import nodemailer from 'nodemailer';
import { createClient } from '@supabase/supabase-js';
import { initializeFirebaseAdmin } from '../utils/firebaseAdmin.js';
import webSocketManager from '../utils/webSocketManager.js';
import logger from '../utils/logger.js';
import { generateFocusNotificationMessage, generateNoFocusTaskMessage, getFocusNotificationTitle } from '../utils/motivationalMessages.js';

// Module-scoped memoized transporter
let cachedTransporter = null;

/**
 * Get or create a memoized nodemailer transporter
 */
function getTransporter() {
  if (!cachedTransporter) {
    if (!process.env.FEEDBACK_EMAIL_USER || !process.env.FEEDBACK_EMAIL_PASS) {
      throw new Error('Email credentials not configured');
    }
    
    cachedTransporter = nodemailer.createTransport({
      service: process.env.EMAIL_SERVICE || 'gmail',
      auth: {
        user: process.env.FEEDBACK_EMAIL_USER,
        pass: process.env.FEEDBACK_EMAIL_PASS,
      },
    });
  }
  return cachedTransporter;
}

/**
 * Escape HTML special characters to prevent XSS
 */
function escapeHtml(text) {
  if (typeof text !== 'string') {
    return String(text || '');
  }
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#x27;')
    .replace(/\//g, '&#x2F;');
}

// Lazy initialization of Supabase client
let supabase = null;
function getSupabaseClient() {
  if (!supabase) {
    if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
      throw new Error('Supabase credentials not configured. Please check your environment variables.');
    }
    supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
  }
  return supabase;
}

// Lazy initialization of Firebase Admin
let firebaseAdmin = null;
function getFirebaseAdmin() {
  if (!firebaseAdmin) {
    try {
      firebaseAdmin = initializeFirebaseAdmin();
    } catch (error) {
      logger.warn('Firebase Admin not available:', error.message);
      return null;
    }
  }
  return firebaseAdmin;
}

/**
 * Generic function to send notifications based on user preferences.
 * @param {string} userId - The ID of the user to notify.
 * @param {object} notification - The notification object.
 * @param {string} notification.notification_type - The type of notification.
 * @param {string} notification.title - The title of the notification.
 * @param {string} notification.message - The main message of the notification.
 * @param {object} [notification.details] - Additional data for the notification.
 */
export async function sendNotification(userId, notification) {
  try {
    const { notification_type, title, message, details } = notification;

    // 1. Fetch user preferences and device tokens in parallel
    const supabaseClient = getSupabaseClient();
    const [prefsResult, tokensResult, userResult] = await Promise.all([
      supabaseClient.from('user_notification_preferences').select('*').eq('user_id', userId).eq('notification_type', notification_type),
      supabaseClient.from('user_device_tokens').select('device_token').eq('user_id', userId),
      supabaseClient.from('users').select('email, full_name').eq('id', userId).single()
    ]);

    if (userResult.error) {
      logger.error(`User not found for notification: ${userId}`, userResult.error);
      return { success: false, error: 'User not found' };
    }
    const user = userResult.data;
    const preferences = prefsResult.data || [];
    const deviceTokens = tokensResult.data?.map(t => t.device_token) || [];

    // 2. Anti-spam check: a simple check to avoid sending the exact same notification in a short period.
    const { data: recentNotifications, error: recentCheckError } = await supabaseClient
      .from('user_notifications')
      .select('id')
      .eq('user_id', userId)
      .eq('notification_type', notification_type)
      .eq('title', title)
      .gt('created_at', new Date(Date.now() - 5 * 60 * 1000).toISOString()); // 5 minutes

    if (recentNotifications && recentNotifications.length > 0) {
      logger.info(`Spam protection: Similar notification recently sent to user ${userId}. Skipping.`);
      return { success: true, message: 'Spam protection: notification skipped.' };
    }

    // 3. Determine which channels to send to based on preferences
    // If no specific preference is set, we default to in-app only.
    const shouldSend = (channel) => {
      const pref = preferences.find(p => p.channel === channel);
      return pref ? pref.enabled : channel === 'in_app'; // Default to true only for in_app
    };

    const deliveryPromises = [];

    // Send Push Notification
    if (shouldSend('push') && deviceTokens.length > 0) {
      deliveryPromises.push(sendPushNotification(deviceTokens, title, message, { ...(details || {}), userId }));
    }

    // Send Email
    if (shouldSend('email')) {
      deliveryPromises.push(sendEmailNotification(user, notification));
    }

    // Always store In-App Notification if the channel is enabled or not configured
    if (shouldSend('in_app')) {
        deliveryPromises.push(storeInAppNotification(userId, {
            notification_type,
            title,
            message,
            details,
            read: false,
            created_at: new Date().toISOString()
        }));
    }

    await Promise.all(deliveryPromises);

    return { success: true };
  } catch (error) {
    logger.error(`Failed to send notification to user ${userId}:`, error);
    return { success: false, error: error.message };
  }
}

