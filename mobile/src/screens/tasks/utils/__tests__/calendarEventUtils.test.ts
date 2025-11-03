import type { CalendarEvent } from '../../../../types/calendar';
import { extractCalendarEvents } from '../calendarEventUtils';

describe('extractCalendarEvents', () => {
  const createEvent = (overrides: Partial<CalendarEvent> = {}): CalendarEvent => ({
    id: 'evt-0',
    title: 'Sample Event',
    start: { dateTime: '2024-01-01T00:00:00.000Z' },
    end: { dateTime: '2024-01-01T01:00:00.000Z' },
    ...overrides,
  });

  it('returns empty array for falsy input', () => {
    expect(extractCalendarEvents(undefined)).toEqual([]);
    expect(extractCalendarEvents(null)).toEqual([]);
  });

  it('returns the array when input is already an array', () => {
    const events = [createEvent({ id: 'evt-1' }), createEvent({ id: 'evt-2' })];
    const result = extractCalendarEvents(events);

    expect(result).toEqual(events);
    expect(result).not.toBe(events);
  });

  it('extracts events from data property', () => {
    const event = createEvent({ id: 'evt-1', summary: undefined });
    const response = { data: [event] };

    expect(extractCalendarEvents(response)).toEqual([event]);
  });

  it('extracts events from nested data.events structure', () => {
    const event = createEvent({ id: 'evt-2', title: 'Nested Event' });
    const response = { data: { events: [event] } };

    expect(extractCalendarEvents(response)).toEqual([event]);
  });

  it('avoids infinite loops with circular references', () => {
    const circular: any = {};
    circular.self = circular;
    expect(extractCalendarEvents(circular)).toEqual([]);
  });

  it('filters out invalid events and logs a warning', () => {
    const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});
    const validEvent = createEvent({ id: 'evt-3' });
    const response = { items: [validEvent, { foo: 'bar' }] };

    expect(extractCalendarEvents(response)).toEqual([validEvent]);
    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining('extractCalendarEvents: ignored 1 invalid calendar event(s) at index(es) 1'),
    );

    warnSpy.mockRestore();
  });

  it('throws error when extraction fails instead of returning empty array', () => {
    // Create an object with a property that throws when accessed
    const throwingObject: any = {};
    const errorMessage = 'Access denied';
    Object.defineProperty(throwingObject, 'data', {
      get() {
        throw new Error(errorMessage);
      },
      enumerable: true,
      configurable: true,
    });

    // The function should throw an error with a contextual message
    expect(() => extractCalendarEvents(throwingObject)).toThrow('Failed to extract calendar events');
    expect(() => extractCalendarEvents(throwingObject)).toThrow(errorMessage);
  });
});

