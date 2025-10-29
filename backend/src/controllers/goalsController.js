import { createClient } from '@supabase/supabase-js';
import logger from '../utils/logger.js';
import { sendNotification } from '../services/notificationService.js';
const DEBUG = process.env.DEBUG_LOGS === 'true';

/**
 * Goals Controller
 * 
 * IMPORTANT: Goals vs Tasks Field Mapping
 * - Goals table has a 'category' field (USER-DEFINED type goal_category) but NO separate 'priority' field
 * - Tasks table has both 'priority' (USER-DEFINED type priority_level) and 'category' fields
 * - For goals, priority parameters are normalized to category filters to maintain API compatibility
 * - When both priority and category are provided, category takes precedence
 */

/**
 * Derives the category filter for goal queries from the provided inputs.
 *
 * If a category is present, it is returned. If no category is provided but a priority is present, the priority is used as the category filter. If both are provided, category takes precedence and a warning is logged.
 * @param {{priority?: string, category?: string}} args - Object containing optional `priority` and `category` fields.
 * @param {string} functionName - Name of the calling function used in warning logs when both `priority` and `category` are provided.
 * @returns {string|null} The category to use for filtering goals, or `null` if neither `category` nor `priority` is provided.
 */
function normalizePriorityToCategory(args, functionName) {
  let categoryFilter = args.category;
  
  if (args.priority && !args.category) {
    // If priority is provided but not category, use priority as the category filter
    categoryFilter = args.priority;
  } else if (args.priority && args.category) {
    // If both are provided, category takes precedence (log a warning for debugging)
    logger.warn(`[${functionName}] Both priority (${args.priority}) and category (${args.category}) provided. Using category.`);
  }
  
  return categoryFilter;
}

/**
 * Create a goal for the given user and, if provided, create its milestones and steps, then return the complete goal with nested milestones and steps.
 *
 * @param {string} userId - ID of the goal owner.
 * @param {Object} goalData - Goal fields: title, description, target_completion_date, and category.
 * @param {Array<Object>} [milestones] - Optional array of milestones; each may include `title`, `description`, `order`, and `steps`. Each step may be a string or an object with `text`, `order`, and `completed`.
 * @returns {Promise<Object>} The created goal including its milestones and their steps.
 * @throws {Error} If any database operation fails.
 */
async function createGoalWithMilestones(supabase, userId, goalData, milestones) {
  const { title, description, target_completion_date, category } = goalData;
  
  // Create the goal first
  const { data: goal, error: goalError } = await supabase
    .from('goals')
    .insert([{ user_id: userId, title, description, target_completion_date, category }])
    .select()
    .single();
  
  if (goalError) {
    throw new Error(goalError.message);
  }

  // If milestones are provided, create them along with their steps
  if (milestones && Array.isArray(milestones) && milestones.length > 0) {
    for (let i = 0; i < milestones.length; i++) {
      const milestone = milestones[i];
      const { title: milestoneTitle, description: milestoneDescription, steps: milestoneSteps, order: milestoneOrder = i + 1 } = milestone;
      
      // Create the milestone
      const { data: createdMilestone, error: milestoneError } = await supabase
        .from('milestones')
        .insert([{ 
          goal_id: goal.id, 
          title: milestoneTitle, 
          description: milestoneDescription,
          order: milestoneOrder 
        }])
        .select()
        .single();
      
      if (milestoneError) {
        throw new Error(`Failed to create milestone: ${milestoneError.message}`);
      }

      // If steps are provided for this milestone, create them
      if (milestoneSteps && Array.isArray(milestoneSteps) && milestoneSteps.length > 0) {
        const stepsToInsert = milestoneSteps.map((step, stepIndex) => ({
          milestone_id: createdMilestone.id,
          text: step.text || step,
          order: step.order || stepIndex + 1,
          completed: step.completed || false
        }));

        const { error: stepsError } = await supabase
          .from('steps')
          .insert(stepsToInsert);

        if (stepsError) {
          throw new Error(`Failed to create steps: ${stepsError.message}`);
        }
      }
    }
  }

  // Fetch the complete goal with milestones and steps
  const { data: completeGoal, error: fetchError } = await supabase
    .from('goals')
    .select(`
      *,
      milestones (
        *,
        steps (*)
      )
    `)
    .eq('id', goal.id)
    .single();

  if (fetchError) {
    throw new Error(fetchError.message);
  }

  return completeGoal;
}

/**
 * Create a new goal (optionally with milestones) for the authenticated user and send the created goal in the response.
 *
 * On success responds with HTTP 201 and the created goal object. On failure responds with HTTP 400 and a JSON error `{ error: string }`.
 * @param {import('express').Request} req - Express request; expects authenticated user on `req.user` and goal payload (`title`, `description`, `target_completion_date`, `category`, optional `milestones`) in `req.body`.
 * @param {import('express').Response} res - Express response used to send HTTP status and JSON body.
 */
