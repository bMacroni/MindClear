import express from 'express';
import { requireAuth } from '../middleware/enhancedAuth.js';
import GeminiService from '../utils/geminiService.js';
import GroqService from '../utils/groqService.js';
// import AIService from '../utils/aiService.js';
import { conversationController } from '../controllers/conversationController.js';
import logger from '../utils/logger.js';
import { sendFeedback } from '../controllers/feedbackController.js';
import { sendNotification } from '../services/notificationService.js';
import { getSupabaseConfig } from '../config/supabase.js';

const router = express.Router();
const geminiService = new GeminiService();
const groqService = new GroqService();
// const aiService = new AIService(); // Fallback service

// Chat endpoint with conversation history support
router.post('/chat', requireAuth, async (req, res) => {
  try {
    const { message, threadId, modelMode } = req.body;
    const userId = req.user.id;
    const moodHeader = req.headers['x-user-mood'];
    const timeZoneHeader = req.headers['x-user-timezone'];

    const mode = (typeof modelMode === 'string' && ['fast', 'smart'].includes(modelMode))
      ? modelMode
      : 'fast'; // default per PRD

    if (!message || typeof message !== 'string' || message.trim().length === 0) {
      return res.status(400).json({
        error: 'Message is required and must be a non-empty string'
      });
    }

    // Extract JWT token from Authorization header
    const token = req.headers.authorization?.split(' ')[1];

    // Check for SSE request
    if (req.headers.accept === 'text/event-stream') {
      res.setHeader('Content-Type', 'text/event-stream');
      res.setHeader('Cache-Control', 'no-cache, no-transform');
      res.setHeader('Connection', 'keep-alive');
      res.flushHeaders();

      let finalThreadId = threadId;
      let fullMessage = '';
      let accumulatedActions = [];
      let modelProvider = mode === 'fast' ? 'groq' : 'gemini';

      try {
        // Auto-create thread if needed
        if (!finalThreadId) {
          try {
            const newThread = await conversationController.createThread(userId, null, null, token);
            finalThreadId = newThread.id;
            logger.info('Auto-created thread for new conversation (SSE)', { threadId: finalThreadId, userId });
            // Send threadId immediately
            res.write(`data: ${JSON.stringify({ type: 'meta', threadId: finalThreadId })}\n\n`);
          } catch (threadError) {
            logger.error('Failed to auto-create thread (SSE):', threadError);
            res.write(`data: ${JSON.stringify({ type: 'error', message: 'Failed to create thread' })}\n\n`);
            return res.end();
          }
        } else {
          // Send threadId confirmation
          res.write(`data: ${JSON.stringify({ type: 'meta', threadId: finalThreadId })}\n\n`);
        }

        // Save user message immediately
        try {
          await conversationController.addMessageToThread(finalThreadId, userId, message, 'user', { mood: moodHeader });
        } catch (dbError) {
          logger.error('Database save error (User Message SSE):', dbError);
        }

        const stream = mode === 'fast'
          ? await groqService.streamMessage(message, userId, finalThreadId, { token, mood: moodHeader, timeZone: timeZoneHeader })
          : await geminiService.streamMessage(message, userId, finalThreadId, { token, mood: moodHeader, timeZone: timeZoneHeader });

        for await (const chunk of stream) {
          if (chunk.type === 'token') {
            res.write(`data: ${JSON.stringify(chunk)}\n\n`);
            // Only accumulate if content is present to avoid appending undefined
            if (chunk.content) fullMessage += chunk.content;
          } else if (chunk.type === 'finish') {
            accumulatedActions = chunk.actions || [];
            fullMessage = chunk.message || fullMessage; // Ensure we have the final sanitized message
            modelProvider = chunk.provider || modelProvider;

            // Send finish event with final data
            res.write(`data: ${JSON.stringify({
              type: 'finish',
              message: fullMessage,
              actions: accumulatedActions,
              provider: modelProvider
            })}\n\n`);
          }
        }

        // Save AI response to database
        if (fullMessage) {
          try {
            await conversationController.addMessageToThread(finalThreadId, userId, fullMessage, 'assistant', { actions: accumulatedActions });

            // Track analytics
            const { createClient } = await import('@supabase/supabase-js');
            const { url, serviceKey, anonKey } = getSupabaseConfig();
            const supabase = createClient(url, serviceKey || anonKey);
            await supabase
              .from('analytics_events')
              .insert({
                user_id: userId,
                event_name: 'ai_message_processed',
                payload: {
                  has_actions: accumulatedActions.length > 0,
                  action_count: accumulatedActions.length,
                  message_length: message.length,
                  mood: moodHeader || null,
                  model_mode: mode,
                  thread_id: finalThreadId,
                  timestamp: new Date().toISOString(),
                  stream: true
                }
              });
          } catch (dbError) {
            logger.error('Database save error (AI Response SSE):', dbError);
          }
        }

        res.end();

      } catch (error) {
        logger.error('SSE Stream Error:', error);
        // Attempt to save partial message if we have something
        if (finalThreadId && fullMessage) {
          try {
            await conversationController.addMessageToThread(finalThreadId, userId, fullMessage, 'assistant', { error: 'stream_interrupted' });
          } catch (e) { /* ignore */ }
        }
        if (!res.headersSent) {
          res.status(500).json({ error: 'Stream failed' });
        } else {
          res.write(`data: ${JSON.stringify({ type: 'error', message: 'Stream interrupted' })}\n\n`);
          res.end();
        }
      }
      return;
    }

    // Process message with Gemini service, passing token and mood in userContext
    logger.info('Processing AI chat message', {
      userId,
      threadId,
      messageLength: message.length,
      modelMode: mode
    });

    const response = mode === 'fast'
      ? await groqService.processMessage(message, userId, threadId, { token, mood: moodHeader, timeZone: timeZoneHeader })
      : await geminiService.processMessage(message, userId, threadId, { token, mood: moodHeader, timeZone: timeZoneHeader });

    logger.info('AI response received', {
      userId,
      threadId,
      responseMessageLength: response.message?.length || 0,
      hasActions: response.actions?.length > 0
    });

    // Track AI message processing event
    const { createClient } = await import('@supabase/supabase-js');
    const { url, serviceKey, anonKey } = getSupabaseConfig();
    const supabase = createClient(url, serviceKey || anonKey);
    await supabase
      .from('analytics_events')
      .insert({
        user_id: userId,
        event_name: 'ai_message_processed',
        payload: {
          has_actions: response.actions && response.actions.length > 0,
          action_count: response.actions ? response.actions.length : 0,
          message_length: message.length,
          mood: moodHeader || null,
          model_mode: mode,
          thread_id: threadId || null,
          timestamp: new Date().toISOString()
        }
      });

    // Create thread if not provided, then save messages
    let finalThreadId = threadId;
    let isNewlyCreatedThread = false;
    if (!finalThreadId) {
      try {
        // Auto-create thread for new conversations
        const newThread = await conversationController.createThread(userId, null, null, token);
        finalThreadId = newThread.id;
        isNewlyCreatedThread = true;
        logger.info('Auto-created thread for new conversation', { threadId: finalThreadId, userId });
      } catch (threadError) {
        logger.error('Failed to auto-create thread:', threadError);
        // Continue without threadId - frontend can create locally
      }
    }

    // Save conversation to database if we have a threadId
    if (finalThreadId) {
      try {
        // Use the optimized method that verifies ownership directly using userId
        // This avoids RLS propagation issues for both new and existing threads
        await conversationController.addMessageToThread(finalThreadId, userId, message, 'user', { mood: moodHeader });
        await conversationController.addMessageToThread(finalThreadId, userId, response.message, 'assistant', { actions: response.actions });
      } catch (dbError) {
        logger.error('Database save error:', dbError);
        // Continue with response even if database save fails
      }
    }

    const safeMessage = typeof response.message === 'string' ? response.message : '';

    // Log if we get an empty response
    if (!safeMessage || safeMessage.trim().length === 0) {
      logger.warn('Empty AI response received', {
        userId,
        threadId: finalThreadId
      });
    }

    const finalResponse = {
      message: safeMessage || 'I apologize, but I didn\'t receive a proper response. Please try again.',
      actions: Array.isArray(response.actions) ? response.actions : [],
      threadId: finalThreadId || null, // Include threadId in response
      modelMode: mode,
      provider: response.provider || (mode === 'smart' ? 'gemini' : 'groq')
    };

    // Send a notification to the user
    const notification = {
      notification_type: 'new_message',
      title: 'New message from your AI assistant',
      message: safeMessage.substring(0, 100) + (safeMessage.length > 100 ? '...' : ''),
      details: { threadId: finalThreadId }
    };
    // Don't await this, let it run in the background
    sendNotification(userId, notification).catch(err =>
      logger.error('sendNotification failed', err)
    );

    res.json(finalResponse);

  } catch (error) {
    logger.error('AI Chat Error:', error);
    res.status(500).json({
      error: 'Failed to process message',
      message: 'I\'m sorry, I encountered an error processing your request. Please try again.'
    });
  }
});

