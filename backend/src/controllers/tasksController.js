import { createClient } from '@supabase/supabase-js';
import { dateParser } from '../utils/dateParser.js';
import { autoScheduleTasks, processRecurringTask } from './autoSchedulingController.js';
import logger from '../utils/logger.js';
import cacheService from '../utils/cacheService.js';

/**
 * Clean and normalize a user-provided search string.
 *
 * Removes surrounding quotes and trailing punctuation, strips leading filler words
 * like "my" or "the", and drops common trailing nouns such as "task(s)", "goal(s)",
 * "event(s)", "meeting", "appointment", and "reminder".
 *
 * @param {*} input - The text to normalize; if the value is not a string (or is falsy), it is returned unchanged.
 * @returns {string|*} The normalized string, or the original input when it is not a string.
function normalizeSearchText(input) {
  if (!input || typeof input !== 'string') return input;
  let q = input.trim();
  // Remove wrapping quotes and trailing punctuation
  q = q.replace(/^['"\s]+|['"\s]+$/g, '').replace(/[.!?]+$/g, '').trim();
  // Remove leading fillers
  q = q.replace(/^\b(my|the)\s+/i, '').trim();
  // Drop generic suffix nouns commonly spoken with titles
  q = q.replace(/\b(task|tasks|goal|goals|event|events|meeting|appointment|reminder)s?\b\s*$/i, '').trim();
  return q;
}

/**
 * Adjusts a YYYY-MM-DD date string to use the current year when the original year is earlier than the current year.
 *
 * @param {string} dateStr - A date string in `YYYY-MM-DD` format.
 * @returns {string} The input with the year replaced by the current year when the input matches `YYYY-MM-DD`, the original year is less than the current year, and the reconstructed date is valid; otherwise the original `dateStr`.
 */
function normalizeRolloverYear(dateStr) {
  if (!dateStr || typeof dateStr !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) {
    return dateStr;
  }
  
  const [_, year, month, day] = dateStr.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  const currentYear = new Date().getFullYear();
  
  if (parseInt(year, 10) < currentYear) {
    const rolloverCandidate = new Date(`${currentYear}-${month}-${day}T12:00:00Z`);
    return Number.isNaN(rolloverCandidate.getTime()) ? dateStr : `${currentYear}-${month}-${day}`;
  }
  
  return dateStr;
}

/**
 * Create a new task for the authenticated user from request body fields.
 *
 * Inserts a task row using fields provided in req.body (e.g., title, description, due_date, priority, goal_id,
 * scheduling and auto-scheduling fields, category, is_today_focus). Converts empty-string `goal_id` and `due_date`
 * to null before insert. If a unique constraint prevents setting more than one today-focus task, responds with a
 * specific `FOCUS_CONSTRAINT_VIOLATION` error. Records an analytics event after successful insertion (analytics
 * failures are logged and do not affect the response) and invalidates the user's task cache.
 *
 * @returns {Object} The created task record (response status 201) or an error body with status 400 for validation/DB errors or 404/500 for other controller-level failures.
 */
export async function createTask(req, res) {
  const { 
    title, 
    description, 
    due_date, 
    priority, 
    goal_id, 
    // completed (deprecated): use status; left for backward compatibility via trigger
    preferred_time_of_day, 
    deadline_type, 
    travel_time_minutes,
    // Auto-scheduling fields
    auto_schedule_enabled,
    recurrence_pattern,
    scheduling_preferences,
    weather_dependent,
    location,
    preferred_time_windows,
    max_daily_tasks,
    buffer_time_minutes,
    task_type,
    // Brain dump / focus
    is_today_focus,
    category
  } = req.body;
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
  
  // Creating task for user
  
  // Convert empty string goal_id to null
  const sanitizedGoalId = goal_id === '' ? null : goal_id;
  
  // Convert empty string due_date to null
  const sanitizedDueDate = due_date === '' ? null : due_date;
  
  const { data, error } = await supabase
    .from('tasks')
    .insert([{ 
      user_id, 
      title, 
      description, 
      due_date: sanitizedDueDate, 
      priority, 
      goal_id: sanitizedGoalId, 
      // Do not write completed directly; rely on status and sync trigger
      preferred_time_of_day, 
      deadline_type, 
      travel_time_minutes,
      category,
      is_today_focus,
      // Auto-scheduling fields
      auto_schedule_enabled,
      recurrence_pattern,
      scheduling_preferences,
      weather_dependent,
      location,
      preferred_time_windows,
      max_daily_tasks,
      buffer_time_minutes,
      task_type
    }])
    .select()
    .single();
  
  if (error) {
    // Supabase error occurred
    
    // Check if this is a unique constraint violation for is_today_focus
    if (error.message && error.message.includes('uniq_tasks_user_focus')) {
      return res.status(400).json({ 
        error: 'You already have a task set as today\'s focus. Please update your existing focus task instead.',
        code: 'FOCUS_CONSTRAINT_VIOLATION'
      });
    }
    
    return res.status(400).json({ error: error.message });
  }
  
  // Track analytics event after successful task creation
  try {
    const analyticsSupabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY);
    await analyticsSupabase
      .from('analytics_events')
      .insert({
        user_id,
        event_name: 'task_created',
        payload: {
          task_id: data.id,
          source: 'manual',
          priority: data.priority || 'medium',
          has_due_date: !!data.due_date,
          has_goal_id: !!data.goal_id,
          has_category: !!data.category,
          estimated_duration: data.buffer_time_minutes || null,
          is_today_focus: !!data.is_today_focus,
          task_type: data.task_type,
          timestamp: new Date().toISOString()
        }
      });
  } catch (analyticsError) {
    // Don't fail the request if analytics fails
    logger.warn('Failed to track task creation analytics:', analyticsError);
  }
  
  // Invalidate user's task cache since we added a new task
  cacheService.invalidateUserCache(user_id, 'tasks');
  
  res.status(201).json(data);
}