export async function createGoal(req, res) {
  const { title, description, target_completion_date, category, milestones } = req.body;
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
        event_name: 'goal_created',
        payload: {
          source: 'manual',
          has_milestones: milestones && milestones.length > 0,
          category: category || 'other',
          timestamp: new Date().toISOString()
        }
      });
  } catch (analyticsError) {
    // Don't fail the request if analytics fails
    logger.warn('Failed to track goal creation analytics:', analyticsError);
  }
  
  // Create Supabase client with the JWT
  const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_ANON_KEY, {
    global: {
      headers: {
        Authorization: `Bearer ${token}`
      }
    }
  });
  
  try {
    const goalData = { title, description, target_completion_date, category };
    const completeGoal = await createGoalWithMilestones(supabase, user_id, goalData, milestones);
    res.status(201).json(completeGoal);
  } catch (error) {
    return res.status(400).json({ error: error.message });
  }
}

/**
 * Fetches goals (including nested milestones and steps) for the authenticated user and optionally performs a delta sync when a `since` timestamp is provided.
 *
 * If a valid `since` ISO 8601 string is supplied in the query, the endpoint returns an object `{ changed, deleted }` where `changed` are goals updated after `since` and `deleted` are IDs of goals deleted after `since`. If `since` is omitted, the endpoint returns the full list of matching goals.
 *
 * Behavior and error responses:
 * - Responds 400 when the `since` parameter is present but not a valid ISO 8601 date, or when a Supabase query returns an error.
 * - Responds 500 for unexpected server-side failures (e.g., fetching deleted records failure or other internal errors).
 */
