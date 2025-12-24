import { createClient } from '@supabase/supabase-js';
import logger from '../utils/logger.js';

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseKey) {
    // In some environments (like tests), these might be missing.
    // We'll log a warning instead of throwing to avoid crashing on import.
    logger.warn('RoutineBackgroundService: Missing Supabase credentials for background tasks.');
}

const supabase = (supabaseUrl && supabaseKey) ? createClient(supabaseUrl, supabaseKey) : null;

/**
 * Enqueue a streak reset for a routine.
 * This performs the update in the background with retries.
 */
export const enqueueStreakReset = (routineId, retryCount = 0) => {
    if (!supabase) return;

    // We use setImmediate to run this outside the request/response cycle
    setImmediate(async () => {
        try {
            const { error } = await supabase
                .from('routines')
                .update({
                    current_streak: 0,
                    updated_at: new Date().toISOString()
                })
                .eq('id', routineId);

            if (error) throw error;

            logger.info(`Background: Successfully reset stale streak for routine ${routineId}`);
        } catch (error) {
            logger.error(`Background: Failed to reset streak for routine ${routineId} (attempt ${retryCount + 1}):`, error);

            // Simple exponential backoff retry (up to 3 times)
            if (retryCount < 3) {
                const delay = Math.pow(2, retryCount) * 1000;
                setTimeout(() => enqueueStreakReset(routineId, retryCount + 1), delay);
            }
        }
    });
};