/**
 * Retrieve tasks for the authenticated user, supporting optional delta sync.
 *
 * Validates an optional `since` query parameter (ISO 8601). When `since` is provided, the endpoint bypasses the cache and returns an object `{ changed, deleted }` where `changed` are tasks updated since the timestamp and `deleted` are IDs of tasks deleted since the timestamp. When `since` is not provided, the endpoint returns the full list of tasks (cached per user) including related goal and calendar event data.
 *
 * Observable behavior:
 * - Responds 400 if `since` is present but not a valid ISO 8601 date, or on database query errors.
 * - Responds 500 on internal server failures or when fetching deleted records fails.
 */
export async function getTasks(req, res) {
  const user_id = req.user.id;
  const since = req.query.since; // For delta sync
  
  // Get the JWT from the request
  const token = req.headers.authorization?.split(' ')[1];
  
  // Validate since parameter if provided
  if (since && isNaN(Date.parse(since))) {
    return res.status(400).json({ error: 'Invalid since parameter. Expected ISO 8601 date string.' });
  }
  
  // Create cache key for this user's tasks
  const cacheKey = cacheService.generateUserKey(user_id, 'tasks');
  
  try {
    // For incremental sync, don't use cache
    if (!since) {
      // Try to get from cache first
      const cachedTasks = cacheService.get(cacheKey);
      if (cachedTasks) {
        logger.debug('Cache hit for user tasks:', user_id);
        return res.json(cachedTasks);
      }
    }

    logger.debug('Cache miss for user tasks:', user_id);
    
    // Create Supabase client with the JWT
    const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_ANON_KEY, {
      global: {
        headers: {
          Authorization: `Bearer ${token}`
        }
      }
    });
    
    let query = supabase
      .from('tasks')
      .select(`
        *,
        goals:goal_id (
          id,
          title,
          description
        ),
        calendar_events!task_id (
          id,
          start_time,
          end_time,
          title
        )
      `)
      .eq('user_id', user_id)
      .order('created_at', { ascending: false });
    
    // Add `since` filter for delta sync
    if (since) {
      query = query.gt('updated_at', since);
    }
    
    const { data, error } = await query;
    
    if (error) {
      return res.status(400).json({ error: error.message });
    }

    // For incremental sync, return in the same format as events
    if (since) {
      let deleted = [];
      const { data: deletedData, error: deletedError } = await supabase
        .from('deleted_records')
        .select('record_id')
        .eq('user_id', user_id)
        .eq('table_name', 'tasks')
        .gt('deleted_at', since);

      if (deletedError) {
        logger.error('Error fetching deleted task records:', deletedError);
        return res.status(500).json({ error: 'Failed to fetch deleted records for delta sync' });
      } else {
        deleted = deletedData.map(r => r.record_id);
      }
      
      logger.info(`[Tasks API] Returning ${data.length} changed and ${deleted.length} deleted tasks for user ${user_id}`);
      return res.json({ changed: data, deleted });
    }

    // Cache the results for full sync
    cacheService.cacheUserTasks(user_id, data);
    
    res.json(data);
  } catch (error) {
    logger.error('Error in getTasks:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
}

export async function getTaskById(req, res) {
  const user_id = req.user.id;
  const { id } = req.params;
  
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
  
  const { data, error } = await supabase
    .from('tasks')
    .select('*')
    .eq('id', id)
    .eq('user_id', user_id)
    .single();
  
  if (error) {
    return res.status(404).json({ error: error.message });
  }
  res.json(data);
}

export async function updateTask(req, res) {
  const user_id = req.user.id;
  const { id } = req.params;
  const { 
    title, 
    description, 
    due_date, 
    priority, 
    goal_id, 
    completed, 
    preferred_time_of_day, 
    deadline_type, 
    travel_time_minutes, 
    status,
    estimated_duration_minutes,
    scheduled_time,
    category,
    is_today_focus,
    // Auto-scheduling fields
    auto_schedule_enabled,
    recurrence_pattern,
    scheduling_preferences,
    weather_dependent,
    location,
    preferred_time_windows,
    max_daily_tasks,
    buffer_time_minutes,
    task_type
  } = req.body;
  
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
  
  // Convert empty string goal_id to null
  const sanitizedGoalId = goal_id === '' ? null : goal_id;
  
  // Convert empty string due_date to null
  const sanitizedDueDate = due_date === '' ? null : due_date;
  
  const updateFields = {
    ...(title !== undefined && { title }),
    ...(description !== undefined && { description }),
    ...(due_date !== undefined && { due_date: sanitizedDueDate }),
    ...(priority !== undefined && { priority }),
    ...(goal_id !== undefined && { goal_id: sanitizedGoalId }),
    ...(completed !== undefined && { completed }),
    ...(preferred_time_of_day !== undefined && { preferred_time_of_day }),
    ...(deadline_type !== undefined && { deadline_type }),
    ...(travel_time_minutes !== undefined && { travel_time_minutes }),
    ...(status !== undefined && { status }),
    ...(estimated_duration_minutes !== undefined && { estimated_duration_minutes }),
    ...(scheduled_time !== undefined && { scheduled_time }),
    ...(category !== undefined && { category }),
    ...(is_today_focus !== undefined && { is_today_focus }),
    // Auto-scheduling fields
    ...(auto_schedule_enabled !== undefined && { auto_schedule_enabled }),
    ...(recurrence_pattern !== undefined && { recurrence_pattern }),
    ...(scheduling_preferences !== undefined && { scheduling_preferences }),
    ...(weather_dependent !== undefined && { weather_dependent }),
    ...(location !== undefined && { location }),
    ...(preferred_time_windows !== undefined && { preferred_time_windows }),
    ...(max_daily_tasks !== undefined && { max_daily_tasks }),
    ...(buffer_time_minutes !== undefined && { buffer_time_minutes }),
    ...(task_type !== undefined && { task_type })
  };

  // Check if this is a recurring task being completed
  const isRecurringTaskCompletion = status === 'completed' && recurrence_pattern;
  
  const { data, error } = await supabase
    .from('tasks')
    .update(updateFields)
    .eq('id', id)
    .eq('user_id', user_id)
    .select()
    .single();
  
  if (error) {
    // Supabase error occurred
    return res.status(400).json({ error: error.message });
  }

  // Handle recurring task completion
  if (isRecurringTaskCompletion && data.recurrence_pattern) {
    try {
      const updatedTask = await processRecurringTask(data, token);
      if (updatedTask) {
        // Return the updated task with new due date
        res.json(updatedTask);
        return;
      }
    } catch (recurringError) {
      // Error processing recurring task
      // Continue with normal response even if recurring processing fails
    }
  }

  res.json(data);
}

export async function deleteTask(req, res) {
  const user_id = req.user.id;
  const { id } = req.params;
  
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
  
  const { error } = await supabase
    .from('tasks')
    .delete()
    .eq('id', id)
    .eq('user_id', user_id);
  
  if (error) {
    // Supabase error occurred
    return res.status(400).json({ error: error.message });
  }
  res.status(204).send();
}

/**
 * Finds the next task to focus for today for the authenticated user and marks it as today's focus.
 *
 * Unsets the current task's focus if `current_task_id` is provided, selects the highest-priority candidate
 * task not completed and not in `exclude_ids` (optionally preferring tasks without a location when
 * `travel_preference` is `"home_only"`), ensures the chosen task has a valid `estimated_duration_minutes`
 * (defaults to 30 when missing or invalid), sets `is_today_focus = true` on the chosen task, and returns
 * the updated task row. If no candidate is found, responds with a 404 message; database/query errors
 * produce corresponding 400/500 responses.
 */
export async function getNextFocusTask(req, res) {
  const user_id = req.user.id;
  const { current_task_id, travel_preference, exclude_ids } = req.body || {};

  const token = req.headers.authorization?.split(' ')[1];
  const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_ANON_KEY, {
    global: { headers: { Authorization: `Bearer ${token}` } }
  });

  try {
    // 1) Unset current focus if provided
    if (current_task_id) {
      await supabase
        .from('tasks')
        .update({ is_today_focus: false })
        .eq('id', current_task_id)
        .eq('user_id', user_id);
    }

    // 2) Build optimized query with SQL filtering instead of JavaScript
    let query = supabase
      .from('tasks')
      .select('*')
      .eq('user_id', user_id)
      .neq('status', 'completed');

    // Apply exclusions in SQL with parameterized query for security
    const exclude = Array.isArray(exclude_ids) ? exclude_ids : [];
    
    // Validate exclude IDs to prevent injection attacks
    const validExcludeIds = exclude.filter(id => {
      // Allow integers (task IDs) or valid UUIDs
      return typeof id === 'number' || 
             (typeof id === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)) ||
             (typeof id === 'string' && /^\d+$/.test(id));
    });
    
    if (validExcludeIds.length > 0) {
      // Use Supabase's native parameter handling to prevent SQL injection
      // Pass the array directly to the 'in' operator
      query = query.not('id', 'in', validExcludeIds);
    }
    // Apply travel preference filter in SQL
    if (travel_preference === 'home_only') {
      query = query.or('location.is.null,location.eq.');
    }

    // Order by priority (high=3, medium=2, low=1) and due_date in SQL
    // Use CASE statement for priority ordering and COALESCE for null due_dates
    const { data: candidates, error: fetchErr } = await query
      .order('priority', { ascending: false, nullsLast: true })
      .order('due_date', { ascending: true, nullsLast: true })
      .limit(50); // Limit results to prevent large data transfer

    if (fetchErr) {
      return res.status(400).json({ error: fetchErr.message });
    }

    if (!candidates || candidates.length === 0) {
      return res.status(404).json({ message: 'No other tasks match your criteria.' });
    }

    // 3) Choose first candidate (already sorted by SQL)
    const next = candidates[0];
    const ensureDuration = (t) => (Number.isFinite(t.estimated_duration_minutes) && t.estimated_duration_minutes > 0) ? t.estimated_duration_minutes : 30;

    const updates = {
      is_today_focus: true,
      estimated_duration_minutes: ensureDuration(next),
    };

    const { data: updated, error: updErr } = await supabase
      .from('tasks')
      .update(updates)
      .eq('id', next.id)
      .eq('user_id', user_id)
      .select()
      .single();

    if (updErr) {
      return res.status(400).json({ error: updErr.message });
    }

    return res.json(updated);
  } catch (error) {
    return res.status(500).json({ error: 'Failed to select next focus task' });
  }
}

