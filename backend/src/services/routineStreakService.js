import { startOfDay, endOfDay, startOfWeek, endOfWeek, startOfMonth, endOfMonth, subDays, subWeeks, subMonths, isSameDay, parseISO, format } from 'date-fns';
import { toZonedTime, fromZonedTime } from 'date-fns-tz';

/**
 * Get period boundaries for a given date and frequency
 * @param {string} frequency - 'daily', 'weekly', 'monthly'
 * @param {Date|string} date - Reference date (default: now)
 * @param {string} timezone - User timezone (default: 'UTC')
 * @param {number} weekStart - 0 (Sunday) or 1 (Monday)
 * @returns {object} { start: Date, end: Date } in UTC
 */
export function getPeriodBounds(frequency, date = new Date(), timezone = 'UTC', weekStart = 1) {
    // Convert UTC date to user's zoned time for calculation
    const zonedDate = toZonedTime(date, timezone);

    let start, end;

    switch (frequency) {
        case 'daily':
            start = startOfDay(zonedDate);
            end = endOfDay(zonedDate);
            break;
        case 'weekly':
            start = startOfWeek(zonedDate, { weekStartsOn: weekStart });
            end = endOfWeek(zonedDate, { weekStartsOn: weekStart });
            break;
        case 'monthly':
            start = startOfMonth(zonedDate);
            end = endOfMonth(zonedDate);
            break;
        default:
            throw new Error(`Invalid frequency: ${frequency}`);
    }

    // Convert back to UTC for database comparison
    return {
        start: fromZonedTime(start, timezone),
        end: fromZonedTime(end, timezone),
        periodDate: format(start, 'yyyy-MM-dd') // Canonical date string for the period
    };
}

/**
 * Get the previous period's boundaries
 */
export function getPreviousPeriodBounds(frequency, date, timezone, weekStart) {
    const zonedDate = toZonedTime(date, timezone);
    let prevDate;

    switch (frequency) {
        case 'daily':
            prevDate = subDays(zonedDate, 1);
            break;
        case 'weekly':
            prevDate = subWeeks(zonedDate, 1);
            break;
        case 'monthly':
            prevDate = subMonths(zonedDate, 1);
            break;
    }

    return getPeriodBounds(frequency, prevDate, timezone, weekStart);
}

/**
 * Calculate streak stats based on completion history
 * This is a simplified version for run-time checks.
 * For full history recalculation, we'd need a more complex algorithm.
 */
export function checkStreakStatus(routine, completions, timezone = 'UTC', weekStart = 1) {
    const now = new Date();

    // 1. Check current period status
    const currentPeriod = getPeriodBounds(routine.frequency_type, now, timezone, weekStart);

    // Filter completions for current period
    const currentCompletions = completions.filter(c =>
        c.completed_at >= currentPeriod.start.toISOString() &&
        c.completed_at <= currentPeriod.end.toISOString()
    );

    const isCurrentPeriodComplete = currentCompletions.length >= routine.target_count;
    const currentProgress = currentCompletions.length;

    // 2. Check previous period (to see if streak is broken)
    const prevPeriod = getPreviousPeriodBounds(routine.frequency_type, now, timezone, weekStart);

    // This logic assumes we have access to whether the previous period was completed
    // In a real scenario, valid streak implies previous period was valid (or covered by grace)

    return {
        isCurrentPeriodComplete,
        currentProgress,
        periodDate: currentPeriod.periodDate
    };
}

/**
 * Determine if a streak should be broken or saved by grace
 */
export function validateStreak(routine, lastCompletedPeriodDate, timezone = 'UTC') {
    // If no previous completion, streak is 0 (or just started)
    if (!routine.last_completed_at) return { shouldReset: false, useGrace: false };

    // Implementation logic:
    // We need to see if the gap between NOW and last_completed_at is too large
    // This is complex because 'too large' depends on frequency
}
