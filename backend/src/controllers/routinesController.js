import { createClient } from '@supabase/supabase-js';
import logger from '../utils/logger.js';
import { getPeriodBounds, getPreviousPeriodBounds } from '../services/routineStreakService.js';
import { enqueueStreakReset } from '../services/routineBackgroundService.js';

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseKey) {
    throw new Error('Missing required Supabase environment variables: SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY or SUPABASE_ANON_KEY');
}

const supabase = createClient(supabaseUrl, supabaseKey);
// Helper: Check subscription limit
async function checkRoutineLimit(userId) {
    const { data: user, error: userError } = await supabase
        .from('users')
        .select('subscription_tier')
        .eq('id', userId)
        .single();

    if (userError) {
        logger.error('Error fetching user subscription tier:', userError);
        throw userError;
    }

    // If premium, unlimited
    if (user?.subscription_tier === 'premium') {
        return { allowed: true };
    }

    // Count active routines
    const { count, error } = await supabase
        .from('routines')
        .select('*', { count: 'exact', head: true })
        .eq('user_id', userId)
        .eq('is_active', true);

    if (error) throw error;

    const FREE_LIMIT = 3;
    return {
        allowed: count < FREE_LIMIT,
        currentCount: count,
        limit: FREE_LIMIT
    };
}


export const createRoutine = async (req, res) => {
    const userId = req.user.id;
    const { title, description, frequency_type, target_count, time_window, icon, color, reminder_enabled, reminder_time, timezone } = req.body;

    // 1. Validation
    if (!title || typeof title !== 'string' || title.trim() === '') {
        return res.status(400).json({
            error: 'VALIDATION_ERROR',
            message: 'Title is required'
        });
    }

    if (title.length > 100) {
        return res.status(400).json({
            error: 'VALIDATION_ERROR',
            message: 'Title must be 100 characters or less'
        });
    }

    if (frequency_type && !['daily', 'weekly', 'monthly'].includes(frequency_type)) {
        return res.status(400).json({
            error: 'VALIDATION_ERROR',
            message: 'Invalid frequency_type. Must be daily, weekly, or monthly'
        });
    }

    if (target_count !== undefined) {
        if (!Number.isInteger(target_count) || target_count < 1 || target_count > 10) {
            return res.status(400).json({
                error: 'VALIDATION_ERROR',
                message: 'target_count must be an integer between 1 and 10'
            });
        }
    }

    if (time_window && !['morning', 'afternoon', 'evening', 'anytime'].includes(time_window)) {
        return res.status(400).json({
            error: 'VALIDATION_ERROR',
            message: 'Invalid time_window. Must be morning, afternoon, evening, or anytime'
        });
    }

    if (reminder_enabled !== undefined && typeof reminder_enabled !== 'boolean') {
        return res.status(400).json({
            error: 'VALIDATION_ERROR',
            message: 'reminder_enabled must be a boolean'
        });
    }

    // Simple HH:mm or HH:mm:ss validation
    if (reminder_time && !/^([01]\d|2[0-3]):([0-5]\d)(:([0-5]\d))?$/.test(reminder_time)) {
        return res.status(400).json({
            error: 'VALIDATION_ERROR',
            message: 'Invalid reminder_time format. Use HH:mm or HH:mm:ss'
        });
    }

    try {
        // Check limit
        const limitCheck = await checkRoutineLimit(userId);
        if (!limitCheck.allowed) {
            return res.status(403).json({
                error: 'ROUTINE_LIMIT_REACHED',
                message: 'Free tier limit reached.',
                limit: limitCheck.limit
            });
        }

        const { data, error } = await supabase
            .from('routines')
            .insert({
                user_id: userId,
                title,
                description,
                frequency_type: frequency_type || 'daily',
                target_count: target_count || 1,
                time_window: time_window || 'anytime',
                icon: icon || '📌',
                color: color || '#6366F1',
                reminder_enabled: reminder_enabled === undefined ? true : reminder_enabled,
                reminder_time,
                timezone: timezone || req.header('X-User-Timezone') || 'UTC',
                is_active: true
            })
            .select()
            .single();

        if (error) throw error;

        res.status(201).json(data);
    } catch (error) {
        logger.error('Error creating routine:', error);
        res.status(500).json({ error: error.message });
    }
};