export async function bulkCreateTasks(req, res) {
  const tasks = req.body.tasks;
  const user_id = req.user.id;
  const token = req.headers.authorization?.split(' ')[1];
  const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_ANON_KEY, {
    global: {
      headers: {
        Authorization: `Bearer ${token}`
      }
    }
  });

  if (!Array.isArray(tasks) || tasks.length === 0) {
    return res.status(400).json({ error: 'Request body must be a non-empty array of tasks.' });
  }

  // Build normalized titles to deduplicate (case-insensitive, trim)
  const normalizeTitle = (t) => (typeof t === 'string' ? t.trim().toLowerCase() : '');
  const attemptedCount = tasks.length;

  // Fetch existing titles for this user
  const { data: existingRows, error: existingErr } = await supabase
    .from('tasks')
    .select('title')
    .eq('user_id', user_id);
  if (existingErr) {
    // Supabase fetch existing titles error
    return res.status(400).json({ error: existingErr.message });
  }
  const existingTitleSet = new Set((existingRows || []).map(r => normalizeTitle(r.title)));

  // Attach user_id to each task and sanitize fields; filter out duplicates by normalized title
  const tasksToInsert = tasks
    .filter(task => !existingTitleSet.has(normalizeTitle(task.title)))
    .map(task => ({
      user_id,
      title: task.title,
      description: task.description || '',
      due_date: task.due_date || null,
      priority: task.priority || null,
      goal_id: task.goal_id === '' ? null : (task.goal_id || null),
      preferred_time_of_day: task.preferred_time_of_day || null,
      deadline_type: task.deadline_type || null,
      travel_time_minutes: task.travel_time_minutes || null,
      category: task.category || null,
      is_today_focus: task.is_today_focus === true
    }));

  let data = [];
  if (tasksToInsert.length > 0) {
    const insertResult = await supabase
      .from('tasks')
      .insert(tasksToInsert)
      .select();
    if (insertResult.error) {
      // Supabase bulk insert error
      return res.status(400).json({ error: insertResult.error.message });
    }
    data = insertResult.data || [];
  }

  res.status(201).json(data);
}

