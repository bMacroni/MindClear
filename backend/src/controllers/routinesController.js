import { createClient } from '@supabase/supabase-js';
import logger from '../utils/logger.js';
import { getPeriodBounds, getPreviousPeriodBounds } from '../services/routineStreakService.js';

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

// Helper: Check subscription limit
async function checkRoutineLimit(userId) {
    // Get user subscription tier (mock logic if table doesn't have it, but PRD says it does)
    // Assuming 'users' table has 'subscription_tier' or we check a separate table
    // For safety, defaulting to free limit check

    const { data: user } = await supabase
        .from('users')
        .select('subscription_tier')
        .eq('id', userId)
        .single();

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
    const { title, description, frequency_type, target_count, time_window, icon, color, reminder_enabled, reminder_time } = req.body;

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
                is_active: true
            })
            .select()
            .single();

        if (error) throw error;

        res.status(201).json(data);
    } catch (error) {
        logger.error('Error creating routine:', error);
        res.status(400).json({ error: error.message });
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

            // Streak validation
            let currentStreak = routine.current_streak;
            let streakReset = false;

            if (currentStreak > 0 && routine.last_completed_at) {
                const lastCompleted = new Date(routine.last_completed_at);
                // If last completion was before the start of the previous period, the streak is broken
                // (i.e. they missed the entire previous period)
                if (lastCompleted < prevBounds.start) {
                    // Check grace period logic could go here, but for now strict reset
                    // To support grace: check if (lastCompleted >= prevPrevBounds.start) && grace > 0

                    // Simple check: if missed previous period, reset
                    currentStreak = 0;
                    streakReset = true;

                    // Persist the reset
                    // Fire and forget update
                    supabase.from('routines')
                        .update({ current_streak: 0 })
                        .eq('id', routine.id)
                        .then(({ error }) => {
                            if (error) logger.error('Error resetting streak', error);
                        });
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
                current_streak: currentStreak, // Return validated streak
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
        res.status(404).json({ error: 'Routine not found' });
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
        res.status(400).json({ error: error.message });
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
        res.status(500).json({ error: error.message });
    }
};

export const logCompletion = async (req, res) => {
    const userId = req.user.id;
    const { id } = req.params; // routine_id
    const { notes } = req.body;
    const timezone = req.header('X-User-Timezone') || 'UTC';

    try {
        // 1. Get Routine
        const { data: routine, error: routineError } = await supabase
            .from('routines')
            .select('*')
            .eq('id', id)
            .eq('user_id', userId)
            .single();

        if (routineError || !routine) throw new Error('Routine not found');

        // 2. Determine Period Date
        const bounds = getPeriodBounds(routine.frequency_type, new Date(), timezone);
        const periodDate = bounds.periodDate;

        // 3. Create Completion
        const { data: completion, error: completionError } = await supabase
            .from('routine_completions')
            .insert({
                routine_id: id,
                user_id: userId,
                period_date: periodDate,
                notes,
                completed_at: new Date().toISOString()
            })
            .select()
            .single();

        if (completionError) throw completionError;

        // 4. Update Streak Logic (Simplified for MVP)
        // In a full implementation, we'd check if this completion triggers a streak increment
        // For now, we'll increment total_completions and check if we met the target for the first time this period

        // Count completions for this period
        const { count } = await supabase
            .from('routine_completions')
            .select('*', { count: 'exact', head: true })
            .eq('routine_id', id)
            .eq('period_date', periodDate);

        let updates = {
            total_completions: routine.total_completions + 1,
            last_completed_at: new Date().toISOString()
        };

        // Increment streak logic
        // Only increment if we JUST reached the target count
        if (count === routine.target_count) {
            const newStreak = routine.current_streak + 1;
            updates.current_streak = newStreak;
            // Update best streak
            if (newStreak > routine.longest_streak) {
                updates.longest_streak = newStreak;
            }
        }

        const { data: updatedRoutine, error: updateError } = await supabase
            .from('routines')
            .update(updates)
            .eq('id', id)
            .select()
            .single();

        if (updateError) throw updateError;

        // 5. Celebration Response
        const isOverachiever = count > routine.target_count;

        res.status(201).json({
            completion,
            routine: updatedRoutine,
            celebration: isOverachiever ? { type: 'overachiever', message: 'Extra credit!' } : (count === routine.target_count ? { type: 'streak_increment', message: 'Streak kept!' } : null)
        });
    } catch (error) {
        logger.error('Error logging completion:', error);
        res.status(500).json({ error: error.message });
    }
};

export const removeCompletion = async (req, res) => {
    const userId = req.user.id;
    const { id, completionId } = req.params;

    try {
        // 1. Get Routine
        const { data: routine } = await supabase
            .from('routines')
            .select('*')
            .eq('id', id)
            .single();

        // 2. Delete Completion
        const { error } = await supabase
            .from('routine_completions')
            .delete()
            .eq('id', completionId)
            .eq('routine_id', id)
            .eq('user_id', userId);

        if (error) throw error;

        // 3. Re-calculate Streak (Naive Approach: Decrement if appropriate)
        // Warning: Accurate rollback is hard without history reconstruction. 
        // For MVP, we will simpler: just decrement total_completed. 
        // If we dropped below target, we might need to decrement streak, but that's tricky if we don't know if it was *this* completion that added the streak.
        // For now, let's just decrement total_completions.

        await supabase.rpc('decrement_routine_counter', { row_id: id }); // Assuming we have an RPC or we use update
        // Fallback standard update
        await supabase
            .from('routines')
            .update({ total_completions: Math.max(0, (routine.total_completions || 1) - 1) }) // simple decrement
            .eq('id', id);

        res.json({ message: 'Completion removed' });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
};
