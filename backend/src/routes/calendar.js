import express from 'express';
import logger from '../utils/logger.js';
import { requireAuth } from '../middleware/enhancedAuth.js';
import {
  listCalendarEvents,
  createCalendarEvent,
  updateCalendarEvent,
  deleteCalendarEvent,
  getCalendarList,
  getEventsForDate
} from '../utils/calendarService.js';
import { getCalendarEventsFromDB, syncGoogleCalendarEvents, getUserSubscriptionTier, calculateDateRangeForTier } from '../utils/syncService.js';
import { scheduleSingleTask } from '../controllers/autoSchedulingController.js';
import { createClient } from '@supabase/supabase-js';
import { getSupabaseClient } from '../utils/supabase.js';
import { sendNotification, sendSilentSyncNotification } from '../services/notificationService.js';

const router = express.Router();

// Initialize Supabase client for direct database operations
const supabase = createClient(
  process.env.SUPABASE_URL, 
  process.env.SUPABASE_SERVICE_ROLE_KEY // Use service role key to bypass RLS
);

// Test Supabase connection
router.get('/test-supabase', requireAuth, async (req, res) => {
  try {
    logger.info('Testing Supabase connection...');
    logger.info('SUPABASE_URL:', process.env.SUPABASE_URL ? 'Set' : 'Not set');
    logger.info('SUPABASE_SERVICE_ROLE_KEY:', process.env.SUPABASE_SERVICE_ROLE_KEY ? 'Set' : 'Not set');
    
    if (!process.env.SUPABASE_SERVICE_ROLE_KEY) {
      return res.status(500).json({ 
        error: 'SUPABASE_SERVICE_ROLE_KEY not configured',
        message: 'Please add SUPABASE_SERVICE_ROLE_KEY to your backend .env file'
      });
    }
    
    // Test basic connection with service role
    const { data, error } = await supabase
      .from('calendar_events')
      .select('count')
      .limit(1);

    if (error) {
      logger.error('Supabase test error:', error);
      return res.status(500).json({ 
        error: 'Supabase connection failed',
        details: error.message 
      });
    }

    logger.info('Supabase connection successful with service role');
    res.json({ 
      success: true, 
      message: 'Supabase connection working with service role',
      tableExists: true 
    });
  } catch (error) {
    logger.error('Error testing Supabase:', error);
    res.status(500).json({ 
      error: 'Failed to test Supabase',
      details: error.message 
    });
  }
});

// Get user's calendar list
router.get('/list', requireAuth, async (req, res) => {
  try {
    const calendars = await getCalendarList(req.user.id);
    res.json(calendars);
  } catch (error) {
    logger.error('Error getting calendar list:', error);
    res.status(500).json({ error: 'Failed to get calendar list' });
  }
});

// Get upcoming calendar events from local database
router.get('/events', requireAuth, async (req, res) => {
  try {
    const maxResults = parseInt(req.query.maxResults) || 200;
    const since = req.query.since; // For delta sync
    
    // Validate since parameter if provided
    if (since && isNaN(Date.parse(since))) {
      return res.status(400).json({ error: 'Invalid since parameter. Expected ISO 8601 date string.' });
    }    
    // Get user's subscription tier and calculate appropriate date range
    const subscriptionTier = await getUserSubscriptionTier(req.user.id);
    const { timeMin, timeMax } = calculateDateRangeForTier(subscriptionTier);
    
    logger.info(`[Calendar API] Getting events for user ${req.user.id} (${subscriptionTier} tier), maxResults: ${maxResults}`);
    logger.info(`[Calendar API] Time range: ${timeMin.toISOString()} to ${timeMax.toISOString()}`);
    
    // Get events from local database with subscription-based time range
    const syncData = await getCalendarEventsFromDB(req.user.id, maxResults, timeMin, timeMax, null, since);
    
    logger.info(`[Calendar API] Returning ${syncData.changed.length} changed and ${syncData.deleted.length} deleted events for ${subscriptionTier} tier user`);
    
    // Always return 200 with an object containing changed and deleted arrays
    res.json(syncData);
  } catch (error) {
    logger.error('Error getting calendar events from database:', error);
    res.status(500).json({ error: 'Failed to get calendar events' });
  }
});