/**
 * Create a new task for the given user using AI-provided attributes.
 *
 * Accepts task attributes in `args`, resolves a provided `related_goal` to the user's goal id by exact title match, normalizes and parses `due_date` (adjusting past-year rollovers and storing as a midday timestamp when applicable), applies sensible defaults for missing fields (category, priority, status, deadline_type), inserts the task, and records a non-fatal analytics event.
 *
 * @param {Object} args - Task attributes from the AI layer. May include `title`, `description`, `due_date` (string), `priority`, `related_goal` (title string), `preferred_time_of_day`, `deadline_type`, `travel_time_minutes`, `category`, and `status`.
 * @param {string} userId - ID of the user who will own the task.
 * @param {Object} userContext - Context containing authentication info; `userContext.token` is used for authenticated DB operations.
 * @returns {Object|{error: string}} The created task row on success, or an object with an `error` message on failure.
 */
export async function createTaskFromAI(args, userId, userContext) {
  const { title, description, due_date, priority, related_goal, preferred_time_of_day, deadline_type, travel_time_minutes, category, status } = args;
  const token = userContext?.token;

  // Helper function to determine category based on task title and context
  function determineCategory(title, description) {
    if (category) return category; // Use provided category if available

    if (!title) return 'personal';
    const titleLower = title.toLowerCase();
    // Health-related keywords (check first to avoid conflicts with work keywords)
    if (titleLower.includes('doctor') || titleLower.includes('medical appointment') ||
        titleLower.includes('call doctor') || titleLower.includes('medical') || titleLower.includes('exercise') ||
        titleLower.includes('gym') || titleLower.includes('workout') || titleLower.includes('health') ||
        titleLower.includes('medication') || titleLower.includes('therapy') || titleLower.includes('checkup') ||
        titleLower.includes('health appointment')) {
      return 'health';
    }
    
    // Work-related keywords
    if (titleLower.includes('meeting') || titleLower.includes('email') ||
        titleLower.includes('report') || titleLower.includes('project') || titleLower.includes('work') ||
        titleLower.includes('deadline') || titleLower.includes('presentation') ||
        titleLower.includes('client') || titleLower.includes('call client')) {
      return 'work';
    }
    
    // Social-related keywords
    if (titleLower.includes('social') || titleLower.includes('friend') ||
        titleLower.includes('family') || titleLower.includes('party') ||
        titleLower.includes('gathering') || titleLower.includes('event')) {
      return 'social';
    }
    
    // Default to personal if no specific category matches
    return 'personal';
  }

  // Set default values
  const defaultPriority = priority || 'medium';
  const defaultCategory = determineCategory(title, description);
  const defaultStatus = status || 'not_started';
  const defaultDeadlineType = deadline_type || 'soft';

  const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_ANON_KEY, {
    global: {
      headers: {
        Authorization: `Bearer ${token}`
      }
    }
  });

  let goalId = null;
  if (related_goal) {
    // Fetch all goals for the user and find by title
    const { data: goals, error: fetchError } = await supabase
      .from('goals')
      .select('id, title')
      .eq('user_id', userId);
    if (fetchError) {
      logger.error('Error fetching goals for task creation:', fetchError);
      return { error: fetchError.message };
    }
    const match = goals.find(g => g.title && g.title.trim().toLowerCase() === related_goal.trim().toLowerCase());
    if (match) goalId = match.id;
  }

  // Use DateParser utility for due_date parsing and normalize past years
  let parsedDueDate = due_date;
  if (due_date && typeof due_date === 'string') {
    // If it's already in YYYY-MM-DD format, normalize past years
    if (/^\d{4}-\d{2}-\d{2}$/.test(due_date)) {
      parsedDueDate = normalizeRolloverYear(due_date);
    } else {
      parsedDueDate = dateParser.parse(due_date);
      
      // Also normalize DateParser results if they're in the past
      if (parsedDueDate && /^\d{4}-\d{2}-\d{2}$/.test(parsedDueDate)) {
        parsedDueDate = normalizeRolloverYear(parsedDueDate);
      }
    }
  }

  // Ensure due_date is stored as a proper date string to avoid timezone conversion
  let finalDueDate = parsedDueDate;
  if (parsedDueDate && /^\d{4}-\d{2}-\d{2}$/.test(parsedDueDate)) {
    // Add T12:00:00 for consistent midday representation
    finalDueDate = `${parsedDueDate}T12:00:00`;
  }

  const { data, error } = await supabase
    .from('tasks')
    .insert([{ 
      user_id: userId, 
      title, 
      description, 
      due_date: finalDueDate,
      priority: defaultPriority,
      goal_id: goalId,
      preferred_time_of_day,
      deadline_type: defaultDeadlineType,
      travel_time_minutes,
      category: defaultCategory,
      status: defaultStatus
    }])
    .select()
    .single();

  if (error) {
    return { error: error.message };
  }

  // Track analytics event for AI-created tasks (after successful insertion)
  try {
    const analyticsSupabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY);
    await analyticsSupabase
      .from('analytics_events')
      .insert({
        user_id: userId,
        event_name: 'task_created',
        payload: {
          source: 'ai',
          task_id: data.id,
          priority: defaultPriority,
          has_due_date: !!due_date,
          has_related_goal: !!related_goal,
          has_category: !!defaultCategory,
          preferred_time_of_day: preferred_time_of_day || null,
          category: defaultCategory,
          status: defaultStatus,
          deadline_type: defaultDeadlineType,
          timestamp: new Date().toISOString()
        }
      });
  } catch (analyticsError) {
    // Don't fail the request if analytics fails
    logger.warn('Failed to track AI task creation analytics:', analyticsError);
  }

  return data;
}