// Recommend a task based on user query and current tasks
router.post('/recommend-task', requireAuth, async (req, res) => {
  try {
    const { userRequest } = req.body;
    const userId = req.user.id;
    if (!userRequest || typeof userRequest !== 'string') {
      return res.status(400).json({ error: 'userRequest is required and must be a string' });
    }
    // Fetch the user's tasks (reuse logic from getTasks controller)
    const token = req.headers.authorization?.split(' ')[1];
    const { createClient } = await import('@supabase/supabase-js');
    const { url, serviceKey, anonKey } = getSupabaseConfig();
    const supabase = createClient(url, serviceKey || anonKey, {
      global: {
        headers: {
          Authorization: `Bearer ${token}`
        }
      }
    });
    const { data: tasks, error } = await supabase
      .from('tasks')
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: false });
    if (error) {
      return res.status(400).json({ error: error.message });
    }
    // Call Gemini to recommend a task
    const result = await geminiService.recommendTaskFromList(userRequest, tasks, userId);
    res.json(result);
  } catch (error) {
    logger.error('Recommend Task Error:', error);
    res.status(500).json({ error: 'Failed to recommend a task' });
  }
});

// Brain dump endpoint (Refs: FeaturePRDs/PRD_guided-brain-dump.md L34-L44)
router.post('/braindump', requireAuth, async (req, res) => {
  try {
    const { text } = req.body;
    const userId = req.user.id;
    if (!text || typeof text !== 'string' || text.trim().length === 0) {
      return res.status(400).json({
        error: 'Text is required',
        message: "It's okay if nothing comes to mind right away. Just typing one word about how you're feeling can be a great start."
      });
    }

    const token = req.headers.authorization?.split(' ')[1];

    // 1) Create a new conversation thread for this brain dump session and save raw text
    const thread = await conversationController.createThread(userId, 'Brain Dump', null, token);
    await conversationController.addMessage(thread.id, text, 'user', { source: 'brain_dump' }, token);    // 2) Process with Gemini via service to parse items and classify
    const items = await geminiService.processBrainDump(text, userId);

    // Track brain dump processing event
    const { createClient } = await import('@supabase/supabase-js');
    const { url, serviceKey, anonKey } = getSupabaseConfig();
    const supabase = createClient(url, serviceKey || anonKey);
    await supabase
      .from('analytics_events')
      .insert({
        user_id: userId,
        event_name: 'brain_dump_processed',
        payload: {
          text_length: text.length,
          items_count: items.length,
          thread_id: thread.id,
          timestamp: new Date().toISOString()
        }
      });

    return res.json({ threadId: thread.id, items });
  } catch (error) {
    logger.error('AI BrainDump Error:', error);
    return res.status(500).json({ error: 'Failed to process brain dump' });
  }
});

