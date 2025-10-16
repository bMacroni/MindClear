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

    if (threadId !== undefined && (typeof threadId !== 'string' || threadId.trim().length === 0)) {
      return res.status(400).json({ error: 'threadId must be a non-empty string if provided' });
    }

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
      try {
        const response = await geminiService.processMessage(
          message,
          userId,
          threadId,
          { token, mood: moodHeader, timeZone: timeZoneHeader }
        );
        const safeMessage = typeof response.message === 'string' ? response.message : '';
        return res.status(200).json({
          message: safeMessage || 'I apologize, but I did not receive a proper response. Please try again.',
          actions: Array.isArray(response.actions) ? response.actions : []
        });
      } catch (error) {
        logger.error('Non-streaming message processing failed:', error);
        return res.status(500).json({ error: 'Failed to process message' });
      }
    }

    // Streaming via Server-Sent Events (SSE)
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.flushHeaders?.();

    const send = (obj) => {
      try {
        if (res.writableEnded || !res.writable) {
          return false;
        }
        res.write(`data: ${JSON.stringify(obj)}\n\n`);
        return true;
      } catch (error) {
        logger.debug('SSE send failed, client may have disconnected:', error.message);
        return false;
      }
    };
    // Minimal progressive stream: we cannot stream Gemini tokens with current service,
    // so emit a placeholder thinking event, then final message chunk.
    send({ type: 'assistant_status', status: 'thinking' });

    const response = await geminiService.processMessage(message, userId, threadId, { token, mood: moodHeader, timeZone: timeZoneHeader });
    const safeMessage = typeof response.message === 'string' ? response.message : '';

    // Optionally execute actions via MCP (server-side) for create/update/delete flows
    const actions = Array.isArray(response.actions) ? response.actions : [];
    
    /**
     * Action structure from Gemini service:
     * {
     *   action_type: 'create' | 'update' | 'delete' | 'read',
     *   entity_type: 'task' | 'goal' | 'milestone' | 'calendar' | 'user' | 'notification',
     *   details: object,     // Canonical data field - contains parsed/structured data for the action
     *   args: object         // Optional - contains raw function call arguments, used for filters when present
     * }
     */
    
    // Configuration for action execution
    const ACTION_TIMEOUT_MS = 30000; // 30 seconds per action
    const VALID_ENTITY_TYPES = ['task', 'goal', 'milestone', 'calendar', 'user', 'notification'];
    const VALID_ACTION_TYPES = ['create', 'update', 'delete', 'read'];
    
    // Helper function to validate action inputs
    const validateAction = (action) => {
      if (!action || typeof action !== 'object') {
        return { valid: false, error: 'Action must be a valid object' };
      }
      if (!action.entity_type || typeof action.entity_type !== 'string') {
        return { valid: false, error: 'entity_type is required and must be a string' };
      }
      if (!action.action_type || typeof action.action_type !== 'string') {
        return { valid: false, error: 'action_type is required and must be a string' };
      }
      if (!VALID_ENTITY_TYPES.includes(action.entity_type)) {
        return { valid: false, error: `Invalid entity_type: ${action.entity_type}. Must be one of: ${VALID_ENTITY_TYPES.join(', ')}` };
      }
      if (!VALID_ACTION_TYPES.includes(action.action_type)) {
        return { valid: false, error: `Invalid action_type: ${action.action_type}. Must be one of: ${VALID_ACTION_TYPES.join(', ')}` };
      }
      return { valid: true };
    };
    
    // Helper function to execute a single action with timeout
    const executeActionWithTimeout = async (action) => {
      const method = `${action.entity_type}.${action.action_type}`;
      
      const timeoutPromise = new Promise((_, reject) => {
        setTimeout(() => reject(new Error(`Action timeout after ${ACTION_TIMEOUT_MS}ms`)), ACTION_TIMEOUT_MS);
      });
      
      // Use details as the canonical data field, args for filters when present
      const params = {
        data: action.details || {},
        userId,
        userContext: { token, mood: moodHeader, timeZone: timeZoneHeader }
      };
      
      // Only add filters if args contains filter-specific data
      if (action.args && Object.keys(action.args).length > 0) {
        params.filters = action.args;
      }
      
      const actionPromise = executeTool(method, params);
      
      return Promise.race([actionPromise, timeoutPromise]);
    };
    
    // Filter and validate actions
    const validActions = [];
    for (const action of actions) {
      const validation = validateAction(action);
      if (!validation.valid) {
        send({ 
          type: 'action_result', 
          method: action?.entity_type && action?.action_type ? `${action.entity_type}.${action.action_type}` : 'unknown', 
          ok: false, 
          error: validation.error 
        });
        continue;
      }
      
      if (action.action_type === 'read') continue; // reads remain client-side
      validActions.push(action);
    }
    
    // Execute actions in parallel (since they're independent operations)
    if (validActions.length > 0) {
      const actionPromises = validActions.map(async (action) => {
        const method = `${action.entity_type}.${action.action_type}`;
        try {
          await executeActionWithTimeout(action);
          send({ type: 'action_result', method, ok: true });
          return { method, success: true };
        } catch (error) {
          const isTimeout = error.message.includes('timeout');
          const errorMessage = isTimeout ? `Action timed out after ${ACTION_TIMEOUT_MS}ms` : (error?.message || 'Action failed');
          send({ 
            type: 'action_result', 
            method, 
            ok: false, 
            error: errorMessage,
            timeout: isTimeout
          });
          return { method, success: false, error: errorMessage, timeout: isTimeout };
        }
      });
      
      // Wait for all actions to complete
      try {
        await Promise.all(actionPromises);
      } catch (error) {
        // Individual action errors are already handled above
        logger.debug('Some actions failed during parallel execution:', error);
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