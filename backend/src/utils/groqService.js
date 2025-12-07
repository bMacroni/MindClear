import logger from './logger.js';

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
  }

  _sanitizeMessageForFrontend(message) {
    try {
      if (typeof message !== 'string') return message;
      const trimmed = message.trim();
      const match = trimmed.match(/```json\s*([\s\S]*?)\s*```/i);
      if (!match || !match[1]) return message;
      const obj = JSON.parse(match[1]);
      const category = String(obj?.category || '').toLowerCase();
      if (category === 'general' && typeof obj.message === 'string' && obj.message.trim() !== '') {
        return obj.message.trim();
      }
      return message;
    } catch (_) {
      return message;
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

    const today = new Date();
    const todayString = today.toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
    const tz = userContext.timeZone || 'America/Chicago';
    const moodLine = userContext.mood ? `User mood: ${userContext.mood}. Match tone and keep language supportive.` : '';

    // Mirror the curated system prompt used for Gemini to keep behavior consistent
    const systemPrompt = [
      `Today's date is ${todayString}.`,
      moodLine,
      `Time zone: ${tz}.`,
      'You are the Fast (Groq) model for the Mind Clear productivity app. Keep responses concise, supportive, and action-oriented.',
      'Never expose tools or internals. Present everything as app features (e.g., “I’ll add a task”, “I’ll schedule that”).',
      'Context clarity: prioritize the latest user message, but respect recent history for continuity. Use history only when it clarifies references.',
      'Task/goal guidance: ask brief clarifying questions when needed, then act with sensible defaults.',
      'Response format standardization: when returning structured data, wrap JSON in triple backticks.',
      'Schedule responses (category: schedule): return JSON with title and events[{title,startTime,endTime}] in 12-hour time using the user timezone.',
      'Goal responses (category: goal): include title, description, milestones[{title,steps[{text}]}].',
      'Task responses (category: task): include title and tasks[{title,description,dueDate,priority}].',
      'If no structured data applies, return concise helpful text and suggest a next step.'
    ].filter(Boolean).join('\n');

    try {
      const response = await fetch(this.baseUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${this.apiKey}`
        },
        body: JSON.stringify({
          model: this.model,
          stream: false,
          messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: message }
          ],
          temperature: 0.6,
        })
      });

      if (!response.ok) {
        const text = await response.text();
        logger.error('Groq API error', { status: response.status, text });
        throw new Error(`Groq request failed with status ${response.status}`);
      }

      const data = await response.json();
      let content = data?.choices?.[0]?.message?.content || '';
      content = this._sanitizeMessageForFrontend(content);

      return {
        message: content || 'I had trouble generating a fast response. Please try again.',
        actions: [],
        provider: 'groq'
      };
    } catch (error) {
      logger.error('GroqService processMessage failed', error);
      return {
        message: 'The fast model is temporarily unavailable. Please retry or switch to Smart mode.',
        actions: [],
        provider: 'groq_error'
      };
    }
  }
}

export default GroqService;

