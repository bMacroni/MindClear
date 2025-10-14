import express from 'express';
import { requireAuth as enhancedRequireAuth } from '../middleware/enhancedAuth.js';
import GeminiService from '../utils/geminiService.js';
import logger from '../utils/logger.js';
import { executeTool } from '../mcp/client.js';

const router = express.Router();
const geminiService = new GeminiService();

// POST /api/chat
router.post('/', enhancedRequireAuth, async (req, res) => {
  try {
    const { message, threadId } = req.body || {};
    const userId = req.user.id;
    const moodHeader = req.headers['x-user-mood'];
    const timeZoneHeader = req.headers['x-user-timezone'];
    const token = req.headers.authorization?.split(' ')[1];
    const stream = String(req.query.stream || '').toLowerCase() !== 'false' &&
                   String(req.headers['accept'] || '').includes('text/event-stream');

    if (!message || typeof message !== 'string' || message.trim().length === 0) {
      return res.status(400).json({ error: 'Message is required and must be a non-empty string' });
    }

    // Non-streaming fallback (JSON)
    if (!stream) {
      const response = await geminiService.processMessage(message, userId, threadId, { token, mood: moodHeader, timeZone: timeZoneHeader });
      const safeMessage = typeof response.message === 'string' ? response.message : '';
      return res.status(200).json({
        message: safeMessage || 'I apologize, but I did not receive a proper response. Please try again.',
        actions: Array.isArray(response.actions) ? response.actions : []
      });
    }

    // Streaming via Server-Sent Events (SSE)
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.flushHeaders?.();

    const send = (obj) => {
      try {
        res.write(`data: ${JSON.stringify(obj)}\n\n`);
      } catch (_) {}
    };

    // Minimal progressive stream: we cannot stream Gemini tokens with current service,
    // so emit a placeholder thinking event, then final message chunk.
    send({ type: 'assistant_status', status: 'thinking' });

    const response = await geminiService.processMessage(message, userId, threadId, { token, mood: moodHeader, timeZone: timeZoneHeader });
    const safeMessage = typeof response.message === 'string' ? response.message : '';

    // Optionally execute actions via MCP (server-side) for create/update/delete flows
    const actions = Array.isArray(response.actions) ? response.actions : [];
    for (const action of actions) {
      try {
        if (!action || !action.action_type || !action.entity_type) continue;
        if (action.action_type === 'read') continue; // reads remain client-side
        const method = `${action.entity_type}.${action.action_type}`; // e.g., task.create
        await executeTool(method, {
          data: action.details || action.args || {},
          filters: action.args || {},
          userId,
          userContext: { token, mood: moodHeader, timeZone: timeZoneHeader }
        });
        send({ type: 'action_result', method, ok: true });
      } catch (e) {
        send({ type: 'action_result', method: `${action.entity_type}.${action.action_type}`, ok: false, error: e?.message || 'failed' });
      }
    }

    // Data Stream Protocol-like shape
    send({ type: 'assistant_message', content: [{ type: 'text', text: safeMessage }] });
    send({ type: 'action_list', actions });
    send({ type: 'finish' });

    res.end();
  } catch (error) {
    logger.error('Assistant Chat Stream Error:', error);
    try {
      res.write(`data: ${JSON.stringify({ type: 'error', error: 'Failed to process message' })}\n\n`);
    } catch (_) {}
    res.end();
  }
});

export default router;