export async function getGoals(req, res) {
  const user_id = req.user.id;
  const since = req.query.since; // For delta sync
  
  // Get the JWT from the request
  const token = req.headers.authorization?.split(' ')[1];
  
  // Validate since parameter if provided
  if (since && isNaN(Date.parse(since))) {
    return res.status(400).json({ error: 'Invalid since parameter. Expected ISO 8601 date string.' });
  }
  
  // Create Supabase client with the JWT
  const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_ANON_KEY, {
    global: {
      headers: {
        Authorization: `Bearer ${token}`
      }
    }
  });
  
  try {
    let query = supabase
      .from('goals')
      .select(`
        *,
        milestones (
          *,
          steps (*)
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
        .eq('table_name', 'goals')
        .gt('deleted_at', since);

      if (deletedError) {
        logger.error('Error fetching deleted goal records:', deletedError);
        return res.status(500).json({ error: 'Failed to fetch deleted records for delta sync' });
      } else {
        deleted = deletedData.map(r => r.record_id);
      }
      
      logger.info(`[Goals API] Returning ${data.length} changed and ${deleted.length} deleted goals for user ${user_id}`);
      return res.json({ changed: data, deleted });
    }

    res.json(data);
  } catch (error) {
    return res.status(500).json({ error: 'Internal server error' });
  }
}

export async function getGoalTitles(req, res) {
  const user_id = req.user.id;
  const token = req.headers.authorization?.split(' ')[1];

  // Get query parameters for filtering
  const { search, category, priority, status, due_date } = req.query;

  try {
    const titles = await getGoalTitlesForUser(user_id, token, {
      search,
      category,
      priority,
      status,
      due_date,
    });

    if (titles.error) {
      return res.status(400).json({ error: titles.error });
    }

    return res.json({ titles });
  } catch (error) {
    if (DEBUG) {
      try { logger.error('getGoalTitles error', error); } catch {}
    }
    return res.status(500).json({ error: 'Internal server error' });
  }
}

export async function getGoalById(req, res) {
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
  
  const user_id = req.user.id;
  const { id } = req.params;
  const { data, error } = await supabase
    .from('goals')
    .select(`
      *,
      milestones (
        *,
        steps (*)
      )
    `)
    .eq('id', id)
    .eq('user_id', user_id)
    .single();
  if (error) return res.status(404).json({ error: error.message });
  res.json(data);
}

/**
 * Handle an HTTP request to update a user's goal, optionally update its milestones and steps, and send a completion notification when the goal is marked completed.
 *
 * Updates the goal record identified by req.params.id for the authenticated user (req.user.id) with any of the provided fields: title, description, target_completion_date, completed, and category. If `milestones` is provided (array), existing milestones and their steps with matching `id` values are updated. After updates, the handler fetches and returns the complete goal with nested milestones and steps; if `completed` is true, a `goal_completed` notification is sent to the user.
 *
 * @param {import('express').Request} req - Express request; must include authenticated user at `req.user.id`, route param `req.params.id`, and request body containing any of: `title`, `description`, `target_completion_date`, `completed`, `category`, `milestones` (array of milestone objects with optional `id`, `title`, `description`, `completed`, `order`, and `steps` where each step may include `id`, `text`, `completed`, `order`).
 * @param {import('express').Response} res - Express response used to send JSON responses and HTTP status codes.
 */
export async function updateGoal(req, res) {
  const user_id = req.user.id;
  const { id } = req.params;
  const { title, description, target_completion_date, completed, category, milestones } = req.body;
  
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
    // Update the goal itself
    const { data: goalData, error: goalError } = await supabase
      .from('goals')
      .update({ title, description, target_completion_date, completed, category })
      .eq('id', id)
      .eq('user_id', user_id)
      .select()
      .single();
      
    if (goalError) {
      return res.status(400).json({ error: goalError.message });
    }

    // If milestones are provided, update them
    if (milestones && Array.isArray(milestones)) {
      for (const milestone of milestones) {
        if (milestone.id) {
          // Update existing milestone
          const { error: milestoneError } = await supabase
            .from('milestones')
            .update({
              title: milestone.title,
              description: milestone.description,
              completed: milestone.completed,
              order: milestone.order || 0
            })
            .eq('id', milestone.id)
            .eq('goal_id', id);
            
          if (milestoneError) {
            logger.error('Error updating milestone:', milestoneError);
          }

          // Update steps for this milestone
          if (milestone.steps && Array.isArray(milestone.steps)) {
            for (const step of milestone.steps) {
              if (step.id) {
                const { error: stepError } = await supabase
                  .from('steps')
                  .update({
                    text: step.text,
                    completed: step.completed,
                    order: step.order || 0
                  })
                  .eq('id', step.id)
                  .eq('milestone_id', milestone.id);
                  
                if (stepError) {
                  logger.error('Error updating step:', stepError);
                }
              }
            }
          }
        }
      }
    }

    // Fetch the updated goal with all its data
    const { data: updatedGoal, error: fetchError } = await supabase
      .from('goals')
      .select(`
        *,
        milestones (
          *,
          steps (*)
        )
      `)
      .eq('id', id)
      .eq('user_id', user_id)
      .single();

    if (fetchError) {
      return res.status(400).json({ error: fetchError.message });
    }

    // If goal is marked as completed, send a notification
    if (completed === true) {
      const notification = {
        notification_type: 'goal_completed',
        title: 'Goal Completed!',
        message: `You've successfully completed your goal: ${updatedGoal.title}`,
        details: { goalId: updatedGoal.id }
      };
      await sendNotification(user_id, notification);
    }

    res.json(updatedGoal);
  } catch (error) {
    logger.error('Error updating goal:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
}

/**
 * Delete a goal belonging to the authenticated user.
 *
 * Verifies that the goal specified by req.params.id exists and belongs to req.user.id, deletes it on success, and sends an appropriate HTTP response (204 on success, 400/404/500 on errors).
 *
 * @param {import('express').Request} req - Express request; expects req.user.id (authenticated user) and req.params.id (goal id to delete).
 * @param {import('express').Response} res - Express response used to send status and JSON error messages.
 */
export async function deleteGoal(req, res) {
  try {
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
    
    const user_id = req.user.id;
    const { id } = req.params;
    
    // Validate input
    if (!id) {
      return res.status(400).json({ error: 'Goal ID is required' });
    }
    
    // First, verify the goal exists and belongs to the user
    const { data: goal, error: fetchError } = await supabase
      .from('goals')
      .select('id')
      .eq('id', id)
      .eq('user_id', user_id)
      .single();
    
    if (fetchError) {
      if (fetchError.code === 'PGRST116') {
        return res.status(404).json({ error: 'Goal not found' });
      }
      return res.status(500).json({ error: 'Failed to fetch goal' });
    }
    
    if (!goal) {
      return res.status(404).json({ error: 'Goal not found' });
    }
    
    // Delete the goal
    const { error: deleteError } = await supabase
      .from('goals')
      .delete()
      .eq('id', id)
      .eq('user_id', user_id);
    
    if (deleteError) {
      return res.status(500).json({ error: 'Failed to delete goal' });
    }
    
    // Return success response
    res.status(204).send();
  } catch (error) {
    logger.error('Error deleting goal:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
} 

/**
 * Delete a user's goal identified by an id or by a case-insensitive title match.
 * @param {Object} args - Arguments for deletion.
 * @param {string} [args.id] - Goal id to delete.
 * @param {string} [args.title] - Goal title to delete when id is not provided; matched case-insensitively.
 * @param {string} userId - ID of the authenticated user who owns the goal.
 * @param {Object} userContext - Context containing authentication information.
 * @param {string} userContext.token - Supabase JWT used to authorize the request.
 * @returns {{success: true} | {error: string}} `success: true` on successful deletion, or an `error` message describing the failure.
 */
export async function deleteGoalFromAI(args, userId, userContext) {
  const { id, title } = args;
  const token = userContext?.token;
  const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_ANON_KEY, {
    global: {
      headers: {
        Authorization: `Bearer ${token}`
      }
    }
  });

  let goalId = id;
  if (!goalId && title) {
    // Fetch all goals for the user and find by title
    const { data: goals, error: fetchError } = await supabase
      .from('goals')
      .select('id, title')
      .eq('user_id', userId);
    if (fetchError) return { error: fetchError.message };
    const match = goals.find(g => g.title && g.title.trim().toLowerCase() === title.trim().toLowerCase());
    if (!match) return { error: `No goal found with title '${title}'` };
    goalId = match.id;
  }
  if (!goalId) {
    return { error: "Goal ID or title is required to delete a goal." };
  }
  const { error } = await supabase
    .from('goals')
    .delete()
    .eq('id', goalId)
    .eq('user_id', userId);
  if (error) return { error: error.message };
  return { success: true };
}

/**
 * Retrieve goals for a user, optionally filtered by several criteria, including nested milestones and steps.
 *
 * @param {string} userId - The user's ID whose goals should be fetched.
 * @param {string} token - Supabase JWT used for authenticating the query.
 * @param {Object} [args] - Optional filters to apply to the query.
 * @param {string} [args.title] - Partial title to match (case-insensitive).
 * @param {string} [args.description] - Partial description to match (case-insensitive).
 * @param {string} [args.due_date] - Exact target_completion_date to match (ISO date string).
 * @param {string} [args.priority] - Priority value that may be normalized to a category filter.
 * @param {string} [args.category] - Category to filter goals by.
 * @param {string} [args.status] - Status value to filter goals by.
 * @param {string} [args.recurrence] - Recurrence value to filter goals by.
 * @returns {Array<Object>|{error: string}} An array of goal records (each including nested `milestones` and their `steps`) on success, or an object with an `error` message on failure.
 */
export async function getGoalsForUser(userId, token, args = {}) {
  const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_ANON_KEY, {
    global: {
      headers: {
        Authorization: `Bearer ${token}`
      }
    }
  });

  let query = supabase
    .from('goals')
    .select(`
      *,
      milestones (
        *,
        steps (*)
      )
    `)
    .eq('user_id', userId);

  if (args.title) {
    query = query.ilike('title', `%${args.title}%`);
  }
  if (args.description) {
    query = query.ilike('description', `%${args.description}%`);
  }
  if (args.due_date) {
    query = query.eq('target_completion_date', args.due_date);
  }
  
  // Normalize priority to category using helper function
  const categoryFilter = normalizePriorityToCategory(args, 'getGoalsForUser');
  
  if (categoryFilter) {
    query = query.eq('category', categoryFilter);
  }
  
  if (args.status) {
    query = query.eq('status', args.status);
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
 * Fetches goal titles for a user, applying optional search and filter criteria.
 *
 * @param {string} userId - The user's id whose goal titles to fetch.
 * @param {string} token - JWT used to authenticate the request to Supabase.
 * @param {Object} [args] - Optional filters for the query.
 * @param {string} [args.search] - Substring to match against goal titles (case-insensitive).
 * @param {string} [args.category] - Category to filter by; if omitted, `args.priority` may be mapped to a category.
 * @param {string} [args.priority] - Priority value that will be normalized to a category when `category` is not provided.
 * @param {string} [args.status] - Status to filter goals by.
 * @param {string} [args.due_date] - Target completion date to filter goals by (ISO date string).
 * @returns {string[]|{error: string}} Array of matching goal titles, or an object with `error` on failure.
 */
export async function getGoalTitlesForUser(userId, token, args = {}) {
  const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_ANON_KEY, {
    global: {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    },
  });

  let query = supabase
    .from('goals')
    .select('title')
    .eq('user_id', userId);

  // Apply filters
  if (args.search) query = query.ilike('title', `%${args.search}%`);
  
  // Normalize priority to category using helper function
  const categoryFilter = normalizePriorityToCategory(args, 'getGoalTitlesForUser');
  
  if (categoryFilter) {
    query = query.eq('category', categoryFilter);
  }
  
  if (args.status) query = query.eq('status', args.status);
  if (args.due_date) query = query.eq('target_completion_date', args.due_date);

  const { data, error } = await query.order('created_at', { ascending: false });
  if (error) return { error: error.message };
  return data ? data.map(g => g.title) : [];
}

// removed duplicate lookupGoalbyTitle definition (older, buggy variant)

/**
 * Create a task from the next unfinished step of a user's goal identified by a partial title.
 *
 * Looks up the most recently created goal whose title matches `goal_title` (case-insensitive),
 * finds the first incomplete step across its milestones (ordered by milestone and step order),
 * and inserts a linked task with that step's text as the task title.
 *
 * @param {string} userId - ID of the user who will own the created task.
 * @param {string} token - Supabase JWT used to authenticate requests.
 * @param {Object} [args] - Additional options.
 * @param {string} args.goal_title - Partial or full title to match the target goal (required).
 * @param {string|null} [args.due_date] - Optional due date to assign to the created task (ISO string or null).
 * @param {string|null} [args.priority] - Optional priority value to assign to the created task.
 * @returns {Object} On success: `{ task, goal: { id, title }, used_step: { id, text } }`. On failure: `{ error: string }`.
 */
export async function createTaskFromNextGoalStep(userId, token, args = {}) {
  const { goal_title, due_date, priority } = args || {};
  const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_ANON_KEY, {
    global: { headers: { Authorization: `Bearer ${token}` } }
  });

  if (!goal_title) {
    return { error: 'goal_title is required' };
  }

  // 1) Lookup goal by title (partial ilike)
  const { data: goals, error: goalErr } = await supabase
    .from('goals')
    .select('id, title')
    .eq('user_id', userId)
    .ilike('title', `%${goal_title}%`)
    .order('created_at', { ascending: false })
    .limit(1);
  if (goalErr) return { error: goalErr.message };
  const goal = Array.isArray(goals) && goals.length > 0 ? goals[0] : null;
  if (!goal) return { error: `No goal matched '${goal_title}'` };

  // 2) Optimized query: Fetch milestones with their steps in a single query
  // This eliminates the N+1 query problem by using a single JOIN query
  const { data: milestonesWithSteps, error: msErr } = await supabase
    .from('milestones')
    .select(`
      id,
      title,
      order,
      steps (
        id,
        text,
        completed,
        order
      )
    `)
    .eq('goal_id', goal.id)
    .order('order', { ascending: true });

  if (msErr) return { error: msErr.message };
  if (!Array.isArray(milestonesWithSteps) || milestonesWithSteps.length === 0) {
    return { error: 'Goal has no milestones' };
  }

  // 3) Find first unfinished step across all milestones
  let selectedStep = null;
  for (const milestone of milestonesWithSteps) {
    if (milestone.steps && Array.isArray(milestone.steps)) {
      // Sort steps by order and find first unfinished
      const sortedSteps = milestone.steps.sort((a, b) => a.order - b.order);
      const incompleteStep = sortedSteps.find(s => !s.completed);
      if (incompleteStep) {
        selectedStep = incompleteStep;
        break;
      }
    }
  }

  if (!selectedStep) return { error: 'All steps for this goal are already completed' };  // 4) Create the task using tasks table, linking to goal
  const taskPayload = {
    user_id: userId,
    title: selectedStep.text,
    description: '',
    due_date: due_date || null,
    priority: priority || null,
    goal_id: goal.id,
    completed: false,
  };
  const { data: createdTask, error: taskErr } = await supabase
    .from('tasks')
    .insert([taskPayload])
    .select()
    .single();
  if (taskErr) return { error: taskErr.message };

  return {
    task: createdTask,
    goal: { id: goal.id, title: goal.title },
    used_step: { id: selectedStep.id, text: selectedStep.text },
  };
}

/**
 * Create a goal (and optional milestones/steps) from AI-provided data for the specified user.
 *
 * @param {Object} args - AI-provided goal data.
 * @param {string} args.title - Goal title.
 * @param {string} [args.description] - Goal description.
 * @param {string} [args.due_date] - Target completion date (ISO string).
 * @param {string} [args.priority] - Priority mapped to the goal's category.
 * @param {Array<Object>} [args.milestones] - Array of milestone objects, each may include steps.
 * @param {string} userId - ID of the user who will own the created goal.
 * @param {Object} userContext - Context for the user, may include authentication token at `userContext.token`.
 * @returns {Object} The created complete goal object with nested milestones and steps on success, or `{ error: string }` on failure.
 */
export async function createGoalFromAI(args, userId, userContext) {
  const { title, description, due_date, priority, milestones } = args;
  const token = userContext?.token;

  // Track analytics event for AI-created goals
  try {
    const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY);
    await supabase
      .from('analytics_events')
      .insert({
        user_id: userId,
        event_name: 'goal_created',
        payload: {
          source: 'ai',
          has_milestones: milestones && milestones.length > 0,
          priority: priority || 'medium',
          timestamp: new Date().toISOString()
        }
      });
  } catch (analyticsError) {
    // Don't fail the request if analytics fails
    logger.warn('Failed to track AI goal creation analytics:', analyticsError);
  }
  
  const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_ANON_KEY, {
    global: {
      headers: {
        Authorization: `Bearer ${token}`
      }
    }
  });

  try {
    // Map AI-specific fields to goal data format
    const goalData = { 
      title, 
      description, 
      target_completion_date: due_date,
      category: priority // Map priority to category field
    };
    
    const completeGoal = await createGoalWithMilestones(supabase, userId, goalData, milestones);
    return completeGoal;
  } catch (error) {
    return { error: error.message };
  }
}