// Get events for a specific date from local database
router.get('/events/date', requireAuth, async (req, res) => {
  const { date } = req.query;
  // Validate date (simple regex for YYYY-MM-DD)
  if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return res.status(400).json({ error: 'Missing or invalid date parameter (expected YYYY-MM-DD)' });
  }
  try {
    // Calculate time range for the specific date
    const timeMin = new Date(date + 'T00:00:00Z');
    const timeMax = new Date(date + 'T23:59:59Z');
    
    const events = await getCalendarEventsFromDB(req.user.id, 100, timeMin, timeMax);
    res.json(events);
  } catch (error) {
    logger.error('Error getting events for date from database:', error);
    res.status(500).json({ error: 'Failed to fetch events for date' });
  }
});

// Get calendar events for a specific task
router.get('/events/task/:taskId', requireAuth, async (req, res) => {
  try {
    const { taskId } = req.params;

    if (!taskId) {
      return res.status(400).json({ error: 'Task ID is required' });
    }

    logger.info(`[Calendar API] Getting events for task ${taskId} for user ${req.user.id}`);

    const events = await getCalendarEventsFromDB(req.user.id, 10, null, null, taskId);

    logger.info(`[Calendar API] Found ${events.length} events for task ${taskId}`);

    res.json(events);
  } catch (error) {
    logger.error('Error getting events for task from database:', error);
    res.status(500).json({ error: 'Failed to fetch events for task' });
  }
});

// Delete a calendar event (supports both Google Calendar and direct Supabase)
router.delete('/events/:id', requireAuth, async (req, res) => {
  try {
    const { id } = req.params;
    const { useSupabase = false } = req.query;

    logger.info(`[Calendar API] Delete request for eventId: ${id} by user: ${req.user.id}`);

    if (useSupabase) {
      // Delete event directly from Supabase
      const { error } = await supabase
        .from('calendar_events')
        .delete()
        .eq('id', id)
        .eq('user_id', req.user.id); // Ensure user owns the event

      if (error) {
        logger.error('Supabase error deleting calendar event:', error);
        return res.status(500).json({ error: 'Failed to delete calendar event' });
      }

      // Broadcast a change notification
      const channel = supabase.channel(`user-${req.user.id}-changes`);
      await channel.send({
        type: 'broadcast',
        event: 'update',
        payload: { message: `Event ${id} deleted` },
      });

      // Send a silent push notification to trigger sync on other devices
      await sendSilentSyncNotification(req.user.id).catch(err => {
        logger.error('Failed to send silent sync notification:', err);
      });

      return res.status(200).json({ message: 'Event deleted successfully' });
    } else {
      // Use existing Google Calendar integration
      await deleteCalendarEvent(req.user.id, id);
      res.status(200).json({ message: 'Event deleted successfully' });
    }
  } catch (error) {
    logger.error('Error deleting calendar event:', error);
    if (error.message.includes('No Google tokens found')) {
      res.status(401).json({ error: 'Google Calendar not connected. Please connect your Google account first.' });
    } else {
      res.status(500).json({ error: 'Failed to delete calendar event' });
    }
  }
});

