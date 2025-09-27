import { createClient } from '@supabase/supabase-js';
import logger from '../utils/logger.js';

const DEBUG = process.env.DEBUG_LOGS === 'true';

/**
 * Track an analytics event
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 */
export async function trackEvent(req, res) {
  const { event_name, payload } = req.body;
  const user_id = req.user.id;

  // Get the JWT from the request
  const token = req.headers.authorization?.split(' ')[1];

  // Create Supabase client with the JWT
  const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_ANON_KEY, {
    global: {
      headers: {
        Authorization: `Bearer ${token}`
      }
    }
  });

  // Validate required fields
  if (!event_name || typeof event_name !== 'string') {
    return res.status(400).json({
      error: 'event_name is required and must be a string'
    });
  }

  // Validate payload is an object if provided
  if (payload !== undefined && (typeof payload !== 'object' || payload === null)) {
    return res.status(400).json({
      error: 'payload must be an object if provided'
    });
  }

  try {
    // Insert the analytics event
    const { data, error } = await supabase
      .from('analytics_events')
      .insert([{
        user_id,
        event_name,
        payload: payload || null
      }])
      .select()
      .single();

    if (error) {
      logger.error('Error inserting analytics event:', error);
      return res.status(500).json({
        error: 'Failed to track event'
      });
    }

    if (DEBUG) {
      logger.info(`Analytics event tracked: ${event_name} for user ${user_id}`);
    }

    // Return success response
    res.status(201).json({
      success: true,
      event_id: data.id,
      message: 'Event tracked successfully'
    });

  } catch (error) {
    logger.error('Unexpected error tracking analytics event:', error);
    res.status(500).json({
      error: 'Internal server error'
    });
  }
}

