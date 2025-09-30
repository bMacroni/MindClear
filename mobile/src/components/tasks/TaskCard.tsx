import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Animated,
  Alert,
} from 'react-native';
import { PanGestureHandler, State } from 'react-native-gesture-handler';
import { colors } from '../../themes/colors';
import { spacing, borderRadius } from '../../themes/spacing';
import { typography } from '../../themes/typography';
import Icon from 'react-native-vector-icons/Octicons';
import HelpTarget from '../help/HelpTarget';
import { formatRelativeDueLabel } from '../../utils/dateUtils';

interface Task {
  id: string;
  title: string;
  description?: string;
  priority: 'low' | 'medium' | 'high';
  status: 'not_started' | 'in_progress' | 'completed';
  due_date?: string;
  category?: string;
  goal?: {
    id: string;
    title: string;
  };
  // Auto-scheduling fields
  auto_schedule_enabled?: boolean;
  weather_dependent?: boolean;
  location?: string;
  travel_time_minutes?: number;
}

interface TaskCardProps {
  task: Task;
  onPress: (task: Task) => void;
  onDelete: (taskId: string) => void;
  onToggleStatus: (taskId: string, newStatus: 'not_started' | 'in_progress' | 'completed') => void;
  onAddToCalendar: (taskId: string) => void;
  onToggleAutoSchedule?: (taskId: string, enabled: boolean) => void;
  onScheduleNow?: (taskId: string) => void;
  onQuickSchedule?: (
    taskId: string,
    preset: 'today' | 'tomorrow' | 'this_week' | 'next_week'
  ) => void;
  onOpenQuickSchedule?: (taskId: string, center: { x: number; y: number }) => void;
  onAIHelp?: (task: Task) => void;
}