/**
 * Update an existing task using AI-provided fields; resolves task by `id` or by fuzzy `title` when `id` is absent.
 *
 * Accepts partial task fields and applies them to the matched task for the given user. When `title` is provided but `id` is not, performs a case-insensitive partial match against the user's task titles and selects the most recently created match. When `related_goal` is provided, resolves it to a goal id by exact case-insensitive title match among the user's goals. If `due_date` is provided as a string it is parsed via the project's date parser. For backwards compatibility, `completed: true` sets `status` to `"completed"`, while `completed: false` does not change the existing status.
 *
 * @param {Object} args - Fields to update or lookup information.
 * @param {string} [args.id] - Task id to update; if omitted, `title` may be used to resolve the task.
 * @param {string} [args.title] - Title used for fuzzy lookup when `id` is not provided.
 * @param {string} [args.description] - New description for the task.
 * @param {string|Date} [args.due_date] - New due date; string values are parsed.
 * @param {string} [args.priority] - New priority value.
 * @param {string} [args.related_goal] - Goal title to resolve and link; resolved by exact case-insensitive title match.
 * @param {boolean} [args.completed] - Deprecated: when `true` sets `status` to `"completed"`; when `false` does not modify status.
 * @param {string} [args.status] - New status for the task (overrides `completed`).
 * @param {string} [args.preferred_time_of_day] - Preferred time of day value.
 * @param {string} [args.deadline_type] - Deadline type value.
 * @param {number} [args.travel_time_minutes] - Travel time in minutes.
 * @param {string} userId - ID of the user owning the task.
 * @param {Object} userContext - Context containing authentication token (userContext.token).
 * @returns {Object|{error: string}} The updated task object on success, or an object with an `error` message on failure.
 */
