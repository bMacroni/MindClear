import express from 'express';
import { requireAuth } from '../middleware/enhancedAuth.js';
import { trackEvent, getDashboardData } from '../controllers/analyticsController.js';

const router = express.Router();

// Analytics routes

// Track analytics event
router.post('/track', requireAuth, trackEvent);

// Get analytics dashboard data (internal use)
router.get('/dashboard', requireAuth, getDashboardData);

export default router;