export const getRoutines = async (req, res) => {
    const userId = req.user.id;
    const timezone = req.header('X-User-Timezone') || 'UTC';

    try {
        const { data: routines, error } = await supabase
            .from('routines')
            .select('*')
            .eq('user_id', userId)
            .eq('is_active', true)
            .order('created_at', { ascending: false });

        if (error) throw error;

        // Enhance with current period status
        // Note: This N+1 query pattern is suboptimal but acceptable for MVP with low N (< 20)
        // A better approach would be to join with completions in a specific range

        const enhancedRoutines = await Promise.all(routines.map(async (routine) => {
            const bounds = getPeriodBounds(routine.frequency_type, new Date(), timezone);
            const prevBounds = getPreviousPeriodBounds(routine.frequency_type, new Date(), timezone);

            if (routine.current_streak > 0 && routine.last_completed_at) {
                const lastCompleted = new Date(routine.last_completed_at);
                if (lastCompleted < prevBounds.start) {
                    // Detected stale streak - enqueue reset in background
                    enqueueStreakReset(routine.id);
                }
            }

            const { count, error: countError } = await supabase
                .from('routine_completions')
                .select('*', { count: 'exact', head: true })
                .eq('routine_id', routine.id)
                .gte('completed_at', bounds.start.toISOString())
                .lte('completed_at', bounds.end.toISOString());

            if (countError) logger.error('Error counting completions', countError);

            return {
                ...routine,
                period_status: {
                    completions_count: count || 0,
                    target_count: routine.target_count,
                    is_complete: (count || 0) >= routine.target_count,
                    period_date: bounds.periodDate
                }
            };
        }));

        res.json(enhancedRoutines);
    } catch (error) {
        logger.error('Error fetching routines:', error);
        res.status(500).json({ error: error.message });
    }
};