async function sendPushNotification(tokens, title, body, data = {}) {
  const firebaseAdminInstance = getFirebaseAdmin();
  if (!firebaseAdminInstance) {
    logger.error('Firebase Admin not initialized, skipping push notification.');
    return;
  }

  // Ensure all data values are strings for FCM compatibility
  const stringifiedData = {};
  for (const [key, value] of Object.entries(data)) {
    if (value !== null && value !== undefined) {
      if (typeof value === 'object') {
        stringifiedData[key] = JSON.stringify(value);
      } else {
        stringifiedData[key] = String(value);
      }
    }
  }

  // Add title and body as strings to data payload
  stringifiedData.title = String(title);
  stringifiedData.body = String(body);

  // Compute badge count from unread notifications if available
  let badgeCount = 1; // Default fallback
  if (data.unreadCount !== undefined) {
    badgeCount = parseInt(String(data.unreadCount), 10) || 1;
  } else if (data.userId) {
    // Try to get actual unread count from database
    try {
      badgeCount = await getUnreadNotificationsCount(data.userId);
    } catch (error) {
      logger.warn('Could not fetch unread count for badge, using default:', error.message);
    }
  }

  const message = {
    notification: { title, body },
    data: stringifiedData,
    tokens: tokens,
    android: {
      priority: 'high',
    },
    apns: {
      headers: {
        'apns-push-type': 'alert',
        'apns-priority': '10',
      },
      payload: {
        aps: {
          'content-available': 1,
          badge: badgeCount,
        },
      },
    },
  };

  try {
    const response = await firebaseAdminInstance.messaging().sendEachForMulticast(message);
    logger.info(`Push notifications sent: ${response.successCount}, failed: ${response.failureCount}`);
    
    // Handle failed tokens and clean up invalid ones
    if (response.failureCount > 0) {
      await handleFailedTokens(response.responses, tokens);
    }
    
    return response;
  } catch (error) {
    logger.error('Error sending push notification:', error);
    throw error;
  }
}

/**
 * Handle failed FCM tokens and clean up invalid ones from the database
 */
async function handleFailedTokens(responses, tokens) {
  const invalidTokens = [];
  
  responses.forEach((response, index) => {
    if (!response.success && response.error) {
      const errorCode = response.error.code;
      const token = tokens[index];
      
      // Check for token errors that indicate the token should be removed
      if (errorCode === 'messaging/invalid-registration-token' ||
          errorCode === 'messaging/registration-token-not-registered' ||
          errorCode === 'messaging/invalid-argument') {
        invalidTokens.push(token);
        logger.warn(`Invalid FCM token detected: ${errorCode}`, { token: token.substring(0, 20) + '...' });
      }
    }
  });
  
  // Remove invalid tokens from database
  if (invalidTokens.length > 0) {
    try {
      const supabaseClient = getSupabaseClient();
      const { error } = await supabaseClient
        .from('user_device_tokens')
        .delete()
        .in('device_token', invalidTokens);
      
      if (error) {
        logger.error('Failed to remove invalid device tokens:', error);
      } else {
        logger.info(`Removed ${invalidTokens.length} invalid device tokens from database`);
      }
    } catch (error) {
      logger.error('Exception while removing invalid tokens:', error);
    }
  }
}

async function sendEmailNotification(user, notification) {
  const { title, message, details } = notification;
  
  try {
    const transporter = getTransporter();
    const emailBody = createGenericNotificationEmail(user.full_name, message, details);

    const mailOptions = {
      from: process.env.FEEDBACK_EMAIL_USER,
      to: user.email,
      subject: title,
      html: emailBody,
    };

    await transporter.sendMail(mailOptions);
    logger.info(`Email notification sent to ${user.email}`);
  } catch (error) {
    if (error.message === 'Email credentials not configured') {
      logger.warn('Email credentials not configured. Skipping email notification.');
      return;
    }
    logger.error(`Failed to send email to ${user.email}:`, error);
  }
}


/**
 * Send auto-scheduling notification email to user
 * @deprecated Use sendNotification instead.
 */
export async function sendAutoSchedulingNotification(userId, notificationData) {
    const { type, ...rest } = notificationData;
    // This function is now a wrapper around the new generic service.
    // It helps maintain backward compatibility where it's currently used.
    return sendNotification(userId, { notification_type: type, ...rest });
}

