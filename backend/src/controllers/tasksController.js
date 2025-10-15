import { createClient } from '@supabase/supabase-js';
import { dateParser } from '../utils/dateParser.js';
import { autoScheduleTasks, processRecurringTask } from './autoSchedulingController.js';
import logger from '../utils/logger.js';
import cacheService from '../utils/cacheService.js';

// Normalize user-provided search text (e.g., strip trailing words like "task")
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

  // Track analytics event
  try {
    const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY);
    await supabase
      .from('analytics_events')
      .insert({
        user_id,
        event_name: 'task_created',
        payload: {
          source: 'manual',
          priority: priority || 'medium',
          has_due_date: !!due_date,
          has_goal_id: !!goal_id,
          has_category: !!category,
          estimated_duration: buffer_time_minutes || null,
          is_today_focus: !!is_today_focus,
          timestamp: new Date().toISOString()
        }
      });
  } catch (analyticsError) {
    // Don't fail the request if analytics fails
    logger.warn('Failed to track task creation analytics:', analyticsError);
  }
  
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
  
  // Invalidate user's task cache since we added a new task
  cacheService.invalidateUserCache(user_id, 'tasks');
  
  res.status(201).json(data);
}

export async function getTasks(req, res) {
  const user_id = req.user.id;
  
  // Get the JWT from the request
  const token = req.headers.authorization?.split(' ')[1];
  
  // Create cache key for this user's tasks
  const cacheKey = cacheService.generateUserKey(user_id, 'tasks');
  
  try {
    // Try to get from cache first
    const cachedTasks = cacheService.get(cacheKey);
    if (cachedTasks) {
      logger.debug('Cache hit for user tasks:', user_id);
      return res.json(cachedTasks);
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
    
    const { data, error } = await supabase
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
    
    if (error) {
      return res.status(400).json({ error: error.message });
    }

    // Cache the results
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
 * Momentum Mode: Find and set the next focus task for today.
 * Body: { current_task_id: string|null, travel_preference: 'allow_travel'|'home_only'|null, exclude_ids: string[] }
 * Behavior:
 * 1) If current_task_id provided, unset its is_today_focus (set false)
 * 2) Select next candidate among user's tasks:
 *    - Not completed
 *    - Not in exclude_ids
 *    - If travel_preference === 'home_only', prefer tasks without a location
 *    - Must have estimated_duration_minutes; if missing on chosen task, default to 30
 *    - Highest priority (high > medium > low), then earliest due date (nulls last)
 * 3) Set chosen task is_today_focus = true and return the full row
 * 4) If none found, return 404 with message
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
      // Use Supabase's parameterized not method with in operator for security
      // Pass the array directly to avoid string interpolation
      const exclusionList = `(${validExcludeIds
        .map((id) => (typeof id === 'number' ? id : `"${id}"`))
        .join(',')})`;
      query = query.not('id', 'in', exclusionList);
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

export async function createTaskFromAI(args, userId, userContext) {
  const { title, description, due_date, priority, related_goal, preferred_time_of_day, deadline_type, travel_time_minutes, category, status } = args;
  const token = userContext?.token;

  // Helper function to determine category based on task title and context
  function determineCategory(title, description) {
    if (category) return category; // Use provided category if available
    
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
  const defaultCategory = determineCategory(title, description, related_goal);
  const defaultStatus = status || 'not_started';
  const defaultDeadlineType = deadline_type || 'soft';

  // Track analytics event for AI-created tasks
  try {
    const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY);
    await supabase
      .from('analytics_events')
      .insert({
        user_id: userId,
        event_name: 'task_created',
        payload: {
          source: 'ai',
          priority: defaultPriority,
          has_due_date: !!due_date,
          has_related_goal: !!related_goal,
          has_category: !!defaultCategory,
          preferred_time_of_day: preferred_time_of_day || null,
          timestamp: new Date().toISOString()
        }
      });
  } catch (analyticsError) {
    // Don't fail the request if analytics fails
    logger.warn('Failed to track AI task creation analytics:', analyticsError);
  }
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
      const [_, year, month, day] = due_date.match(/^(\d{4})-(\d{2})-(\d{2})$/);
      const currentYear = new Date().getFullYear();
      
      if (parseInt(year, 10) < currentYear) {
        const rolloverCandidate = new Date(`${currentYear}-${month}-${day}T12:00:00Z`);
        parsedDueDate = Number.isNaN(rolloverCandidate.getTime())
          ? due_date
          : `${currentYear}-${month}-${day}`;
      } else {
        parsedDueDate = due_date;
      }
    } else {
      parsedDueDate = dateParser.parse(due_date);
      
      // Also normalize DateParser results if they're in the past
      if (parsedDueDate && /^\d{4}-\d{2}-\d{2}$/.test(parsedDueDate)) {
        const [_, year, month, day] = parsedDueDate.match(/^(\d{4})-(\d{2})-(\d{2})$/);
        const currentYear = new Date().getFullYear();
        
        if (parseInt(year, 10) < currentYear) {
          const rolloverCandidate = new Date(`${currentYear}-${month}-${day}T12:00:00Z`);
          if (!Number.isNaN(rolloverCandidate.getTime())) {
            parsedDueDate = `${currentYear}-${month}-${day}`;
          }
        }
      }
    }
  }

  // Ensure due_date is stored as a proper date string to avoid timezone conversion
  let finalDueDate = parsedDueDate;
  if (parsedDueDate && /^\d{4}-\d{2}-\d{2}$/.test(parsedDueDate)) {
    // Add time component to ensure it's treated as local date, not UTC
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
  return data;
}

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
  if (priority !== undefined) updateData.priority = priority;
  if (related_goal !== undefined) updateData.goal_id = goalId;
  // Prefer status as source of truth; DB trigger keeps completed mirrored while it exists
  if (status !== undefined) {
    updateData.status = status;
  } else if (completed !== undefined) {
    // Back-compat: translate completed to status if provided by older clients
    updateData.status = completed ? 'completed' : 'not_started';
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

// Auto-scheduling API endpoints

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
    logger.error('Supabase error in bulkCreateTasks:', taskError);
    return res.status(400).json({ error: taskError.message });
  }

  // Prevent toggling auto-scheduling for completed tasks
  if (task.status === 'completed') {
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