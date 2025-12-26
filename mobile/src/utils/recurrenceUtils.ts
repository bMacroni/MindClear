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
                const days = pattern.daysOfWeek.map(d => DAY_NAMES[d]).join(', ');
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

    switch (pattern.type) {
        case 'daily':
            return interval === 1 ? 'Daily' : `Every ${interval}d`;
        case 'weekly':
            return interval === 1 ? 'Weekly' : `Every ${interval}w`;
        case 'monthly':
            return interval === 1 ? 'Monthly' : `Every ${interval}mo`;
        default:
            return 'Recurring';
    }
}

/**
 * Format end condition as a string
 */
export function formatEndCondition(pattern: RecurrencePattern | null | undefined): string | null {
    if (!pattern?.endCondition || pattern.endCondition.type === 'never') {
        return null;
    }

    if (pattern.endCondition.type === 'count') {
        const completed = pattern.completedCount || 0;
        const total = pattern.endCondition.value as number;
        return `${completed} of ${total} times`;
    }

    if (pattern.endCondition.type === 'date') {
        const endDate = new Date(pattern.endCondition.value as string);
        return `Until ${endDate.toLocaleDateString()}`;
    }

    return null;
}

/**
 * Calculate progress percentage for count-based end condition
 */
export function getRecurrenceProgress(pattern: RecurrencePattern | null | undefined): number | null {
    if (!pattern?.endCondition || pattern.endCondition.type !== 'count') {
        return null;
    }

    const completed = pattern.completedCount || 0;
    const total = pattern.endCondition.value as number;

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
 */
export function isValidRecurrencePattern(pattern: any): pattern is RecurrencePattern {
    if (!pattern || typeof pattern !== 'object') return false;
    if (!['daily', 'weekly', 'monthly'].includes(pattern.type)) return false;
    if (pattern.interval !== undefined && (typeof pattern.interval !== 'number' || pattern.interval < 1)) return false;
    if (pattern.daysOfWeek !== undefined && !Array.isArray(pattern.daysOfWeek)) return false;
    return true;
}
