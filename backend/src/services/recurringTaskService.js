import { createClient } from '@supabase/supabase-js';
import logger from '../utils/logger.js';

/**
 * Recurring Task Service
 * Handles enhanced recurring task logic with ADHD-friendly behavior:
 * - End conditions (count or date-based)
 * - Completion history tracking
 * - Pause/resume functionality
 * - ADHD-friendly due date rollover (no shame-inducing "overdue" labels)
 */

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

/**
 * Get the next day of week from a list of target days
 * @param {Date} fromDate - Starting date
 * @param {number[]} daysOfWeek - Target days (0=Sun, 1=Mon, ..., 6=Sat)
 * @param {number} weekInterval - How many weeks between occurrences
 * @returns {Date} Next matching date
 */
export function getNextMatchingDayOfWeek(fromDate, daysOfWeek, weekInterval = 1) {
    if (!daysOfWeek || daysOfWeek.length === 0) {
        // Default to same day next week if no days specified
        const next = new Date(fromDate);
        next.setDate(next.getDate() + 7 * weekInterval);
        return next;
    }

    // Sort days for consistent behavior
    const sortedDays = [...daysOfWeek].sort((a, b) => a - b);
    const currentDay = fromDate.getDay();

    // Find the next day in the same week (if any)
    let nextDay = sortedDays.find(d => d > currentDay);

    if (nextDay !== undefined) {
        // Found a day later this week
        const next = new Date(fromDate);
        next.setDate(next.getDate() + (nextDay - currentDay));
        return next;
    }

    // Move to first day of next interval week
    const daysUntilNextWeek = 7 * weekInterval - currentDay + sortedDays[0];
    const next = new Date(fromDate);
    next.setDate(next.getDate() + daysUntilNextWeek);
    return next;
}

/**
 * Calculate the next due date based on recurrence pattern
 * @param {Date} fromDate - Original due date
 * @param {Object} pattern - Recurrence pattern
 * @returns {Date} Next due date
 */
export function calculateNextDueDate(fromDate, pattern) {
    const next = new Date(fromDate);
    const interval = pattern.interval || 1;

    switch (pattern.type) {
        case 'daily':
            next.setDate(next.getDate() + interval);
            break;

        case 'weekly':
            if (pattern.daysOfWeek && pattern.daysOfWeek.length > 0) {
                return getNextMatchingDayOfWeek(fromDate, pattern.daysOfWeek, interval);
            } else {
                next.setDate(next.getDate() + 7 * interval);
            }
            break;

        case 'monthly':
            next.setMonth(next.getMonth() + interval);
            break;

        default:
            throw new Error(`Invalid recurrence type: ${pattern.type}`);
    }

    return next;
}

/**
 * Format a recurrence pattern as a human-readable string
 * @param {Object} pattern - Recurrence pattern
 * @returns {string} Human-readable description
 */
export function formatRecurrencePattern(pattern) {
    if (!pattern) return null;

    const interval = pattern.interval || 1;
    const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

    let base = '';
    switch (pattern.type) {
        case 'daily':
            base = interval === 1 ? 'Every day' : `Every ${interval} days`;
            break;
        case 'weekly':
            if (pattern.daysOfWeek && pattern.daysOfWeek.length > 0) {
                const days = pattern.daysOfWeek.map(d => dayNames[d]).join(', ');
                base = interval === 1
                    ? `Weekly on ${days}`
                    : `Every ${interval} weeks on ${days}`;
            } else {
                base = interval === 1 ? 'Every week' : `Every ${interval} weeks`;
            }
            break;
        case 'monthly':
            base = interval === 1 ? 'Every month' : `Every ${interval} months`;
            break;
        default:
            return 'Custom recurrence';
    }

    // Add end condition info
    if (pattern.endCondition) {
        if (pattern.endCondition.type === 'count') {
            const completed = pattern.completedCount || 0;
            base += ` (${completed}/${pattern.endCondition.value} times)`;
        } else if (pattern.endCondition.type === 'date') {
            base += ` until ${pattern.endCondition.value}`;
        }
    }

    return base;
}

// ============================================================================
// CORE SERVICE FUNCTIONS
// ============================================================================

/**
 * Process a recurring task after completion
 * - Logs completion to history
 * - Checks end conditions
 * - Calculates and sets next due date (or archives if ended)
 * @returns {Object} Updated task or archive result
 */
