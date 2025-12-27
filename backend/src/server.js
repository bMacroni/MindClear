import dotenv from 'dotenv';
import logger from './utils/logger.js';
import { validateConfiguration, getConfigurationSummary } from './utils/configValidator.js';
import { isIPInAnyCIDR, parseCIDRString, isValidCIDR } from './utils/cidrValidator.js';

const env = process.env.NODE_ENV || 'development';
// Load base, then local, then env-specific, then env-specific local (highest precedence)
dotenv.config();
dotenv.config({ path: `.env.local`, override: true });
dotenv.config({ path: `.env.${env}`, override: true });
dotenv.config({ path: `.env.${env}.local`, override: true });

// Validate configuration on startup
try {
  validateConfiguration();
  logger.info('Configuration summary:', getConfigurationSummary());
} catch (error) {
  logger.error('Configuration validation failed:', error.message);
  if (process.env.NODE_ENV !== 'test') {
    process.exit(1);
  }
}

import express from 'express';
import http from 'http';
import cors from 'cors';
import { createClient } from '@supabase/supabase-js';
import { requireAuth } from './middleware/auth.js';
import {
  helmetConfig,
  globalRateLimit,
  authRateLimit,
  chatRateLimit,
  slowDownConfig,
  compressionConfig,
  requestSizeLimit,
  securityHeaders,
  securityLogging
} from './middleware/security.js';
import { requestTracking, errorTracking } from './middleware/requestTracking.js';
import goalsRouter from './routes/goals.js';
import tasksRouter from './routes/tasks.js';
import googleAuthRoutes from './routes/googleAuth.js';
import googleMobileAuthRoutes from './routes/googleMobileAuth.js';
import authRouter from './routes/auth.js';
import calendarRouter from './routes/calendar.js';
import aiRouter from './routes/ai.js';
import conversationsRouter from './routes/conversations.js';
import assistantChatRouter from './routes/assistantChat.js';
import userRouter from './routes/user.js';
import analyticsRouter from './routes/analytics.js';
import routinesRouter from './routes/routines.js';
import cron from 'node-cron';
import { syncGoogleCalendarEvents } from './utils/syncService.js';
import { sendNotification, sendRoutineReminder } from './services/notificationService.js';
import { initializeFirebaseAdmin } from './utils/firebaseAdmin.js';
import webSocketManager from './utils/webSocketManager.js';
import { toZonedTime } from 'date-fns-tz';
import { format } from 'date-fns';


const app = express();

// Secure proxy trust configuration - only trust Railway's ingress
const configureTrustProxy = () => {
  const railwayIngressCIDR = process.env.RAILWAY_INGRESS_CIDR;

  if (!railwayIngressCIDR) {
    // No CIDR configured - don't trust any proxies (secure default)
    logger.warn('RAILWAY_INGRESS_CIDR not configured. Not trusting any proxies.');
    app.set('trust proxy', false);
    return;
  }

  // Parse and validate CIDR strings
  const cidrs = parseCIDRString(railwayIngressCIDR);
  const validCIDRs = cidrs.filter(cidr => {
    if (!isValidCIDR(cidr)) {
      logger.warn(`Invalid CIDR format: ${cidr}`);
      return false;
    }
    return true;
  });

  if (validCIDRs.length === 0) {
    logger.warn('No valid CIDRs found in RAILWAY_INGRESS_CIDR. Not trusting any proxies.');
    app.set('trust proxy', false);
    return;
  }

  logger.info(`Trusting proxies from CIDRs: ${validCIDRs.join(', ')}`);

  // Set up trust proxy callback that validates against configured CIDRs
  app.set('trust proxy', (ip, hopIndex) => {
    // Only trust the first hop (immediate upstream)
    if (hopIndex !== 0) {
      return false;
    }

    const isTrusted = isIPInAnyCIDR(ip, validCIDRs);


    return isTrusted;
  });
};

// Configure secure proxy trust
configureTrustProxy();
const server = http.createServer(app);
const PORT = process.env.PORT || 5000;

// Security Middleware (applied in order)
app.use(helmetConfig); // Security headers
app.use(securityHeaders); // Additional custom security headers
app.use(compressionConfig); // Response compression
app.use(requestTracking); // Request ID tracking
app.use(securityLogging); // Security request/response logging