export async function updateTaskFromAI(args, userId, userContext) {
  const { id, title, description, due_date, priority, related_goal, /* completed (deprecated) */ completed, status, preferred_time_of_day, deadline_type, travel_time_minutes } = args;
  const token = userContext?.token;
  const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_ANON_KEY, {
    global: {
      headers: {
        Authorization: `Bearer ${token}`
      }
    }
  });

  let taskId = id;
  if (!taskId && title) {
    const cleaned = normalizeSearchText(title);
    // Partial, case-insensitive match on title using ilike
    const { data: matches, error: fetchError } = await supabase
      .from('tasks')
      .select('id, title')
      .eq('user_id', userId)
      .ilike('title', `%${cleaned}%`)
      .order('created_at', { ascending: false })
      .limit(1);
    if (fetchError) return { error: fetchError.message };
    const match = Array.isArray(matches) && matches.length > 0 ? matches[0] : null;
    if (!match) return { error: `No task found matching '${cleaned}'` };
    taskId = match.id;
  }
  if (!taskId) {
    return { error: "Task ID or title is required to update a task." };
  }

  let goalId = null;
  if (related_goal) {
    // Fetch all goals for the user and find by title
    const { data: goals, error: fetchError } = await supabase
      .from('goals')
      .select('id, title')
      .eq('user_id', userId);
    if (fetchError) return { error: fetchError.message };
    const match = goals.find(g => g.title && g.title.trim().toLowerCase() === related_goal.trim().toLowerCase());
    if (match) goalId = match.id;
  }

  // Prepare update data with DateParser for due_date
  const updateData = {};
  if (description !== undefined) updateData.description = description;
  if (due_date !== undefined) {
    updateData.due_date = typeof due_date === 'string' ? dateParser.parse(due_date) : due_date;
  }
  if (status !== undefined) {
    updateData.status = status;
  } else if (completed !== undefined) {
    // Back-compat: only handle completed=true; let completed=false preserve existing status
    if (completed === true) {
      updateData.status = 'completed';
    }
    // If completed=false, don't modify status (could be in_progress or not_started)
  }
  if (preferred_time_of_day !== undefined) updateData.preferred_time_of_day = preferred_time_of_day;
  if (deadline_type !== undefined) updateData.deadline_type = deadline_type;
  if (travel_time_minutes !== undefined) updateData.travel_time_minutes = travel_time_minutes;

  const { data, error } = await supabase
    .from('tasks')
    .update(updateData)
    .eq('id', taskId)
    .eq('user_id', userId)
    .select()
    .single();

  if (error) {
    return { error: error.message };
  }
  return data;
}

