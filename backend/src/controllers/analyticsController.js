import { createClient } from '@supabase/supabase-js';
import logger from '../utils/logger.js';

const DEBUG = process.env.DEBUG_LOGS === 'true';

/**
 * Track an analytics event
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 */
export async function trackEvent(req, res) {
  // Extract event details
  const { event_name, payload } = req.body;

  // Validate user authentication
  if (!req.user || !req.user.id) {
    return res.status(401).json({
      error: 'Authentication required. User context is missing.'
    });
  }

  // Validate user ID is a string or number
  if (typeof req.user.id !== 'string' && typeof req.user.id !== 'number') {
    return res.status(401).json({
      error: 'Invalid user ID format in authentication context'
    });
  }

  const user_id = req.user.id;
  // Prefer token from enhanced auth middleware, fallback to header
  const token = req.token || req.headers.authorization?.split(' ')[1];
  if (!token) {
    return res.status(401).json({ error: 'Authorization token is required' });
  }

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
    // Fire-and-forget insert to avoid blocking the client for analytics
    // Respond immediately and process in background to prevent client timeouts
    // Note: we intentionally do not await this promise
    supabase
      .from('analytics_events')
      .insert([{
        user_id: String(user_id),
        event_name,
        payload: payload || null
      }])
      .select()
      .single()
      .then(({ data, error }) => {
        if (error) {
          logger.error('Error inserting analytics event (async):', error);
        } else if (DEBUG) {
          logger.info(`Analytics event tracked: ${event_name} for user ${user_id} (id=${data?.id})`);
        }
      })
      .catch((err) => {
        logger.error('Unexpected error tracking analytics event (async):', err);
      });

    // Return 202 Accepted immediately
    return res.status(202).json({
      success: true,
      accepted: true,
      message: 'Event accepted for processing'
    });
  } catch (error) {
    logger.error('Unexpected error scheduling analytics event:', error);
    return res.status(500).json({
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

  // Validate user authentication for dashboard access
  if (!req.user || !req.user.id) {
    return res.status(401).json({
      error: 'Authentication required to access analytics dashboard.'
    });
  }

  // Validate user ID is a string or number
  if (typeof req.user.id !== 'string' && typeof req.user.id !== 'number') {
    return res.status(401).json({
      error: 'Invalid user ID format in authentication context'
    });
  }

  // Get the JWT from the request
  const token = req.headers.authorization?.split(' ')[1];

  // Guard: Check if Bearer token is present
  if (!token) {
    return res.status(401).json({ error: 'Missing or invalid token' });
  }

  // Create Supabase client conditionally based on admin status
  let supabase;
  if (req.user && req.user.is_admin) {
    // Use service-role key for admin users (no JWT header needed)
    supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
  } else {
    // Use anon key with JWT for regular users
    supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_ANON_KEY, {
      global: {
        headers: {
          Authorization: `Bearer ${token}`
        }
      }
    });
  }

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
    const { count: totalEventsCount, error: eventsError } = await supabase
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

    // Get task completion count
    const { count: taskCompletionsCount, error: taskError } = await supabase
      .from('analytics_events')
      .select('id', { count: 'exact', head: true })
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

    const taskCompletions = taskCompletionsCount || 0;

    // Get event breakdown by type
    const { data: eventBreakdownData, error: breakdownError } = await supabase
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
    eventBreakdownData?.forEach(event => {
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

    // Get AI token usage statistics
    const { data: aiTokenEvents, error: aiTokenError } = await supabase
      .from('analytics_events')
      .select('user_id, payload')
      .eq('event_name', 'ai_tokens_used')
      .gte('created_at', startDate.toISOString());

    if (aiTokenError) {
      logger.error('Error getting AI token events:', aiTokenError);
    }

    // Calculate AI token usage per user
    const tokenUsageByUser = {};
    if (aiTokenEvents) {
      aiTokenEvents.forEach(event => {
        const userId = event.user_id;
        const tokens = event.payload?.total_tokens || 0;
        tokenUsageByUser[userId] = (tokenUsageByUser[userId] || 0) + tokens;
      });
    }

    const totalTokensUsed = Object.values(tokenUsageByUser).reduce((sum, tokens) => sum + tokens, 0);
    const avgTokensPerUser = Object.keys(tokenUsageByUser).length > 0
      ? totalTokensUsed / Object.keys(tokenUsageByUser).length
      : 0;

    // Get goals created per user
    const { data: goalCreationEvents, error: goalCreationError } = await supabase
      .from('analytics_events')
      .select('user_id')
      .eq('event_name', 'goal_created')
      .gte('created_at', startDate.toISOString());

    if (goalCreationError) {
      logger.error('Error getting goal creation events:', goalCreationError);
    }

    // Calculate goals created per user
    const goalsByUser = {};
    if (goalCreationEvents) {
      goalCreationEvents.forEach(event => {
        const userId = event.user_id;
        goalsByUser[userId] = (goalsByUser[userId] || 0) + 1;
      });
    }

    const totalGoalsCreated = Object.values(goalsByUser).reduce((sum, goals) => sum + goals, 0);
    const avgGoalsPerUser = Object.keys(goalsByUser).length > 0
      ? totalGoalsCreated / Object.keys(goalsByUser).length
      : 0;

    // Get tasks created per user
    const { data: taskCreationEvents, error: taskCreationError } = await supabase
      .from('analytics_events')
      .select('user_id')
      .eq('event_name', 'task_created')
      .gte('created_at', startDate.toISOString());

    if (taskCreationError) {
      logger.error('Error getting task creation events:', taskCreationError);
    }

    // Calculate tasks created per user
    const tasksByUser = {};
    if (taskCreationEvents) {
      taskCreationEvents.forEach(event => {
        const userId = event.user_id;
        tasksByUser[userId] = (tasksByUser[userId] || 0) + 1;
      });
    }

    const totalTasksCreated = Object.values(tasksByUser).reduce((sum, tasks) => sum + tasks, 0);
    const avgTasksPerUser = Object.keys(tasksByUser).length > 0
      ? totalTasksCreated / Object.keys(tasksByUser).length
      : 0;

    // Get AI message processing statistics
    const { data: aiMessageEvents, error: aiMessageError } = await supabase
      .from('analytics_events')
      .select('event_name, user_id, payload')
      .in('event_name', ['ai_message_sent', 'ai_message_processed'])
      .gte('created_at', startDate.toISOString());

    if (aiMessageError) {
      logger.error('Error getting AI message events:', aiMessageError);
    }

    // Calculate AI usage statistics
    const aiUsageByUser = {};
    const aiUsageByEventType = {};
    let totalAiMessages = 0;
    if (aiMessageEvents) {
      aiMessageEvents.forEach(event => {
        const userId = event.user_id;
        const eventName = event.event_name;
        const actionCount = event.payload?.action_count || 1; // Treat missing action_count as 1

        // Sum action_count instead of just counting rows
        totalAiMessages += actionCount;

        // Track by event type
        aiUsageByEventType[eventName] = (aiUsageByEventType[eventName] || 0) + actionCount;

        // Track per user (using message count, not action_count for user stats)
        aiUsageByUser[userId] = (aiUsageByUser[userId] || 0) + 1;
      });
    }

    const avgAiMessagesPerUser = Object.keys(aiUsageByUser).length > 0
      ? totalAiMessages / Object.keys(aiUsageByUser).length
      : 0;

    // Create AI message event breakdown
    const aiMessageEventBreakdown = Object.entries(aiUsageByEventType).map(([event_name, total_action_count]) => ({
      event_name,
      total_action_count
    })).sort((a, b) => b.total_action_count - a.total_action_count);

    // Return dashboard data
    res.json({
      timeframe,
      totalEvents: totalEventsCount || 0,
      activeUsers: activeUsersCount,
      goalCreations,
      taskCompletions,
      manualGoals,
      aiGoals,
      eventBreakdown: eventBreakdownArray,
      recentEvents: recentEvents || [],
      aiTokenUsage: {
        totalTokensUsed,
        avgTokensPerUser: Math.round(avgTokensPerUser),
        usersWithTokens: Object.keys(tokenUsageByUser).length
      },
      aiMessageStats: {
        totalAiMessages: Math.round(totalAiMessages),
        aiMessageEventBreakdown,
        usersWithAiMessages: Object.keys(aiUsageByUser).length
      },
      perUserStats: {
        avgGoalsPerUser: Math.round(avgGoalsPerUser * 10) / 10,
        avgTasksPerUser: Math.round(avgTasksPerUser * 10) / 10,
        avgAiMessagesPerUser: Math.round(avgAiMessagesPerUser * 10) / 10,
        totalUsersWithGoals: Object.keys(goalsByUser).length,
        totalUsersWithTasks: Object.keys(tasksByUser).length,
        totalUsersWithAiUsage: Object.keys(aiUsageByUser).length
      }
    });
  } catch (error) {
    logger.error('Unexpected error getting analytics dashboard data:', error);
    res.status(500).json({
      error: 'Internal server error'
    });
  }
}
