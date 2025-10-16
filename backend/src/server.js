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

import express from 'express'
import http from 'http'
import cors from 'cors'
import { createClient } from '@supabase/supabase-js'
import { requireAuth } from './middleware/auth.js'
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
} from './middleware/security.js'
import { requestTracking, errorTracking } from './middleware/requestTracking.js'
import goalsRouter from './routes/goals.js'
import tasksRouter from './routes/tasks.js'
import googleAuthRoutes from './routes/googleAuth.js'
import googleMobileAuthRoutes from './routes/googleMobileAuth.js'
import authRouter from './routes/auth.js'
import calendarRouter from './routes/calendar.js'
import aiRouter from './routes/ai.js'
import conversationsRouter from './routes/conversations.js'
import assistantChatRouter from './routes/assistantChat.js'
import userRouter from './routes/user.js'
import analyticsRouter from './routes/analytics.js'
import cron from 'node-cron';
import { syncGoogleCalendarEvents } from './utils/syncService.js';
import { autoScheduleTasks } from './controllers/autoSchedulingController.js';
import { sendNotification } from './services/notificationService.js';
import { initializeFirebaseAdmin } from './utils/firebaseAdmin.js';
import webSocketManager from './utils/webSocketManager.js';


const app = express()

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
    
    if (process.env.DEBUG_LOGS === 'true') {
      logger.debug(`Trust proxy check: IP ${ip} ${isTrusted ? 'trusted' : 'rejected'}`);
    }
    
    return isTrusted;
  });
};

// Configure secure proxy trust
configureTrustProxy();
const server = http.createServer(app);
const PORT = process.env.PORT || 5000

// Security Middleware (applied in order)
app.use(helmetConfig) // Security headers
app.use(securityHeaders) // Additional custom security headers
app.use(compressionConfig) // Response compression
app.use(requestTracking) // Request ID tracking
app.use(securityLogging) // Security request/response logging

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

app.use(cors(corsOptions))

// Request size limiting
app.use(requestSizeLimit('10mb'))

// Body parsing with size limits
app.use(express.json({ limit: '10mb' }))
app.use(express.urlencoded({ extended: true, limit: '10mb' }))

// Rate limiting
app.use(globalRateLimit) // Global rate limiting
app.use(slowDownConfig) // Slow down suspicious activity

// Initialize Supabase client
const supabaseUrl = process.env.SUPABASE_URL
const supabaseKey = process.env.SUPABASE_ANON_KEY

let supabase
if (supabaseUrl && supabaseKey) {
  supabase = createClient(supabaseUrl, supabaseKey)
  logger.info('Supabase client initialized')
} else {
  logger.warn('Supabase credentials not found. Some features may not work.')
}

// Environment check - only log non-sensitive info
if (process.env.DEBUG_LOGS === 'true') {
  logger.info('NODE_ENV:', process.env.NODE_ENV);
  logger.info('PORT:', process.env.PORT);
  logger.info('Environment variables loaded:', Object.keys(process.env).filter(key =>
    key.includes('URL') || key.includes('GOOGLE') || key.includes('FRONTEND')
  ).length, 'configured');
} else {
  logger.info('NODE_ENV:', process.env.NODE_ENV);
  logger.info('PORT:', process.env.PORT);
  logger.info('Environment variables loaded:', Object.keys(process.env).filter(key =>
    key.includes('URL') || key.includes('GOOGLE') || key.includes('FRONTEND')
  ).length, 'configured');
}

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
  })
})

app.get('/api/protected', requireAuth, (req, res) => {
  res.json({ message: `Hello, ${req.user.email}! You have accessed a protected route.` });
});

app.use('/api/goals', goalsRouter);

app.use('/api/tasks', tasksRouter);

// Authentication routes with strict rate limiting
app.use('/api/auth', authRateLimit, authRouter);
app.use('/api/auth/google', authRateLimit, googleAuthRoutes);
app.use('/api/auth/google', authRateLimit, googleMobileAuthRoutes);

if (process.env.DEBUG_LOGS === 'true') logger.info('Registering calendar router...');
app.use('/api/calendar', calendarRouter);
if (process.env.DEBUG_LOGS === 'true') logger.info('Calendar router registered');

if (process.env.DEBUG_LOGS === 'true') logger.info('Registering AI router...');
app.use('/api/ai', aiRouter);
if (process.env.DEBUG_LOGS === 'true') logger.info('AI router registered');

