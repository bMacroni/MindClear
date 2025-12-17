import logger from './logger.js';
import { conversationController } from '../controllers/conversationController.js';

/**
 * Lightweight Groq client wrapper for fast, low-latency responses.
 * Uses the OpenAI-compatible Groq chat completions API to keep payload shape
 * consistent with Gemini service outputs.
 */
class GroqService {
  constructor() {
    this.apiKey = process.env.GROQ_API_KEY;
    this.enabled = Boolean(this.apiKey);
    this.baseUrl = 'https://api.groq.com/openai/v1/chat/completions';
    this.model = process.env.GROQ_MODEL || 'llama-3.1-8b-instant';
    this.debugLoggingEnabled = process.env.GROQ_DEBUG_LOGS === 'true';
    this.conversationHistory = new Map();
    this.historyLocks = new Map(); // per-conversation mutex
    this.MAX_CONVERSATIONS = 1000;
    this.MAX_HISTORY_MESSAGES = 20; // keep parity with Gemini trimming
  }

  _sanitizeMessageForFrontend(message) {
    try {
      if (typeof message !== 'string') return message;
      const trimmed = message.trim();
      // If already fenced, keep existing logic
      const fencedMatch = trimmed.match(/```json\s*([\s\S]*?)\s*```/i);
      if (fencedMatch?.[1]) {
        const obj = JSON.parse(fencedMatch[1]);
        const category = String(obj?.category || '').toLowerCase();
      // Fix: Handle general category with message OR details
      if (category === 'general') {
        const text = obj.message || obj.details || obj.title;
        if (typeof text === 'string' && text.trim() !== '') {
          return text.trim();
        }
      }
        return message;
      }

      // If unfenced JSON with category exists, wrap it in a code block to align with Gemini
      const inlineMatch = trimmed.match(/\{[\s\S]*"category"\s*:\s*"[^"]+"[\s\S]*\}/);
      if (inlineMatch?.[0]) {
        const jsonText = inlineMatch[0];
        // Ensure it parses before wrapping
        try {
          JSON.parse(jsonText);
          return `\`\`\`json\n${jsonText}\n\`\`\``;
        } catch (_) {
          return message;
        }
      }

      return message;
    } catch (_) {
      return message;
    }
  }

  _getHistoryKey(userId, threadId) {
    return threadId ? `${userId}:${threadId}` : `${userId}:null`;
  }

  _getHistory(key) {
    const history = this.conversationHistory.get(key);
    if (history) {
      // Reinsert to mark as most recently used for LRU eviction
      this.conversationHistory.delete(key);
      this.conversationHistory.set(key, history);
      return history;
    }
    return [];
  }

  _evictOldestIfNeeded() {
    if (this.conversationHistory.size >= this.MAX_CONVERSATIONS) {
      const oldestKey = this.conversationHistory.keys().next().value;
      if (oldestKey) {
        this.conversationHistory.delete(oldestKey);
      }
    }
  }

  _getRedactedPreview(content) {
    if (typeof content !== 'string') return '';
    const preview = content.slice(0, 160);
    const scrubbed = preview
      .replace(/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g, '[email-redacted]')
      .replace(/[0-9]{3,}/g, '[digits-redacted]');
    return `${scrubbed}${content.length > 160 ? '…[truncated]' : ''}`;
  }

  async _addToHistory(userId, threadId, messageObj) {
    const key = this._getHistoryKey(userId, threadId);
    const currentLock = this.historyLocks.get(key) || Promise.resolve();

    let release;
    const nextLock = new Promise(resolve => {
      release = resolve;
    });
    const chainedLock = currentLock.then(() => nextLock);
    this.historyLocks.set(key, chainedLock);

    await currentLock;

    try {
      const isNewConversation = !this.conversationHistory.has(key);
      if (isNewConversation) {
        this._evictOldestIfNeeded();
      }
      const list = isNewConversation ? [] : this._getHistory(key);
      list.push(messageObj);
      if (list.length > this.MAX_HISTORY_MESSAGES) {
        list.splice(0, list.length - this.MAX_HISTORY_MESSAGES);
      }
      this.conversationHistory.set(key, list);
    } finally {
      release();
      if (this.historyLocks.get(key) === chainedLock) {
        this.historyLocks.delete(key);
      }
    }
  }

  async _loadHistoryFromDatabase(userId, threadId) {
    try {
      if (!threadId) return [];
      const messages = await conversationController.getRecentMessages(threadId, userId, this.MAX_HISTORY_MESSAGES);
      return messages.map(msg => ({
        role: msg.role === 'user' ? 'user' : 'assistant',
        content: msg.content
      }));
    } catch (err) {
      logger.warn('GroqService failed to load history', { err: err?.message, threadId, userId });
      return [];
    }
  }

  async processMessage(message, userId, threadId = null, userContext = {}) {
    if (!this.enabled) {
      logger.warn('GROQ_API_KEY not set; falling back to Gemini for fast mode');
      return {
        message: "Fast model unavailable. Please try again in Smart mode.",
        actions: [],
        provider: 'groq_disabled'
      };
    }

    const tz = userContext.timeZone || 'America/Chicago';
    const today = new Date();
    const todayString = today.toLocaleString('en-US', { 
      year: 'numeric', 
      month: 'long', 
      day: 'numeric', 
      hour: 'numeric', 
      minute: '2-digit', 
      timeZone: tz,
      timeZoneName: 'short'
    });
    const moodLine = userContext.mood ? `User mood: ${userContext.mood}. Match tone and keep language supportive.` : '';

    // Mirror the curated system prompt used for Gemini to keep behavior consistent
    const systemPrompt = [
      `Today's date is ${todayString}.`,
      moodLine,
      `Time zone: ${tz}.`,
      'You are the Fast (Groq) model for the Mind Clear productivity app. Keep responses concise, supportive, and action-oriented.',
      'Never expose tools or internals. Present everything as app features (e.g., “I’ll add a task”, “I’ll schedule that”).',
      'Context clarity: prioritize the latest user message, but also use recent chat history to keep continuity and choose the best next action (do not ignore prior requests/goals/tasks already discussed). Resolve references using recent turns; avoid repeating work already done.',
      'Task/goal guidance: ask brief clarifying questions when needed, then act with sensible defaults.',
      'Decision rule: classify intent cleanly —',
      '• Treat single, concrete actions as tasks (one-off, short, schedulable).',
      '• Treat multi-step outcomes or learning journeys as goals with milestones (2–5 steps).',
      '• If unsure, ask one concise clarifier; otherwise pick goal vs task confidently (no hedging).',
      '• Do not return both a goal and a task for the same request; choose the best fit.',
      'Goal output: when creating or updating a goal, return exactly ONE JSON block wrapped in ```json ... ``` with category:"goal", title, description, and milestones[{title,steps[{text}]}]. Do not claim anything is saved; present it as a draft. If you truly need a missing detail, ask ONE short clarifier first, otherwise produce the goal block.',
      'Response format standardization: when returning structured data, wrap JSON in triple backticks.',
      'Schedule responses (category: schedule): return JSON with title and events[{title,startTime,endTime}] in 12-hour time using the user timezone.',
      'Goal responses (category: goal): include title, description, milestones[{title,steps[{text}]}].',
      'Task responses (category: task): include title and tasks[{title,description,dueDate,priority}].',
      'If no structured data applies, return concise helpful text and suggest a next step.'
    ].filter(Boolean).join('\n');

    let timeoutId;
    const timeoutMs = 30000;
    const controller = new AbortController();

    try {
      // Build history (system + recent turns + current user)
      const historyKey = this._getHistoryKey(userId, threadId);
      let cachedHistory = this._getHistory(historyKey);

      // If cache empty and threadId present, hydrate from DB
      if (cachedHistory.length === 0 && threadId) {
        const dbHistory = await this._loadHistoryFromDatabase(userId, threadId);
        if (dbHistory.length > 0) {
          cachedHistory = dbHistory;
          this.conversationHistory.set(historyKey, dbHistory);
        }
      }

      // Trim history to max allowed and append current user message
      const trimmedHistory = cachedHistory.slice(-this.MAX_HISTORY_MESSAGES);
      const messagesPayload = [
        { role: 'system', content: systemPrompt },
        ...trimmedHistory.map(m => ({ role: m.role, content: m.content })),
        { role: 'user', content: message }
      ];

      timeoutId = setTimeout(() => controller.abort(), timeoutMs);

      const response = await fetch(this.baseUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${this.apiKey}`
        },
        body: JSON.stringify({
          model: this.model,
          stream: false,
          messages: messagesPayload,
          temperature: 0.6,
        }),
        signal: controller.signal
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        logger.error('Groq API error', { status: response.status, threadId, userId });
        throw new Error(`Groq request failed with status ${response.status}`);
      }

      const data = await response.json();
      let content = data?.choices?.[0]?.message?.content || '';
      const hasJsonBlock = typeof content === 'string' ? /```json/i.test(content) : false;
      logger.info('Groq response received', {
        status: response.status,
        threadId,
        userId,
        hasJsonBlock
      });
      if (this.debugLoggingEnabled && typeof content === 'string') {
        logger.debug('Groq response preview (redacted)', {
          status: response.status,
          threadId,
          userId,
          hasJsonBlock,
          redactedPreview: this._getRedactedPreview(content)
        });
      }
      content = this._sanitizeMessageForFrontend(content);

      // Append assistant reply to history cache
      await this._addToHistory(userId, threadId, { role: 'user', content: message });
      await this._addToHistory(userId, threadId, { role: 'assistant', content });

      return {
        message: content || 'I had trouble generating a fast response. Please try again.',
        actions: [],
        provider: 'groq'
      };
    } catch (error) {
      if (typeof timeoutId !== 'undefined') {
        clearTimeout(timeoutId);
      }

      if (error?.name === 'AbortError') {
        logger.warn('GroqService request timed out', { timeoutMs: 30000 });
        return {
          message: 'The fast model is taking too long to respond. Please retry or switch to Smart mode.',
          actions: [],
          provider: 'groq_timeout'
        };
      }

      logger.error('GroqService processMessage failed', {
        errorName: error?.name,
        errorMessage: error?.message,
        threadId,
        userId
      });
      return {
        message: 'The fast model is temporarily unavailable. Please retry or switch to Smart mode.',
        actions: [],
        provider: 'groq_error'
      };
    }
  }
}

export default GroqService;