export async function processRecurringTask(task, token) {
    const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_ANON_KEY, {
        global: {
            headers: {
                Authorization: `Bearer ${token}`
            }
        }
    });

    if (!task.recurrence_pattern) {
        return null;
    }

    const pattern = task.recurrence_pattern;
    const now = new Date();
    const originalDueDate = new Date(task.due_date);

    // Check if task is paused - don't regenerate paused tasks
    if (pattern.is_paused) {
        logger.info(`Recurring task ${task.id} is paused, not regenerating`);
        return task;
    }

    // 1. Log completion to history
    try {
        await logRecurringCompletion(task.id, task.user_id, originalDueDate, token);
    } catch (err) {
        logger.error('Failed to log recurring completion:', err);
        // Continue even if logging fails
    }

    // 2. Update completed count
    const completedCount = (pattern.completedCount || 0) + 1;

    // 3. Check end conditions
    if (pattern.endCondition) {
        // Count-based end condition
        if (pattern.endCondition.type === 'count' && completedCount >= pattern.endCondition.value) {
            return await archiveRecurringTask(task, supabase, 'Completed all scheduled occurrences');
        }

        // Date-based end condition (check if original due date is at or past end date)
        if (pattern.endCondition.type === 'date') {
            const endDate = new Date(pattern.endCondition.value);
            if (originalDueDate >= endDate) {
                return await archiveRecurringTask(task, supabase, 'End date reached');
            }
        }
    }

    // 4. Calculate next due date
    let nextDueDate;
    try {
        nextDueDate = calculateNextDueDate(originalDueDate, pattern);
    } catch (err) {
        logger.error('Failed to calculate next due date:', err);
        return null;
    }

    // 5. Check if next due date exceeds end date
    if (pattern.endCondition?.type === 'date') {
        const endDate = new Date(pattern.endCondition.value);
        if (nextDueDate > endDate) {
            return await archiveRecurringTask(task, supabase, 'Next occurrence would exceed end date');
        }
    }

    // 6. Update task with new due date
    const updatedPattern = {
        ...pattern,
        completedCount
    };

    const { data, error } = await supabase
        .from('tasks')
        .update({
            due_date: nextDueDate.toISOString(),
            status: 'not_started',
            last_completed_at: now.toISOString(),
            recurrence_pattern: updatedPattern
        })
        .eq('id', task.id)
        .select()
        .single();

    if (error) {
        logger.error('Failed to update recurring task:', error);
        return null;
    }

    logger.info(`Recurring task ${task.id} regenerated with next due date: ${nextDueDate.toISOString()}`);
    return data;
}

/**
 * Archive a recurring task when its end condition is met
 */
async function archiveRecurringTask(task, supabase, reason) {
    const { data, error } = await supabase
        .from('tasks')
        .update({
            status: 'completed',
            last_completed_at: new Date().toISOString()
        })
        .eq('id', task.id)
        .select()
        .single();

    if (error) {
        logger.error('Failed to archive recurring task:', error);
        return null;
    }

    logger.info(`Recurring task ${task.id} archived: ${reason}`);
    return { ...data, _archived: true, _archiveReason: reason };
}

/**
 * Log a completion to the recurring_task_completions table
 */
export async function logRecurringCompletion(taskId, userId, dueDate, token) {
    const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_ANON_KEY, {
        global: {
            headers: {
                Authorization: `Bearer ${token}`
            }
        }
    });

    const { data, error } = await supabase
        .from('recurring_task_completions')
        .insert({
            task_id: taskId,
            user_id: userId,
            due_date_at_completion: dueDate.toISOString().split('T')[0],
            completed_at: new Date().toISOString()
        })
        .select()
        .single();

    if (error) {
        logger.error('Failed to log recurring completion:', error);
        throw error;
    }

    return data;
}

/**
 * ADHD-Friendly Rollover: Update missed recurring tasks to today
 * This avoids shame-inducing "overdue" labels by silently moving the task forward
 */
