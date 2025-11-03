import type { CalendarEvent } from '../../../types/calendar';

const isCalendarEvent = (value: unknown): value is CalendarEvent => {
  if (!value || typeof value !== 'object') {
    return false;
  }

  const candidate = value as Partial<CalendarEvent> & {
    start?: { dateTime?: unknown } | null;
    end?: { dateTime?: unknown } | null;
  };

  const start = candidate.start;
  const end = candidate.end;
  const startDateTime =
    start && typeof start === 'object' && 'dateTime' in start ? (start as { dateTime?: unknown }).dateTime : undefined;
  const endDateTime =
    end && typeof end === 'object' && 'dateTime' in end ? (end as { dateTime?: unknown }).dateTime : undefined;

  const hasId = typeof candidate.id === 'string' && candidate.id.trim().length > 0;
  const hasTitle =
    (typeof candidate.title === 'string' && candidate.title.trim().length > 0) ||
    (typeof candidate.summary === 'string' && candidate.summary.trim().length > 0);
  const hasStart =
    (typeof candidate.start_time === 'string' && candidate.start_time.trim().length > 0) ||
    typeof startDateTime === 'string';
  const hasEnd =
    (typeof candidate.end_time === 'string' && candidate.end_time.trim().length > 0) ||
    typeof endDateTime === 'string';

  return hasId && hasTitle && hasStart && hasEnd;
};

const validateCalendarEvents = (values: unknown[]): CalendarEvent[] => {
  if (!values.length) {
    return [];
  }

  const validEvents: CalendarEvent[] = [];
  const invalidIndexes: number[] = [];

  values.forEach((value, index) => {
    if (isCalendarEvent(value)) {
      validEvents.push(value);
      return;
    }

    invalidIndexes.push(index);
  });

  if (invalidIndexes.length) {
    console.warn(
      `extractCalendarEvents: ignored ${invalidIndexes.length} invalid calendar event(s) at index(es) ${invalidIndexes.join(', ')}`,
    );
  }

  return validEvents;
};

export const extractCalendarEvents = (response: unknown): CalendarEvent[] => {
  try {
    const visited = new WeakSet<object>();

    const walk = (value: unknown): unknown[] => {
      if (!value) {
        return [];
      }

      if (Array.isArray(value)) {
        return value;
      }

      if (typeof value !== 'object') {
        return [];
      }

      if (visited.has(value as object)) {
        return [];
      }

      visited.add(value as object);

      if (Array.isArray((value as { data?: unknown[] }).data)) {
        return (value as { data: unknown[] }).data;
      }

      if (Array.isArray((value as { events?: unknown[] }).events)) {
        return (value as { events: unknown[] }).events;
      }

      if (Array.isArray((value as { items?: unknown[] }).items)) {
        return (value as { items: unknown[] }).items;
      }

      if ((value as any).data) {
        const nestedFromData = walk((value as any).data);
        if (nestedFromData.length) {
          return nestedFromData;
        }
      }

      for (const nestedValue of Object.values(value)) {
        const nested = walk(nestedValue);
        if (nested.length) {
          return nested;
        }
      }

      return [];
    };

    const candidates = walk(response);

    return validateCalendarEvents(candidates);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error occurred';
    throw new Error(`Failed to extract calendar events: ${message}`);
  }
};