export const TaskCard: React.FC<TaskCardProps> = React.memo(({
  task,
  onPress,
  onDelete,
  onToggleStatus,
  onAddToCalendar,
  onToggleAutoSchedule,
  onScheduleNow,
  onQuickSchedule,
  onOpenQuickSchedule,
  onAIHelp,
}) => {
  const translateX = React.useRef(new Animated.Value(0)).current;
  const [_isDeleting, _setIsDeleting] = React.useState(false);

  const [anchor, setAnchor] = React.useState<{ x: number; y: number } | undefined>(undefined);

  // helpers retained for future UI variants
   
  const _getStatusColor = (status: string) => {
    switch (status) {
      case 'completed':
        return colors.success;
      case 'in_progress':
        return colors.warning;
      default:
        return colors.info;
    }
  };

  const _getPriorityColor = (priority: string) => {
    switch (priority) {
      case 'high':
        return colors.error;
      case 'medium':
        return colors.warning;
      default:
        return colors.success;
    }
  };

  const _getStatusText = (status: string) => {
    switch (status) {
      case 'completed':
        return 'Completed';
      case 'in_progress':
        return 'In Progress';
      default:
        return 'Not Started';
    }
  };

  const _getPriorityText = (priority: string) => {
    if (!priority) {return 'Low';}
    return priority.charAt(0).toUpperCase() + priority.slice(1);
  };

  const formatDueDate = (dueDate?: string) => {
    if (!dueDate) {return null;}
    
    // Handle YYYY-MM-DD format to avoid timezone conversion issues
    let date: Date;
    if (/^\d{4}-\d{2}-\d{2}$/.test(dueDate)) {
      const [year, month, day] = dueDate.split('-');
      date = new Date(parseInt(year), parseInt(month) - 1, parseInt(day));
    } else {
      date = new Date(dueDate);
    }
    
    const today = new Date();
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);

    if (date.toDateString() === today.toDateString()) {
      return 'Today';
    } else if (date.toDateString() === tomorrow.toDateString()) {
      return 'Tomorrow';
    } else {
      return date.toLocaleDateString();
    }
  };

  const formatScheduledTime = (dueDate?: string) => {
    if (!dueDate) {return null;}
    const date = new Date(dueDate);
    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  };

  const handleGestureEvent = Animated.event(
    [{ nativeEvent: { translationX: translateX } }],
    { useNativeDriver: true }
  );

  const handleStateChange = (event: { nativeEvent: { state: number; translationX: number } }) => {
    if (event.nativeEvent.state === State.END) {
      const { translationX } = event.nativeEvent;
      
      if (translationX < -150) {
        // Swipe left - delete
        Alert.alert(
          'Delete Task',
          'Are you sure you want to delete this task?',
          [
            { text: 'Cancel', style: 'cancel' },
            { text: 'Delete', style: 'destructive', onPress: () => onDelete(task.id) },
          ]
        );
      } else if (translationX > 150) {
        // Swipe right - toggle status
        const newStatus = task.status === 'completed' ? 'not_started' : 'completed';
        onToggleStatus(task.id, newStatus);
      }
      
      // Reset position
      Animated.spring(translateX, {
        toValue: 0,
        useNativeDriver: true,
      }).start();
    }
  };

  const _getNextStatus = () => {
    switch (task.status) {
      case 'not_started':
        return 'in_progress';
      case 'in_progress':
        return 'completed';
      default:
        return 'not_started';
    }
  };
   

  const handleToggleAutoSchedule = () => {
    if (onToggleAutoSchedule) {
      onToggleAutoSchedule(task.id, !task.auto_schedule_enabled);
    }
  };

  const handleScheduleNow = () => {
    if (onScheduleNow) {
      onScheduleNow(task.id);
    }
  };

  const toggleComplete = () => {
    const newStatus = task.status === 'completed' ? 'not_started' : 'completed';
    onToggleStatus(task.id, newStatus);
  };

  const dueMeta = formatRelativeDueLabel(task.due_date, { status: task.status });

  const getDueToneStyle = () => {
    switch (dueMeta?.tone) {
      case 'overdue':
        return styles.dueOverdue;
      case 'today':
      case 'tomorrow':
        return styles.dueEmphasis;
      default:
        return styles.dueNeutral;
    }
  };

  return (
    <View style={styles.container} testID={`task-${task.id}`}>
      <PanGestureHandler
        onGestureEvent={handleGestureEvent}
        onHandlerStateChange={handleStateChange}
        activeOffsetX={[-20, 20]}
        failOffsetY={[-10, 10]}
        shouldCancelWhenOutside={true}
      >
        <Animated.View
          style={[
            styles.card,
            {
              transform: [{ translateX }],
            },
          ]}
        >
          <View style={styles.content}>
            <View style={styles.rowTop} />

            <TouchableOpacity onPress={() => onPress(task)} activeOpacity={0.7}>
              <Text
                style={[styles.title, task.status === 'completed' && styles.completedTitle]}
                testID={`task-${task.id}-title`}
                numberOfLines={3}
              >
                {task.title}
              </Text>
            </TouchableOpacity>

            <View style={styles.actionIcons}>
                <HelpTarget helpId={`task-complete:${task.id}`}>
                  <TouchableOpacity style={styles.iconBtn} onPress={toggleComplete} testID={`task-${task.id}-complete`}>
                    <Icon name="check" size={22} color={colors.text.primary} />
                  </TouchableOpacity>
                </HelpTarget>
                <HelpTarget helpId={`task-schedule:${task.id}`}>
                  <TouchableOpacity
                    style={styles.iconBtn}
                    onPressIn={(e) => {
                      const { pageX, pageY } = e.nativeEvent;
                      setAnchor({ x: pageX, y: pageY });
                    }}
                    onPress={() => {
                      if (onOpenQuickSchedule && anchor) {
                        onOpenQuickSchedule(task.id, anchor);
                      }
                    }}
                  >
                    <Icon name="calendar" size={22} color={colors.text.primary} />
                  </TouchableOpacity>
                </HelpTarget>
                {onAIHelp && (
                  <HelpTarget helpId={`task-ai:${task.id}`}>
                    <TouchableOpacity style={styles.iconBtn} onPress={() => onAIHelp(task)}>
                      <Icon name="light-bulb" size={22} color={colors.text.primary} />
                    </TouchableOpacity>
                  </HelpTarget>
                )}
                <HelpTarget helpId={`task-edit:${task.id}`}>
                  <TouchableOpacity style={styles.iconBtn} onPress={() => onPress(task)}>
                    <Icon name="pencil" size={22} color={colors.text.primary} />
                  </TouchableOpacity>
                </HelpTarget>
                <HelpTarget helpId={`task-delete:${task.id}`}>
                  <TouchableOpacity style={styles.iconBtn} onPress={() => onDelete(task.id)} testID={`task-${task.id}-delete`}>
                    <Icon name="trash" size={22} color={colors.text.primary} />
                  </TouchableOpacity>
                </HelpTarget>
              </View>

            {/* Meta chips row */}
            <View style={styles.metaRow}>
              {dueMeta && (
                <Text style={[styles.duePill, getDueToneStyle()]} numberOfLines={1}>
                  {dueMeta.label}
                </Text>
              )}
              {!!task.goal?.title && (
                <View style={styles.goalBadge}><Text style={styles.goalText}>{task.goal.title}</Text></View>
              )}
              <View style={[styles.priorityBadge, task.priority === 'high' ? styles.high : task.priority === 'medium' ? styles.medium : styles.low]}>
                <Text style={[styles.badgeText, styles.badgeTextDark]}>{task.priority}</Text>
              </View>
              {Number.isFinite((task as any).estimated_duration_minutes) && (
                <View style={styles.durationBadge}>
                  <Icon name="clock" size={14} color={colors.text.secondary} />
                  <Text style={styles.durationText}>{(task as any).estimated_duration_minutes}m</Text>
                </View>
              )}
            </View>

            {/* Auto-scheduling controls (hidden unless enabled or indicators present) */}
            {(task.auto_schedule_enabled || task.weather_dependent || !!task.location) && (
              <View style={styles.autoScheduleSection}>
                {task.auto_schedule_enabled && (
                  <>
                    <View style={styles.autoScheduleRow}>
                      <TouchableOpacity
                        style={[
                          styles.autoScheduleToggle,
                          task.status === 'completed' && styles.autoScheduleToggleDisabled
                        ]}
                        onPress={handleToggleAutoSchedule}
                        activeOpacity={0.7}
                        disabled={task.status === 'completed'}
                      >
                        <Icon 
                          name={task.auto_schedule_enabled ? "check-circle" : "circle"} 
                          size={20} 
                          color={task.status === 'completed' ? colors.text.disabled : (task.auto_schedule_enabled ? colors.primary : colors.text.disabled)} 
                        />
                        <Text style={[
                          styles.autoScheduleText,
                          task.auto_schedule_enabled && styles.autoScheduleTextEnabled,
                          task.status === 'completed' && styles.autoScheduleTextDisabled
                        ]}>
                          Auto-schedule
                        </Text>
                      </TouchableOpacity>

                      {task.auto_schedule_enabled && task.status !== 'completed' && (
                        <TouchableOpacity
                          style={styles.scheduleNowButton}
                          onPress={handleScheduleNow}
                          activeOpacity={0.7}
                        >
                          <Icon name="clock" size={16} color={colors.primary} />
                          <Text style={styles.scheduleNowText}>Schedule Now</Text>
                        </TouchableOpacity>
                      )}
                    </View>

                    {/* Scheduled time display */}
                    {task.due_date && (
                      <View style={styles.scheduledTimeRow}>
                        <Icon name="clock" size={14} color={colors.text.secondary} />
                        <Text style={styles.scheduledTimeText}>
                          Scheduled for {formatScheduledTime(task.due_date)}
                        </Text>
                      </View>
                    )}
                  </>
                )}

                {/* Weather dependency indicator */}
                {task.weather_dependent && (
                  <View style={styles.weatherIndicator}>
                    <Icon name="cloud" size={14} color={colors.text.secondary} />
                    <Text style={styles.weatherText}>Weather dependent</Text>
                  </View>
                )}

                {/* Location indicator */}
                {task.location && (
                  <View style={styles.locationIndicator}>
                    <Icon name="location" size={14} color={colors.text.secondary} />
                    <Text style={styles.locationText}>{task.location}</Text>
                  </View>
                )}
              </View>
            )}
          </View>
        </Animated.View>
      </PanGestureHandler>

    </View>
  );
});

