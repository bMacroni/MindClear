import { extractCalendarEvents } from '../calendarEventUtils';

describe('extractCalendarEvents', () => {
  it('returns empty array for falsy input', () => {
    expect(extractCalendarEvents(undefined)).toEqual([]);
    expect(extractCalendarEvents(null)).toEqual([]);
  });

  it('returns the array when input is already an array', () => {
    const events = [{ id: '1' }, { id: '2' }];
    expect(extractCalendarEvents(events)).toBe(events);
  });

  it('extracts events from data property', () => {
    const response = { data: [{ id: 'evt-1' }] };
    expect(extractCalendarEvents(response)).toEqual([{ id: 'evt-1' }]);
  });

  it('extracts events from nested data.events structure', () => {
    const response = { data: { events: [{ id: 'evt-2' }] } };
    expect(extractCalendarEvents(response)).toEqual([{ id: 'evt-2' }]);
  });

  it('avoids infinite loops with circular references', () => {
    const circular: any = {};
    circular.self = circular;
    expect(extractCalendarEvents(circular)).toEqual([]);
  });
});