export async function deleteTaskFromAI(args, userId, userContext) {
  const { id, title } = args;
  const token = userContext?.token;
  const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_ANON_KEY, {
    global: {
      headers: {
        Authorization: `Bearer ${token}`
      }
    }
  });

  let taskId = id;
  if (!taskId && title) {
    const cleaned = normalizeSearchText(title);
    // Partial, case-insensitive match
    const { data: matches, error: fetchError } = await supabase
      .from('tasks')
      .select('id, title')
      .eq('user_id', userId)
      .ilike('title', `%${cleaned}%`)
      .order('created_at', { ascending: false })
      .limit(1);
    if (fetchError) return { error: fetchError.message };
    const match = Array.isArray(matches) && matches.length > 0 ? matches[0] : null;
    if (!match) return { error: `No task found matching '${cleaned}'` };
    taskId = match.id;
  }
  if (!taskId) {
    return { error: "Task ID or title is required to delete a task." };
  }

  const { error } = await supabase
    .from('tasks')
    .delete()
    .eq('id', taskId)
    .eq('user_id', userId);

  if (error) {
    return { error: error.message };
  }
  return { success: true };
}

export async function lookupTaskbyTitle(userId, token) {
  if (!token) {
    return { error: 'No authentication token provided' };
  }

  const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_ANON_KEY, {
    global: {
      headers: {
        Authorization: `Bearer ${token}`
      }
    }
  });

  // Get ALL tasks for this user
  const { data, error } = await supabase
    .from('tasks')
    .select('id, title')
    .eq('user_id', userId)
    .order('created_at', { ascending: false });

  if (error) {
    return { error: error.message };
  }
  
  // Return all tasks with their IDs and titles
  if (data && data.length > 0) {
    return data;
  } else {
    return { error: 'No tasks found for this user' };
  }
}


export async function readTaskFromAI(args, userId, userContext) {
  const { due_date, related_goal } = args;
  const token = userContext?.token;
  const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_ANON_KEY, {
    global: {
      headers: {
        Authorization: `Bearer ${token}`
      }
    }
  });

  let query = supabase
    .from('tasks')
    .select('*')
    .eq('user_id', userId);

  if (due_date) {
    query = query.eq('due_date', due_date);
  }
  if (related_goal) {
    // First get the goal ID
    const { data: goals, error: goalError } = await supabase
      .from('goals')
      .select('id, title')
      .eq('user_id', userId);
    if (goalError) return { error: goalError.message };
    const match = goals.find(g => g.title && g.title.trim().toLowerCase() === related_goal.trim().toLowerCase());
    if (match) {
      query = query.eq('goal_id', match.id);
    }
  }
  if (args.priority) {
    query = query.eq('priority', args.priority);
  }
  if (args.status) {
    query = query.eq('status', args.status);
  }
  // Back-compat: map completed filter to status
  if (args.completed !== undefined) {
    query = query.eq('status', args.completed ? 'completed' : 'not_started');
  }
  if (args.category) {
    query = query.eq('category', args.category);
  }
  if (args.search) {
    const cleanedSearch = normalizeSearchText(args.search);
    // Case-insensitive partial match for title or description
    query = query.or(`title.ilike.%${cleanedSearch}%,description.ilike.%${cleanedSearch}%`);
  }
  if (args.preferred_time_of_day) {
    query = query.eq('preferred_time_of_day', args.preferred_time_of_day);
  }
  if (args.deadline_type) {
    query = query.eq('deadline_type', args.deadline_type);
  }
  if (args.recurrence) {
    query = query.eq('recurrence', args.recurrence);
  }

  const { data, error } = await query.order('created_at', { ascending: false });

  if (error) {
    return { error: error.message };
  }
  return data;
}

/**
 * Set the auto-scheduling enabled state for a user's task.
 *
 * Updates the task's `auto_schedule_enabled` field for the authenticated user unless the task's status is `completed`.
 *
 * @returns {Object} The updated task row.
 */