export async function rolloverMissedRecurringTasks(userId, token) {
    const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_ANON_KEY, {
        global: {
            headers: {
                Authorization: `Bearer ${token}`
            }
        }
    });

    const today = new Date();
    today.setHours(12, 0, 0, 0); // Set to noon to avoid timezone edge cases

    // Find recurring tasks that are past due
    const { data: missedTasks, error: fetchError } = await supabase
        .from('tasks')
        .select('id, due_date, recurrence_pattern')
        .eq('user_id', userId)
        .not('recurrence_pattern', 'is', null)
        .neq('status', 'completed')
        .lt('due_date', today.toISOString());

    if (fetchError) {
        logger.error('Failed to fetch missed recurring tasks:', fetchError);
        return { updated: 0, error: fetchError.message };
    }

    if (!missedTasks || missedTasks.length === 0) {
        return { updated: 0 };
    }

    // Filter out paused tasks
    const tasksToRollover = missedTasks.filter(t =>
        !t.recurrence_pattern?.is_paused
    );

    if (tasksToRollover.length === 0) {
        return { updated: 0 };
    }

    // Update all missed tasks to today
    const taskIds = tasksToRollover.map(t => t.id);

    const { error: updateError } = await supabase
        .from('tasks')
        .update({ due_date: today.toISOString() })
        .in('id', taskIds);

    if (updateError) {
        logger.error('Failed to rollover missed recurring tasks:', updateError);
        return { updated: 0, error: updateError.message };
    }

    logger.info(`ADHD-friendly rollover: Updated ${tasksToRollover.length} missed recurring tasks to today`);
    return { updated: tasksToRollover.length };
}

/**
 * Pause a recurring task (will not regenerate until resumed)
 */
export async function pauseRecurringTask(taskId, userId, token) {
    const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_ANON_KEY, {
        global: {
            headers: {
                Authorization: `Bearer ${token}`
            }
        }
    });

    // Get current task
    const { data: task, error: fetchError } = await supabase
        .from('tasks')
        .select('*')
        .eq('id', taskId)
        .eq('user_id', userId)
        .single();

    if (fetchError) {
        throw new Error('Task not found');
    }

    if (!task.recurrence_pattern) {
        throw new Error('Task is not recurring');
    }

    // Update recurrence pattern with is_paused flag
    const updatedPattern = {
        ...task.recurrence_pattern,
        is_paused: true,
        paused_at: new Date().toISOString()
    };

    const { data, error } = await supabase
        .from('tasks')
        .update({ recurrence_pattern: updatedPattern })
        .eq('id', taskId)
        .select()
        .single();

    if (error) {
        throw new Error('Failed to pause recurring task');
    }

    logger.info(`Recurring task ${taskId} paused`);
    return data;
}

/**
 * Resume a paused recurring task
 */
export async function resumeRecurringTask(taskId, userId, token) {
    const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_ANON_KEY, {
        global: {
            headers: {
                Authorization: `Bearer ${token}`
            }
        }
    });

    // Get current task
    const { data: task, error: fetchError } = await supabase
        .from('tasks')
        .select('*')
        .eq('id', taskId)
        .eq('user_id', userId)
        .single();

    if (fetchError) {
        throw new Error('Task not found');
    }

    if (!task.recurrence_pattern) {
        throw new Error('Task is not recurring');
    }

    // Update recurrence pattern to remove is_paused flag
    const updatedPattern = {
        ...task.recurrence_pattern,
        is_paused: false,
        paused_at: null
    };

    const { data, error } = await supabase
        .from('tasks')
        .update({ recurrence_pattern: updatedPattern })
        .eq('id', taskId)
        .select()
        .single();

    if (error) {
        throw new Error('Failed to resume recurring task');
    }

    logger.info(`Recurring task ${taskId} resumed`);
    return data;
}

/**
 * Get completion history for a recurring task
 */
export async function getRecurrenceHistory(taskId, userId, token) {
    const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_ANON_KEY, {
        global: {
            headers: {
                Authorization: `Bearer ${token}`
            }
        }
    });

    // Verify task belongs to user
    const { data: task, error: taskError } = await supabase
        .from('tasks')
        .select('id, recurrence_pattern')
        .eq('id', taskId)
        .eq('user_id', userId)
        .single();

    if (taskError || !task) {
        throw new Error('Task not found');
    }

    // Get completion history
    const { data: history, error } = await supabase
        .from('recurring_task_completions')
        .select('*')
        .eq('task_id', taskId)
        .order('completed_at', { ascending: false });

    if (error) {
        throw new Error('Failed to fetch completion history');
    }

    return {
        task_id: taskId,
        recurrence_pattern: task.recurrence_pattern,
        total_completions: history.length,
        completions: history
    };
}

export default {
    processRecurringTask,
    calculateNextDueDate,
    getNextMatchingDayOfWeek,
    formatRecurrencePattern,
    logRecurringCompletion,
    rolloverMissedRecurringTasks,
    pauseRecurringTask,
    resumeRecurringTask,
    getRecurrenceHistory
};