// Create a new calendar event (supports both Google Calendar and direct Supabase)
router.post('/events', requireAuth, async (req, res) => {
  try {
    const { summary, description, startTime, endTime, timeZone, location, useSupabase = false, eventType, taskId, goalId, isAllDay } = req.body;

    logger.info('Creating calendar event:', { summary, startTime, endTime, useSupabase });

    if (!summary || !startTime || !endTime) {
      return res.status(400).json({ 
        error: 'Summary, startTime, and endTime are required' 
      });
    }

    if (useSupabase) {
      // Check if Supabase is properly configured
      if (!process.env.SUPABASE_URL || !process.env.SUPABASE_ANON_KEY) {
        logger.error('Supabase environment variables not configured');
        return res.status(500).json({ error: 'Supabase not configured' });
      }

      logger.info('Attempting to create event in Supabase...');
      
      // Create event directly in Supabase
      const { data, error } = await supabase
        .from('calendar_events')
        .insert({
          user_id: req.user.id,
          title: summary,
          description: description || '',
          start_time: startTime,
          end_time: endTime,
          location: location || '',
          event_type: eventType || 'event',
          task_id: taskId || null,
          goal_id: goalId || null,
          is_all_day: !!isAllDay,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })
        .select()
        .single();

      if (error) {
        logger.error('Supabase error creating calendar event:', error);
        return res.status(500).json({ 
          error: 'Failed to create calendar event'
        });
      }

      logger.info('Successfully created event in Supabase:', data);

      // Broadcast a change notification
      const channel = supabase.channel(`user-${req.user.id}-changes`);
      await channel.send({
        type: 'broadcast',
        event: 'update',
        payload: { message: `Event ${data.id} created` },
      });

      // Send a silent push notification to trigger sync on other devices
      await sendSilentSyncNotification(req.user.id).catch(err => {
        logger.error('Failed to send silent sync notification after event creation:', err);
      });

      return res.status(201).json(data);
    } else {
      // Use existing Google Calendar integration
      const eventData = {
        summary,
        description: description || '',
        startTime,
        endTime,
        timeZone: timeZone || 'UTC'
      };

      const event = await createCalendarEvent(req.user.id, eventData);
      res.status(201).json(event);
    }
  } catch (error) {
    logger.error('Error creating calendar event:', error);
    if (error.message.includes('No Google tokens found')) {
      res.status(401).json({ error: 'Google Calendar not connected. Please connect your Google account first.' });
    } else {
      res.status(500).json({ 
        error: 'Failed to create calendar event',
        details: error.message 
      });
    }
  }
});

// Update a calendar event (supports both Google Calendar and direct Supabase)
router.put('/events/:eventId', requireAuth, async (req, res) => {
  try {
    const { eventId } = req.params;
    const { summary, description, startTime, endTime, timeZone, location, useSupabase = false, eventType, taskId, goalId, isAllDay, client_updated_at } = req.body;

    if (!summary || !startTime || !endTime) {
      return res.status(400).json({ 
        error: 'Summary, startTime, and endTime are required' 
      });
    }

    if (useSupabase) {
      // Last Write Wins Check
      const { data: existingEvent, error: fetchError } = await supabase
        .from('calendar_events')
        .select('updated_at')
        .eq('id', eventId)
        .eq('user_id', req.user.id)
        .single();

      if (fetchError || !existingEvent) {
        return res.status(404).json({ error: 'Event not found' });
      }

      // Validate client_updated_at if provided
      if (client_updated_at) {
        const clientDate = new Date(client_updated_at);
        if (isNaN(clientDate.getTime())) {
          return res.status(400).json({ 
            error: 'Invalid client_updated_at: Must be a valid date string' 
          });
        }
        
        if (clientDate < new Date(existingEvent.updated_at)) {
          logger.warn(`Conflict detected for event ${eventId}. Server version is newer.`);
          // Fetch the full current event data to send back to the client
          const { data: currentEventData, error: currentEventError } = await supabase
            .from('calendar_events')
            .select('*')
            .eq('id', eventId)
            .single();
          
          return res.status(409).json({ 
            error: 'Conflict: The event has been updated on the server since your last sync.',
            server_record: currentEventData
          });
        }
      }

      // Update event directly in Supabase
      const { data, error } = await supabase
        .from('calendar_events')
        .update({
          title: summary,
          description: description || '',
          start_time: startTime,
          end_time: endTime,
          location: location || '',
          event_type: eventType || 'event',
          task_id: taskId || null,
          goal_id: goalId || null,
          is_all_day: !!isAllDay,
          updated_at: new Date().toISOString(),
        })
        .eq('id', eventId)
        .eq('user_id', req.user.id) // Ensure user owns the event
        .select()
        .single();

      if (error) {
        logger.error('Supabase error updating calendar event:', error);
        return res.status(500).json({ error: 'Failed to update calendar event' });
      }

      // Broadcast a change notification
      const channel = supabase.channel(`user-${req.user.id}-changes`);
      await channel.send({
        type: 'broadcast',
        event: 'update',
        payload: { message: `Event ${data.id} updated` },
      });
      
      // Send a silent push notification to trigger sync on other devices
      await sendSilentSyncNotification(req.user.id).catch(err => {
        logger.error('Failed to send silent sync notification after event update:', err);
      });

      res.json(data);
    } else {
      // Use existing Google Calendar integration
      const eventData = {
        summary,
        description: description || '',
        startTime,
        endTime,
        timeZone: timeZone || 'UTC'
      };

      const event = await updateCalendarEvent(req.user.id, eventId, eventData);
      res.json(event);
    }
  } catch (error) {
    logger.error('Error updating calendar event:', error);
    if (error.message.includes('No Google tokens found')) {
      res.status(401).json({ error: 'Google Calendar not connected. Please connect your Google account first.' });
    } else {
      res.status(500).json({ error: 'Failed to update calendar event' });
    }
  }
});