/**
 * Update an existing goal (and optionally its milestones and steps) for a user using AI-provided fields.
 * @param {Object} args - Fields to locate and update the goal.
 * @param {string} [args.id] - The goal ID to update. Required if `lookup_title` is not provided.
 * @param {string} [args.title] - New title for the goal.
 * @param {string} [args.description] - New description for the goal.
 * @param {string} [args.due_date] - New target completion date for the goal (mapped to `target_completion_date`).
 * @param {string} [args.priority] - Priority value mapped to the goal's `category`.
 * @param {Array<Object>|Array<string>} [args.milestones] - Array of milestones to add or replace; each item may include `title`, `description`, `order`, and `steps` (steps may be strings or objects with `text`, `order`, `completed`).
 * @param {string} [args.milestone_behavior='add'] - How to handle provided milestones: `'add'` to append or `'replace'` to delete existing milestones and replace them.
 * @param {string} [args.lookup_title] - If `id` is not provided, a title to locate the goal (case-insensitive exact match).
 * @param {string} userId - The user's ID owning the goal.
 * @param {Object} userContext - Context containing authentication info for the user.
 * @returns {Object} The updated goal record with nested `milestones` and `steps`, or an object `{ error: string }` describing the failure.
export async function updateGoalFromAI(args, userId, userContext) {
  const {
    id,
    title,            // new title
    description,
    due_date,
    priority,
    milestones,
    milestone_behavior = 'add',
    lookup_title      // title to find the goal
  } = args;
  const token = userContext?.token;
  const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_ANON_KEY, {
    global: {
      headers: {
        Authorization: `Bearer ${token}`
      }
    }
  });

  let goalId = id;
  const selector = lookup_title;
  if (!goalId && selector) {
    // Fetch all goals for the user and find by title
    const { data: goals, error: fetchError } = await supabase
      .from('goals')
      .select('id, title')
      .eq('user_id', userId);
    if (fetchError) return { error: fetchError.message };
    const match = goals.find(g => g.title && g.title.trim().toLowerCase() === selector.trim().toLowerCase());
    if (!match) return { error: `No goal found with title '${selector}'` };
    goalId = match.id;
  }
  if (!goalId) {
    return { error: "Goal ID or lookup_title is required to update a goal." };
  }

  try {
    // Prepare update data
    const updateData = {};
    if (title !== undefined) updateData.title = title;
    if (description !== undefined) updateData.description = description;
    if (due_date !== undefined) updateData.target_completion_date = due_date;
    if (priority !== undefined) updateData.category = priority;

    // Update the goal if there are changes
    if (Object.keys(updateData).length > 0) {
      const { data, error } = await supabase
        .from('goals')
        .update(updateData)
        .eq('id', goalId)
        .eq('user_id', userId)
        .select()
        .single();

      if (error) {
        return { error: error.message };
      }
    }

    // If milestones are provided, handle them based on milestone_behavior
    if (milestones && Array.isArray(milestones) && milestones.length > 0) {
      // If behavior is 'replace', delete existing milestones and their steps first
      if (milestone_behavior === 'replace') {
        // WARNING: This deletes data before creating new. If creation fails, data is lost.
        // Consider implementing transaction support.
        // Get existing milestones to delete their steps
        const { data: existingMilestones } = await supabase
          .from('milestones')
          .select('id')
          .eq('goal_id', goalId);
        
        if (existingMilestones && existingMilestones.length > 0) {
          const milestoneIds = existingMilestones.map(m => m.id);
          
          // Delete steps first (foreign key constraint)
          const { error: stepsDeleteError } = await supabase
            .from('steps')
            .delete()
            .in('milestone_id', milestoneIds);
          
          if (stepsDeleteError) {
            return { error: `Failed to delete existing steps: ${stepsDeleteError.message}` };
          }
          
          // Delete milestones
          const { error: milestonesDeleteError } = await supabase
            .from('milestones')
            .delete()
            .eq('goal_id', goalId);
          
          if (milestonesDeleteError) {
            return { error: `Failed to delete existing milestones: ${milestonesDeleteError.message}` };
          }
        }
      }
      
      // Create new milestones and their steps
      for (let i = 0; i < milestones.length; i++) {
        const milestone = milestones[i];
        const { title: milestoneTitle, description: milestoneDescription, steps: milestoneSteps, order: milestoneOrder = i + 1 } = milestone;
        
        // Create the milestone
        const { data: createdMilestone, error: milestoneError } = await supabase
          .from('milestones')
          .insert([{ 
            goal_id: goalId, 
            title: milestoneTitle, 
            description: milestoneDescription,
            order: milestoneOrder 
          }])
          .select()
          .single();
        
        if (milestoneError) {
          return { error: `Failed to create milestone: ${milestoneError.message}` };
        }

        // If steps are provided for this milestone, create them
        if (milestoneSteps && Array.isArray(milestoneSteps) && milestoneSteps.length > 0) {
          const stepsToInsert = milestoneSteps.map((step, stepIndex) => ({
            milestone_id: createdMilestone.id,
            text: step.text || step,
            order: step.order || stepIndex + 1,
            completed: step.completed || false
          }));

          const { error: stepsError } = await supabase
            .from('steps')
            .insert(stepsToInsert);

          if (stepsError) {
            return { error: `Failed to create steps: ${stepsError.message}` };
          }
        }
      }
    }
    // Fetch the complete goal with milestones and steps
    const { data: completeGoal, error: fetchError } = await supabase
      .from('goals')
      .select(`
        *,
        milestones (
          *,
          steps (*)
        )
      `)
      .eq('id', goalId)
      .single();

    if (fetchError) {
      return { error: fetchError.message };
    }

    return completeGoal;
  } catch (error) {
    return { error: 'Internal server error' };
  }
} 

// === Milestone Logic (migrated from milestonesController.js) ===

export async function createMilestone(req, res) {
  const { goalId } = req.params;
  const { title, order } = req.body;
  const token = req.headers.authorization?.split(' ')[1];
  const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_ANON_KEY, {
    global: { headers: { Authorization: `Bearer ${token}` } }
  });

  const { data, error } = await supabase
    .from('milestones')
    .insert([{ goal_id: goalId, title, order }])
    .select()
    .single();

  if (error) return res.status(400).json({ error: error.message });
  res.status(201).json(data);
}

export async function updateMilestone(req, res) {
  const { milestoneId } = req.params;
  const { title, description, order } = req.body;
  const token = req.headers.authorization?.split(' ')[1];
  const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_ANON_KEY, {
    global: { headers: { Authorization: `Bearer ${token}` } }
  });

  const { data, error } = await supabase
    .from('milestones')
    .update({ title, description, order, updated_at: new Date().toISOString() })
    .eq('id', milestoneId)
    .select()
    .single();

  if (error) return res.status(400).json({ error: error.message });
  res.json(data);
}

export async function deleteMilestone(req, res) {
  const { milestoneId } = req.params;
  const token = req.headers.authorization?.split(' ')[1];
  const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_ANON_KEY, {
    global: { headers: { Authorization: `Bearer ${token}` } }
  });

  const { error } = await supabase
    .from('milestones')
    .delete()
    .eq('id', milestoneId);

  if (error) return res.status(400).json({ error: error.message });
  res.json({ success: true });
}

// Read all milestones for a goal (with steps)
export async function readMilestones(req, res) {
  const { goalId } = req.params;
  const token = req.headers.authorization?.split(' ')[1];
  const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_ANON_KEY, {
    global: { headers: { Authorization: `Bearer ${token}` } }
  });

  // Get all milestones for the goal
  const { data: milestones, error } = await supabase
    .from('milestones')
    .select('*')
    .eq('goal_id', goalId)
    .order('order', { ascending: true });
  if (error) return res.status(400).json({ error: error.message });

  // For each milestone, get its steps
  const milestonesWithSteps = await Promise.all(milestones.map(async (milestone) => {
    const { data: steps } = await supabase
      .from('steps')
      .select('*')
      .eq('milestone_id', milestone.id)
      .order('order', { ascending: true });
    return { ...milestone, steps };
  }));

  res.json(milestonesWithSteps);
}

// Lookup a milestone by id or title (with steps)
export async function lookupMilestone(req, res) {
  const { milestoneId, goalId } = req.params;
  const { title } = req.query;
  const token = req.headers.authorization?.split(' ')[1];
  const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_ANON_KEY, {
    global: { headers: { Authorization: `Bearer ${token}` } }
  });

  let milestone;
  let error;
  if (milestoneId) {
    // Lookup by id
    ({ data: milestone, error } = await supabase
      .from('milestones')
      .select('*')
      .eq('id', milestoneId)
      .single());
  } else if (goalId && title) {
    // Lookup by title within a goal
    ({ data: milestone, error } = await supabase
      .from('milestones')
      .select('*')
      .eq('goal_id', goalId)
      .ilike('title', title)
      .single());
  } else {
    return res.status(400).json({ error: 'Must provide milestoneId or goalId and title' });
  }
  if (error) return res.status(404).json({ error: error.message });

  // Get steps for this milestone
  const { data: steps, error: stepsError } = await supabase
    .from('steps')
    .select('*')
    .eq('milestone_id', milestone.id)
    .order('order', { ascending: true });
  if (stepsError) return res.status(400).json({ error: stepsError.message });

  res.json({ ...milestone, steps });
} 

// === Step Logic (migrated from stepsController.js) ===

export async function createStep(req, res) {
  const { milestoneId } = req.params;
  const { text, order, completed = false } = req.body;
  const token = req.headers.authorization?.split(' ')[1];
  const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_ANON_KEY, {
    global: { headers: { Authorization: `Bearer ${token}` } }
  });

  const { data, error } = await supabase
    .from('steps')
    .insert([{ milestone_id: milestoneId, text, order, completed }])
    .select()
    .single();

  if (error) return res.status(400).json({ error: error.message });
  res.status(201).json(data);
}

export async function updateStep(req, res) {
  const { stepId } = req.params;
  const { text, order, completed } = req.body;
  const token = req.headers.authorization?.split(' ')[1];
  
  // Step update initiated
  
  const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_ANON_KEY, {
    global: { headers: { Authorization: `Bearer ${token}` } }
  });

  const updateFields = { text, order, updated_at: new Date().toISOString() };
  if (typeof completed === 'boolean') updateFields.completed = completed;
  
  // Updating step fields
  
  const { data, error } = await supabase
    .from('steps')
    .update(updateFields)
    .eq('id', stepId)
    .select('*, milestone:milestones(id, goal_id, completed)')
    .single();

  if (error) {
    return res.status(400).json({ error: error.message });
  }

  // Check for milestone completion if a step was marked as complete
  if (completed === true && data.milestone && !data.milestone.completed) {
    const { data: steps, error: stepsError } = await supabase
      .from('steps')
      .select('completed')
      .eq('milestone_id', data.milestone_id);

    if (!stepsError && steps.every(s => s.completed)) {
      // All steps are complete, mark milestone as complete and send notification
      const { data: updatedMilestone, error: milestoneUpdateError } = await supabase
        .from('milestones')
        .update({ completed: true })
        .eq('id', data.milestone_id)
        .select()
        .single();

      if (!milestoneUpdateError && updatedMilestone) {
        const notification = {
          notification_type: 'milestone_completed',
          title: 'Milestone Reached!',
          message: `You've completed the milestone: ${updatedMilestone.title}`,
          details: { milestoneId: updatedMilestone.id, goalId: updatedMilestone.goal_id }
        };
        // We need the user_id for the notification.
        // The current context doesn't have it directly. We can get it from the goal.
        const { data: goalData } = await supabase.from('goals').select('user_id').eq('id', updatedMilestone.goal_id).single();
        if (goalData) {
          await sendNotification(goalData.user_id, notification);
        }
      }
    }
  }
  
  res.json(data);
}

export async function deleteStep(req, res) {
  const { stepId } = req.params;
  const token = req.headers.authorization?.split(' ')[1];
  const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_ANON_KEY, {
    global: { headers: { Authorization: `Bearer ${token}` } }
  });

  const { error } = await supabase
    .from('steps')
    .delete()
    .eq('id', stepId);

  if (error) return res.status(400).json({ error: error.message });
  res.json({ success: true });
}

// Read all steps for a milestone
export async function readSteps(req, res) {
  const { milestoneId } = req.params;
  const token = req.headers.authorization?.split(' ')[1];
  const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_ANON_KEY, {
    global: { headers: { Authorization: `Bearer ${token}` } }
  });

  const { data, error } = await supabase
    .from('steps')
    .select('*')
    .eq('milestone_id', milestoneId)
    .order('order', { ascending: true });

  if (error) return res.status(400).json({ error: error.message });
  res.json(data);
}

// Lookup a step by id or text
export async function lookupStep(req, res) {
  const { stepId, milestoneId } = req.params;
  const { text } = req.query;
  const token = req.headers.authorization?.split(' ')[1];
  const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_ANON_KEY, {
    global: { headers: { Authorization: `Bearer ${token}` } }
  });

  let step;
  let error;
  if (stepId) {
    // Lookup by id
    ({ data: step, error } = await supabase
      .from('steps')
      .select('*')
      .eq('id', stepId)
      .single());
  } else if (milestoneId && text) {
    // Lookup by text within a milestone
    ({ data: step, error } = await supabase
      .from('steps')
      .select('*')
      .eq('milestone_id', milestoneId)
      .ilike('text', text)
      .single());
  } else {
    return res.status(400).json({ error: 'Must provide stepId or milestoneId and text' });
  }
  if (error) return res.status(404).json({ error: error.message });

  res.json(step);
} 

export async function generateGoalBreakdown(req, res) {
  const { title, description } = req.body;
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
  
  try {
    // Import the Gemini service
    const { default: GeminiService } = await import('../utils/geminiService.js');
    const geminiService = new GeminiService();
    
    // Generate goal breakdown using AI
    const breakdown = await geminiService.generateGoalBreakdown(title, description);
    
    res.status(200).json(breakdown);
  } catch (error) {
    logger.error('Error generating goal breakdown:', error);
    return res.status(500).json({ error: 'Failed to generate goal breakdown' });
  }
} 