const styles = StyleSheet.create({
  container: {
    marginBottom: spacing.sm,
  },
  card: {
    backgroundColor: colors.secondary,
    borderRadius: borderRadius.md,
    borderWidth: 1,
    borderColor: colors.border.light,
    // Green accent bar on the left
    borderLeftWidth: 4,
    borderLeftColor: colors.success,
    // No shadow for a flatter look
    shadowColor: 'transparent',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0,
    shadowRadius: 0,
    elevation: 0,
  },
  content: {
    padding: spacing.md,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: spacing.sm,
  },
  rowTop: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  leftControls: {},
  completeToggle: {},
  completeToggleActive: {},
  headerRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  actionIcons: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: spacing.sm,
  },
  iconBtn: {
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    borderRadius: borderRadius.sm,
    backgroundColor: 'transparent',
    borderWidth: 0,
  },
  title: {
    fontSize: typography.fontSize.lg,
    fontWeight: typography.fontWeight.semibold as any,
    color: colors.text.primary,
    flex: 1,
    marginRight: spacing.sm,
  },
  completedTitle: {
    textDecorationLine: 'line-through',
    color: colors.text.disabled,
  },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    marginTop: spacing.xs,
  },
  badges: {
    flexDirection: 'row',
    gap: spacing.xs,
  },
  statusBadge: {
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
    borderRadius: borderRadius.full,
  },
  priorityBadge: {
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
    borderRadius: borderRadius.full,
  },
  durationBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
    borderRadius: borderRadius.full,
    borderWidth: 1,
    borderColor: colors.border.light,
    backgroundColor: colors.surface,
  },
  durationText: {
    fontSize: typography.fontSize.xs,
    color: colors.text.secondary,
  },
  badgeText: {
    color: colors.secondary,
    fontSize: typography.fontSize.xs,
    fontWeight: typography.fontWeight.medium as any,
  },
  badgeTextDark: { color: colors.text.primary },
  low: { backgroundColor: '#E8F5E9', borderWidth: 1, borderColor: '#C8E6C9' },
  medium: { backgroundColor: '#FFFDE7', borderWidth: 1, borderColor: '#FFF9C4' },
  high: { backgroundColor: '#FFEBEE', borderWidth: 1, borderColor: '#FFCDD2' },
  description: {
    fontSize: typography.fontSize.sm,
    color: colors.text.secondary,
    marginBottom: spacing.sm,
    lineHeight: typography.lineHeight.normal * typography.fontSize.sm,
  },
  footer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  duePill: {
    paddingHorizontal: spacing.sm,
    paddingVertical: 4,
    borderRadius: 999,
    fontSize: typography.fontSize.xs,
    overflow: 'hidden',
    borderWidth: 1,
  },
  dueOverdue: { color: '#B00020', borderColor: '#F4C7C3', backgroundColor: '#FDECEA' },
  dueEmphasis: { color: '#8A6D1A', borderColor: '#F3E2A9', backgroundColor: '#FFF8D9' },
  dueNeutral: { color: colors.text.secondary, borderColor: colors.border.light, backgroundColor: colors.background.surface },
  calendarButton: {
    paddingVertical: spacing.xs,
    paddingHorizontal: spacing.sm,
    borderRadius: borderRadius.full,
    backgroundColor: colors.primary,
    borderWidth: 0,
    shadowColor: colors.shadow,
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.2,
    shadowRadius: 2,
    elevation: 2,
  },
  goalBadge: {
    backgroundColor: colors.surface,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
    borderRadius: borderRadius.full,
    borderWidth: 1,
    borderColor: colors.border.light,
  },
  goalText: {
    fontSize: typography.fontSize.xs,
    color: colors.text.secondary,
    fontWeight: typography.fontWeight.medium as any,
  },
  // Auto-scheduling styles
  autoScheduleSection: {
    marginTop: spacing.sm,
    paddingTop: spacing.sm,
    borderTopWidth: 1,
    borderTopColor: colors.border.light,
  },
  autoScheduleRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: spacing.xs,
  },
  autoScheduleToggle: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
  autoScheduleToggleDisabled: {
    opacity: 0.5,
  },
  autoScheduleText: {
    fontSize: typography.fontSize.sm,
    color: colors.text.disabled,
    fontWeight: typography.fontWeight.medium as any,
  },
  autoScheduleTextEnabled: {
    color: colors.text.primary,
  },
  autoScheduleTextDisabled: {
    color: colors.text.disabled,
  },
  scheduleNowButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
    backgroundColor: colors.surface,
    borderRadius: borderRadius.sm,
    borderWidth: 1,
    borderColor: colors.border.light,
  },
  scheduleNowText: {
    fontSize: typography.fontSize.xs,
    color: colors.primary,
    fontWeight: typography.fontWeight.medium as any,
  },
  scheduledTimeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    marginBottom: spacing.xs,
  },
  scheduledTimeText: {
    fontSize: typography.fontSize.xs,
    color: colors.text.secondary,
  },
  weatherIndicator: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    marginBottom: spacing.xs,
  },
  weatherText: {
    fontSize: typography.fontSize.xs,
    color: colors.text.secondary,
  },
  locationIndicator: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
  locationText: {
    fontSize: typography.fontSize.xs,
    color: colors.text.secondary,
  },
});
