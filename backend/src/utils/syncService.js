import { listCalendarEvents } from './calendarService.js';
import logger from './logger.js';
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
const env = process.env.NODE_ENV || 'development';
dotenv.config();
dotenv.config({ path: `.env.local`, override: true });
dotenv.config({ path: `.env.${env}`, override: true });
dotenv.config({ path: `.env.${env}.local`, override: true });

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

/**
 * Syncs Google Calendar events for a user into the local calendar_events table.
 * Upserts by user_id + google_event_id to prevent duplicates.
 * Date range is based on user subscription tier:
 * - Free/Basic: today to 60 days ahead
 * - Premium: today to 365 days ahead
 * @param {string} userId
 * @returns {Promise<{success: boolean, count: number}>}
 */
export async function syncGoogleCalendarEvents(userId) {
  // Get user's subscription tier
  const subscriptionTier = await getUserSubscriptionTier(userId);
  logger.info(`[Calendar Sync] User ${userId} has subscription tier: ${subscriptionTier}`);
  
  // Calculate date range based on subscription tier
  const { timeMin, timeMax } = calculateDateRangeForTier(subscriptionTier);
  logger.info(`[Calendar Sync] Date range for user ${userId}: ${timeMin.toISOString()} to ${timeMax.toISOString()}`);

  // We will page through Google events via listCalendarEvents' maxResults window
  // If listCalendarEvents adds pagination later, this function will still upsert idempotently
  const maxResults = 2500; // Google API max per call
  const googleEvents = await listCalendarEvents(userId, maxResults, timeMin, timeMax);

  let importedCount = 0;
  for (const event of googleEvents) {
    const { id, summary, description, start, end, location } = event;
    const isAllDay = !!(start?.date && end?.date);
    const startTime = start?.dateTime || start?.date || null;
    const endTime = end?.dateTime || end?.date || null;

    const { error } = await supabase
      .from('calendar_events')
      .upsert([
        {
          user_id: userId,
          google_calendar_id: id,
          title: summary || '',
          description: description || '',
          start_time: startTime,
          end_time: endTime,
          location: location || '',
          event_type: 'event',
          is_all_day: isAllDay,
          updated_at: new Date().toISOString(),
        }
      ], { onConflict: 'google_calendar_id,user_id' });

    if (error) {
      logger.error('Error upserting event:', error, event);
    } else {
      importedCount += 1;
    }
  }
  
  logger.info(`[Calendar Sync] Successfully synced ${importedCount} events for user ${userId} (${subscriptionTier} tier)`);
  return { success: true, count: importedCount };
}

/**
 * Gets calendar events from the local database for a user
 * @param {string} userId
 * @param {number} maxResults - maximum number of events to return
 * @param {Date} timeMin - start time filter (optional)
 * @param {Date} timeMax - end time filter (optional)
 * @param {string} taskId - filter by task ID (optional)
 * @param {string} since - filter by updated_at timestamp (optional, for delta sync)
 * @returns {Promise<Array>} events from database
 */
export async function getCalendarEventsFromDB(userId, maxResults = 100, timeMin = null, timeMax = null, taskId = null, since = null) {
  try {


    let query = supabase
      .from('calendar_events')
      .select('*')
      .eq('user_id', userId)
      .order('start_time', { ascending: true })
      .limit(maxResults);

    // Add time filters if provided
    if (timeMin && !since) { // Do not apply timeMin if `since` is used
      query = query.gte('start_time', timeMin.toISOString());
    }
    if (timeMax && !since) { // Do not apply timeMax if `since` is used
      query = query.lte('start_time', timeMax.toISOString());
    }

    // Add task ID filter if provided
    if (taskId) {
      query = query.eq('task_id', taskId);
    }

    // Add `since` filter for delta sync
    if (since) {
      query = query.gt('updated_at', since);
    }

    const { data, error } = await query;

    if (error) {
      logger.error('Error fetching events from database:', error);
      throw error;
    }

    // Transform database format to match frontend shape and include new fields
    return data.map(event => ({
      id: event.id,
      summary: event.title,
      description: event.description,
      start: { dateTime: event.start_time, timeZone: 'UTC' },
      end: { dateTime: event.end_time, timeZone: 'UTC' },
      location: event.location,
      created: event.created_at,
      updated: event.updated_at,
      // Extra fields for client classification
      event_type: event.event_type,
      task_id: event.task_id,
      goal_id: event.goal_id,
      is_all_day: event.is_all_day
    }));
  } catch (error) {
    logger.error('Error getting calendar events from database:', error);
    throw error;
  }
}

/**
 * Gets the subscription tier for a user
 * @param {string} userId
 * @returns {Promise<string>} subscription tier ('free', 'basic', 'premium')
 */
export async function getUserSubscriptionTier(userId) {
  try {
    const { data, error } = await supabase
      .from('users')
      .select('subscription_tier')
      .eq('id', userId)
      .single();

    if (error) {
      logger.error('Error getting user subscription tier:', error);
      return 'free'; // Default to free tier on error
    }

    return data?.subscription_tier || 'free';
  } catch (error) {
    logger.error('Error getting user subscription tier:', error);
    return 'free'; // Default to free tier on error
  }
}

/**
 * Calculates date range based on user subscription tier
 * @param {string} subscriptionTier
 * @returns {Object} Object with timeMin and timeMax dates
 */
export function calculateDateRangeForTier(subscriptionTier) {
  const now = new Date();

  // Calculate start of today (00:00:00) to include all events from today
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());

  switch (subscriptionTier) {
    case 'premium':
      // Premium users: today to 365 days ahead
      return {
        timeMin: startOfToday,
        timeMax: new Date(now.getTime() + (365 * 24 * 60 * 60 * 1000))
      };
    case 'basic':
      // Basic users: today to 60 days ahead
      return {
        timeMin: startOfToday,
        timeMax: new Date(now.getTime() + (60 * 24 * 60 * 60 * 1000))
      };
    case 'free':
    default:
      // Free users: today to 60 days ahead (same as basic for now)
      return {
        timeMin: startOfToday,
        timeMax: new Date(now.getTime() + (60 * 24 * 60 * 60 * 1000))
      };
  }
} 