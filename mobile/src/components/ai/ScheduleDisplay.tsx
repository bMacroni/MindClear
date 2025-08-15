import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Alert } from 'react-native';
import { colors } from '../../themes/colors';
import { typography } from '../../themes/typography';
import { spacing, borderRadius } from '../../themes/spacing';

interface ScheduleEvent {
  activity: string;
  startTime: string; // may be ISO or time string
  endTime: string;   // may be ISO or time string
  date?: string;     // human date like August 15, 2025
}

interface ScheduleDisplayProps {
  text: string;
}

import { calendarAPI } from '../../services/api';

export default function ScheduleDisplay({ text }: ScheduleDisplayProps) {
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
            activity: event.title || event.summary || 'Untitled',
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
            activity: event.title || event.summary || 'Untitled',
            startTime: event.startTime || event.start?.dateTime || event.start || event.start_time,
            endTime: event.endTime || event.end?.dateTime || event.end || event.end_time,
            date: event.date || event.dateLabel,
          }));
        }
      }
    } catch (error) {
      console.error('Failed to parse JSON schedule data:', error);
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
            activity: cleanActivity,
            startTime: match[2].trim(),
            endTime: match[3].trim(),
            date: match[4]?.trim() || lastDate,
          });
          matched = true;
          break; // Found a match, move to next line
        }
      }
      if (matched) continue;

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
  const scheduleDate = 'Tap to schedule the event';

  // If no events found, return null to fall back to regular text display
  if (events.length === 0) {
    return null;
  }

  // Utilities
  const truncate = (s: string, max: number) => (s.length > max ? s.slice(0, max - 1).trim() + '…' : s);

  // Format time for display
  const formatTime = (time: string) => {
    if (!time) return '';
    // If time already looks like 12:34 PM keep it
    if (/(AM|PM)$/i.test(time)) return time.toUpperCase();
    // Otherwise try to parse ISO
    const date = new Date(time);
    if (!isNaN(date.getTime())) {
      return date.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true });
    }
    return time;
  };

  const parseDate = (dateStr?: string): Date | undefined => {
    if (!dateStr) return undefined;
    const cleaned = String(dateStr)
      .replace(/^on\s+/i, '')
      .replace(/[,\.]\s*$/g, '')
      .trim();
    // Try native first
    const native = new Date(cleaned);
    if (!isNaN(native.getTime())) return native;
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
      if (month !== undefined) return new Date(year, month, day);
    }
    return undefined;
  };

  const combineDateTime = (dateLabel: string | undefined, timeStr: string): Date | undefined => {
    // If time is ISO, just return parsed date
    const iso = new Date(timeStr);
    if (!isNaN(iso.getTime())) return iso;
    const d = parseDate(dateLabel);
    if (!d) return undefined;
    const [_, hrStr, minStr, ampm] = timeStr.match(/(\d{1,2}):(\d{2})\s*(AM|PM)/i) || [];
    if (!hrStr) return undefined;
    let hour = parseInt(hrStr, 10);
    const minute = parseInt(minStr, 10);
    const isPM = /PM/i.test(ampm);
    if (hour === 12) hour = isPM ? 12 : 0; else if (isPM) hour += 12;
    const combined = new Date(d.getFullYear(), d.getMonth(), d.getDate(), hour, minute, 0);
    return combined;
  };

  const handleSchedule = async (event: ScheduleEvent) => {
    try {
      const start = combineDateTime(event.date, event.startTime);
      const end = combineDateTime(event.date, event.endTime);
      if (!start || !end) {
        Alert.alert('Missing date', 'Please ask for options that include a date to schedule.');
        return;
      }
      const summary = truncate(event.activity, 60);
      await calendarAPI.createEvent({
        summary,
        description: event.activity,
        startTime: start.toISOString(),
        endTime: end.toISOString(),
      });
      Alert.alert('Scheduled', 'Your event has been added to the calendar.');
    } catch (e) {
      Alert.alert('Error', 'Failed to schedule the event.');
    }
  };

  return (
    <View style={styles.container}>
      <Text style={styles.scheduleTitle}>{scheduleDate}</Text>
      <View style={styles.eventsContainer}>
        {events.map((event, index) => (
          <TouchableOpacity key={index} style={styles.eventCard} onPress={() => handleSchedule(event)}>
            <Text style={styles.timeText}>
              {formatTime(event.startTime)} - {formatTime(event.endTime)}
              {(() => {
                const d = parseDate(event.date);
                return d ? `  •  ${d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })}` : (event.date ? `  •  ${event.date}` : '');
              })()}
            </Text>
            <Text selectable style={styles.activityText} numberOfLines={2}>{truncate(event.activity, 80)}</Text>
            {index < events.length - 1 && <View style={styles.separator} />}
          </TouchableOpacity>
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
  eventCard: {
    padding: spacing.md,
    flexDirection: 'column',
    alignItems: 'flex-start',
    minHeight: 60,
    width: '100%',
  },
  timeText: {
    fontSize: typography.fontSize.sm,
    fontWeight: typography.fontWeight.bold,
    color: colors.primary,
    fontFamily: 'monospace',
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
}); 