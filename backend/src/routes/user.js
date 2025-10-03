import express from 'express';
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
  deleteUserAccount
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

// Notification settings
router.post('/device-token', requireAuth, registerDeviceToken);
router.get('/notifications/preferences', requireAuth, getNotificationPreferences);
router.put('/notifications/preferences', requireAuth, updateNotificationPreferences);

// Account deletion (Play policy compliance)
router.delete('/', requireAuth, deleteUserAccount);

export default router; 