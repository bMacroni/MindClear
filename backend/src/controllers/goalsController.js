import { createClient } from '@supabase/supabase-js';
import logger from '../utils/logger.js';
import { sendNotification } from '../services/notificationService.js';
const DEBUG = process.env.DEBUG_LOGS === 'true';

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
  
  // Goal creation initiated
  
  try {
    // Start a transaction by creating the goal first
    const { data: goal, error: goalError } = await supabase
      .from('goals')
      .insert([{ user_id, title, description, target_completion_date, category }])
      .select()
      .single();
    
    if (goalError) {
      return res.status(400).json({ error: goalError.message });
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
          return res.status(400).json({ error: `Failed to create milestone: ${milestoneError.message}` });
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
            return res.status(400).json({ error: `Failed to create steps: ${stepsError.message}` });
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
      return res.status(400).json({ error: fetchError.message });
    }

    res.status(201).json(completeGoal);
  } catch (error) {
    return res.status(500).json({ error: 'Internal server error' });
  }
}

export async function getGoals(req, res) {
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
    const { data, error } = await supabase
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

    if (error) {
      return res.status(400).json({ error: error.message });
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

export async function deleteGoal(req, res) {
  // Goal deletion initiated
  
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
  
  // Attempting to delete goal
  
  const { error } = await supabase
    .from('goals')
    .delete()
    .eq('id', id)
    .eq('user_id', user_id);
    
  if (error) {
    return res.status(400).json({ error: error.message });
  }
  
  res.status(204).send();
} 

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
  if (args.priority) {
    query = query.eq('category', args.priority); // Assuming priority maps to category
  }
  if (args.category) {
    query = query.eq('category', args.category);
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
  if (args.category) query = query.eq('category', args.category);
  if (args.priority) query = query.eq('category', args.priority);
  if (args.status) query = query.eq('status', args.status);
  if (args.due_date) query = query.eq('target_completion_date', args.due_date);

  const { data, error } = await query.order('created_at', { ascending: false });
  if (error) return { error: error.message };
  return data ? data.map(g => g.title) : [];
}

// removed duplicate lookupGoalbyTitle definition (older, buggy variant)

// Helper: Create a task from the next unfinished step in a goal
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

export async function lookupGoalbyTitle(userId, token, args = {}) {
  if (!token) {
    return { error: 'No authentication token provided' };
  }

  const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_ANON_KEY, {
    global: {
      headers: { Authorization: `Bearer ${token}` }
    }
  });

  let query = supabase
    .from('goals')
    .select('id, title')
    .eq('user_id', userId)
    .order('created_at', { ascending: false });

  if (args.search) {
    query = query.ilike('title', `%${args.search}%`);
  }
  if (args.category) {
    query = query.eq('category', args.category);
  }
  if (args.priority) {
  if (args.priority) {
    query = query.eq('category', args.priority);
  }
  if (args.status) {    query = query.eq('status', args.status);
  }
  if (args.due_date) {
    query = query.eq('target_completion_date', args.due_date);
  }
  if (args.limit && Number.isInteger(args.limit) && args.limit > 0) {
    query = query.limit(args.limit);
  } else if (args.search) {
    // default to 1 when doing a targeted lookup
    query = query.limit(1);
  }

  const { data, error } = await query;

  if (error) {
    return { error: error.message };
  }

  if (data && data.length > 0) {
    return data;
  }
  return { error: 'No goals matched your query' };
}

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
    // Create the goal first
    const { data: goal, error: goalError } = await supabase
      .from('goals')
      .insert([{ 
        user_id: userId, 
        title, 
        description, 
        target_completion_date: due_date,
        category: priority // Map priority to category field
      }])
      .select()
      .single();

    if (goalError) {
      return { error: goalError.message };
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
      .eq('id', goal.id)
      .single();

    if (fetchError) {
      return { error: fetchError.message };
    }

    return completeGoal;
  } catch (error) {
    return { error: 'Internal server error' };
  }
}

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