/**
 * Get analytics dashboard data
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 */
export async function getDashboardData(req, res) {
  const { timeframe = '7d' } = req.query;

  // Get the JWT from the request
  const token = req.headers.authorization?.split(' ')[1];

  // Create Supabase client with the JWT
  const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_ANON_KEY, {
    global: {
      headers: {
        Authorization: `Bearer ${token}`
      }
    }
  });

  try {
    // Calculate date range based on timeframe
    const now = new Date();
    let startDate = new Date();

    switch (timeframe) {
      case '24h':
        startDate.setHours(now.getHours() - 24);
        break;
      case '7d':
        startDate.setDate(now.getDate() - 7);
        break;
      case '30d':
        startDate.setDate(now.getDate() - 30);
        break;
      case '90d':
        startDate.setDate(now.getDate() - 90);
        break;
      default:
        startDate.setDate(now.getDate() - 7);
    }

    // Get total events count
    const { data: totalEvents, error: eventsError } = await supabase
      .from('analytics_events')
      .select('id', { count: 'exact', head: true })
      .gte('created_at', startDate.toISOString());

    if (eventsError) {
      logger.error('Error getting total events:', eventsError);
      // If table doesn't exist, return empty data
      if (eventsError.code === '42P01') { // Table doesn't exist
        return res.json({
          timeframe,
          totalEvents: 0,
          activeUsers: 0,
          goalCreations: 0,
          taskCompletions: 0,
          manualGoals: 0,
          aiGoals: 0,
          eventBreakdown: [],
          recentEvents: []
        });
      }
      return res.status(500).json({ error: 'Failed to get analytics data' });
    }

    // Get active users count (unique users in timeframe)
    const { data: activeUsers, error: usersError } = await supabase
      .from('analytics_events')
      .select('user_id')
      .gte('created_at', startDate.toISOString());

    if (usersError) {
      logger.error('Error getting active users:', usersError);
      // If table doesn't exist, return empty data
      if (usersError.code === '42P01') {
        return res.json({
          timeframe,
          totalEvents: 0,
          activeUsers: 0,
          goalCreations: 0,
          taskCompletions: 0,
          manualGoals: 0,
          aiGoals: 0,
          eventBreakdown: [],
          recentEvents: []
        });
      }
      return res.status(500).json({ error: 'Failed to get analytics data' });
    }

    const uniqueUsers = new Set(activeUsers?.map(event => event.user_id) || []);
    const activeUsersCount = uniqueUsers.size;

    // Get goal creation events
    const { data: goalEvents, error: goalError } = await supabase
      .from('analytics_events')
      .select('event_name, payload')
      .eq('event_name', 'goal_created')
      .gte('created_at', startDate.toISOString());

    if (goalError) {
      logger.error('Error getting goal events:', goalError);
      // If table doesn't exist, return empty data
      if (goalError.code === '42P01') {
        return res.json({
          timeframe,
          totalEvents: 0,
          activeUsers: 0,
          goalCreations: 0,
          taskCompletions: 0,
          manualGoals: 0,
          aiGoals: 0,
          eventBreakdown: [],
          recentEvents: []
        });
      }
      return res.status(500).json({ error: 'Failed to get analytics data' });
    }

    const goalCreations = goalEvents?.length || 0;
    const manualGoals = goalEvents?.filter(event => event.payload?.source === 'manual').length || 0;
    const aiGoals = goalEvents?.filter(event => event.payload?.source === 'ai').length || 0;

    // Get task completion events
    const { data: taskEvents, error: taskError } = await supabase
      .from('analytics_events')
      .select('id')
      .eq('event_name', 'task_completed')
      .gte('created_at', startDate.toISOString());

    if (taskError) {
      logger.error('Error getting task events:', taskError);
      // If table doesn't exist, return empty data
      if (taskError.code === '42P01') {
        return res.json({
          timeframe,
          totalEvents: 0,
          activeUsers: 0,
          goalCreations: 0,
          taskCompletions: 0,
          manualGoals: 0,
          aiGoals: 0,
          eventBreakdown: [],
          recentEvents: []
        });
      }
      return res.status(500).json({ error: 'Failed to get analytics data' });
    }

    const taskCompletions = taskEvents?.length || 0;

    // Get event breakdown
    const { data: eventBreakdown, error: breakdownError } = await supabase
      .from('analytics_events')
      .select('event_name')
      .gte('created_at', startDate.toISOString());

    if (breakdownError) {
      logger.error('Error getting event breakdown:', breakdownError);
      // If table doesn't exist, return empty data
      if (breakdownError.code === '42P01') {
        return res.json({
          timeframe,
          totalEvents: 0,
          activeUsers: 0,
          goalCreations: 0,
          taskCompletions: 0,
          manualGoals: 0,
          aiGoals: 0,
          eventBreakdown: [],
          recentEvents: []
        });
      }
      return res.status(500).json({ error: 'Failed to get analytics data' });
    }

    // Count events by type
    const eventCounts = {};
    eventBreakdown?.forEach(event => {
      eventCounts[event.event_name] = (eventCounts[event.event_name] || 0) + 1;
    });

    const eventBreakdownArray = Object.entries(eventCounts).map(([event_name, count]) => ({
      event_name,
      count
    })).sort((a, b) => b.count - a.count);

    // Get recent events (last 50)
    const { data: recentEvents, error: recentError } = await supabase
      .from('analytics_events')
      .select('event_name, created_at, user_id')
      .gte('created_at', startDate.toISOString())
      .order('created_at', { ascending: false })
      .limit(50);

    if (recentError) {
      logger.error('Error getting recent events:', recentError);
      // If table doesn't exist, return empty data
      if (recentError.code === '42P01') {
        return res.json({
          timeframe,
          totalEvents: 0,
          activeUsers: 0,
          goalCreations: 0,
          taskCompletions: 0,
          manualGoals: 0,
          aiGoals: 0,
          eventBreakdown: [],
          recentEvents: []
        });
      }
      return res.status(500).json({ error: 'Failed to get analytics data' });
    }

    // Return dashboard data
    res.json({
      timeframe,
      totalEvents: totalEvents?.length || 0,
      activeUsers: activeUsersCount,
      goalCreations,
      taskCompletions,
      manualGoals,
      aiGoals,
      eventBreakdown: eventBreakdownArray,
      recentEvents: recentEvents || []
    });

  } catch (error) {
    logger.error('Unexpected error getting analytics dashboard data:', error);
    res.status(500).json({
      error: 'Internal server error'
    });
  }
}