// Create new conversation thread
router.post('/threads', requireAuth, async (req, res) => {
  try {
    const { title, summary } = req.body;
    const userId = req.user.id;

    const thread = await conversationController.createThread(userId, title || 'New Conversation', summary);
    res.json(thread);
  } catch (error) {
    logger.error('Create Thread Error:', error);
    res.status(500).json({ error: 'Failed to create conversation thread' });
  }
});

// Get conversation threads for user
router.get('/threads', requireAuth, async (req, res) => {
  try {
    const userId = req.user.id;
    const threads = await conversationController.getThreads(userId);
    res.json(threads);
  } catch (error) {
    logger.error('Get Threads Error:', error);
    res.status(500).json({ error: 'Failed to get conversation threads' });
  }
});

// Get specific conversation thread
router.get('/threads/:threadId', requireAuth, async (req, res) => {
  try {
    const { threadId } = req.params;
    const userId = req.user.id;
    const limitParam = req.query.limit;
    const limit = limitParam ? parseInt(String(limitParam), 10) : undefined;

    if (limit && Number.isFinite(limit) && limit > 0) {
      // Fetch thread meta and limited recent messages
      const threadMeta = await conversationController.getThreadMeta(threadId, userId);
      if (!threadMeta) {
        return res.status(404).json({ error: 'Thread not found' });
      }
      const messages = await conversationController.getRecentMessages(threadId, userId, limit);
      return res.json({ thread: threadMeta, messages });
    }

    const thread = await conversationController.getThread(threadId, userId);
    if (!thread) {
      return res.status(404).json({ error: 'Thread not found' });
    }
    return res.json(thread);
  } catch (error) {
    logger.error('Get Thread Error:', error);
    res.status(500).json({ error: 'Failed to get conversation thread' });
  }
});