// Check if user has Google Calendar connected
router.get('/status', requireAuth, async (req, res) => {
  try {
    const { getGoogleTokens } = await import('../utils/googleTokenStorage.js');
    const tokens = await getGoogleTokens(req.user.id);
    
    logger.info(`[Calendar Status] User ${req.user.id} tokens:`, {
      hasTokens: !!tokens,
      hasAccessToken: !!tokens?.access_token,
      hasRefreshToken: !!tokens?.refresh_token,
      scope: tokens?.scope,
      expiryDate: tokens?.expiry_date
    });
    
    if (!tokens) {
      return res.json({ 
        connected: false, 
        error: 'calendar_status_error', 
        details: 'No Google tokens found for user' 
      });
    }
    
    if (!tokens.refresh_token) {
      return res.json({ 
        connected: false, 
        error: 'calendar_status_error', 
        details: 'No refresh token is set.' 
      });
    }
    
    // Try a lightweight Google Calendar API call to verify token validity
    try {
      const { google } = await import('googleapis');
      const oauth2Client = new google.auth.OAuth2(
        process.env.GOOGLE_CLIENT_ID,
        process.env.GOOGLE_CLIENT_SECRET,
        process.env.GOOGLE_REDIRECT_URI
      );
      oauth2Client.setCredentials({
        access_token: tokens.access_token,
        refresh_token: tokens.refresh_token,
        scope: tokens.scope,
        token_type: tokens.token_type,
        expiry_date: tokens.expiry_date
      });
      const calendar = google.calendar({ version: 'v3', auth: oauth2Client });
      // Try to list 1 event as a token check
      await calendar.events.list({ calendarId: 'primary', maxResults: 1 });
      // If successful, token is valid
      return res.json({ 
        connected: true, 
        email: req.user.email,
        lastUpdated: tokens.updated_at 
      });
    } catch (err) {
      logger.warn(`[Calendar Status] API call failed: ${err.message}`);
      // If token is invalid or expired
      if (
        (err.response && err.response.data && err.response.data.error === 'invalid_grant') ||
        (err.message && err.message.includes('Token has been expired or revoked'))
      ) {
        return res.json({ connected: false, error: 'google_calendar_disconnected' });
      }
      // Other errors
      return res.json({ connected: false, error: 'calendar_status_error', details: err.message });
    }
  } catch (error) {
    logger.error('Error checking calendar status:', error);
    res.status(500).json({ error: 'Failed to check calendar status' });
  }
});

// Manual sync endpoint
router.post('/sync', requireAuth, async (req, res) => {
  try {
    logger.info(`Manual sync requested for user: ${req.user.id}`);
    const result = await syncGoogleCalendarEvents(req.user.id);
    res.json({ 
      success: true, 
      message: `Synced ${result.count} events`,
      count: result.count 
    });
  } catch (error) {
    logger.error('Error during manual sync:', error);
    res.status(500).json({ 
      success: false, 
      error: 'Failed to sync calendar events',
      details: error.message 
    });
  }
});

