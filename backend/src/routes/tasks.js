import express from 'express';
import rateLimit, { ipKeyGenerator } from 'express-rate-limit';
import logger from '../utils/logger.js';
import { requireAuth } from '../middleware/enhancedAuth.js';
import { body, param, query, validationResult } from 'express-validator';
import { validateInput, commonValidations } from '../middleware/security.js';
import {
  createTask,
  getTasks,
  getTaskById,
  updateTask,
  deleteTask,
  bulkCreateTasks,
  getNextFocusTask,
  // Auto-scheduling endpoints
  toggleAutoSchedule,
  getAutoSchedulingDashboard,
  getUserSchedulingPreferences,
  updateUserSchedulingPreferences,
  getTaskSchedulingHistory,
  triggerAutoScheduling
} from '../controllers/tasksController.js';
import {
  getUserNotifications,
  markNotificationAsRead,
  markAllNotificationsAsRead,
  getUnreadNotificationsCount,
  markAllNotificationsAsReadAndArchive
} from '../services/notificationService.js';

// Rate limiter for archive-all endpoint to prevent abuse of expensive operation
const archiveLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute window
  limit: 2, // Maximum 2 requests per window per user
  keyGenerator: (req) =>
    req.user?.id !== undefined
      ? `user:${req.user.id}`
      : `ip:${ipKeyGenerator(req)}`, // Use user ID if authenticated, fallback to IP with IPv6 support
  message: {
    error: 'Too many archive requests. Please wait a moment before trying again.',
    retryAfter: '1 minute'
  },
  standardHeaders: true, // Return rate limit info in the `RateLimit-*` headers
  legacyHeaders: false, // Disable the `X-RateLimit-*` headers
});

// Rate limiter for auto-scheduling trigger endpoint to prevent abuse
const autoScheduleTriggerLimiter = rateLimit({
  windowMs: 5 * 60 * 1000, // 5 minute window
  limit: 10, // Maximum 10 requests per window per user
  keyGenerator: (req) =>
    req.user?.id !== undefined
      ? `user:${req.user.id}`
      : `ip:${ipKeyGenerator(req)}`, // Use user ID if authenticated, fallback to IP with IPv6 support
  message: {
    error: 'Too many auto-scheduling trigger requests. Please wait before trying again.',
    retryAfter: '5 minutes'
  },
  standardHeaders: true, // Return rate limit info in the `RateLimit-*` headers
  legacyHeaders: false, // Disable the `X-RateLimit-*` headers
});
const router = express.Router();

// Task validation rules
const taskValidation = [
  commonValidations.string('title', 1, 255),
  body('description').optional().isLength({ max: 2000 }).trim().escape(),
  commonValidations.date('due_date'),
  commonValidations.enum('priority', ['low', 'medium', 'high']),
  commonValidations.uuid('goal_id'),
  commonValidations.enum('preferred_time_of_day', ['morning', 'afternoon', 'evening']),
  commonValidations.enum('deadline_type', ['soft', 'hard']),
  commonValidations.integer('travel_time_minutes', 0, 480),
  commonValidations.boolean('auto_schedule_enabled'),
  commonValidations.enum('recurrence_pattern', ['none', 'daily', 'weekly', 'monthly']),
  commonValidations.json('scheduling_preferences'),
  commonValidations.boolean('weather_dependent'),
  commonValidations.string('location', 0, 500),
  commonValidations.json('preferred_time_windows'),
  commonValidations.integer('max_daily_tasks', 1, 50),
  commonValidations.integer('buffer_time_minutes', 0, 120),
  commonValidations.enum('task_type', ['indoor', 'outdoor', 'travel', 'virtual', 'other']),
  commonValidations.boolean('is_today_focus'),
  commonValidations.string('category', 0, 100)
];

const bulkTaskValidation = [
  body('tasks').isArray({ min: 1, max: 50 }).withMessage('Tasks must be an array with 1-50 items'),
  body('tasks.*.title').isLength({ min: 1, max: 255 }).trim().escape(),
  body('tasks.*.description').optional().isLength({ max: 2000 }).trim().escape(),
  body('tasks.*.due_date').optional().isISO8601(),
  body('tasks.*.priority').optional().isIn(['low', 'medium', 'high']),
  body('tasks.*.goal_id').optional().isUUID(),
  body('tasks.*.category').optional().isLength({ max: 100 }).trim().escape()
];

// Auto-scheduling trigger validation
const autoScheduleTriggerValidation = [
  body('force_reschedule').optional().isBoolean().withMessage('force_reschedule must be a boolean'),
  body('date_range').optional().custom((value) => {
    if (value !== null && typeof value === 'object' && !Array.isArray(value)) {
      return true;
    }
    throw new Error('date_range must be an object');
  }),
  body('date_range.start_date').optional().isISO8601().withMessage('start_date must be a valid ISO8601 date'),
  body('date_range.end_date').optional().isISO8601().withMessage('end_date must be a valid ISO8601 date'),
  body('task_ids').optional().isArray().withMessage('task_ids must be an array'),
  body('task_ids.*').optional().isUUID().withMessage('Each task_id must be a valid UUID'),
  body('preferences_override').optional().custom((value) => {
    if (value !== null && typeof value === 'object' && !Array.isArray(value)) {
      return true;
    }
    throw new Error('preferences_override must be an object');
  })
];