export const getRoutineById = async (req, res) => {
    const userId = req.user.id;
    const { id } = req.params;

    try {
        const { data, error } = await supabase
            .from('routines')
            .select('*')
            .eq('id', id)
            .eq('user_id', userId)
            .single();

        if (error) throw error;
        res.json(data);
    } catch (error) {
        if (error.code === 'PGRST116') {
            return res.status(404).json({ error: 'Routine not found' });
        }
        logger.error('Error fetching routine by ID:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
};

export const updateRoutine = async (req, res) => {
    const userId = req.user.id;
    const { id } = req.params;
    const updates = req.body;

    // Prevent changing fundamental properties that break history
    delete updates.frequency_type;
    delete updates.id;
    delete updates.user_id;

    // 1. Validation
    if (updates.title !== undefined) {
        if (typeof updates.title !== 'string' || updates.title.trim() === '') {
            return res.status(400).json({
                error: 'VALIDATION_ERROR',
                message: 'Title cannot be empty'
            });
        }
        if (updates.title.length > 100) {
            return res.status(400).json({
                error: 'VALIDATION_ERROR',
                message: 'Title must be 100 characters or less'
            });
        }
    }

    if (updates.target_count !== undefined) {
        if (!Number.isInteger(updates.target_count) || updates.target_count < 1 || updates.target_count > 10) {
            return res.status(400).json({
                error: 'VALIDATION_ERROR',
                message: 'target_count must be an integer between 1 and 10'
            });
        }
    }

    if (updates.time_window !== undefined) {
        if (!['morning', 'afternoon', 'evening', 'anytime'].includes(updates.time_window)) {
            return res.status(400).json({
                error: 'VALIDATION_ERROR',
                message: 'Invalid time_window. Must be morning, afternoon, evening, or anytime'
            });
        }
    }

    if (updates.reminder_enabled !== undefined && typeof updates.reminder_enabled !== 'boolean') {
        return res.status(400).json({
            error: 'VALIDATION_ERROR',
            message: 'reminder_enabled must be a boolean'
        });
    }

    if (updates.reminder_time && !/^([01]\d|2[0-3]):([0-5]\d)(:([0-5]\d))?$/.test(updates.reminder_time)) {
        return res.status(400).json({
            error: 'VALIDATION_ERROR',
            message: 'Invalid reminder_time format. Use HH:mm or HH:mm:ss'
        });
    }

    try {
        const { data, error } = await supabase
            .from('routines')
            .update(updates)
            .eq('id', id)
            .eq('user_id', userId)
            .select()
            .single();

        if (error) throw error;
        res.json(data);
    } catch (error) {
        if (error.code === 'PGRST116') {
            return res.status(404).json({ error: 'Routine not found' });
        }
        logger.error('Error updating routine:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
};

export const deleteRoutine = async (req, res) => {
    const userId = req.user.id;
    const { id } = req.params;

    try {
        // Soft delete
        const { data, error } = await supabase
            .from('routines')
            .update({ is_active: false })
            .eq('id', id)
            .eq('user_id', userId)
            .select()
            .single();

        if (error) throw error;
        res.json({ message: 'Routine deleted successfully', routine: data });
    } catch (error) {
        if (error.code === 'PGRST116') {
            return res.status(404).json({ error: 'Routine not found' });
        }
        logger.error('Error deleting routine:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
};

export const logCompletion = async (req, res) => {
    const userId = req.user.id;
    const { id } = req.params; // routine_id
    const { notes } = req.body;
    const timezone = req.header('X-User-Timezone') || 'UTC';

    try {
        // 1. Get Routine for metadata
        const { data: routine, error: routineError } = await supabase
            .from('routines')
            .select('*')
            .eq('id', id)
            .eq('user_id', userId)
            .single();

        if (routineError) {
            logger.error('Database error fetching routine:', routineError);
            throw routineError;
        }
        if (!routine) throw new Error('Routine not found');

        // 2. Determine Period Date
        const bounds = getPeriodBounds(routine.frequency_type, new Date(), timezone);
        const prevBounds = getPreviousPeriodBounds(routine.frequency_type, new Date(), timezone);
        const periodDate = bounds.periodDate;

        // 3. Detect if streak is stale
        let resetStreak = false;
        if (routine.current_streak > 0 && routine.last_completed_at) {
            const lastCompleted = new Date(routine.last_completed_at);
            if (lastCompleted < prevBounds.start) {
                resetStreak = true;
            }
        }

        // 4. Perform atomic log and streak update via RPC
        const { data: result, error: rpcError } = await supabase
            .rpc('log_routine_completion', {
                p_routine_id: id,
                p_user_id: userId,
                p_period_date: periodDate,
                p_notes: notes || '',
                p_completed_at: new Date().toISOString(),
                p_reset_streak: resetStreak
            });

        if (rpcError) throw rpcError;

        const { completion, routine: updatedRoutine, streak_incremented, completions_count } = result;

        // 4. Celebration Response
        const isOverachiever = completions_count > routine.target_count;

        // Re-construct enriched routine for the frontend
        const enrichedRoutine = {
            ...updatedRoutine,
            period_status: {
                completions_count: completions_count,
                target_count: routine.target_count,
                is_complete: completions_count >= routine.target_count,
                period_date: periodDate
            }
        };

        res.status(201).json({
            completion,
            routine: enrichedRoutine,
            celebration: isOverachiever
                ? { type: 'overachiever', message: 'Extra credit!' }
                : (streak_incremented ? { type: 'streak_increment', message: 'Streak kept!' } : null)
        });
    } catch (error) {
        logger.error('Error logging completion:', error);
        const isNotFound =
            error.message === 'Routine not found' ||
            error.status === 404 ||
            error.message?.includes('Routine not found') ||
            error.name === 'NotFoundError' ||
            error.code === 'PGRST116';
        res.status(isNotFound ? 404 : 500).json({ error: error.message });
    }
};

// Undo completion: removes latest and reverts stats
export const undoCompletion = async (req, res) => {
    const userId = req.user.id;
    const { id } = req.params;

    try {
        // Perform atomic undo via RPC
        const { data: result, error: rpcError } = await supabase
            .rpc('undo_routine_completion', {
                p_routine_id: id,
                p_user_id: userId
            });

        if (rpcError) throw rpcError;

        const { routine: updatedRoutine, completions_count, period_date } = result;

        // Return Enriched routine with calculated period status
        const enrichedRoutine = {
            ...updatedRoutine,
            period_status: {
                completions_count: completions_count,
                target_count: updatedRoutine.target_count,
                is_complete: completions_count >= updatedRoutine.target_count,
                period_date: period_date
            }
        };

        res.json({ routine: enrichedRoutine });
    } catch (error) {
        const isNotFound =
            error.status === 404 ||
            error.code === 'NOT_FOUND' ||
            error.message?.includes('not found') ||
            error.message?.includes('does not own routine') ||
            error.code === 'PGRST116';

        if (isNotFound) {
            res.status(404).json({ error: 'Routine not found' });
        } else {
            logger.error('Error undoing completion:', error);
            res.status(500).json({ error: error.message });
        }
    }
};

// Reset completions for the current period
export const resetCompletions = async (req, res) => {
    const userId = req.user.id;
    const { id } = req.params;
    const timezone = req.header('X-User-Timezone') || 'UTC';

    try {
        // 1. Get Routine for metadata (to determine current period)
        const { data: routine, error: routineError } = await supabase
            .from('routines')
            .select('*')
            .eq('id', id)
            .eq('user_id', userId)
            .single();

        if (routineError) {
            logger.error('Database error fetching routine:', routineError);
            throw routineError;
        }
        if (!routine) throw new Error('Routine not found');

        // 2. Determine Period Date
        const bounds = getPeriodBounds(routine.frequency_type, new Date(), timezone);
        const periodDate = bounds.periodDate;

        // 3. Perform atomic reset via RPC
        const { data: result, error: rpcError } = await supabase
            .rpc('reset_routine_period', {
                p_routine_id: id,
                p_user_id: userId,
                p_period_date: periodDate
            });

        if (rpcError) throw rpcError;

        const { routine: updatedRoutine, completions_removed } = result;

        // Re-construct enriched routine
        const enrichedRoutine = {
            ...updatedRoutine,
            period_status: {
                completions_count: 0,
                target_count: updatedRoutine.target_count,
                is_complete: false,
                period_date: periodDate
            }
        };

        res.json({
            routine: enrichedRoutine,
            message: `Successfully removed ${completions_removed} completions.`
        });
    } catch (error) {
        logger.error('Error resetting completions:', error);

        const isNotFound =
            error.message === 'Routine not found' ||
            error.status === 404 ||
            error.message?.includes('Routine not found') ||
            error.name === 'NotFoundError' ||
            error.code === 'PGRST116';

        res.status(isNotFound ? 404 : 500).json({ error: error.message });
    }
};