// Schedule a single task using auto-scheduling logic
router.post('/schedule-task', requireAuth, async (req, res) => {
  try {
    const { taskId } = req.body;
    
    if (!taskId) {
      return res.status(400).json({ error: 'Task ID is required' });
    }

    logger.info(`Scheduling single task ${taskId} for user ${req.user.id}`);
    
    // Get the JWT token from the Authorization header
    const token = req.headers.authorization?.split(' ')[1];
    
    const result = await scheduleSingleTask(req.user.id, taskId, token);
    
    res.json({
      success: true,
      message: 'Task scheduled successfully',
      data: result
    });
  } catch (error) {
    logger.error('Error scheduling single task:', error);
    res.status(500).json({ 
      success: false, 
      error: 'Failed to schedule task',
      details: error.message 
    });
  }
});

// First-run import: sync Google → DB and set preference flag in one call
router.post('/import/first-run', requireAuth, async (req, res) => {
  try {
    logger.info(`First-run import requested for user: ${req.user.id}`);

    // 1) Sync events from Google into our DB
    const result = await syncGoogleCalendarEvents(req.user.id);

    // 2) Mark preference as completed
    const { error: prefErr } = await supabase
      .from('user_app_preferences')
      .upsert({
        user_id: req.user.id,
        calendar_first_import_completed: true,
        updated_at: new Date().toISOString(),
      }, { onConflict: 'user_id' });

    if (prefErr) {
      logger.warn('Failed to update user_app_preferences after first-run import:', prefErr);
      // Continue; the import succeeded, but we return a warning
      return res.status(200).json({
        success: true,
        count: result.count,
        warning: 'Import completed but preference flag failed to update',
      });
    }

    res.json({ success: true, count: result.count });
  } catch (error) {
    logger.error('Error during first-run import:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to complete first-run import',
      details: error.message,
    });
  }
});

// Disconnect Google Calendar
router.post('/disconnect', requireAuth, async (req, res) => {
  try {
    logger.info(`Disconnect Google Calendar requested for user: ${req.user.id}`);

    // Get current tokens to revoke them with Google
    const { getGoogleTokens, deleteGoogleTokens } = await import('../utils/googleTokenStorage.js');
    const tokens = await getGoogleTokens(req.user.id);
    
    if (!tokens) {
      logger.info(`No Google tokens found for user ${req.user.id} - already disconnected`);
      return res.json({ 
        success: true, 
        message: 'Google Calendar was already disconnected' 
      });
    }

    // Revoke the token with Google if we have an access token
    if (tokens.access_token) {
      try {
        const { google } = await import('googleapis');
        const oauth2Client = new google.auth.OAuth2(
          process.env.GOOGLE_CLIENT_ID,
          process.env.GOOGLE_CLIENT_SECRET,
          process.env.GOOGLE_REDIRECT_URI
        );
        
        oauth2Client.setCredentials({
          access_token: tokens.access_token,
          refresh_token: tokens.refresh_token
        });
        
        // Revoke the token with Google
        await oauth2Client.revokeToken(tokens.access_token);
        logger.info(`Successfully revoked Google token for user: ${req.user.id}`);
      } catch (revokeError) {
        logger.warn(`Failed to revoke Google token for user ${req.user.id}:`, revokeError);
        // Continue with local cleanup even if Google revocation fails
      }
    }

    // Delete tokens from our database
    await deleteGoogleTokens(req.user.id);
    
    // Clear only Google-synced calendar events for this user (preserve locally-created events)
    try {
      const { error: deleteEventsError } = await supabase
        .from('calendar_events')
        .delete()
        .eq('user_id', req.user.id)
        .not('google_calendar_id', 'is', null);
      
      if (deleteEventsError) {
        logger.warn('Failed to clear Google-synced calendar events:', deleteEventsError);
        // Don't fail the disconnect for cache cleanup issues
      } else {
        logger.info(`Cleared Google-synced calendar events for user: ${req.user.id} (locally-created events preserved)`);
      }
    } catch (cacheError) {
      logger.warn('Error clearing Google-synced calendar events:', cacheError);
    }

    logger.info(`Successfully disconnected Google Calendar for user: ${req.user.id}`);
    res.json({ 
      success: true, 
      message: 'Google Calendar disconnected successfully' 
    });
  } catch (error) {
    logger.error('Error disconnecting Google Calendar:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to disconnect Google Calendar',
      details: error.message,
    });
  }
});



export default router; 