/**
 * Create email template for auto-scheduling completion
 */
function createAutoSchedulingCompletedEmail(userName, scheduledTasks, failedTasks) {
  const escapedUserName = escapeHtml(userName);
  
  let html = `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
      <h2 style="color: #2563eb;">Hello ${escapedUserName},</h2>
      <p>Your auto-scheduling has been completed successfully!</p>
  `;

  if (scheduledTasks.length > 0) {
    html += `
      <h3 style="color: #059669;">✅ Successfully Scheduled Tasks (${scheduledTasks.length})</h3>
      <ul style="list-style: none; padding: 0;">
    `;
    scheduledTasks.forEach(task => {
      const scheduledTime = new Date(task.scheduled_time).toLocaleString();
      const escapedTaskTitle = escapeHtml(task.task_title);
      html += `
        <li style="padding: 8px 0; border-bottom: 1px solid #e5e7eb;">
          <strong>${escapedTaskTitle}</strong><br>
          <small style="color: #6b7280;">Scheduled for: ${scheduledTime}</small>
        </li>
      `;
    });
    html += '</ul>';
  }

  if (failedTasks.length > 0) {
    html += `
      <h3 style="color: #dc2626;">❌ Failed to Schedule (${failedTasks.length})</h3>
      <ul style="list-style: none; padding: 0;">
    `;
    failedTasks.forEach(task => {
      const escapedTaskTitle = escapeHtml(task.task_title);
      const escapedReason = escapeHtml(task.reason);
      html += `
        <li style="padding: 8px 0; border-bottom: 1px solid #e5e7eb;">
          <strong>${escapedTaskTitle}</strong><br>
          <small style="color: #6b7280;">Reason: ${escapedReason}</small>
        </li>
      `;
    });
    html += '</ul>';
  }

  html += `
      <p style="margin-top: 20px;">
        <a href="${process.env.FRONTEND_URL}/dashboard" style="background-color: #2563eb; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px;">
          View Dashboard
        </a>
      </p>
      <p style="color: #6b7280; font-size: 14px; margin-top: 20px;">
        You can review and adjust your auto-scheduling preferences anytime in your dashboard.
      </p>
    </div>
  `;

  return html;
}

/**
 * Create email template for auto-scheduling errors
 */
function createAutoSchedulingErrorEmail(userName, details, failedTasks) {
  const escapedUserName = escapeHtml(userName);
  const escapedDetails = escapeHtml(details);
  
  let html = `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
      <h2 style="color: #dc2626;">Hello ${escapedUserName},</h2>
      <p>We encountered some issues while auto-scheduling your tasks:</p>
      <div style="background-color: #fef2f2; border: 1px solid #fecaca; padding: 16px; border-radius: 6px; margin: 16px 0;">
        <p style="margin: 0; color: #dc2626;"><strong>${escapedDetails}</strong></p>
      </div>
  `;

  if (failedTasks.length > 0) {
    html += `
      <h3 style="color: #dc2626;">Tasks That Couldn't Be Scheduled</h3>
      <ul style="list-style: none; padding: 0;">
    `;
    failedTasks.forEach(task => {
      const escapedTaskTitle = escapeHtml(task.task_title);
      const escapedReason = escapeHtml(task.reason);
      html += `
        <li style="padding: 8px 0; border-bottom: 1px solid #e5e7eb;">
          <strong>${escapedTaskTitle}</strong><br>
          <small style="color: #6b7280;">Reason: ${escapedReason}</small>
        </li>
      `;
    });
    html += '</ul>';
  }

  html += `
      <p style="margin-top: 20px;">
        <a href="${process.env.FRONTEND_URL}/dashboard" style="background-color: #2563eb; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px;">
          Review Tasks
        </a>
      </p>
      <p style="color: #6b7280; font-size: 14px; margin-top: 20px;">
        You can manually schedule these tasks or adjust your preferences to resolve the issues.
      </p>
    </div>
  `;

  return html;
}

/**
 * Create email template for weather conflicts
 */
function createWeatherConflictEmail(userName, details) {
  const escapedUserName = escapeHtml(userName);
  const escapedDetails = escapeHtml(details);
  
  const html = `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
      <h2 style="color: #f59e0b;">Hello ${escapedUserName},</h2>
      <p>Weather conditions affected the scheduling of some of your outdoor tasks:</p>
      <div style="background-color: #fffbeb; border: 1px solid #fed7aa; padding: 16px; border-radius: 6px; margin: 16px 0;">
        <p style="margin: 0; color: #92400e;"><strong>${escapedDetails}</strong></p>
      </div>
      <p>These tasks will be automatically rescheduled when weather conditions improve.</p>
      <p style="margin-top: 20px;">
        <a href="${process.env.FRONTEND_URL}/dashboard" style="background-color: #2563eb; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px;">
          View Dashboard
        </a>
      </p>
    </div>
  `;

  return html;
}