router.post('/', requireAuth, taskValidation, validateInput, createTask);
router.post('/bulk', requireAuth, bulkTaskValidation, validateInput, bulkCreateTasks);
router.get('/', requireAuth, getTasks);

// Notification routes (must come before /:id routes)
router.get('/notifications', requireAuth, [
  query('status').optional().isIn(['all', 'read', 'unread']).withMessage('Status must be one of: all, read, unread'),
  query('limit').optional().isInt({ min: 1, max: 100 }).withMessage('Limit must be between 1 and 100')
], validateInput, async (req, res) => {
  try {
    // Validate and normalize status parameter
    const validStatuses = ['all', 'read', 'unread'];
    const statusRaw = (req.query.status || 'unread').toString().toLowerCase();
    const normalizedStatus = validStatuses.includes(statusRaw) ? statusRaw : 'unread';
    
    // Parse limit parameter if provided
    const requested = req.query.limit ? parseInt(req.query.limit, 10) : undefined;
    const limit = Number.isFinite(requested) && requested > 0 ? Math.min(requested, 100) : undefined;
    
    const notifications = await getUserNotifications(req.user.id, normalizedStatus, limit);
    res.json(notifications);
  } catch (error) {
    logger.error('Error fetching notifications:', error);
    res.status(500).json({ error: 'Failed to fetch notifications' });
  }
});

router.put('/notifications/:id/read', requireAuth, [
  param('id').isUUID().withMessage('Notification ID must be a valid UUID')
], validateInput, async (req, res) => {
  try {
    const result = await markNotificationAsRead(req.params.id, req.user.id);
    if (result.success) {
      res.json({ success: true });
    } else {
      res.status(400).json({ error: result.error });
    }
  } catch (error) {
    logger.error('Error marking notification as read:', error);
    res.status(500).json({ error: 'Failed to mark notification as read' });
  }
});

router.put('/notifications/read-all', requireAuth, async (req, res) => {
  try {
    const result = await markAllNotificationsAsRead(req.user.id);
    if (result.success) {
      res.json({ success: true });
    } else {
      res.status(400).json({ error: result.error });
    }
  } catch (error) {
    logger.error('Error marking all notifications as read:', error);
    res.status(500).json({ error: 'Failed to mark all notifications as read' });
  }
});

router.get('/notifications/unread-count', requireAuth, async (req, res) => {
  try {
    const count = await getUnreadNotificationsCount(req.user.id);
    res.json({ count });
  } catch (error) {
    logger.error('Error fetching unread notification count:', error);
    res.status(500).json({ error: 'Failed to fetch unread notification count' });
  }
});

router.put('/notifications/archive-all', requireAuth, archiveLimiter, async (req, res) => {
  try {
    const result = await markAllNotificationsAsReadAndArchive(req.user.id);
    if (result.success) {
      res.json({ success: true });
    } else {
      res.status(400).json({ error: result.error });
    }
  } catch (error) {
    logger.error('Error archiving all notifications:', error);
    res.status(500).json({ error: 'Failed to archive all notifications' });
  }
});

// Task-specific routes (must come after notification routes)
router.get('/:id', requireAuth, [
  param('id').isUUID().withMessage('Task ID must be a valid UUID')
], validateInput, getTaskById);

router.put('/:id', requireAuth, [
  param('id').isUUID().withMessage('Task ID must be a valid UUID'),
  ...taskValidation.map(validation => validation.optional())
], validateInput, updateTask);

router.delete('/:id', requireAuth, [
  param('id').isUUID().withMessage('Task ID must be a valid UUID')
], validateInput, deleteTask);

// Momentum Mode endpoint
router.post('/focus/next', requireAuth, getNextFocusTask);

// Auto-scheduling routes
router.put('/:id/toggle-auto-schedule', requireAuth, [
  param('id').isUUID().withMessage('Task ID must be a valid UUID'),
  body('enabled').isBoolean().withMessage('Enabled must be a boolean value')
], validateInput, toggleAutoSchedule);
router.get('/auto-scheduling/dashboard', requireAuth, getAutoSchedulingDashboard);
router.get('/auto-scheduling/preferences', requireAuth, getUserSchedulingPreferences);
router.put(
  '/auto-scheduling/preferences',
  requireAuth,
  [
    body('scheduling_preferences')
      .optional()
      .custom(value => typeof value === 'object' && value !== null)
      .withMessage('Scheduling preferences must be valid JSON'),
    body('max_daily_tasks')
      .optional()
      .isInt({ min: 1, max: 50 })
      .withMessage('Max daily tasks must be between 1 and 50'),
    body('buffer_time_minutes')
      .optional()
      .isInt({ min: 0, max: 120 })
      .withMessage('Buffer time must be between 0 and 120 minutes'),
    body('preferred_time_windows')
      .optional()
      .custom(value => typeof value === 'object' && value !== null)
      .withMessage('Preferred time windows must be valid JSON')
  ],
  validateInput,
  updateUserSchedulingPreferences
);

router.get(
  '/auto-scheduling/history/:task_id?',
  requireAuth,
  [
    param('task_id')
      .optional()
      .isUUID()
      .withMessage('Task ID must be a valid UUID')
  ],
  validateInput,
  getTaskSchedulingHistory
);

router.post(
  '/auto-scheduling/trigger',
  requireAuth,
  autoScheduleTriggerLimiter,
  autoScheduleTriggerValidation,
  validateInput,
  triggerAutoScheduling
);

export default router; 