if (process.env.DEBUG_LOGS === 'true') logger.info('Registering conversations router...');
app.use('/api/conversations', conversationsRouter);
if (process.env.DEBUG_LOGS === 'true') logger.info('Conversations router registered');

app.use('/api/user', userRouter);

if (process.env.DEBUG_LOGS === 'true') logger.info('Registering analytics router...');
app.use('/api/analytics', analyticsRouter);
if (process.env.DEBUG_LOGS === 'true') logger.info('Analytics router registered');

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

async function getUsersWithAutoSchedulingEnabled() {
  // Check if Supabase is initialized
  if (!supabase) {
    logger.warn('Supabase client not initialized. Skipping getUsersWithAutoSchedulingEnabled.');
    return [];
  }

  // Query users who have auto-scheduling enabled
  const { data, error } = await supabase
    .from('user_scheduling_preferences')
    .select('user_id')
    .eq('auto_scheduling_enabled', true);

  if (error) {
    logger.error('Error fetching users with auto-scheduling enabled:', error);
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

// Schedule auto-scheduling every day at 5:00 AM CST (after calendar sync)
cron.schedule('0 5 * * *', async () => {
  // Check if Supabase is initialized
  if (!supabase) {
    logger.warn('[CRON] Supabase client not initialized. Skipping auto-scheduling.');
    return;
  }

  logger.cron('[CRON] Starting auto-scheduling for all enabled users at 5:00 AM CST');
  const userIds = await getUsersWithAutoSchedulingEnabled();
  
  if (userIds.length === 0) {
    logger.cron('[CRON] No users with auto-scheduling enabled found');
    return;
  }
  
  logger.cron(`[CRON] Found ${userIds.length} users with auto-scheduling enabled`);
  
  for (const userId of userIds) {
    try {
      // Get user's JWT token for API calls
      const { data: tokenData, error: tokenError } = await supabase
        .from('google_tokens')
        .select('access_token')
        .eq('user_id', userId)
        .single();
      
      if (tokenError || !tokenData?.access_token) {
        logger.cron(`[CRON] No valid token found for user: ${userId}, skipping auto-scheduling`);
        continue;
      }
      
      const token = tokenData.access_token;
      const result = await autoScheduleTasks(userId, token);
      
      if (result.error) {
        logger.error(`[CRON] Error auto-scheduling for user ${userId}:`, result.error);
      } else {
        logger.cron(`[CRON] Auto-scheduling completed for user: ${userId}`);
        if (result.successful > 0) {
          logger.cron(`[CRON] Successfully scheduled ${result.successful} tasks for user: ${userId}`);
        }
      }
    } catch (err) {
      logger.error(`[CRON] Error in auto-scheduling for user: ${userId}`, err);
    }
  }
}, {
  timezone: 'America/Chicago'
});

// Schedule auto-scheduling every 6 hours for recurring tasks and new tasks
cron.schedule('0 */6 * * *', async () => {
  // Check if Supabase is initialized
  if (!supabase) {
    logger.warn('[CRON] Supabase client not initialized. Skipping periodic auto-scheduling.');
    return;
  }

  logger.cron('[CRON] Starting periodic auto-scheduling check (every 6 hours)');
  const userIds = await getUsersWithAutoSchedulingEnabled();
  
  if (userIds.length === 0) {
    logger.cron('[CRON] No users with auto-scheduling enabled found for periodic check');
    return;
  }
  
  logger.cron(`[CRON] Found ${userIds.length} users for periodic auto-scheduling check`);
  
  for (const userId of userIds) {
    try {
      // Get user's JWT token for API calls
      const { data: tokenData, error: tokenError } = await supabase
        .from('google_tokens')
        .select('access_token')
        .eq('user_id', userId)
        .single();
      
      if (tokenError || !tokenData?.access_token) {
        logger.cron(`[CRON] No valid token found for user: ${userId}, skipping periodic auto-scheduling`);
        continue;
      }
      
      const token = tokenData.access_token;
      const result = await autoScheduleTasks(userId, token);
      
      if (result.error) {
        logger.error(`[CRON] Error in periodic auto-scheduling for user ${userId}:`, result.error);
      } else if (result.successful > 0) {
        logger.cron(`[CRON] Periodically scheduled ${result.successful} tasks for user: ${userId}`);
      }
    } catch (err) {
      logger.error(`[CRON] Error in periodic auto-scheduling for user: ${userId}`, err);
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