/**
 * Create email template for calendar conflicts
 */
function createCalendarConflictEmail(userName, details) {
  const escapedUserName = escapeHtml(userName);
  const escapedDetails = escapeHtml(details);
  
  const html = `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
      <h2 style="color: #7c3aed;">Hello ${escapedUserName},</h2>
      <p>Calendar conflicts were detected while scheduling your tasks:</p>
      <div style="background-color: #f3f4f6; border: 1px solid #d1d5db; padding: 16px; border-radius: 6px; margin: 16px 0;">
        <p style="margin: 0; color: #374151;"><strong>${escapedDetails}</strong></p>
      </div>
      <p>Some tasks were scheduled in alternative time slots to avoid conflicts.</p>
      <p style="margin-top: 20px;">
        <a href="${process.env.FRONTEND_URL}/dashboard" style="background-color: #2563eb; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px;">
          Review Schedule
        </a>
      </p>
    </div>
  `;

  return html;
}

/**
 * Create generic notification email template
 */
function createGenericNotificationEmail(userName, message, details) {
  const escapedUserName = escapeHtml(userName);
  const escapedMessage = escapeHtml(message);
  const escapedDetails = details ? escapeHtml(details) : '';
  
  const html = `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
      <h2 style="color: #2563eb;">Hello ${escapedUserName},</h2>
      <p>${escapedMessage}</p>
      ${escapedDetails ? `<p style="color: #6b7280;">${escapedDetails}</p>` : ''}
      <p style="margin-top: 20px;">
        <a href="${process.env.FRONTEND_URL}/dashboard" style="background-color: #2563eb; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px;">
          View Dashboard
        </a>
      </p>
    </div>
  `;

  return html;
}

/**
 * Store in-app notification in database
 */
async function storeInAppNotification(userId, notification) {
    try {
        const supabaseClient = getSupabaseClient();
        const { data, error: insertError } = await supabaseClient
            .from('user_notifications')
            .insert([{
                user_id: userId,
                notification_type: notification.notification_type,
                title: notification.title,
                message: notification.message,
                details: notification.details,
                read: notification.read,
                created_at: notification.created_at
            }])
            .select()
            .single();

        if (insertError) {
            logger.error(`Failed to store in-app notification for user ${userId}:`, insertError);
        } else if (data) {
            // Send real-time update
            webSocketManager.sendMessage(userId, {
                type: 'new_notification',
                payload: data
            });
        }
    } catch (error) {
        logger.error(`Exception in storeInAppNotification for user ${userId}:`, error);
    }
}

/**
 * Get user's notifications with status filter.
 */
export async function getUserNotifications(userId, status = 'unread', limit = 20) {
    try {
        // Validate and sanitize the limit parameter
        const sanitizedLimit = Math.max(1, Math.min(100, 
            Number.isNaN(parseInt(limit)) || parseInt(limit) <= 0 ? 20 : parseInt(limit)
        ));

        const supabaseClient = getSupabaseClient();
        let query = supabaseClient
            .from('user_notifications')
            .select('*')
            .eq('user_id', userId);

        if (status === 'unread') {
            query = query.eq('read', false);
        } else if (status === 'read') {
            query = query.eq('read', true);
        }
        // 'all' status doesn't need a read filter

        const { data, error } = await query
            .order('created_at', { ascending: false })
            .limit(sanitizedLimit);

        if (error) {
            logger.error(`Failed to get notifications for user ${userId}:`, error);
            return [];
        }

        return data || [];
    } catch (error) {
        logger.error(`Exception in getUserNotifications for user ${userId}:`, error);
        return [];
    }
}

/**
 * Mark notification as read
 */
export async function markNotificationAsRead(notificationId, userId) {
    try {
        const supabaseClient = getSupabaseClient();
        const { data, error } = await supabaseClient
            .from('user_notifications')
            .update({ read: true })
            .eq('id', notificationId)
            .eq('user_id', userId)
            .select('id')
            .single();

        if (error) {
            logger.error(`Failed to mark notification as read for user ${userId}:`, error);
            return { success: false, error: error.message };
        }

        if (data) {
            webSocketManager.sendMessage(userId, {
                type: 'notification_read',
                payload: { id: notificationId }
            });
        }

        return { success: true };
    } catch (error) {
        logger.error(`Exception in markNotificationAsRead for user ${userId}:`, error);
        return { success: false, error: error.message };
    }
}