// Update conversation thread
router.put('/threads/:threadId', requireAuth, async (req, res) => {
  try {
    const { threadId } = req.params;
    const { title, summary } = req.body;
    const userId = req.user.id;

    const updatedThread = await conversationController.updateThread(threadId, userId, { title, summary });
    if (!updatedThread) {
      return res.status(404).json({ error: 'Thread not found' });
    }

    res.json(updatedThread);
  } catch (error) {
    logger.error('Update Thread Error:', error);
    res.status(500).json({ error: 'Failed to update conversation thread' });
  }
});

// Delete conversation thread
router.delete('/threads/:threadId', requireAuth, async (req, res) => {
  try {
    const { threadId } = req.params;
    const userId = req.user.id;

    const deleted = await conversationController.deleteThread(threadId, userId);
    if (!deleted) {
      return res.status(404).json({ error: 'Thread not found' });
    }

    res.json({ message: 'Thread deleted successfully' });
  } catch (error) {
    logger.error('Delete Thread Error:', error);
    res.status(500).json({ error: 'Failed to delete conversation thread' });
  }
});

// Goal suggestions endpoint
router.post('/goal-suggestions', requireAuth, async (req, res) => {
  try {
    const { goalTitle } = req.body;
    const userId = req.user.id;

    if (!goalTitle || typeof goalTitle !== 'string') {
      return res.status(400).json({
        error: 'Goal title is required and must be a string'
      });
    }

    // Goal suggestions requested

    // Try Gemini first, fallback to basic suggestions if needed
    let suggestions;
    try {
      suggestions = await geminiService.generateGoalSuggestions(goalTitle);
    } catch (error) {
      // Using fallback suggestions
      suggestions = `• Break down the goal into smaller, manageable steps
• Set specific milestones and deadlines
• Track your progress regularly
• Stay motivated by celebrating small wins
• Create a detailed action plan with timelines`;
    }

    res.json({
      suggestions: suggestions,
      goalTitle: goalTitle
    });

  } catch (error) {
    res.status(500).json({
      error: 'Failed to generate suggestions',
      message: "I'm sorry, I couldn't generate suggestions right now. Please try again."
    });
  }
});

// Goal breakdown suggestions endpoint
router.post('/goal-breakdown', requireAuth, async (req, res) => {
  try {
    const { goalTitle, goalDescription } = req.body;
    const userId = req.user.id;

    if (!goalTitle || typeof goalTitle !== 'string') {
      return res.status(400).json({
        error: 'Goal title is required and must be a string'
      });
    }

    // Goal breakdown requested

    // Generate breakdown suggestions using Gemini
    let breakdown;
    try {
      breakdown = await geminiService.generateGoalBreakdown(goalTitle, goalDescription);
    } catch (error) {
      return res.status(500).json({
        error: 'Failed to generate goal breakdown',
        message: "I'm sorry, I couldn't generate a breakdown right now. Please try again."
      });
    }

    res.json({
      breakdown: breakdown,
      goalTitle: goalTitle,
      goalDescription: goalDescription
    });

  } catch (error) {
    res.status(500).json({
      error: 'Failed to generate breakdown',
      message: "I'm sorry, I couldn't generate a breakdown right now. Please try again."
    });
  }
});

// Health check for AI service
router.get('/health', requireAuth, (req, res) => {
  res.json({
    status: 'OK',
    message: 'AI service is running',
    timestamp: new Date().toISOString()
  });
});

router.post('/feedback', sendFeedback);

export default router; 