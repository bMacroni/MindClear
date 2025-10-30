// Date utility functions for calendar functionality

/**
 * Format a date to YYYY-MM-DD format
 */
export const formatDateToYYYYMMDD = (date: Date): string => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

/**
 * Get a stable YYYY-MM-DD key for a given timestamp interpreted in the device's local timezone.
 * This avoids subtle mismatches when comparing server UTC timestamps to local calendar days.
 */
export const getLocalDateKey = (input: string | Date): string => {
  const d = typeof input === 'string' ? new Date(input) : input;
  // Using local getters ensures the key matches UI local-day selection
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

/**
 * Get the start of a week (Sunday) for a given date
 */
export const getWeekStart = (date: Date): Date => {
  const weekStart = new Date(date);
  weekStart.setDate(date.getDate() - date.getDay());
  return weekStart;
};

/**
 * Get the end of a week (Saturday) for a given date
 */
export const getWeekEnd = (date: Date): Date => {
  const weekEnd = new Date(date);
  weekEnd.setDate(date.getDate() + (6 - date.getDay()));
  return weekEnd;
};

/**
 * Check if two dates are the same day
 */
export const isSameDay = (date1: Date, date2: Date): boolean => {
  return formatDateToYYYYMMDD(date1) === formatDateToYYYYMMDD(date2);
};

/**
 * Get the time difference in minutes between two dates
 */
export const getTimeDifferenceInMinutes = (date1: Date, date2: Date): number => {
  return Math.abs(date2.getTime() - date1.getTime()) / (1000 * 60);
};

/**
 * Format a date to a readable string
 */
export const formatDateReadable = (date: Date): string => {
  return date.toLocaleDateString([], {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });
};

/**
 * Format a time to HH:MM format
 */
export const formatTime = (date: Date): string => {
  return date.toLocaleTimeString([], {
    hour: '2-digit',
    minute: '2-digit',
  });
};

/**
 * Get the current timezone offset in minutes
 */
export const getTimezoneOffset = (): number => {
  return new Date().getTimezoneOffset();
};

/**
 * Convert a date to the user's local timezone
 */
export const toLocalTimezone = (date: Date): Date => {
  const offset = getTimezoneOffset();
  return new Date(date.getTime() - offset * 60 * 1000);
};

/**
 * Check if a date is today
 */
export const isToday = (date: Date): boolean => {
  return isSameDay(date, new Date());
};

/**
 * Check if a date is in the past
 */
export const isPast = (date: Date): boolean => {
  return date < new Date();
};

/**
 * Check if a date is in the future
 */
export const isFuture = (date: Date): boolean => {
  return date > new Date();
};

/**
 * Format a date using a specific format
 */
export const format = (date: Date, formatStr: string): string => {
  const year = date.getFullYear();
  const month = date.getMonth() + 1;
  const day = date.getDate();
  const hours = date.getHours();
  const minutes = date.getMinutes();
  const seconds = date.getSeconds();

  return formatStr
    .replace('YYYY', year.toString())
    .replace('MM', month.toString().padStart(2, '0'))
    .replace('DD', day.toString().padStart(2, '0'))
    .replace('HH', hours.toString().padStart(2, '0'))
    .replace('mm', minutes.toString().padStart(2, '0'))
    .replace('ss', seconds.toString().padStart(2, '0'));
};

/**
 * Get the start of a week (Sunday) for a given date
 */
export const startOfWeek = (date: Date): Date => {
  const weekStart = new Date(date);
  weekStart.setDate(date.getDate() - date.getDay());
  weekStart.setHours(0, 0, 0, 0);
  return weekStart;
};

/**
 * Get the end of a week (Saturday) for a given date
 */
export const endOfWeek = (date: Date): Date => {
  const weekEnd = new Date(date);
  weekEnd.setDate(date.getDate() + (6 - date.getDay()));
  weekEnd.setHours(23, 59, 59, 999);
  return weekEnd;
};

/**
 * Get the start of a day (00:00:00)
 */
export const startOfDay = (date: Date): Date => {
  const start = new Date(date);
  start.setHours(0, 0, 0, 0);
  return start;
};

/**
 * Get the end of a day (23:59:59)
 */
export const endOfDay = (date: Date): Date => {
  const end = new Date(date);
  end.setHours(23, 59, 59, 999);
  return end;
};

/**
 * Check if a date is this week
 */
export const isThisWeek = (date: Date): boolean => {
  const now = new Date();
  const weekStart = startOfWeek(now);
  const weekEnd = endOfWeek(now);
  return date >= weekStart && date <= weekEnd;
};

/**
 * Check if a task is overdue
 */
export const isOverdue = (dueDate: Date, status?: string): boolean => {
  if (status === 'completed') {return false;}
  return dueDate < new Date();
};

/**
 * Format a human-friendly due label similar to the interface sample page.
 * Returns a tuple of [label, tone] where tone can drive color styling.
 * - overdue: red emphasis (e.g., "Overdue by 2 days")
 * - today: amber emphasis ("Due today")
 * - tomorrow: amber emphasis ("Due tomorrow")
 * - soon: neutral emphasis within 7 days ("3 days left")
 * - date: fallback absolute date (e.g., "Aug 29, 2025")
 */
export const formatRelativeDueLabel = (
  dueDateString?: string,
  opts?: { now?: Date; status?: 'not_started' | 'in_progress' | 'completed' }
): { label: string; tone: 'overdue' | 'today' | 'tomorrow' | 'soon' | 'date' } | null => {
  if (!dueDateString) { return null; }
  const now = opts?.now ?? new Date();
  const due = new Date(dueDateString);

  // Normalize both to local date without time for day comparisons
  const toDayOnly = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate());
  const today = toDayOnly(now);
  const dueDay = toDayOnly(due);
  const msPerDay = 24 * 60 * 60 * 1000;
  const diffDays = Math.round((dueDay.getTime() - today.getTime()) / msPerDay);

  if (opts?.status !== 'completed' && diffDays < 0) {
    const days = Math.abs(diffDays);
    return { label: days === 1 ? 'Overdue by 1 day' : `Overdue by ${days} days`, tone: 'overdue' };
  }
  if (diffDays === 0) {
    return { label: 'Due today', tone: 'today' };
  }
  if (diffDays === 1) {
    return { label: 'Due tomorrow', tone: 'tomorrow' };
  }
  if (diffDays <= 7) {
    return { label: `${diffDays} days left`, tone: 'soon' };
  }

  const monthNames = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  const label = `${monthNames[due.getMonth()]} ${due.getDate()}, ${due.getFullYear()}`;
  return { label, tone: 'date' };
};

/**
 * Get the number of days between two dates
 */
export const getDaysDifference = (date1: Date, date2: Date): number => {
  const timeDiff = date2.getTime() - date1.getTime();
  return Math.ceil(timeDiff / (1000 * 3600 * 24));
};

/**
 * Add days to a date
 */
export const addDays = (date: Date, days: number): Date => {
  const result = new Date(date);
  result.setDate(result.getDate() + days);
  return result;
};

/**
 * Subtract days from a date
 */
export const subtractDays = (date: Date, days: number): Date => {
  return addDays(date, -days);
};

/**
 * Safely parse a date string, returning undefined if invalid
 * @param dateString - The date string to parse
 * @returns A valid Date object or undefined if parsing fails
 */
export const safeParseDate = (dateString: string | null | undefined): Date | undefined => {
  if (!dateString) {
    return undefined;
  }
  
  try {
    const parsedDate = new Date(dateString);
    
    // Check if the parsed date is valid
    if (isNaN(parsedDate.getTime())) {
      return undefined;
    }
    
    return parsedDate;
  } catch (error) {
    return undefined;
  }
};