export async function markAllNotificationsAsReadAndArchive(userId) {
    try {
        // First, mark all as read
        await markAllNotificationsAsRead(userId);

        // Get all read notifications
        const supabaseClient = getSupabaseClient();
        const { data: readNotifications, error: fetchError } = await supabaseClient
            .from('user_notifications')
            .select('*')
            .eq('user_id', userId)
            .eq('read', true);

        if (fetchError) {
            logger.error(`Failed to fetch read notifications for archiving for user ${userId}:`, fetchError);
            return { success: false, error: fetchError.message };
        }

        if (readNotifications && readNotifications.length > 0) {
            const archiveData = readNotifications.map(n => ({
                id: n.id,
                user_id: n.user_id,
                notification_type: n.notification_type,
                title: n.title,
                message: n.message,
                details: n.details,
                created_at: n.created_at,
            }));

            // Insert into archive table
            const { error: archiveError } = await supabaseClient
                .from('archived_user_notifications')
                .insert(archiveData);

            if (archiveError) {
                logger.error(`Failed to archive notifications for user ${userId}:`, archiveError);
                return { success: false, error: archiveError.message };
            }

            // Delete from original table
            const idsToDelete = readNotifications.map(n => n.id);
            const { error: deleteError } = await supabaseClient
                .from('user_notifications')
                .delete()
                .in('id', idsToDelete);

            if (deleteError) {
                logger.error(`Failed to delete archived notifications for user ${userId}:`, deleteError);
                // Don't fail the whole operation, as the main goal was to archive.
            }
        }

        return { success: true };
    } catch (error) {
        logger.error(`Exception in markAllNotificationsAsReadAndArchive for user ${userId}:`, error);
        return { success: false, error: error.message };
    }
}

export async function getUnreadNotificationsCount(userId) {
    try {
        const supabaseClient = getSupabaseClient();
        const { count, error } = await supabaseClient
            .from('user_notifications')
            .select('*', { count: 'exact', head: true })
            .eq('user_id', userId)
            .eq('read', false);

        if (error) {
            logger.error(`Failed to get unread notifications count for user ${userId}:`, error);
            return 0;
        }

        return Number(count) || 0;
    } catch (error) {
        logger.error(`Exception in getUnreadNotificationsCount for user ${userId}:`, error);
        return 0;
    }
}

/**
 * Mark all notifications as read for a user
 */
export async function markAllNotificationsAsRead(userId) {
    try {
        const supabaseClient = getSupabaseClient();
        const { data, error } = await supabaseClient
            .from('user_notifications')
            .update({ read: true })
            .eq('user_id', userId)
            .eq('read', false)
            .select('id');

        if (error) {
            logger.error(`Failed to mark all notifications as read for user ${userId}:`, error);
            return { success: false, error: error.message };
        }

        if (data && data.length > 0) {
            webSocketManager.sendMessage(userId, {
                type: 'all_notifications_read',
                payload: { ids: data.map(n => n.id) }
            });
        }

        return { success: true };
    } catch (error) {
        logger.error(`Exception in markAllNotificationsAsRead for user ${userId}:`, error);
        return { success: false, error: error.message };
    }
}

/**
 * Send daily focus reminder notification to user
 * @param {string} userId - The ID of the user to notify
 * @param {object} task - The focus task object (can be null if no focus task)
 * @param {string} userName - The user's full name
 * @returns {Promise<{success: boolean, error?: string}>}
 */
export async function sendDailyFocusReminder(userId, task, userName) {
    try {
        const hasFocusTask = task && task.title;
        const title = getFocusNotificationTitle(hasFocusTask);
        const message = hasFocusTask 
            ? generateFocusNotificationMessage(userName, task.title)
            : generateNoFocusTaskMessage();

        const notification = {
            notification_type: 'daily_focus_reminder',
            title,
            message,
            details: hasFocusTask ? { 
                taskId: task.id, 
                taskTitle: task.title,
                hasFocusTask: true 
            } : { 
                hasFocusTask: false 
            }
        };

        const result = await sendNotification(userId, notification);
        
        if (result.success) {
            logger.info(`Daily focus reminder sent to user ${userId}${hasFocusTask ? ` for task: ${task.title}` : ' (no focus task set)'}`);
        }
        
        return result;
    } catch (error) {
        logger.error(`Failed to send daily focus reminder to user ${userId}:`, error);
        return { success: false, error: error.message };
    }
}