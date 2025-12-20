import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Alert,
  ActionSheetIOS,
  Platform,
} from 'react-native';
import { HugeiconsIcon as Icon } from '@hugeicons/react-native';
import { Clock01Icon } from '@hugeicons/core-free-icons';
import { colors } from '../../themes/colors';
import { typography } from '../../themes/typography';
import { spacing } from '../../themes/spacing';
import { Button } from '../common/Button';
import { CalendarEvent, Task } from '../../types/calendar';
import { hapticFeedback } from '../../utils/hapticFeedback';

interface EventCardProps {
  event: CalendarEvent | Task;
  type: 'event' | 'task';
  onEdit?: (event: CalendarEvent | Task) => void;
  onDelete?: (eventId: string) => void;
  onCompleteTask?: (taskId: string) => void;
  onReschedule?: (eventId: string, newDate: Date) => void;
  compact?: boolean;
}

export const EventCard: React.FC<EventCardProps> = ({
  event,
  type,
  onEdit,
  onDelete,
  onCompleteTask,
  onReschedule,
  compact = false,
}) => {
  const [isExpanded, setIsExpanded] = useState(false);
  const [_deleting, setDeleting] = useState(false);
  const [_completing, setCompleting] = useState(false);

  const isTask = type === 'task';
  const task = isTask ? (event as Task) : null;
  const calendarEvent = !isTask ? (event as CalendarEvent) : null;

  // Quick reschedule options
  const getRescheduleOptions = () => {
    const now = new Date();
    const today = new Date(now);
    const tomorrow = new Date(now);
    tomorrow.setDate(tomorrow.getDate() + 1);
    const nextWeek = new Date(now);
    nextWeek.setDate(nextWeek.getDate() + 7);

    return [
      { label: 'Today', date: today },
      { label: 'Tomorrow', date: tomorrow },
      { label: 'Next Week', date: nextWeek },
      { label: 'Custom Date...', date: null },
    ];
  };

  const getEventColor = () => {
    if (isTask) {
      switch (task?.priority) {
        case 'high':
          return colors.error;
        case 'medium':
          return colors.warning;
        case 'low':
          return colors.success;
        default:
          return colors.info;
      }
    }
    return colors.primary;
  };

  const getEventTime = () => {
    if (isTask && task?.due_date) {
      return new Date(task.due_date).toLocaleTimeString([], {
        hour: '2-digit',
        minute: '2-digit',
      });
    }
    // Handle both database format and Google Calendar API format
    if (calendarEvent?.start_time) {
      return new Date(calendarEvent.start_time).toLocaleTimeString([], {
        hour: '2-digit',
        minute: '2-digit',
      });
    }
    if (calendarEvent?.start?.dateTime) {
      return new Date(calendarEvent.start.dateTime).toLocaleTimeString([], {
        hour: '2-digit',
        minute: '2-digit',
      });
    }
    return '';
  };

  const getEventTitle = () => {
    return isTask ? task?.title : calendarEvent?.summary || calendarEvent?.title || 'Untitled Event';
  };

  const getEventDescription = () => {
    if (isTask) {
      return task?.description || '';
    }
    // Handle both database format and Google Calendar API format
    return calendarEvent?.description || '';
  };

  const getStatusIndicator = () => {
    if (isTask && task?.status === 'completed') {
      return (
        <View style={[styles.statusIndicator, { backgroundColor: colors.success }]} />
      );
    }
    return null;
  };

  // removed unused formatDateTime helper

  const getPriorityText = () => {
    if (isTask && task?.priority) {
      return task.priority.charAt(0).toUpperCase() + task.priority.slice(1);
    }
    return '';
  };

  const getStatusText = () => {
    if (isTask && task?.status) {
      return task.status.replace('_', ' ').replace(/\b\w/g, l => l.toUpperCase());
    }
    return '';
  };

  const handleCardPress = () => {
    hapticFeedback.light();
    setIsExpanded(!isExpanded);
  };

  const handleLongPress = () => {
    if (!onReschedule) { return; }

    hapticFeedback.medium();
    const options = getRescheduleOptions();

    if (Platform.OS === 'ios') {
      ActionSheetIOS.showActionSheetWithOptions(
        {
          options: [...options.map(opt => opt.label), 'Cancel'],
          cancelButtonIndex: options.length,
          title: 'Reschedule Event',
          message: 'Choose when to reschedule this event',
        },
        (buttonIndex) => {
          if (buttonIndex < options.length) {
            hapticFeedback.selection();
            const selectedOption = options[buttonIndex];
            if (selectedOption.date) {
              onReschedule(event.id, selectedOption.date);
            } else {
              // Handle custom date selection
              handleCustomDateReschedule();
            }
          }
        }
      );
    } else {
      // Android implementation
      Alert.alert(
        'Reschedule Event',
        'Choose when to reschedule this event',
        [
          ...options.map((option, _index) => ({
            text: option.label,
            onPress: () => {
              hapticFeedback.selection();
              if (option.date) {
                onReschedule(event.id, option.date);
              } else {
                handleCustomDateReschedule();
              }
            },
          })),
          { text: 'Cancel', style: 'cancel' },
        ]
      );
    }
  };

  const handleCustomDateReschedule = () => {
    // For now, just show an alert. In a real app, you'd open a date picker
    Alert.alert(
      'Custom Date',
      'Custom date selection will be implemented with a date picker',
      [{ text: 'OK' }]
    );
  };

  const handleDelete = () => {
    Alert.alert(
      'Delete Event',
      'Are you sure you want to delete this event?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            hapticFeedback.warning();
            setDeleting(true);
            try {
              await onDelete?.(event.id);
              hapticFeedback.success();
            } catch (error) {
              console.error('Error deleting event:', error);
              hapticFeedback.error();
              Alert.alert('Error', 'Failed to delete event');
            } finally {
              setDeleting(false);
            }
          },
        },
      ]
    );
  };

  const handleCompleteTask = async () => {
    if (!isTask) { return; }

    hapticFeedback.success();
    setCompleting(true);
    try {
      await onCompleteTask?.(event.id);
    } catch (error) {
      console.error('Error completing task:', error);
      hapticFeedback.error();
      Alert.alert('Error', 'Failed to complete task');
    } finally {
      setCompleting(false);
    }
  };



  if (compact) {
    return (
      <View style={[styles.compactCard, { borderLeftColor: getEventColor() }]}>
        <TouchableOpacity
          onPress={handleCardPress}
          onLongPress={handleLongPress}
          style={styles.compactContent}
        >
          <Text style={styles.compactTitle} numberOfLines={1}>
            {getEventTitle()}
          </Text>
          <Text style={styles.compactTime}>{getEventTime()}</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <View style={[styles.card, { borderLeftColor: getEventColor() }]}>
      <TouchableOpacity
        onPress={handleCardPress}
        onLongPress={handleLongPress}
        style={styles.content}
      >
        <View style={styles.header}>
          <View style={styles.titleContainer}>
            <Text style={styles.title}>{getEventTitle()}</Text>
            {getStatusIndicator()}
          </View>
          <View style={styles.headerRight}>
            <Text style={styles.time}>{getEventTime()}</Text>
            <Icon icon={Clock01Icon} size={16} color={colors.text.secondary} style={styles.rescheduleIcon} />
          </View>
        </View>

        {getEventDescription() && (
          <Text style={styles.description} numberOfLines={isExpanded ? undefined : 2}>
            {getEventDescription()}
          </Text>
        )}

        {isTask && (
          <View style={styles.taskInfo}>
            {task?.priority && (
              <View style={[styles.priorityBadge, { backgroundColor: getEventColor() }]}>
                <Text style={styles.priorityText}>{getPriorityText()}</Text>
              </View>
            )}
            {task?.status && (
              <Text style={styles.statusText}>{getStatusText()}</Text>
            )}
          </View>
        )}

        {isExpanded && (
          <View style={styles.expandedContent}>
            <View style={styles.actions}>
              {onReschedule && (
                <Button
                  title="Reschedule"
                  onPress={handleLongPress}
                  variant="outline"
                  style={styles.actionButton}
                />
              )}
              {onEdit && (
                <Button
                  title="Edit"
                  onPress={() => onEdit(event)}
                  variant="outline"
                  style={styles.actionButton}
                />
              )}
              {isTask && onCompleteTask && task?.status !== 'completed' && (
                <Button
                  title={_completing ? 'Completing...' : 'Complete'}
                  onPress={handleCompleteTask}
                  variant="outline"
                  style={styles.actionButton}
                  disabled={_completing}
                />
              )}
              {onDelete && (
                <Button
                  title={_deleting ? 'Deleting...' : 'Delete'}
                  onPress={handleDelete}
                  variant="outline"
                  style={styles.actionButton}
                  disabled={_deleting}
                />
              )}
            </View>
          </View>
        )}
      </TouchableOpacity>
    </View>
  );
};

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.surface,
    borderRadius: spacing.sm,
    padding: spacing.md,
    marginBottom: spacing.sm,
    borderLeftWidth: 4,
    shadowColor: colors.text.primary,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 2,
  },
  compactCard: {
    backgroundColor: colors.surface,
    borderRadius: spacing.xs,
    padding: spacing.xs,
    marginBottom: spacing.xs,
    borderLeftWidth: 3,
    shadowColor: colors.text.primary,
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 2,
    elevation: 1,
  },
  compactContent: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  compactTitle: {
    fontSize: typography.fontSize.sm,
    fontWeight: typography.fontWeight.medium as any,
    color: colors.text.primary,
    flex: 1,
  },
  compactTime: {
    fontSize: typography.fontSize.xs,
    color: colors.text.secondary,
    marginLeft: spacing.xs,
  },
  content: {
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: spacing.sm,
  },
  titleContainer: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
  },
  title: {
    fontSize: typography.fontSize.base,
    fontWeight: typography.fontWeight.bold as any,
    color: colors.text.primary,
    flex: 1,
  },
  time: {
    fontSize: typography.fontSize.sm,
    color: colors.text.secondary,
    fontWeight: typography.fontWeight.medium as any,
  },
  headerRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
  rescheduleIcon: {
    opacity: 0.6,
  },
  description: {
    fontSize: typography.fontSize.sm,
    color: colors.text.secondary,
    marginBottom: spacing.sm,
  },
  taskInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: spacing.sm,
  },
  priorityBadge: {
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
    borderRadius: spacing.xs,
    marginRight: spacing.sm,
  },
  priorityText: {
    fontSize: typography.fontSize.xs,
    color: colors.secondary,
    fontWeight: typography.fontWeight.medium as any,
  },
  statusText: {
    fontSize: typography.fontSize.xs,
    color: colors.text.secondary,
    textTransform: 'capitalize',
  },
  statusIndicator: {
    width: 8,
    height: 8,
    borderRadius: 4,
    marginLeft: spacing.xs,
  },
  expandedContent: {
    marginTop: spacing.sm,
    paddingTop: spacing.sm,
    borderTopWidth: 1,
    borderTopColor: colors.border.light,
  },
  actions: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  actionButton: {
    flex: 1,
  },
  deleteButton: {
    borderColor: colors.error,
  },
}); 