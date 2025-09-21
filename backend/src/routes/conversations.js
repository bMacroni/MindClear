import express from 'express';
import { requireAuth } from '../middleware/enhancedAuth.js';
import { conversationController } from '../controllers/conversationController.js';

const router = express.Router();

// All routes require authentication
router.use(requireAuth);

// Get all conversation threads for the user
router.get('/threads', conversationController.getThreadsExpress);

// Get conversation statistics
router.get('/stats', conversationController.getStats);

// Create a new conversation thread
router.post('/threads', conversationController.createThreadExpress);

// Get a specific conversation thread with all messages
router.get('/threads/:threadId', conversationController.getThreadExpress);

// Add a message to a conversation thread
router.post('/threads/:threadId/messages', conversationController.addMessageExpress);

// Update a conversation thread (title, summary, etc.)
router.put('/threads/:threadId', conversationController.updateThreadExpress);

// Delete a conversation thread (soft delete)
router.delete('/threads/:threadId', conversationController.deleteThreadExpress);

export default router; 