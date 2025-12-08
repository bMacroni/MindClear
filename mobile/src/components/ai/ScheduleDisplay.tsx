import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Alert } from 'react-native';
import { colors } from '../../themes/colors';
import { typography } from '../../themes/typography';
import { spacing, borderRadius } from '../../themes/spacing';
import Icon from 'react-native-vector-icons/Octicons';
import type { CalendarEvent } from '../../types/calendar';
import { extractCalendarEvents } from '../../screens/tasks/utils/calendarEventUtils';

interface ScheduleEvent {
  activity: string;
  startTime: string; // may be ISO or time string
  endTime: string;   // may be ISO or time string
  date?: string;     // human date like August 15, 2025
}

interface ScheduleDisplayProps {
  text: string;
  taskTitle?: string;
}

import { calendarAPI } from '../../services/api';

export default function ScheduleDisplay({ text, taskTitle }: ScheduleDisplayProps) {
  const [isBulkScheduling, setIsBulkScheduling] = useState(false);
  const [calendarEvents, setCalendarEvents] = useState<CalendarEvent[]>([]);
  const [calendarEventsLoaded, setCalendarEventsLoaded] = useState(false);

  useEffect(() => {
    let isMounted = true;
    const loadCalendarEvents = async () => {
      try {
        const response = await calendarAPI.getEvents(200);
        const extracted = extractCalendarEvents(response);
        if (isMounted) {
          setCalendarEvents(extracted);
        }
      } catch (error) {
        console.warn('ScheduleDisplay: failed to load calendar events for context', error);
      } finally {
        if (isMounted) {
          setCalendarEventsLoaded(true);
        }
      }
    };

    loadCalendarEvents();

    return () => {
      isMounted = false;
    };
  }, []);

  // Extract the title/date from the AI response, preferring JSON title
  const extractScheduleDate = (scheduleText: string): string => {
    try {
      const jsonMatch = scheduleText.match(/```json\s*(\{[\s\S]*?\})\s*```/);
      if (jsonMatch) {
        const jsonData = JSON.parse(jsonMatch[1]);
        if (jsonData.title && typeof jsonData.title === 'string') {
          return jsonData.title;
        }
      }
    } catch {}
    // Look for patterns like "Here's your schedule for [date]:"
    const datePatterns = [
      /schedule for (.*?):/i,
      /schedule for (.*?)$/im,
      /for (.*?):/i,
    ];
    
    for (const pattern of datePatterns) {
      const match = scheduleText.match(pattern);
      if (match && match[1]) {
        return match[1].trim();
      }
    }
    
    // Fallback to "Today's Schedule" if no date found
    return "Today's Schedule";
  };

  // Parse schedule events from text
  const parseScheduleEvents = (scheduleText: string): ScheduleEvent[] => {
    try {
      // First try to parse standardized JSON format
      const jsonMatch = scheduleText.match(/```json\s*(\{[\s\S]*?\})\s*```/);
      if (jsonMatch) {
        const jsonData = JSON.parse(jsonMatch[1]);
        if (jsonData.category === 'schedule' && jsonData.events) {
          return jsonData.events.map((event: any) => ({
            activity: event.title || event.summary || taskTitle || 'Task',
            // Support both new keys (startTime/endTime) and ISO keys (start/end)
            startTime: event.startTime || event.start?.dateTime || event.start || event.start_time,
            endTime: event.endTime || event.end?.dateTime || event.end || event.end_time,
            date: event.date || event.dateLabel,
          }));
        }
      }
      
      // Also try to parse if the text is just JSON
      const directJsonMatch = scheduleText.match(/\{[\s\S]*\}/);
      if (directJsonMatch) {
        const jsonData = JSON.parse(directJsonMatch[0]);
        if (jsonData.category === 'schedule' && jsonData.events) {
          return jsonData.events.map((event: any) => ({
            activity: event.title || event.summary || taskTitle || 'Task',
            startTime: event.startTime || event.start?.dateTime || event.start || event.start_time,
            endTime: event.endTime || event.end?.dateTime || event.end || event.end_time,
            date: event.date || event.dateLabel,
          }));
        }
      }
    } catch (_error) {
      // ignore parse errors; fallback below
    }
    
    // Fallback to old parsing method for backward compatibility
    const events: ScheduleEvent[] = [];
    let lastDate: string | undefined;
    
    // Split by lines and look for schedule patterns
    const lines = scheduleText.split('\n');
    
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      // Look for patterns like "Activity from time to time" with various bullet styles
      const schedulePatterns = [
        /^[•\-\*]?\s*(.+?)\s+from\s+(\d{1,2}:\d{2}\s*(?:AM|PM))\s+to\s+(\d{1,2}:\d{2}\s*(?:AM|PM))(?:\s+on\s+([A-Za-z]+\s+\d{1,2},\s+\d{4}))?/i,
        /^\*\s*(.+?)\s+from\s+(\d{1,2}:\d{2}\s*(?:AM|PM))\s+to\s+(\d{1,2}:\d{2}\s*(?:AM|PM))(?:\s+on\s+([A-Za-z]+\s+\d{1,2},\s+\d{4}))?/i,
        /^•\s*(.+?)\s+from\s+(\d{1,2}:\d{2}\s*(?:AM|PM))\s+to\s+(\d{1,2}:\d{2}\s*(?:AM|PM))(?:\s+on\s+([A-Za-z]+\s+\d{1,2},\s+\d{4}))?/i,
      ];
      
      let matched = false;
      for (const pattern of schedulePatterns) {
        const match = line.trim().match(pattern);
        if (match) {
          // Strip out ** characters from activity name
          const cleanActivity = match[1].trim().replace(/\*\*/g, '');
          events.push({
            activity: (cleanActivity.match(/^your event$/i) ? (taskTitle || 'Task') : cleanActivity),
            startTime: match[2].trim(),
            endTime: match[3].trim(),
            date: match[4]?.trim() || lastDate,
          });
          matched = true;
          break; // Found a match, move to next line
        }
      }
      if (matched) {continue;}

      // Capture a standalone date line and associate it with subsequent items
      const dateLine = line.match(/^(?:on\s+)?([A-Za-z]+\s+\d{1,2},\s+\d{4})\b/i);
      if (dateLine) {
        lastDate = dateLine[1];
        continue;
      }
    }
    
    return events;
  };

  const events = parseScheduleEvents(text);

  // If no events found, return null to fall back to regular text display
  if (events.length === 0) {
    return null;
  }

  // Utilities
  const truncate = (s: string, max: number) => (s.length > max ? s.slice(0, max - 1).trim() + '…' : s);

  type CalendarEventPayload = {
    summary: string;
    description: string;
    startTime: string;
    endTime: string;
    timeZone?: string;
  };

  // Format time for display
  const formatTime = (time: string) => {
    if (!time) {return '';}
    // If time already looks like 12:34 PM keep it
    if (/(AM|PM)$/i.test(time)) {return time.toUpperCase();}
    // Otherwise try to parse ISO
    const date = new Date(time);
    if (!isNaN(date.getTime())) {
      return date.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true });
    }
    return time;
  };

  const parseDate = (dateStr?: string): Date | undefined => {
    if (!dateStr) {return undefined;}
    const cleaned = String(dateStr)
      .replace(/^on\s+/i, '')
      .replace(/[,\.]\s*$/g, '')
      .trim();
    // Try native first
    const native = new Date(cleaned);
    if (!isNaN(native.getTime())) {return native;}
    // Manual parse: Month Day, Year (with optional comma or ordinal)
    const m = cleaned.match(/^(January|February|March|April|May|June|July|August|September|October|November|December|Jan|Feb|Mar|Apr|Jun|Jul|Aug|Sep|Sept|Oct|Nov|Dec)\s+(\d{1,2})(?:st|nd|rd|th)?,?\s+(\d{4})$/i);
    if (m) {
      const monthName = m[1].toLowerCase();
      const day = parseInt(m[2], 10);
      const year = parseInt(m[3], 10);
      const monthMap: Record<string, number> = {
        january: 0, jan: 0,
        february: 1, feb: 1,
        march: 2, mar: 2,
        april: 3, apr: 3,
        may: 4,
        june: 5, jun: 5,
        july: 6, jul: 6,
        august: 7, aug: 7,
        september: 8, sep: 8, sept: 8,
        october: 9, oct: 9,
        november: 10, nov: 10,
        december: 11, dec: 11,
      };
      const month = monthMap[monthName];
      if (month !== undefined) {return new Date(year, month, day);}
    }
    return undefined;
  };

  const combineDateTime = (dateLabel: string | undefined, timeStr: unknown): Date | undefined => {
    // If time is ISO, just return parsed date
    const iso = new Date(timeStr as any);
    if (!isNaN(iso.getTime())) {return iso;}
    const d = parseDate(dateLabel);
    if (!d) {return undefined;}
    // Guard against non-string inputs (e.g., all-day events objects)
    if (typeof timeStr !== 'string') {return undefined;}
    const [_, hrStr, minStr, ampm] = timeStr.match(/(\d{1,2}):(\d{2})\s*(AM|PM)/i) || [];
    if (!hrStr) {return undefined;}
    let hour = parseInt(hrStr, 10);
    const minute = parseInt(minStr, 10);
    const isPM = /PM/i.test(ampm);
    if (hour === 12) {hour = isPM ? 12 : 0;} else if (isPM) {hour += 12;}
    const combined = new Date(d.getFullYear(), d.getMonth(), d.getDate(), hour, minute, 0);
    return combined;
  };

  const buildEventPayload = (event: ScheduleEvent): CalendarEventPayload | null => {
    const start = combineDateTime(event.date, event.startTime);
    const end = combineDateTime(event.date, event.endTime);
    if (!start || !end) {return null;}
    const timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone;
    return {
      summary: truncate(event.activity, 60),
      description: event.activity,
      startTime: start.toISOString(),
      endTime: end.toISOString(),
      timeZone,
    };
  };

  const handleSchedule = async (event: ScheduleEvent) => {
    try {
      const payload = buildEventPayload(event);
      if (!payload) {
        Alert.alert('Missing date', 'Please ask for options that include a date to schedule.');
        return;
      }
      await calendarAPI.createEvent(payload);
      Alert.alert('Scheduled', 'Your event has been added to the calendar.');
    } catch (e) {
      Alert.alert('Error', 'Failed to schedule the event.');
    }
  };

  const handleBulkSchedule = async () => {
    const validPayloads: CalendarEventPayload[] = [];
    const skippedEvents: ScheduleEvent[] = [];

    events.forEach((event) => {
      const payload = buildEventPayload(event);
      if (payload) {
        validPayloads.push(payload);
      } else {
        skippedEvents.push(event);
      }
    });

    if (validPayloads.length === 0) {
      Alert.alert('Missing date', 'Please ask for options that include a date to schedule.');
      return;
    }

    try {
      setIsBulkScheduling(true);
      for (const payload of validPayloads) {
        // Schedule sequentially to keep API usage predictable
        await calendarAPI.createEvent(payload);
      }
      const skippedMessage = skippedEvents.length > 0
        ? `Scheduled ${validPayloads.length} events. Skipped ${skippedEvents.length} without a date/time.`
        : `Scheduled ${validPayloads.length} events.`;
      Alert.alert('Scheduled', skippedMessage);
    } catch (e) {
      Alert.alert('Error', 'Failed to schedule all events. Please try again.');
    } finally {
      setIsBulkScheduling(false);
    }
  };

  const getCalendarEventStart = (event: CalendarEvent): Date | undefined => {
    const startRaw = event.start_time || event.start?.dateTime;
    if (!startRaw) {return undefined;}
    const d = new Date(startRaw);
    return isNaN(d.getTime()) ? undefined : d;
  };

  const getCalendarEventEnd = (event: CalendarEvent): Date | undefined => {
    const endRaw = event.end_time || event.end?.dateTime;
    if (!endRaw) {return undefined;}
    const d = new Date(endRaw);
    return isNaN(d.getTime()) ? undefined : d;
  };

  const isSameDay = (d1?: Date, d2?: Date) => {
    if (!d1 || !d2) {return false;}
    return d1.getFullYear() === d2.getFullYear()
      && d1.getMonth() === d2.getMonth()
      && d1.getDate() === d2.getDate();
  };

  const findAdjacentCalendarEvents = (event: ScheduleEvent) => {
    const start = combineDateTime(event.date, event.startTime);
    const end = combineDateTime(event.date, event.endTime);
    if (!start || !end || !calendarEventsLoaded) {
      return { before: undefined, after: undefined };
    }

    const sameDayEvents = calendarEvents
      .map(evt => ({ evt, start: getCalendarEventStart(evt), end: getCalendarEventEnd(evt) }))
      .filter(({ start: s }) => isSameDay(s, start) && s)
      .sort((a, b) => (a.start!.getTime() - b.start!.getTime()));

    let before: CalendarEvent | undefined;
    let after: CalendarEvent | undefined;

    for (const { evt, start: evtStart, end: evtEnd } of sameDayEvents) {
      if (!evtStart) {continue;}
      if (evtEnd && evtEnd.getTime() <= start.getTime()) {
        before = evt;
      } else if (evtStart.getTime() >= end.getTime() && !after) {
        after = evt;
        break;
      }
    }

    return { before, after };
  };

  const getCalendarTimeRange = (event?: CalendarEvent): string | null => {
    if (!event) {return null;}
    const startRaw = event.start_time || event.start?.dateTime || '';
    const endRaw = event.end_time || event.end?.dateTime || '';
    const startLabel = formatTime(startRaw);
    const endLabel = formatTime(endRaw);
    if (!startLabel && !endLabel) {return null;}
    return `${startLabel}${endLabel ? ` - ${endLabel}` : ''}`;
  };

  const formatCalendarTitle = (event?: CalendarEvent): string => {
    if (!event) {return '';}
    return event.title || event.summary || 'Calendar event';
  };

  // Group events by day label for clearer multi-day schedules
  type DayGroup = { key: string; label: string; events: ScheduleEvent[] };

  const extractDateFromEvent = (event: ScheduleEvent): Date | undefined => {
    const byLabel = parseDate(event.date);
    if (byLabel) {return byLabel;}
    const startAsISO = new Date(event.startTime);
    if (!isNaN(startAsISO.getTime())) {return startAsISO;}
    const endAsISO = new Date(event.endTime);
    if (!isNaN(endAsISO.getTime())) {return endAsISO;}
    return undefined;
  };

  const formatDayLabel = (d: Date | undefined, fallback?: string): string => {
    if (!d) {return fallback || 'Unspecified Date';}
    const opts: Intl.DateTimeFormatOptions = { weekday: 'short', month: 'short', day: 'numeric' };
    const label = d.toLocaleDateString('en-US', opts);
    const includeYear = d.getFullYear() !== new Date().getFullYear();
    return includeYear ? `${label}, ${d.getFullYear()}` : label;
  };

  const toDateKey = (d: Date | undefined, fallback?: string): string => {
    if (!d) {return `unknown:${fallback || ''}`.toLowerCase();}
    const yyyy = d.getFullYear();
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    const dd = String(d.getDate()).padStart(2, '0');
    return `${yyyy}-${mm}-${dd}`;
  };

  // Build groups
  const groupsMap = new Map<string, DayGroup>();
  events.forEach((evt) => {
    const d = extractDateFromEvent(evt);
    const key = toDateKey(d, evt.date);
    const label = formatDayLabel(d, evt.date);
    if (!groupsMap.has(key)) {
      groupsMap.set(key, { key, label, events: [] });
    }
    const group = groupsMap.get(key)!;
    group.events.push(evt);
  });

  // Sort groups by date key when possible, unknowns last
  const groups: DayGroup[] = Array.from(groupsMap.values()).sort((a, b) => {
    const isUnknownA = a.key.startsWith('unknown');
    const isUnknownB = b.key.startsWith('unknown');
    if (isUnknownA && isUnknownB) {return 0;}
    if (isUnknownA) {return 1;}
    if (isUnknownB) {return -1;}
    return a.key.localeCompare(b.key);
  });

  // Sort events within each group by start time
  groups.forEach((g) => {
    g.events.sort((e1, e2) => {
      const d1 = combineDateTime(e1.date, e1.startTime) || new Date(e1.startTime);
      const d2 = combineDateTime(e2.date, e2.startTime) || new Date(e2.startTime);
      const t1 = isNaN(d1.getTime()) ? Number.MAX_SAFE_INTEGER : d1.getTime();
      const t2 = isNaN(d2.getTime()) ? Number.MAX_SAFE_INTEGER : d2.getTime();
      return t1 - t2;
    });
  });

  return (
    <View style={styles.container}>
      <Text style={styles.helperText} accessibilityRole="text">
        Tap the event to add to your calendar
      </Text>
      <TouchableOpacity
        style={[
          styles.bulkScheduleButton,
          isBulkScheduling && styles.bulkScheduleButtonDisabled,
        ]}
        onPress={handleBulkSchedule}
        disabled={isBulkScheduling}
        accessibilityRole="button"
        accessibilityLabel="Add all events to your calendar"
        accessibilityHint="Adds every event with a valid date and time"
      >
        <Icon
          name="plus"
          size={16}
          color={colors.secondary}
          style={styles.bulkScheduleIcon}
        />
        <Text style={styles.bulkScheduleText}>
          {isBulkScheduling ? 'Scheduling...' : 'Add all to calendar'}
        </Text>
      </TouchableOpacity>
      {/* Simplified: no header title */}
      <View style={styles.eventsContainer}>
        {groups.map((group, gIdx) => (
          <View key={group.key}>
            <View style={styles.daySection}>
              <View style={styles.dayHeader}>
                <Text style={styles.dayHeaderText}>{group.label}</Text>
              </View>
              {group.events.map((event, index) => (
                <React.Fragment key={`${group.key}:${index}`}>
                  {(() => {
                    const { before } = findAdjacentCalendarEvents(event);
                    const beforeTime = getCalendarTimeRange(before);
                    return (
                      <View style={styles.adjacentContainer}>
                        <View style={styles.adjacentRow}>
                          <Icon name="chevron-left" size={14} color={colors.text.secondary} />
                          <Text style={styles.adjacentLabel}>Before</Text>
                          <Text style={styles.adjacentText}>
                            {before ? `${formatCalendarTitle(before)}${beforeTime ? ` • ${beforeTime}` : ''}` : 'No other events'}
                          </Text>
                        </View>
                      </View>
                    );
                  })()}
                  <TouchableOpacity
                    style={styles.eventCard}
                    onPress={() => handleSchedule(event)}
                    accessibilityRole="button"
                    accessibilityLabel={`Schedule ${event.activity} from ${formatTime(event.startTime)} to ${formatTime(event.endTime)}`}
                    accessibilityHint="Double tap to add this event to your calendar"
                  >
                  <View style={styles.timeRow}>
                    <Icon name="calendar" size={16} color={colors.primary} />
                    <Text style={styles.timeText}>
                      {formatTime(event.startTime)} - {formatTime(event.endTime)}
                    </Text>
                  </View>
                    <Text
                      selectable
                      style={styles.activityText}
                      numberOfLines={2}
                    >
                      {truncate(event.activity, 80)}
                    </Text>
                  </TouchableOpacity>
                  {(() => {
                    const { after } = findAdjacentCalendarEvents(event);
                    const afterTime = getCalendarTimeRange(after);
                    return (
                      <View style={styles.adjacentContainer}>
                        <View style={styles.adjacentRow}>
                          <Icon name="chevron-right" size={14} color={colors.text.secondary} />
                          <Text style={styles.adjacentLabel}>After</Text>
                          <Text style={styles.adjacentText}>
                            {after ? `${formatCalendarTitle(after)}${afterTime ? ` • ${afterTime}` : ''}` : 'No other events'}
                          </Text>
                        </View>
                      </View>
                    );
                  })()}
                  {index < group.events.length - 1 && (
                    <View style={styles.separator} />
                  )}
                </React.Fragment>
              ))}
            </View>
            {gIdx < groups.length - 1 ? <View style={styles.dayDivider} /> : null}
          </View>
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    marginTop: spacing.sm,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    maxWidth: '100%',
  },
  helperText: {
    fontSize: typography.fontSize.sm,
    color: colors.text.secondary,
    marginBottom: spacing.xs,
  },
  scheduleTitle: {
    fontSize: typography.fontSize.lg,
    fontWeight: typography.fontWeight.bold,
    color: colors.text.primary,
    marginBottom: spacing.md,
  },
  eventsContainer: {
    backgroundColor: colors.background.surface,
    borderRadius: borderRadius.md,
    borderWidth: 1,
    borderColor: colors.border.light,
    overflow: 'hidden',
  },
  daySection: {
    width: '100%',
  },
  dayHeader: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    backgroundColor: colors.background.primary,
    borderBottomWidth: 1,
    borderBottomColor: colors.border.light,
  },
  dayHeaderText: {
    fontSize: typography.fontSize.sm,
    fontWeight: typography.fontWeight.bold,
    color: colors.text.primary,
    textTransform: 'uppercase',
    letterSpacing: 0.4,
  },
  eventCard: {
    padding: spacing.md,
    flexDirection: 'column',
    alignItems: 'flex-start',
    minHeight: 60,
    width: '100%',
  },
  timeRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  timeText: {
    fontSize: typography.fontSize.sm,
    fontWeight: typography.fontWeight.bold,
    color: colors.primary,
    fontFamily: 'monospace',
    marginLeft: spacing.xs,
    marginBottom: spacing.xs,
  },
  activityText: {
    fontSize: typography.fontSize.base,
    fontWeight: typography.fontWeight.medium,
    color: colors.text.primary,
  },
  separator: {
    height: 1,
    backgroundColor: colors.border.light,
    marginHorizontal: -spacing.md,
  },
  dayDivider: {
    height: 8,
    backgroundColor: colors.background.primary,
    borderTopWidth: 1,
    borderTopColor: colors.border.light,
    borderBottomWidth: 1,
    borderBottomColor: colors.border.light,
  },
  bulkScheduleButton: {
    marginTop: spacing.sm,
    marginBottom: spacing.sm,
    backgroundColor: colors.primary,
    borderRadius: borderRadius.md,
    minHeight: 44,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
  },
  bulkScheduleButtonDisabled: {
    opacity: 0.7,
  },
  bulkScheduleText: {
    color: colors.secondary,
    fontSize: typography.fontSize.sm,
    fontWeight: typography.fontWeight.bold,
  },
  bulkScheduleIcon: {
    marginRight: spacing.xs,
  },
  adjacentContainer: {
    marginTop: spacing.xs,
    marginHorizontal: spacing.sm,
    padding: spacing.sm,
    backgroundColor: colors.background.secondary,
    borderRadius: borderRadius.sm,
    borderWidth: 1,
    borderColor: colors.border.light,
  },
  adjacentRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: spacing.xs,
  },
  adjacentLabel: {
    fontSize: typography.fontSize.xs,
    fontWeight: typography.fontWeight.bold,
    color: colors.text.secondary,
    marginHorizontal: spacing.xs,
  },
  adjacentText: {
    fontSize: typography.fontSize.xs,
    color: colors.text.secondary,
    flex: 1,
    flexWrap: 'wrap',
  },
}); 