// CORS configuration with specific origins
const corsOptions = {
  origin: function (origin, callback) {
    // Allow requests with no origin (mobile apps, Postman, etc.)
    if (!origin) return callback(null, true);

    const allowedOrigins = [
      'http://localhost:3000',
      'http://localhost:5173',
      'http://localhost:8080',
      process.env.FRONTEND_URL,
      process.env.CORS_ORIGIN
    ].filter(Boolean); // Remove undefined values

    if (allowedOrigins.includes(origin)) {
      callback(null, true);
    } else {
      logger.warn(`CORS blocked request from origin: ${origin}`);
      callback(new Error('Not allowed by CORS'));
    }
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: [
    'Content-Type',
    'Authorization',
    'X-User-Mood',
    'X-User-Timezone',
    'X-CSRF-Token',
    'X-Requested-With'
  ],
  exposedHeaders: ['RateLimit-Limit', 'RateLimit-Remaining', 'RateLimit-Reset']
};

app.use(cors(corsOptions));

// Request size limiting
app.use(requestSizeLimit('10mb'));

// Body parsing with size limits
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Rate limiting
app.use(globalRateLimit); // Global rate limiting
app.use(slowDownConfig); // Slow down suspicious activity

// Initialize Supabase client
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_ANON_KEY;

let supabase;
if (supabaseUrl && supabaseKey) {
  supabase = createClient(supabaseUrl, supabaseKey);
  logger.info('Supabase client initialized');
} else {
  logger.warn('Supabase credentials not found. Some features may not work.');
}

// Environment check - only log non-sensitive info
logger.info('NODE_ENV:', process.env.NODE_ENV);
logger.info('PORT:', process.env.PORT);
logger.info('Environment variables loaded:', Object.keys(process.env).filter(key =>
  key.includes('URL') || key.includes('GOOGLE') || key.includes('FRONTEND')
).length, 'configured');

// Health check endpoint
app.get('/api/health', (req, res) => {
  res.json({
    status: 'OK',
    timestamp: new Date().toISOString(),
    environment: process.env.NODE_ENV || 'development'
  });
});

// Security monitoring endpoint (protected)
app.get('/api/security/summary', requireAuth, async (req, res) => {
  try {
    const { getSecuritySummary } = await import('./utils/securityMonitor.js');
    const summary = getSecuritySummary();
    res.json(summary);
  } catch (error) {
    logger.error('Error getting security summary:', error);
    res.status(500).json({ error: 'Failed to get security summary' });
  }
});

// Basic API routes
app.get('/api', (req, res) => {
  res.json({
    message: 'Welcome to Mind Clear API',
    version: '1.0.0',
    endpoints: {
      health: '/api/health',
      goals: '/api/goals',
      tasks: '/api/tasks'
    }
  });
});

app.get('/api/protected', requireAuth, (req, res) => {
  res.json({ message: `Hello, ${req.user.email}! You have accessed a protected route.` });
});

app.use('/api/goals', goalsRouter);
// Sync endpoints for milestones and milestone steps (separate from nested routes)
app.get('/api/milestones', requireAuth, async (req, res) => {
  const { getMilestones } = await import('./controllers/goalsController.js');
  return getMilestones(req, res);
});
app.get('/api/milestone-steps', requireAuth, async (req, res) => {
  const { getMilestoneSteps } = await import('./controllers/goalsController.js');
  return getMilestoneSteps(req, res);
});

app.use('/api/tasks', tasksRouter);

// Authentication routes with strict rate limiting
app.use('/api/auth', authRateLimit, authRouter);
app.use('/api/auth/google', authRateLimit, googleAuthRoutes);
app.use('/api/auth/google', authRateLimit, googleMobileAuthRoutes);

app.use('/api/calendar', calendarRouter);
app.use('/api/user', userRouter);
app.use('/api/ai', aiRouter);
app.use('/api/conversations', conversationsRouter);

app.use('/api/user', userRouter);

app.use('/api/analytics', analyticsRouter);
app.use('/api/routines', routinesRouter);

// Assistant UI streaming chat route (additive, does not affect mobile)
if (process.env.DEBUG_LOGS === 'true') logger.info('Registering assistant chat router...');
app.use('/api/chat', requireAuth, chatRateLimit, assistantChatRouter);
if (process.env.DEBUG_LOGS === 'true') logger.info('Assistant chat router registered');

async function getAllUserIds() {
  // Check if Supabase is initialized
  if (!supabase) {
    logger.warn('Supabase client not initialized. Skipping getAllUserIds.');
    return [];
  }

  // Query all user_ids from google_tokens table
  const { data, error } = await supabase
    .from('google_tokens')
    .select('user_id');

  if (error) {
    logger.error('Error fetching user IDs for Google Calendar sync:', error);
    return [];
  }

  // Return unique user IDs as an array of strings
  return data.map(row => row.user_id);
}

// Schedule sync every day at 4:00 AM CST (America/Chicago)
cron.schedule('0 4 * * *', async () => {
  // Check if Supabase is initialized
  if (!supabase) {
    logger.warn('[CRON] Supabase client not initialized. Skipping Google Calendar sync.');
    return;
  }

  logger.cron('[CRON] Starting Google Calendar sync for all users at 4:00 AM CST');
  const userIds = await getAllUserIds();
  for (const userId of userIds) {
    try {
      await syncGoogleCalendarEvents(userId);
      logger.cron(`[CRON] Synced Google Calendar for user: ${userId}`);
    } catch (err) {
      logger.error(`[CRON] Error syncing Google Calendar for user: ${userId}`, err);
    }
  }
}, {
  timezone: 'America/Chicago'
});

// --- Task Reminder Cron Job ---
const sendTaskReminders = async () => {
  // Check if Supabase is initialized
  if (!supabase) {
    logger.warn('Supabase client not initialized. Skipping sendTaskReminders.');
    return;
  }

  const now = new Date();
  const reminderWindow = new Date(now.getTime() + 30 * 60 * 1000); // 30 minutes from now

  logger.cron('[CRON] Checking for task reminders...');

  try {
    const { data: tasks, error } = await supabase
      .from('tasks')
      .select('id, user_id, title, due_date')
      .lte('due_date', reminderWindow.toISOString())
      .gte('due_date', now.toISOString())
      .eq('status', 'not_started')
      .is('reminder_sent_at', null);

    if (error) {
      logger.error('[CRON] Error fetching tasks for reminders:', error);
      return;
    }

    if (tasks && tasks.length > 0) {
      logger.cron(`[CRON] Found ${tasks.length} tasks needing reminders.`);

      // Get unique user IDs from tasks
      const userIds = [...new Set(tasks.map(task => task.user_id))];

      // Batch load user notification preferences for all users
      const { data: preferences, error: prefsError } = await supabase
        .from('user_notification_preferences')
        .select('user_id, notification_type, channel, enabled')
        .in('user_id', userIds)
        .in('notification_type', ['task_reminder', 'general']);

      if (prefsError) {
        logger.error('[CRON] Error fetching notification preferences:', prefsError);
        return;
      }

      // Create a map of user preferences for quick lookup
      const userPrefsMap = new Map();
      preferences?.forEach(pref => {
        const key = `${pref.user_id}_${pref.notification_type}_${pref.channel}`;
        userPrefsMap.set(key, pref.enabled);
      });

      // Helper function to check if user has opted into task reminders
      const shouldSendReminder = (userId) => {
        // Check for specific task_reminder preference first
        const taskReminderInApp = userPrefsMap.get(`${userId}_task_reminder_in_app`);
        const taskReminderPush = userPrefsMap.get(`${userId}_task_reminder_push`);
        const taskReminderEmail = userPrefsMap.get(`${userId}_task_reminder_email`);

        // If any channel is enabled for task_reminder, send notification
        if (taskReminderInApp === true || taskReminderPush === true || taskReminderEmail === true) {
          return true;
        }

        // If task_reminder is explicitly disabled for all channels, don't send
        if (taskReminderInApp === false && taskReminderPush === false && taskReminderEmail === false) {
          return false;
        }

        // Check for general notification preferences as fallback
        const generalInApp = userPrefsMap.get(`${userId}_general_in_app`);
        const generalPush = userPrefsMap.get(`${userId}_general_push`);
        const generalEmail = userPrefsMap.get(`${userId}_general_email`);

        // If any channel is enabled for general notifications, send notification
        if (generalInApp === true || generalPush === true || generalEmail === true) {
          return true;
        }

        // If general is explicitly disabled for all channels, don't send
        if (generalInApp === false && generalPush === false && generalEmail === false) {
          return false;
        }

        // Default behavior: treat missing preferences as opt-out (conservative approach)
        return false;
      };

      // Process each task
      for (const task of tasks) {
        try {
          // Check if user has opted into task reminders
          if (!shouldSendReminder(task.user_id)) {
            logger.cron(`[CRON] User ${task.user_id} has opted out of task reminders. Skipping task ${task.id}.`);
            continue;
          }

          const notification = {
            notification_type: 'task_reminder',
            title: `Reminder: ${task.title}`,
            message: `This task is due at ${new Date(task.due_date).toLocaleTimeString()}.`,
            details: { taskId: task.id }
          };

          // Send notification and handle result
          const result = await sendNotification(task.user_id, notification);

          if (result.success) {
            // Only mark reminder as sent if notification was successfully sent
            const { error: updateError } = await supabase
              .from('tasks')
              .update({ reminder_sent_at: new Date().toISOString() })
              .eq('id', task.id);

            if (updateError) {
              logger.error(`[CRON] Failed to mark reminder as sent for task ${task.id}:`, updateError);
            } else {
              logger.cron(`[CRON] Successfully sent reminder for task ${task.id} to user ${task.user_id}`);
            }
          } else {
            // Log failed send but don't mark reminder as sent
            logger.error(`[CRON] Failed to send reminder for task ${task.id} to user ${task.user_id}:`, result.error);
          }
        } catch (taskError) {
          // Log individual task errors but continue processing other tasks
          logger.error(`[CRON] Exception processing task ${task.id}:`, taskError);
        }
      }
    } else {
      logger.cron('[CRON] No tasks need reminders at this time.');
    }
  } catch (err) {
    logger.error('[CRON] Exception in sendTaskReminders:', err);
  }
};

// Schedule task reminder check to run every 5 minutes
cron.schedule('*/5 * * * *', sendTaskReminders);

// --- Daily Focus Reminder Cron Job (Optimized) ---
const sendDailyFocusReminders = async () => {
  const startTime = Date.now();

  // Check if Supabase is initialized
  if (!supabase) {
    logger.warn('[CRON] Supabase client not initialized. Skipping daily focus reminders.');
    return;
  }

  logger.cron('[CRON] Checking for daily focus reminders...');

  try {
    // Get current time in UTC
    const now = new Date();
    const currentDate = now.toISOString().split('T')[0]; // YYYY-MM-DD format

    // Optimized SQL query: Use database-level filtering to find users who need notifications
    // This replaces the in-memory scan with a targeted SQL query
    const queryStartTime = Date.now();

    const { data: users, error: usersError } = await supabase
      .rpc('get_users_for_focus_notifications', {
        current_utc_time: now.toISOString(),
        target_date: currentDate
      });

    const queryDuration = Date.now() - queryStartTime;
    logger.cron(`[CRON] Focus notification query completed in ${queryDuration}ms, found ${users?.length || 0} users`);

    // Alert if query takes too long (> 1 second)
    if (queryDuration > 1000) {
      logger.warn(`[CRON] SLOW QUERY ALERT: Focus notification query took ${queryDuration}ms (> 1s threshold)`);
    }

    if (usersError) {
      logger.error('[CRON] Error fetching users for focus reminders:', usersError);
      return;
    }

    if (!users || users.length === 0) {
      logger.cron('[CRON] No users found for focus reminders');
      return;
    }

    // Note: Removed push-only preference gating - let sendNotification handle all channels

    // Import the notification service
    const { sendDailyFocusReminder } = await import('./services/notificationService.js');

    let notificationsSent = 0;
    let notificationsSkipped = 0;
    let notificationsFailed = 0;

    // Process each user
    for (const user of users) {
      try {
        // Let sendNotification handle channel preferences internally

        // Get user's focus task for today
        const { data: focusTask, error: taskError } = await supabase
          .from('tasks')
          .select('id, title, description')
          .eq('user_id', user.id)
          .eq('is_today_focus', true)
          .eq('status', 'not_started')
          .maybeSingle();

        if (taskError) {
          logger.error(`[CRON] Error fetching focus task for user ${user.id}:`, taskError);
          notificationsFailed++;
          continue;
        }

        // If no focus task found, skip this user
        if (!focusTask) {
          logger.cron(`[CRON] No focus task found for user ${user.id}`);
          notificationsSkipped++;
          continue;
        }

        // Send the notification
        const result = await sendDailyFocusReminder(user.id, focusTask, user.full_name);

        if (result.success) {
          // Update last_focus_notification_sent timestamp
          const { error: updateError } = await supabase
            .from('users')
            .update({ last_focus_notification_sent: now.toISOString() })
            .eq('id', user.id);

          if (updateError) {
            logger.error(`[CRON] Failed to update last_focus_notification_sent for user ${user.id}:`, updateError);
            notificationsFailed++;
          } else {
            logger.cron(`[CRON] Successfully sent daily focus reminder to user ${user.id}`);
            notificationsSent++;
          }
        } else {
          logger.error(`[CRON] Failed to send focus reminder to user ${user.id}:`, result.error);
          notificationsFailed++;
        }
      } catch (userError) {
        logger.error(`[CRON] Exception processing user ${user.id} for focus reminder:`, userError);
        notificationsFailed++;
      }
    }

    // Log performance metrics
    const totalDuration = Date.now() - startTime;
    logger.cron(`[CRON] Focus reminder job completed in ${totalDuration}ms - Sent: ${notificationsSent}, Skipped: ${notificationsSkipped}, Failed: ${notificationsFailed}`);

    // Alert if total job takes too long (> 30 seconds)
    if (totalDuration > 30000) {
      logger.warn(`[CRON] SLOW JOB ALERT: Focus reminder job took ${totalDuration}ms (> 30s threshold)`);
    }

  } catch (err) {
    logger.error('[CRON] Exception in sendDailyFocusReminders:', err);
  }
};

// Schedule daily focus reminder check to run every 5 minutes (optimized frequency)
// This reduces database load while maintaining reasonable notification precision
cron.schedule('*/5 * * * *', sendDailyFocusReminders);

// --- Routine Reminder Cron Job ---
const sendRoutineReminders = async () => {
  // Check if Supabase is initialized
  if (!supabase) {
    logger.warn('[CRON] Supabase client not initialized. Skipping routine reminders.');
    return;
  }

  logger.cron('[CRON] Checking for routine reminders...');

  try {
    const now = new Date(); // Current server time (UTC usually)

    // 1. Fetch all active routines with reminders enabled
    const { data: routines, error } = await supabase
      .from('routines')
      .select('*, users!inner(timezone)')
      .eq('is_active', true)
      .eq('reminder_enabled', true);

    if (error) {
      logger.error('[CRON] Error fetching routines for reminders:', error);
      return;
    }

    if (!routines || routines.length === 0) {
      return;
    }

    let sentCount = 0;

    // 2. Process each routine
    for (const routine of routines) {
      try {
        const userTimezone = routine.timezone || routine.users?.timezone || 'UTC';

        // Get user's current time
        const userNow = toZonedTime(now, userTimezone);

        // Parse reminder time (HH:mm)
        if (!routine.reminder_time) continue;
        const [rHour, rMin] = routine.reminder_time.split(':').map(Number);

        // Get current user time components
        // Using native methods on the zoned date object (which treats the date as if it is in that zone)
        // BE CAREFUL: toZonedTime returns a Date which effectively holds the local time values. 
        // We should use getHours/getMinutes directly.
        const currentHour = userNow.getHours();
        const currentMin = userNow.getMinutes();

        // Calculate difference in minutes
        // We handle day wrap-around edge cases simply by ignoring them for now (cron runs every 5 mins)
        // If reminder is 23:59 and now is 00:02, we might miss it with simple math.
        // Simple minute of day comparison:
        const currentTotalMinutes = currentHour * 60 + currentMin;
        const reminderTotalMinutes = rHour * 60 + rMin;

        const diff = currentTotalMinutes - reminderTotalMinutes;

        // Check if we are within the 5 minute window (0 to 4 minutes past the reminder time)
        // This assumes cron runs every 5 minutes.
        if (diff >= 0 && diff < 5) {

          // 3. Check if already completed today (in user's timezone)
          const todayString = format(userNow, 'yyyy-MM-dd'); // YYYY-MM-DD in user's timezone
          const { count: completionCount } = await supabase
            .from('routine_completions')
            .select('*', { count: 'exact', head: true })
            .eq('routine_id', routine.id)
            .eq('period_date', todayString); // Assuming period_date aligns with YYYY-MM-DD

          if (completionCount && completionCount > 0) {
            // Already completed today, skip
            continue;
          }

          // 4. Check if we already sent a notification today
          // We look for a notification of type 'routine_reminder' for this routine sent "today"
          // We can use a rough check using server time for "last 24h" or strict "today"
          // Let's use the 'details->>routine_id' query
          const startOfUserDay = new Date(userNow);
          startOfUserDay.setHours(0, 0, 0, 0);

          // We need startOfUserDay in UTC for the query against created_at (which is UTC)
          // Actually created_at is timestamptz.
          // Simplest: Check if we sent one in the last 12 hours. Routines are daily.
          const twelveHoursAgo = new Date(now.getTime() - 12 * 60 * 60 * 1000);

          const { data: existingNotifs } = await supabase
            .from('user_notifications')
            .select('id, details')
            .eq('user_id', routine.user_id)
            .eq('notification_type', 'routine_reminder')
            .gt('created_at', twelveHoursAgo.toISOString());

          const alreadySent = existingNotifs?.some(n => n.details?.routine_id === routine.id);

          if (alreadySent) {
            continue;
          }

          // 5. Send Reminder
          const result = await sendRoutineReminder(routine.user_id, routine);
          if (result.success) {
            sentCount++;
            logger.cron(`[CRON] Sent routine reminder for "${routine.title}" to user ${routine.user_id}`);
          }
        }

      } catch (routineError) {
        logger.error(`[CRON] Error processing routine ${routine.id}:`, routineError);
      }
    }

    if (sentCount > 0) {
      logger.cron(`[CRON] Routine reminders finished. Sent: ${sentCount}`);
    }

  } catch (err) {
    logger.error('[CRON] Exception in sendRoutineReminders:', err);
  }
};

// Schedule routine reminders every 5 minutes
cron.schedule('*/5 * * * *', sendRoutineReminders);

// Initialize Firebase Admin SDK
try {
  initializeFirebaseAdmin();
  logger.info('Firebase Admin SDK initialized successfully');
} catch (error) {
  logger.warn('Firebase Admin SDK initialization failed:', error.message);
  logger.warn('Google mobile authentication will not be available');
}

// Initialize WebSocket Server
webSocketManager.init(server);

// Start server only if run directly
if (process.env.NODE_ENV !== 'test') {
  server.listen(PORT, '0.0.0.0', () => {
    logger.info(`🚀 Mind Clear API server running on port ${PORT}`);

    // Use environment-based URLs for logging
    const protocol = process.env.NODE_ENV === 'production' ? 'https' : 'http';
    const host = process.env.API_HOST || 'localhost';

    logger.info(`📊 Health check: ${protocol}://${host}:${PORT}/api/health`);

    // Only log network access in development
    if (process.env.NODE_ENV !== 'production') {
      logger.info(`🌐 Network access: ${protocol}://192.168.1.66:${PORT}/api/health`);
    }
  });
}

// Error handling middleware
app.use(errorTracking);

// Add error handlers (skip in test environment)
if (process.env.NODE_ENV !== 'test') {
  process.on('uncaughtException', (err) => {
    logger.error('Uncaught Exception:', err);
    process.exit(1);
  });

  process.on('unhandledRejection', (reason, promise) => {
    logger.error('Unhandled Rejection at:', promise, 'reason:', reason);
    process.exit(1);
  });
}

export default app; 