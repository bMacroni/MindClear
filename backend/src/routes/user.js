import express from 'express';
import logger from '../utils/logger.js';
import { requireAuth } from '../middleware/enhancedAuth.js';
import {
  getUserSettings,
  updateUserSettings,
  updateUserProfile,
  getUserProfile,
  getAppPreferences,
  updateAppPreferences,
  registerDeviceToken,
  getNotificationPreferences,
  updateNotificationPreferences,
  updateSingleNotificationPreference,
  deleteUserAccount,
  getClientConfig,
} from '../controllers/userController.js';

const router = express.Router();

// Get user settings
router.get('/settings', requireAuth, getUserSettings);

// Update user settings
router.put('/settings', requireAuth, updateUserSettings);

// Get current user full profile (includes new profile fields)
router.get('/me', requireAuth, getUserProfile);

// Update profile by authenticated user (ID is derived from token to avoid spoofing)
router.put('/me', requireAuth, updateUserProfile);

// App preferences (Momentum Mode, etc.)
router.get('/app-preferences', requireAuth, getAppPreferences);
router.put('/app-preferences', requireAuth, updateAppPreferences);

// This endpoint is now public and does not require authentication,
// as it only provides publicly available client-side keys.
router.get('/config', getClientConfig);

// Notification settings
router.post('/device-token', requireAuth, registerDeviceToken);
router.get('/notifications/preferences', requireAuth, getNotificationPreferences);
router.put('/notifications/preferences', requireAuth, updateNotificationPreferences);
router.put('/notification-preferences', requireAuth, updateSingleNotificationPreference);

// Account deletion (Play policy compliance)
router.delete('/', requireAuth, deleteUserAccount);

export default router; 