export async function toggleAutoSchedule(req, res) {
  const user_id = req.user.id;
  const { id } = req.params;
  const { auto_schedule_enabled } = req.body;
  
  const token = req.headers.authorization?.split(' ')[1];
  const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_ANON_KEY, {
    global: {
      headers: {
        Authorization: `Bearer ${token}`
      }
    }
  });

  // First get the task to check its status
  const { data: task, error: taskError } = await supabase
    .from('tasks')
    .select('status')
    .eq('id', id)
    .eq('user_id', user_id)
    .single();

  if (taskError) {
    logger.error('Supabase error in toggleAutoSchedule:', taskError);
    return res.status(400).json({ error: taskError.message });
  }

  // Prevent toggling auto-schedule on completed tasks
  if (task && task.status === 'completed') {
    return res.status(400).json({ error: 'Cannot modify auto-scheduling for completed tasks' });
  }
  const { data, error } = await supabase
    .from('tasks')
    .update({ auto_schedule_enabled })
    .eq('id', id)
    .eq('user_id', user_id)
    .select()
    .single();

  if (error) {
    // Supabase error occurred
    return res.status(400).json({ error: error.message });
  }
  res.json(data);
}

export async function getAutoSchedulingDashboard(req, res) {
  const user_id = req.user.id;
  
  const token = req.headers.authorization?.split(' ')[1];
  const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_ANON_KEY, {
    global: {
      headers: {
        Authorization: `Bearer ${token}`
      }
    }
  });

  const { data, error } = await supabase
    .from('auto_scheduling_dashboard')
    .select('*')
    .eq('user_id', user_id)
    .single();

  if (error) {
    // Supabase error occurred
    return res.status(400).json({ error: error.message });
  }
  res.json(data);
}

export async function getUserSchedulingPreferences(req, res) {
  const user_id = req.user.id;
  
  const token = req.headers.authorization?.split(' ')[1];
  const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_ANON_KEY, {
    global: {
      headers: {
        Authorization: `Bearer ${token}`
      }
    }
  });

  const { data, error } = await supabase
    .from('user_scheduling_preferences')
    .select('*')
    .eq('user_id', user_id)
    .single();

  if (error) {
    // Supabase error occurred
    return res.status(400).json({ error: error.message });
  }
  res.json(data);
}

export async function updateUserSchedulingPreferences(req, res) {
  const user_id = req.user.id;
  const {
    preferred_start_time,
    preferred_end_time,
    work_days,
    max_tasks_per_day,
    buffer_time_minutes,
    weather_check_enabled,
    travel_time_enabled,
    auto_scheduling_enabled
  } = req.body;
  
  const token = req.headers.authorization?.split(' ')[1];
  const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_ANON_KEY, {
    global: {
      headers: {
        Authorization: `Bearer ${token}`
      }
    }
  });

  const updateFields = {
    ...(preferred_start_time !== undefined && { preferred_start_time }),
    ...(preferred_end_time !== undefined && { preferred_end_time }),
    ...(work_days !== undefined && { work_days }),
    ...(max_tasks_per_day !== undefined && { max_tasks_per_day }),
    ...(buffer_time_minutes !== undefined && { buffer_time_minutes }),
    ...(weather_check_enabled !== undefined && { weather_check_enabled }),
    ...(travel_time_enabled !== undefined && { travel_time_enabled }),
    ...(auto_scheduling_enabled !== undefined && { auto_scheduling_enabled })
  };

  const { data, error } = await supabase
    .from('user_scheduling_preferences')
    .update(updateFields)
    .eq('user_id', user_id)
    .select()
    .single();

  if (error) {
    // Supabase error occurred
    return res.status(400).json({ error: error.message });
  }
  res.json(data);
}

export async function getTaskSchedulingHistory(req, res) {
  const user_id = req.user.id;
  const { task_id } = req.params;
  
  const token = req.headers.authorization?.split(' ')[1];
  const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_ANON_KEY, {
    global: {
      headers: {
        Authorization: `Bearer ${token}`
      }
    }
  });

  let query = supabase
    .from('task_scheduling_history')
    .select('*')
    .eq('user_id', user_id);

  if (task_id) {
    query = query.eq('task_id', task_id);
  }

  const { data, error } = await query.order('created_at', { ascending: false });

  if (error) {
    // Supabase error occurred
    return res.status(400).json({ error: error.message });
  }
  res.json(data);
}

export async function triggerAutoScheduling(req, res) {
  const user_id = req.user.id;
  const token = req.headers.authorization?.split(' ')[1];

  try {
    const result = await autoScheduleTasks(user_id, token);
    
    if (result.error) {
      return res.status(400).json({ error: result.error });
    }
    
    res.json(result);
  } catch (error) {
    // Error in triggerAutoScheduling
    res.status(500).json({ error: 'Internal server error during auto-scheduling' });
  }
} 