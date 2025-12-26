/**
 * Recurrence utilities for mobile
 * Helper functions for formatting and working with recurrence patterns
 */

export interface RecurrencePattern {
    type: 'daily' | 'weekly' | 'monthly';
    interval: number;
    daysOfWeek?: number[];
    endCondition?: {
        type: 'never' | 'count' | 'date';
        value?: number | string;
    };
    completedCount?: number;
    is_paused?: boolean;
    paused_at?: string;
    createdAt?: string;
}

export interface Task {
    id: string;
    recurrence_pattern?: RecurrencePattern | null;
    // ... other task fields
}

const DAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const DAY_NAMES_FULL = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

/**
 * Check if a task has a recurrence pattern
 */
export function isRecurringTask(task: Task | undefined | null): boolean {
    return !!(task?.recurrence_pattern && task.recurrence_pattern.type);
}

/**
 * Check if a recurring task is paused
 */
export function isPausedRecurringTask(task: Task | undefined | null): boolean {
    return !!(task?.recurrence_pattern?.is_paused);
}

/**
 * Format a recurrence pattern as a human-readable string
 */
export function formatRecurrencePattern(pattern: RecurrencePattern | null | undefined): string | null {
    if (!pattern) return null;

    const interval = pattern.interval || 1;

    let base = '';
    switch (pattern.type) {
        case 'daily':
            base = interval === 1 ? 'Every day' : `Every ${interval} days`;
            break;
        case 'weekly':
            if (pattern.daysOfWeek && pattern.daysOfWeek.length > 0) {
                // Filter to only valid day indices (0-6), deduplicate, and preserve order
                const validDays = Array.from(new Set(
                    pattern.daysOfWeek.filter(d => typeof d === 'number' && d >= 0 && d <= 6)
                ));

                if (validDays.length > 0) {
                    const days = validDays.map(d => DAY_NAMES[d]).join(', ');
                    base = interval === 1
                        ? `Weekly on ${days}`
                        : `Every ${interval} weeks on ${days}`;
                } else {
                    // Fall back to interval-based text if no valid days
                    base = interval === 1 ? 'Weekly' : `Every ${interval} weeks`;
                }
            } else {
                base = interval === 1 ? 'Every week' : `Every ${interval} weeks`;
            }
            break;
        case 'monthly':
            base = interval === 1 ? 'Every month' : `Every ${interval} months`;
            break;
        default:
            return 'Recurring';
    }

    return base;
}

/**
 * Get a short summary of the recurrence (for badges)
 */
export function getRecurrenceBadgeText(pattern: RecurrencePattern | null | undefined): string | null {
    if (!pattern) return null;

    const interval = pattern.interval || 1;
    let baseLabel: string;

    // Compute base label without early returns
    switch (pattern.type) {
        case 'daily':
            baseLabel = interval === 1 ? 'Daily' : `Every ${interval}d`;
            break;
        case 'weekly':
            baseLabel = interval === 1 ? 'Weekly' : `Every ${interval}w`;
            break;
        case 'monthly':
            baseLabel = interval === 1 ? 'Monthly' : `Every ${interval}mo`;
            break;
        default:
            baseLabel = 'Recurring';
            break;
    }

    // Handle end condition if present
    if (!pattern.endCondition) {
        return baseLabel;
    }

    if (pattern.endCondition.type === 'count') {
        const completed = pattern.completedCount || 0;
        const total = typeof pattern.endCondition.value === 'number'
            ? pattern.endCondition.value
            : 0;

        // Guard against non-positive totals
        if (total <= 0) {
            return baseLabel;
        }

        return `${baseLabel} (${completed}/${total})`;
    }

    if (pattern.endCondition.type === 'date') {
        const dateValue = pattern.endCondition.value;

        // Validate date type and value
        if (typeof dateValue !== 'string') {
            return baseLabel;
        }

        const endDate = new Date(dateValue);

        // Guard against invalid dates
        if (isNaN(endDate.getTime())) {
            return baseLabel;
        }

        return `${baseLabel} (until ${endDate.toLocaleDateString()})`;
    }

    // 'never' type or unknown type - return base label
    return baseLabel;
}

/**
 * Calculate progress percentage for count-based end condition
 */
export function getRecurrenceProgress(pattern: RecurrencePattern | null | undefined): number | null {
    if (!pattern?.endCondition || pattern.endCondition.type !== 'count') {
        return null;
    }

    const completed = pattern.completedCount || 0;
    const total = typeof pattern.endCondition.value === 'number' 
        ? pattern.endCondition.value 
        : 0;

    if (total <= 0) return null;

    return Math.min(100, Math.round((completed / total) * 100));
}

/**
 * Create a default recurrence pattern
 */
export function createDefaultRecurrencePattern(type: 'daily' | 'weekly' | 'monthly' = 'weekly'): RecurrencePattern {
    return {
        type,
        interval: 1,
        daysOfWeek: type === 'weekly' ? [] : undefined,
        endCondition: { type: 'never' },
        completedCount: 0,
        createdAt: new Date().toISOString(),
    };
}

/**
 * Validate a recurrence pattern
 * Performs comprehensive validation of all recurrence fields
 */
export function isValidRecurrencePattern(pattern: any): pattern is RecurrencePattern {
    // Basic type check
    if (!pattern || typeof pattern !== 'object') return false;

    // Validate type field
    if (!['daily', 'weekly', 'monthly'].includes(pattern.type)) return false;

    // Validate interval (must be an integer >= 1)
    if (pattern.interval !== undefined) {
        if (typeof pattern.interval !== 'number' ||
            !Number.isInteger(pattern.interval) ||
            pattern.interval < 1) {
            return false;
        }
    }

    // Validate daysOfWeek (must be array of integers 0-6)
    if (pattern.daysOfWeek !== undefined) {
        if (!Array.isArray(pattern.daysOfWeek)) return false;

        for (const day of pattern.daysOfWeek) {
            if (typeof day !== 'number' ||
                !Number.isInteger(day) ||
                day < 0 ||
                day > 6) {
                return false;
            }
        }
    }

    // Validate completedCount (must be a non-negative integer)
    if (pattern.completedCount !== undefined) {
        if (typeof pattern.completedCount !== 'number' ||
            !Number.isInteger(pattern.completedCount) ||
            pattern.completedCount < 0) {
            return false;
        }
    }

    // Validate endCondition
    if (pattern.endCondition !== undefined) {
        const endCond = pattern.endCondition;

        // Must be an object
        if (!endCond || typeof endCond !== 'object') return false;

        // Validate type field
        if (!['never', 'count', 'date'].includes(endCond.type)) return false;

        // Type-specific validation
        if (endCond.type === 'count') {
            // Must have a positive integer value
            if (endCond.value === undefined) return false;
            if (typeof endCond.value !== 'number' ||
                !Number.isInteger(endCond.value) ||
                endCond.value <= 0) {
                return false;
            }
        } else if (endCond.type === 'date') {
            // Must have a valid date/ISO string
            if (endCond.value === undefined) return false;
            if (typeof endCond.value !== 'string') return false;

            const date = new Date(endCond.value);
            if (isNaN(date.getTime())) return false;
        }
        // 'never' type doesn't require a value
    }

    return true;
}
