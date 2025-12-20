import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  RefreshControl,
  Alert,
} from 'react-native';
import { Calendar, DateData } from 'react-native-calendars';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors } from '../../themes/colors';
import { typography } from '../../themes/typography';
import { spacing } from '../../themes/spacing';
import { Button } from '../../components/common/Button';
import { EventCard } from '../../components/calendar/EventCard';
import { EventFormModal } from '../../components/calendar/EventFormModal';
import { CalendarImportModal } from '../../components/calendar/CalendarImportModal';
import { GoalDueCard } from '../../components/goals/GoalDueCard';
// import { VirtualizedEventList } from '../../components/calendar/VirtualizedEventList';
import { OfflineIndicator } from '../../components/common/OfflineIndicator';
import ScreenHeader from '../../components/common/ScreenHeader';
import { ErrorDisplay, ErrorBanner } from '../../components/common/ErrorDisplay';
import { SearchAndFilter } from '../../components/calendar/SearchAndFilter';
import { enhancedAPI } from '../../services/enhancedApi';
import { errorHandlingService, ErrorCategory, UserFriendlyError } from '../../services/errorHandling';
import {
  ViewType,
  CalendarState,
  DayViewEvent,
  WeekViewEvent,
  CalendarEvent as CalendarEventType,
  Task as TaskType,
} from '../../types/calendar';
// import { Goal } from '../../services/api';
import { formatDateToYYYYMMDD, getLocalDateKey } from '../../utils/dateUtils';
import { hapticFeedback } from '../../utils/hapticFeedback';
import { LoadingSkeleton } from '../../components/common/LoadingSkeleton';
import {
  useFadeAnimation,
  useScaleAnimation
} from '../../utils/animations';
import { useNavigation, useFocusEffect } from '@react-navigation/native';
import { HugeiconsIcon as Icon } from '@hugeicons/react-native';
import { Bug01Icon, ReloadIcon, Download01Icon, PlusSignIcon } from '@hugeicons/core-free-icons';
import withObservables from '@nozbe/watermelondb/react/withObservables';
import { useDatabase } from '../../contexts/DatabaseContext';
import CalendarEvent from '../../db/models/CalendarEvent';
import Task from '../../db/models/Task';
import Goal from '../../db/models/Goal';
import { authService } from '../../services/auth';
import { Q } from '@nozbe/watermelondb';
import { syncService } from '../../services/SyncService';

// const { width } = Dimensions.get('window');

// Adapter functions to convert database models to calendar types
const convertCalendarEventToType = (event: CalendarEvent): CalendarEventType => {
  return {
    id: event.id,
    title: event.title,
    description: event.description,
    start_time: event.startTime?.toISOString(),
    end_time: event.endTime?.toISOString(),
    is_all_day: event.isAllDay,
    location: event.location,
    task_id: event.taskId,
    goal_id: event.goalId,
    created_at: event.createdAt?.toISOString(),
    updated_at: event.updatedAt?.toISOString(),
    user_id: event.userId,
    google_calendar_id: event.googleCalendarId,
    event_type: event.taskId ? 'task' : 'event',
  };
};

const convertTaskToType = (task: Task): TaskType => {
  const priority = (task.priority as 'low' | 'medium' | 'high') || 'medium';
  const status = (task.status as 'not_started' | 'in_progress' | 'completed') || 'not_started';

  return {
    id: task.id,
    title: task.title,
    description: task.description,
    priority,
    status,
    due_date: task.dueDate?.toISOString(),
    category: task.category,
    goal_id: task.goalId,
    estimated_duration_minutes: task.estimatedDurationMinutes,
    created_at: task.createdAt?.toISOString(),
    updated_at: task.updatedAt?.toISOString(),
    goal: task.goal ? {
      id: task.goal.id,
      title: task.goal.title,
      description: task.goal.description,
    } : undefined,
  };
};
interface CalendarScreenProps {
  events: CalendarEvent[];
  tasks: Task[];
  goals: Goal[];
  database: any; // Pass database through for debug action
}

function CalendarScreen({ events, tasks, goals, database }: CalendarScreenProps) {
  const insets = useSafeAreaInsets();
  const navigation = useNavigation<any>();
  const dayViewScrollRef = useRef<ScrollView>(null);

  // Animation hooks
  const { } = useFadeAnimation(1); // animations disabled for now
  const { } = useScaleAnimation(1);

  // Stagger animation for event cards (disabled)
  // const eventAnimations = useRef<Animated.Value[]>([]).current;

  const [state, setState] = useState<Omit<CalendarState, 'events' | 'tasks' | 'goals'>>({
    selectedDate: new Date(),
    viewType: 'month',
    loading: false,
    error: null,
  });

  const [refreshing, setRefreshing] = useState(false);
  const [formModalVisible, setFormModalVisible] = useState(false);
  const [editingEvent, setEditingEvent] = useState<CalendarEvent | Task | null>(null);
  const [formLoading, setFormLoading] = useState(false);
  const [showImportPrompt, setShowImportPrompt] = useState(false);
  const [importing, setImporting] = useState(false);
  const [showImportModal, setShowImportModal] = useState(false);

  // Enhanced error handling state
  const [currentError, setCurrentError] = useState<UserFriendlyError | null>(null);
  const [_errorVisible, setErrorVisible] = useState(false);

  // Track if this is the first load to avoid double loading
  const [isFirstLoad, setIsFirstLoad] = useState(true);

  // Pagination state
  const [currentPage, setCurrentPage] = useState(1);
  const [_hasMoreEvents, setHasMoreEvents] = useState(true);
  const [_loadingMore, setLoadingMore] = useState(false);

  // Convert database models to calendar types (memoized to prevent infinite loops)
  const convertedEvents = useMemo(() => {
    return events.map(convertCalendarEventToType);
  }, [events]);

  const convertedTasks = useMemo(() => {
    return tasks.map(convertTaskToType);
  }, [tasks]);

  // Filtered state for search and filtering (using calendar types for component compatibility)
  // Initialize with converted data, but let SearchAndFilter manage updates to prevent loops
  const [filteredEvents, setFilteredEvents] = useState<CalendarEventType[]>(convertedEvents);
  const [filteredTasks, setFilteredTasks] = useState<TaskType[]>(convertedTasks);

  // Only update filtered state from source data if SearchAndFilter hasn't applied filters yet
  // Use a ref to track if we need to sync with source data
  const hasActiveFiltersRef = useRef(false);

  useEffect(() => {
    // If SearchAndFilter hasn't called handleFilterChange yet, sync with source data
    if (!hasActiveFiltersRef.current) {
      setFilteredEvents(convertedEvents);
      setFilteredTasks(convertedTasks);
    }
  }, [convertedEvents, convertedTasks]);

  // Handle filter changes from SearchAndFilter component
  const handleFilterChange = useCallback((nextFilteredEvents: CalendarEventType[], nextFilteredTasks: TaskType[]) => {
    hasActiveFiltersRef.current = true;
    // Only update if the arrays are actually different to prevent infinite loops
    setFilteredEvents(prev => {
      if (prev.length !== nextFilteredEvents.length ||
        prev.some((e, i) => e.id !== nextFilteredEvents[i]?.id)) {
        return nextFilteredEvents;
      }
      return prev;
    });
    setFilteredTasks(prev => {
      if (prev.length !== nextFilteredTasks.length ||
        prev.some((t, i) => t.id !== nextFilteredTasks[i]?.id)) {
        return nextFilteredTasks;
      }
      return prev;
    });
  }, []);

  // Load calendar data - now a no-op as data is reactive
  const loadCalendarData = useCallback(async () => {
    // This function is now intentionally left blank.
    // Data is supplied reactively by the withObservables HOC.
    return Promise.resolve();
  }, []);

  // Load more events (unused handler removed to satisfy linter)

  // Refresh data
  const onRefresh = useCallback(async () => {
    hapticFeedback.light();
    setRefreshing(true);
    // Data will refresh automatically, just give visual feedback
    setTimeout(() => setRefreshing(false), 1000);
  }, []);

  // Load data on mount - no longer needed
  useEffect(() => {
    setIsFirstLoad(false);
  }, []);

  // Refresh data when screen comes into focus - no longer needed
  useFocusEffect(
    React.useCallback(() => {
      // Data is now live, no need to refetch on focus.
    }, [])
  );

  // Check first-visit import conditions
  // This logic will need to be re-evaluated post-migration
  // For now, disable it to prevent API calls.
  useEffect(() => {
    const checkImportPrompt = async () => {
      // try {
      //   const status = await enhancedAPI.getCalendarStatus();
      //   const prefs = await enhancedAPI.getAppPreferences();
      //   const completed = !!(prefs && (prefs as any).calendar_first_import_completed);
      //   if (status && status.connected === true && !completed) {
      //     setShowImportPrompt(true);
      //   }
      // } catch (_e) {
      //   // non-blocking
      // }
    };
    // checkImportPrompt();
  }, []);

  const handleImportNow = useCallback(async () => {
    try {
      setImporting(true);
      // await enhancedAPI.importCalendarFirstRun();
      // await loadCalendarData(1, false);
      setShowImportPrompt(false);
    } catch (_e) {
      // leave prompt for retry
    } finally {
      setImporting(false);
    }
  }, []);

  const handleNotNow = useCallback(async () => {
    try {
      setShowImportPrompt(false);
      // await enhancedAPI.updateAppPreferences({ calendar_import_prompt_dismissed_at: new Date().toISOString() });
    } catch (_e) {
      // ignore
    }
  }, []);

  const handleImportModalComplete = useCallback(() => {
    // Refresh calendar data after successful import
    // loadCalendarData(1, false);
    setShowImportPrompt(false);
  }, []);

  // Handle date selection
  const handleDateSelect = useCallback((day: DateData) => {
    hapticFeedback.selection();
    // The day object contains the date string in YYYY-MM-DD format
    if (day.dateString) {
      // Parse the date string properly to avoid timezone issues
      const [year, month, dayOfMonth] = day.dateString.split('-').map(Number);
      const selectedDate = new Date(year, month - 1, dayOfMonth); // month is 0-indexed
      setState(prev => ({
        ...prev,
        selectedDate: selectedDate,
        viewType: 'day', // Automatically switch to Day view when a date is selected
      }));
    }
  }, []);

  // Handle view type change
  const handleViewTypeChange = useCallback((viewType: ViewType) => {
    hapticFeedback.light();
    setState(prev => ({ ...prev, viewType }));
  }, []);

  // Handle event edit - convert calendar types to database models
  const handleEventEdit = useCallback(async (event: CalendarEventType | TaskType) => {
    hapticFeedback.medium();
    try {
      // Check if it's a calendar event or task by looking for event-specific fields
      const isCalendarEvent = 'start_time' in event || 'start' in event;

      if (isCalendarEvent) {
        // Look up the database model
        const dbEvent = (await database.get('calendar_events').find(event.id)) as CalendarEvent;
        setEditingEvent(dbEvent);
      } else {
        // Look up the database model for task
        const dbTask = (await database.get('tasks').find(event.id)) as Task;
        setEditingEvent(dbTask);
      }
      setFormModalVisible(true);
    } catch (error) {
      // Fallback: if we can't find the DB model, still allow editing with calendar type
      // EventFormModal will need to handle this case
      setEditingEvent(event as any);
      setFormModalVisible(true);
    }
  }, [database]);

  // Handle event delete with optimistic updates
  const handleEventDelete = useCallback(async (eventId: string) => {
    try {
      hapticFeedback.medium();
      const eventToDelete = (await database.get('calendar_events').find(eventId)) as CalendarEvent;

      await database.write(async () => {
        await eventToDelete.update((e: CalendarEvent) => {
          e.status = 'pending_delete';
        });
      });
      hapticFeedback.success();
    } catch (error) {
      hapticFeedback.error();
      Alert.alert('Error', 'Failed to delete event locally.');
    }
  }, [database]);

  // Handle task completion with enhanced error handling
  const handleTaskComplete = useCallback(async (taskId: string) => {
    // This will be handled by optimistic updates in Milestone 3
  }, []);

  // Handle event rescheduling with enhanced error handling
  const handleReschedule = useCallback(async (eventId: string, newDate: Date) => {
    // This will be handled by optimistic updates in Milestone 3
  }, []);

  // Create new event
  const handleCreateEvent = useCallback(() => {
    hapticFeedback.medium();
    setEditingEvent(null);
    setFormModalVisible(true);
  }, []);

  // Handle form submission
  const handleFormSubmit = useCallback(async (formData: any) => {
    setFormLoading(true);
    try {
      if (editingEvent) {
        // Determine if the item being edited is a calendar event (DB or Google) or a raw task
        const isCalendarEventLike = (obj: any) => {
          try {
            return !!(
              obj?.startTime ||
              obj?.endTime ||
              obj?.start?.dateTime ||
              obj?.end?.dateTime
            );
          } catch { return false; }
        };

        if (isCalendarEventLike(editingEvent)) {
          // Update existing calendar event and preserve linkage/context (task/goal classification)
          const existing: any = editingEvent as any;
          const preservedEventType = existing.event_type || existing.eventType;
          const preservedTaskId = existing.task_id || existing.taskId;
          const preservedGoalId = existing.goal_id || existing.goalId;

          // await enhancedAPI.updateEvent(editingEvent.id, { // No longer needed
          //   summary: formData.title,
          //   description: formData.description,
          //   startTime: formData.startTime.toISOString(),
          //   endTime: formData.endTime.toISOString(),
          //   location: formData.location,
          //   eventType: preservedEventType,
          //   taskId: preservedTaskId,
          //   goalId: preservedGoalId,
          // });
        } else {
          // Editing a task: create a linked calendar event for the task
          // await enhancedAPI.createEvent({ // No longer needed
          //   summary: formData.title,
          //   description: formData.description,
          //   startTime: formData.startTime.toISOString(),
          //   endTime: formData.endTime.toISOString(),
          //   location: formData.location,
          //   eventType: 'task',
          //   taskId: (editingEvent as any).id,
          // });
        }
      } else {
        // Create new event
        // await enhancedAPI.createEvent({ // No longer needed
        //   summary: formData.title,
        //   description: formData.description,
        //   startTime: formData.startTime.toISOString(),
        //   endTime: formData.endTime.toISOString(),
        //   location: formData.location,
        // });
      }

      // Refresh data
      // await loadCalendarData(); // No longer needed
      hapticFeedback.success();
    } catch (error) {
      // error saving event
      hapticFeedback.error();
      throw error;
    } finally {
      setFormLoading(false);
    }
  }, [editingEvent]);

  // Close form modal
  const handleCloseForm = useCallback(() => {
    setFormModalVisible(false);
    setEditingEvent(null);
    setFormLoading(false);
  }, []);

  // Handle Today button press
  const handleTodayPress = useCallback(() => {
    hapticFeedback.selection();
    setState(prev => ({
      ...prev,
      selectedDate: new Date(),
      viewType: 'day' // Automatically switch to Day view when Today is pressed
    }));
  }, []);

  // Handle retry button press with enhanced error handling
  const handleRetryPress = useCallback(() => {
    hapticFeedback.medium();
    setCurrentError(null);
    setErrorVisible(false);
    // loadCalendarData(1, false); // No longer needed
  }, []);

  // Compute lapsed goals (overdue target date and not completed)
  const getLapsedGoals = useCallback(() => {
    const todayKey = formatDateToYYYYMMDD(new Date());
    return goals.filter((goal: any) => {
      if (!goal?.targetCompletionDate) { return false; }
      try {
        const goalKey = formatDateToYYYYMMDD(new Date(goal.targetCompletionDate));
        const isOverdue = goalKey < todayKey;
        const isCompleted = goal?.status === 'completed' || (Array.isArray(goal?.milestones) && goal.milestones.length > 0 && goal.milestones.every((m: any) => m.completed || ((m.steps || []).every((s: any) => s.completed))));
        return isOverdue && !isCompleted;
      } catch {
        return false;
      }
    });
  }, [goals]);

  // Get events for selected date (only calendar events; tasks are no longer rendered directly as events)
  const getEventsForSelectedDate = useCallback(() => {
    const selectedDateStr = formatDateToYYYYMMDD(state.selectedDate);
    const dayEvents: DayViewEvent[] = [];
    const goalsDueToday: any[] = [];

    // Add calendar events
    filteredEvents.forEach((event) => {
      try {
        const startTime = event.start_time ? new Date(event.start_time) : (event.start?.dateTime ? new Date(event.start.dateTime) : null);
        if (!startTime) return;

        const eventDateStr = getLocalDateKey(startTime);

        if (eventDateStr === selectedDateStr) {
          const endTime = event.end_time ? new Date(event.end_time) : (event.end?.dateTime ? new Date(event.end.dateTime) : startTime);
          const dayEvent: DayViewEvent = {
            id: event.id,
            title: event.title || 'Untitled Event',
            startTime,
            endTime,
            type: 'event' as const,
            data: event,
            color: colors.info,
          };
          dayEvents.push(dayEvent);
        }
      } catch (_error) {
        // invalid event date
      }
    });

    // Collect goals due today for a lightweight summary card in Day view
    goals.forEach(goal => {
      if (!goal.targetCompletionDate) { return; }
      try {
        const goalDate = new Date(goal.targetCompletionDate);
        if (getLocalDateKey(goalDate) === selectedDateStr) {
          goalsDueToday.push(goal);
        }
      } catch { }
    });

    // Attach as property for renderDayView to read (avoid prop threading for now)
    (getEventsForSelectedDate as any)._goalsDueToday = goalsDueToday;

    return dayEvents.sort((a, b) => a.startTime.getTime() - b.startTime.getTime());
  }, [filteredEvents, goals, state.selectedDate]);

  // Get goals due in the current month
  const getGoalsForCurrentMonth = useCallback(() => {
    const currentMonth = state.selectedDate.getMonth();
    const currentYear = state.selectedDate.getFullYear();

    return goals.filter(goal => {
      if (!goal.targetCompletionDate) { return false; }

      try {
        const goalDate = new Date(goal.targetCompletionDate);
        return goalDate.getMonth() === currentMonth && goalDate.getFullYear() === currentYear;
      } catch (_error) {
        // invalid goal date
        return false;
      }
    }).sort((a, b) => {
      // Sort by completion date, then by title
      const dateA = new Date(a.targetCompletionDate || '');
      const dateB = new Date(b.targetCompletionDate || '');
      if (dateA.getTime() !== dateB.getTime()) {
        return dateA.getTime() - dateB.getTime();
      }
      return a.title.localeCompare(b.title);
    });
  }, [goals, state.selectedDate]);

  // Get marked dates for calendar
  const getMarkedDates = useCallback(() => {
    const marked: Record<string, { marked: boolean; dots: Array<{ color: string }> }> = {};

    const ensureEntry = (date: string) => {
      if (!marked[date]) {
        marked[date] = { marked: true, dots: [] };
      }
      return marked[date];
    };

    // Events
    filteredEvents.forEach(event => {
      try {
        const startTime = event.start_time ? new Date(event.start_time) : (event.start?.dateTime ? new Date(event.start.dateTime) : null);
        if (!startTime) { return; }
        const date = getLocalDateKey(startTime);
        const entry = ensureEntry(date);

        const dotColor = event.task_id ? colors.success : colors.info;

        if (!entry.dots.some(d => d.color === dotColor)) {
          entry.dots.push({ color: dotColor });
        }
      } catch { }
    });

    // Goals
    goals.forEach(goal => {
      if (!goal.targetCompletionDate) { return; }
      try {
        const date = getLocalDateKey(new Date(goal.targetCompletionDate));
        const entry = ensureEntry(date);
        if (!entry.dots.some(d => d.color === colors.warning)) {
          entry.dots.push({ color: colors.warning });
        }
      } catch { }
    });

    return marked;
  }, [filteredEvents, goals]);

  // Render day view with time blocks
  const renderDayView = useCallback(() => {

    // Get events for the selected date
    const dayEvents = getEventsForSelectedDate();
    const goalsDueToday: any[] = (getEventsForSelectedDate as any)._goalsDueToday || [];
    // day view rendering

    // Group events by time blocks (6-hour segments)
    const timeBlocks: Array<{
      name: string;
      start: number;
      end: number;
      events: DayViewEvent[];
    }> = [
        {
          name: 'Early Morning',
          start: 0,
          end: 6,
          events: [],
        },
        {
          name: 'Morning',
          start: 6,
          end: 12,
          events: [],
        },
        {
          name: 'Afternoon',
          start: 12,
          end: 18,
          events: [],
        },
        {
          name: 'Evening',
          start: 18,
          end: 24,
          events: [],
        },
      ];

    // Distribute events into time blocks
    dayEvents.forEach(event => {
      const eventHour = event.startTime.getHours();
      let blockIndex = -1;

      if (eventHour >= 0 && eventHour < 6) {
        blockIndex = 0; // Early Morning
      } else if (eventHour >= 6 && eventHour < 12) {
        blockIndex = 1; // Morning
      } else if (eventHour >= 12 && eventHour < 18) {
        blockIndex = 2; // Afternoon
      } else if (eventHour >= 18 && eventHour < 24) {
        blockIndex = 3; // Evening
      }

      if (blockIndex >= 0 && blockIndex < timeBlocks.length) {
        timeBlocks[blockIndex].events.push(event);
      }
    });

    // Sort events within each block by start time
    timeBlocks.forEach(block => {
      block.events.sort((a, b) => a.startTime.getTime() - b.startTime.getTime());
    });

    return (
      <ScrollView
        ref={dayViewScrollRef}
        style={styles.dayViewContainer}
        contentContainerStyle={styles.dayViewContent}
        showsVerticalScrollIndicator={true}
        scrollIndicatorInsets={{ right: 1 }}
        bounces={true}
        scrollEventThrottle={16}
        directionalLockEnabled={true}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
        }
      >
        <Text style={styles.dayViewTitle}>
          {state.selectedDate.toLocaleDateString([], {
            weekday: 'long',
            year: 'numeric',
            month: 'long',
            day: 'numeric',
          })}
        </Text>

        {/* Goals due today (show at top before time blocks) */}
        {goalsDueToday.length > 0 && (
          <View style={{ marginBottom: spacing.md }}>
            <Text style={styles.timeBlockTitle}>Goals Due</Text>
            <View style={{ marginTop: spacing.xs }}>
              {goalsDueToday.map(goal => (
                <GoalDueCard key={goal.id} goal={goal} />
              ))}
            </View>
          </View>
        )}

        {dayEvents.length === 0 && goalsDueToday.length === 0 ? (
          <View style={styles.emptyState}>
            <Text style={styles.emptyStateText}>No events scheduled for this day</Text>
            <Button
              title="Create Event"
              onPress={handleCreateEvent}
              variant="outline"
              style={styles.createButton}
            />
          </View>
        ) : (
          timeBlocks.map(block => (
            <View key={block.name} style={styles.timeBlock}>
              <View style={styles.timeBlockHeader}>
                <Text style={styles.timeBlockTitle}>{block.name}</Text>
                <Text style={styles.timeBlockTime}>
                  {block.start === 0 ? '12:00 AM' : block.start === 12 ? '12:00 PM' : block.start > 12 ? `${block.start - 12}:00 PM` : `${block.start}:00 AM`} - {block.end === 24 ? '12:00 AM' : block.end === 12 ? '12:00 PM' : block.end > 12 ? `${block.end - 12}:00 PM` : `${block.end}:00 AM`}
                </Text>
              </View>

              {block.events.length === 0 ? (
                <View style={styles.emptyTimeBlock}>
                  <Text style={styles.emptyTimeBlockText}>No events</Text>
                </View>
              ) : (
                <View style={styles.eventsList}>
                  {block.events.map(event => (
                    <View key={event.id} style={styles.eventCardContainer}>
                      <EventCard
                        event={event.data}
                        type={event.type}
                        onEdit={handleEventEdit}
                        onDelete={handleEventDelete}
                        onCompleteTask={handleTaskComplete}
                        onReschedule={handleReschedule}
                        compact={false}
                      />
                    </View>
                  ))}
                </View>
              )}
            </View>
          ))
        )}


      </ScrollView>
    );
  }, [handleCreateEvent, handleEventDelete, handleEventEdit, handleReschedule, handleTaskComplete, onRefresh, refreshing, state.selectedDate, getEventsForSelectedDate]);

  // Render week view with list-based layout grouped by date
  const renderWeekView = useCallback(() => {
    const weekStart = new Date(state.selectedDate);
    weekStart.setDate(weekStart.getDate() - weekStart.getDay());
    // week view rendering

    // Create date groups for the week
    const dateGroups: Array<{
      date: Date;
      dayName: string;
      dateString: string;
      events: WeekViewEvent[];
    }> = [];

    // Initialize date groups for the week
    for (let i = 0; i < 7; i++) {
      const currentDate = new Date(weekStart);
      currentDate.setDate(currentDate.getDate() + i);
      const dateStr = getLocalDateKey(currentDate);

      dateGroups.push({
        date: currentDate,
        dayName: currentDate.toLocaleDateString([], { weekday: 'long' }),
        dateString: dateStr,
        events: [],
      });
    }

    // Distribute events into date groups (calendar events only)
    filteredEvents.forEach(event => {
      try {
        // Handle both database format and Google Calendar API format
        const startTime = event.start_time ? new Date(event.start_time) : (event.start?.dateTime ? new Date(event.start.dateTime) : null);
        if (!startTime) return;

        const eventDateStr = getLocalDateKey(startTime);
        const endTime = event.end_time ? new Date(event.end_time) : (event.end?.dateTime ? new Date(event.end.dateTime) : startTime);

        const group = dateGroups.find(g => g.dateString === eventDateStr);
        if (group) {
          group.events.push({
            id: event.id,
            title: event.title || 'Untitled Event',
            startTime,
            endTime,
            day: startTime.getDay(),
            type: 'event' as const,
            data: event,
            color: colors.primary,
          });
        }
      } catch (error) {
        // error processing event
      }
    });

    // Do not add raw tasks to date groups; tasks should appear as calendar events linked via task_id

    // Sort events within each date group by start time
    dateGroups.forEach(group => {
      group.events.sort((a, b) => a.startTime.getTime() - b.startTime.getTime());
    });

    // Add a compact goal-due entry into each group's end if any goal is due that day
    goals.forEach(goal => {
      if (!goal.targetCompletionDate) { return; }
      try {
        const goalDateStr = getLocalDateKey(new Date(goal.targetCompletionDate));
        const group = dateGroups.find(g => g.dateString === goalDateStr);
        if (group) {
          group.events.push({
            id: `goal-${goal.id}`,
            title: `Goal Due: ${goal.title}`,
            startTime: group.date,
            endTime: group.date,
            day: group.date.getDay(),
            type: 'event' as const,
            // Pass a minimal CalendarEvent shape so types are satisfied
            data: {
              id: `goal-${goal.id}`,
              title: `Goal Due: ${goal.title}`,
              description: goal.description,
              start_time: group.date.toISOString(),
              end_time: group.date.toISOString(),
              location: undefined,
            } as any,
            color: colors.warning,
          });
        }
      } catch { }
    });

    // Filter out empty date groups or show them with empty state
    const nonEmptyGroups = dateGroups.filter(group => group.events.length > 0);
    const hasAnyEvents = nonEmptyGroups.length > 0;

    return (
      <ScrollView
        style={styles.weekViewContainer}
        scrollEventThrottle={16}
        directionalLockEnabled={true}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
        }
      >
        <Text style={styles.weekViewTitle}>
          Week of {weekStart.toLocaleDateString([], { month: 'short', day: 'numeric' })} - {
            new Date(weekStart.getTime() + 6 * 24 * 60 * 60 * 1000).toLocaleDateString([], { month: 'short', day: 'numeric' })
          }
        </Text>

        {!hasAnyEvents ? (
          <View style={styles.emptyState}>
            <Text style={styles.emptyStateText}>No events scheduled this week</Text>
            <Button
              title="Create Event"
              onPress={handleCreateEvent}
              variant="outline"
              style={styles.createButton}
            />
          </View>
        ) : (
          dateGroups.map(group => (
            <View key={group.dateString} style={styles.dateGroup}>
              <View style={styles.dateGroupHeader}>
                <Text style={styles.dateGroupTitle}>{group.dayName}</Text>
                <Text style={styles.dateGroupDate}>
                  {group.date.toLocaleDateString([], {
                    month: 'short',
                    day: 'numeric'
                  })}
                </Text>
              </View>

              {group.events.length === 0 ? (
                <View style={styles.emptyDateGroup}>
                  <Text style={styles.emptyDateGroupText}>No events</Text>
                </View>
              ) : (
                <View style={styles.eventsList}>
                  {group.events.map(event => (
                    <View key={event.id} style={styles.eventCardContainer}>
                      <EventCard
                        event={event.data}
                        type={event.type}
                        onEdit={handleEventEdit}
                        onDelete={handleEventDelete}
                        onCompleteTask={handleTaskComplete}
                        onReschedule={handleReschedule}
                        compact={false}
                      />
                    </View>
                  ))}
                </View>
              )}
            </View>
          ))
        )}
      </ScrollView>
    );
  }, [filteredEvents, filteredTasks, goals, handleCreateEvent, handleEventDelete, handleEventEdit, handleReschedule, handleTaskComplete, onRefresh, refreshing, state.selectedDate]);

  // Render month view
  const renderMonthView = () => {
    const monthGoals = getGoalsForCurrentMonth();
    // Determine the next upcoming goal (by target date or created date), and derive current milestone and next step
    const nextGoal = monthGoals
      .filter(g => !!g)
      .sort((a, b) => {
        const aDate = a.targetCompletionDate ? new Date(a.targetCompletionDate).getTime() : Number.MAX_SAFE_INTEGER;
        const bDate = b.targetCompletionDate ? new Date(b.targetCompletionDate).getTime() : Number.MAX_SAFE_INTEGER;
        if (aDate !== bDate) { return aDate - bDate; }
        const aCreated = a.createdAt ? new Date(a.createdAt).getTime() : 0;
        const bCreated = b.createdAt ? new Date(b.createdAt).getTime() : 0;
        return bCreated - aCreated;
      })[0];

    let currentMilestoneTitle: string | undefined;
    let nextStepText: string | undefined;
    if (nextGoal && (nextGoal as any).milestones?.length) {
      const milestones = (nextGoal as any).milestones as Array<any>;
      const activeMilestone = milestones.find(m => (m.steps || []).some((s: any) => !s.completed)) || milestones[0];
      currentMilestoneTitle = activeMilestone?.title;
      const step = (activeMilestone?.steps || []).find((s: any) => !s.completed) || (activeMilestone?.steps || [])[0];
      nextStepText = step?.text || step?.title;
    }

    return (
      <ScrollView style={styles.monthViewContainer}>
        <Calendar
          current={formatDateToYYYYMMDD(state.selectedDate)}
          onDayPress={handleDateSelect}
          markedDates={getMarkedDates()}
          markingType="multi-dot"
          theme={{
            backgroundColor: colors.background.primary,
            calendarBackground: colors.background.primary,
            textSectionTitleColor: colors.text.primary,
            selectedDayBackgroundColor: colors.primary,
            selectedDayTextColor: colors.secondary,
            todayTextColor: colors.primary,
            dayTextColor: colors.text.primary,
            textDisabledColor: colors.text.disabled,
            dotColor: colors.primary,
            selectedDotColor: colors.secondary,
            arrowColor: colors.primary,
            monthTextColor: colors.text.primary,
            indicatorColor: colors.primary,
            textDayFontFamily: typography.fontFamily.regular,
            textMonthFontFamily: typography.fontFamily.bold,
            textDayHeaderFontFamily: typography.fontFamily.medium,
            textDayFontSize: typography.fontSize.sm,
            textMonthFontSize: typography.fontSize.lg,
            textDayHeaderFontSize: typography.fontSize.sm,
          }}
        />

        {/* Dot legend */}
        <View style={styles.legendContainer}>
          <View style={styles.legendItem}>
            <View style={[styles.legendDot, { backgroundColor: colors.info }]} />
            <Text style={styles.legendLabel}>Events</Text>
          </View>
          <View style={styles.legendItem}>
            <View style={[styles.legendDot, { backgroundColor: colors.success }]} />
            <Text style={styles.legendLabel}>Task Events</Text>
          </View>
          <View style={styles.legendItem}>
            <View style={[styles.legendDot, { backgroundColor: colors.warning }]} />
            <Text style={styles.legendLabel}>Goals</Text>
          </View>
        </View>

        {/* This Month's Focus (single upcoming goal) */}
        {nextGoal && (
          <View style={styles.monthGoalsSection}>
            <Text style={styles.monthGoalsTitle}>This Month's Goal</Text>
            <View style={styles.goalCard}>
              <Text style={styles.goalTitle}>{nextGoal.title}</Text>
              {nextGoal.description ? (
                <Text style={styles.goalDescription}>{nextGoal.description}</Text>
              ) : null}
              {currentMilestoneTitle ? (
                <View>
                  <Text style={styles.goalProgressText}>Current Milestone</Text>
                  <Text style={styles.goalTitle}>{currentMilestoneTitle}</Text>
                </View>
              ) : null}
              {nextStepText ? (
                <View style={{ marginTop: spacing.xs }}>
                  <Text style={styles.goalProgressText}>Next Step</Text>
                  <Text style={styles.goalDescription}>{nextStepText}</Text>
                </View>
              ) : null}
            </View>

            {/* Lapsed goals banner moved here */}
            {(() => {
              const lapsed = getLapsedGoals();
              const count = lapsed.length;
              if (count <= 0) { return null; }
              return (
                <View style={[styles.lapsedBanner, { marginTop: spacing.md }]}>
                  <View style={styles.lapsedLeft}>
                    <Text style={styles.lapsedTitle}>Lapsed goals</Text>
                    <Text style={styles.lapsedSubtitle}>{count} {count === 1 ? 'goal needs review' : 'goals need review'}</Text>
                  </View>
                  <TouchableOpacity
                    style={styles.lapsedButton}
                    onPress={() => {
                      try { navigation.navigate('Goals', { focus: 'needsReview' }); } catch { }
                    }}
                    activeOpacity={0.9}
                  >
                    <Text style={styles.lapsedButtonText}>Review</Text>
                  </TouchableOpacity>
                </View>
              );
            })()}
          </View>
        )}
      </ScrollView>
    );
  };

  // Render view content based on selected view type
  const renderViewContent = () => {
    // rendering view content

    switch (state.viewType) {
      case 'day':
        return renderDayView();
      case 'week':
        return renderWeekView();
      case 'month':
        return renderMonthView();
      default:
        return renderDayView();
    }
  };

  // Only show loading skeleton for initial load, not for pagination
  if (state.loading) {
    return (
      <View style={[styles.container, { paddingTop: insets.top }]}>
        <View style={styles.header}>
          <Text style={styles.title}>Calendar</Text>
        </View>
        <LoadingSkeleton type="event" count={5} />
      </View>
    );
  }

  const addDebugEvent = async () => {
    const user = authService.getCurrentUser();
    if (!user) {
      Alert.alert('Not Logged In', 'Please log in to create a debug event.');
      return;
    }

    await database.write(async () => {
      const newEvent = (await database.get('calendar_events').create((e: CalendarEvent) => {
        const now = new Date();
        e.userId = user.id;
        e.title = `Debug Event @ ${now.toLocaleTimeString()}`;
        e.startTime = now;
        e.endTime = new Date(now.getTime() + 60 * 60 * 1000);
        e.isAllDay = false;
        e.status = 'synced'; // Will be 'pending_create' in Milestone 3
      })) as CalendarEvent;
      return newEvent;
    });
    Alert.alert('Success', 'Debug event created locally.');
  };

  const handleSync = async () => {
    Alert.alert('Syncing...', 'Manual sync has been initiated.');
    await syncService.sync();
    Alert.alert('Sync Complete', 'Manual sync has finished.');
  };

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      {/* Error Banner for critical errors */}
      {currentError && currentError.severity === 'CRITICAL' && (
        <ErrorBanner
          error={currentError}
          onRetry={() => {
            setCurrentError(null);
            setErrorVisible(false);
            // loadCalendarData(); // No longer needed
          }}
          onDismiss={() => {
            setCurrentError(null);
            setErrorVisible(false);
          }}
          onAction={(action) => {
            if (action === 'signIn') {
              // Handle sign in action
              // navigate to sign in
            }
          }}
        />
      )}

      {/* Offline Indicator */}
      <OfflineIndicator />

      {/* Header */}
      <ScreenHeader
        title="Calendar"
        rightActions={(
          <>
            {__DEV__ && (
              <TouchableOpacity onPress={addDebugEvent} style={{ marginRight: 10 }}>
                <Icon icon={Bug01Icon} size={18} color={colors.text.secondary} />
              </TouchableOpacity>
            )}
            {__DEV__ && (
              <TouchableOpacity onPress={handleSync} style={{ marginRight: 10 }}>
                <Icon icon={ReloadIcon} size={18} color={colors.text.secondary} />
              </TouchableOpacity>
            )}
            <TouchableOpacity
              onPress={() => setShowImportModal(true)}
              style={styles.importButton}
            >
              <Icon icon={Download01Icon} size={18} color={colors.text.secondary} />
            </TouchableOpacity>
            <TouchableOpacity onPress={onRefresh} style={styles.refreshButton}>
              <Text style={styles.refreshButtonText}>↻</Text>
            </TouchableOpacity>
          </>
        )}
        withDivider
      />

      {/* First-run Import Prompt */}
      {showImportPrompt && (
        <View style={{
          marginHorizontal: spacing.md,
          marginTop: spacing.sm,
          padding: spacing.md,
          backgroundColor: colors.surface,
          borderRadius: 12,
          borderWidth: 1,
          borderColor: colors.border.light,
        }}>
          <Text style={{ color: colors.text.primary, marginBottom: spacing.sm, fontSize: typography.fontSize.base }}>
            Import your Google Calendar events into Mind Clear?
          </Text>
          <View style={{ flexDirection: 'row', gap: 12 }}>
            <TouchableOpacity onPress={handleImportNow} disabled={importing} style={{
              paddingVertical: 10,
              paddingHorizontal: 14,
              backgroundColor: colors.primary,
              borderRadius: 8,
              opacity: importing ? 0.7 : 1,
            }}>
              <Text style={{ color: 'white', fontWeight: '600' }}>{importing ? 'Importing…' : 'Import now'}</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={handleNotNow} style={{
              paddingVertical: 10,
              paddingHorizontal: 14,
              backgroundColor: colors.surface,
              borderRadius: 8,
              borderWidth: 1,
              borderColor: colors.border.light,
            }}>
              <Text style={{ color: colors.text.secondary }}>Not now</Text>
            </TouchableOpacity>
          </View>
        </View>
      )}

      {/* View Type Selector */}
      <View style={styles.viewSelector}>
        {(['day', 'week', 'month'] as ViewType[]).map(viewType => (
          <TouchableOpacity
            key={viewType}
            style={[
              styles.viewButton,
              state.viewType === viewType && styles.viewButtonActive,
            ]}
            onPress={() => handleViewTypeChange(viewType)}
          >
            <Text
              style={[
                styles.viewButtonText,
                state.viewType === viewType && styles.viewButtonTextActive,
              ]}
            >
              {viewType.charAt(0).toUpperCase() + viewType.slice(1)}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {/* Today + inline add (right) in the whitespace below view tabs and above filter */}
      <View style={styles.topActionsRow}>
        <TouchableOpacity
          style={styles.todayButton}
          onPress={handleTodayPress}
        >
          <Text style={styles.todayButtonText}>Today</Text>
        </TouchableOpacity>
        <TouchableOpacity
          onPress={handleCreateEvent}
          style={styles.inlineAddTop}
          activeOpacity={0.7}
          accessibilityLabel="Create event"
          accessibilityRole="button"
          hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
        >
          <Icon icon={PlusSignIcon} size={20} color={colors.text.secondary} />
        </TouchableOpacity>
      </View>

      {/* Search and Filter */}
      <SearchAndFilter
        events={convertedEvents}
        tasks={convertedTasks}
        onFilterChange={handleFilterChange}
        viewType={state.viewType}
      />

      {/* Content with Animation */}
      <View style={styles.content}>
        {/* Lapsed goals banner moved into month section above */}
        {state.error ? (
          <View style={styles.errorContainer}>
            <Text style={styles.errorText}>{state.error}</Text>
            <Button
              title="Retry"
              onPress={handleRetryPress}
              variant="outline"
              style={styles.retryButton}
            />
          </View>
        ) : (
          renderViewContent()
        )}
      </View>

      {/* Error Display for non-critical errors */}
      {currentError && currentError.severity !== 'CRITICAL' && (
        <ErrorDisplay
          error={currentError}
          onRetry={() => {
            setCurrentError(null);
            setErrorVisible(false);
            // loadCalendarData(); // No longer needed
          }}
          onDismiss={() => {
            setCurrentError(null);
            setErrorVisible(false);
          }}
          onAction={(action) => {
            if (action === 'signIn') {
              // Handle sign in action
              // navigate to sign in
            }
          }}
        />
      )}

      {/* Floating Action Button removed in favor of inline add icon */}

      {/* Event Form Modal */}
      <EventFormModal
        visible={formModalVisible}
        event={editingEvent}
        onClose={handleCloseForm}
      />

      {/* Calendar Import Modal */}
      <CalendarImportModal
        visible={showImportModal}
        onClose={() => setShowImportModal(false)}
        onImportComplete={handleImportModalComplete}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background.primary,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: colors.border.light,
  },
  headerActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  importButton: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: colors.surface,
    justifyContent: 'center',
    alignItems: 'center',
  },
  title: {
    fontSize: typography.fontSize.xl,
    fontWeight: typography.fontWeight.bold as any,
    color: colors.text.primary,
  },
  refreshButton: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: colors.surface,
    justifyContent: 'center',
    alignItems: 'center',
  },
  refreshButtonText: {
    fontSize: typography.fontSize.lg,
    color: colors.text.secondary,
  },
  viewSelector: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: colors.border.light,
  },
  viewButton: {
    flex: 1,
    paddingVertical: spacing.sm,
    marginHorizontal: spacing.xs,
    borderRadius: spacing.xs,
    backgroundColor: colors.surface,
    alignItems: 'center',
  },
  viewButtonActive: {
    backgroundColor: colors.primary,
  },
  viewButtonText: {
    fontSize: typography.fontSize.sm,
    fontWeight: typography.fontWeight.medium as any,
    color: colors.text.secondary,
  },
  viewButtonTextActive: {
    color: colors.secondary,
  },
  inlineAddButton: {
    marginLeft: spacing.sm,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
    borderRadius: spacing.xs,
    backgroundColor: 'transparent',
  },
  todayButton: {
    alignSelf: 'flex-start',
    marginVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    borderRadius: spacing.xs,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border.medium,
  },
  todayButtonText: {
    fontSize: typography.fontSize.sm,
    fontWeight: typography.fontWeight.medium as any,
    color: colors.text.primary,
  },
  content: {
    flex: 1,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingText: {
    marginTop: spacing.sm,
    fontSize: typography.fontSize.base,
    color: colors.text.secondary,
  },
  errorContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: spacing.xl,
  },
  errorText: {
    fontSize: typography.fontSize.base,
    color: colors.error,
    textAlign: 'center',
    marginBottom: spacing.md,
  },
  retryButton: {
    marginTop: spacing.sm,
  },
  dayViewContainer: {
    padding: spacing.md,
  },
  dayViewContent: {
    flexGrow: 1, // Allow content to grow and take available space
    paddingBottom: 100, // Add padding at bottom for better scrolling
  },
  dayViewTitle: {
    fontSize: typography.fontSize.lg,
    fontWeight: typography.fontWeight.bold as any,
    color: colors.text.primary,
    marginBottom: spacing.md,
  },
  weekViewContainer: {
    padding: spacing.md,
  },
  weekViewTitle: {
    fontSize: typography.fontSize.lg,
    fontWeight: typography.fontWeight.bold as any,
    color: colors.text.primary,
    marginBottom: spacing.md,
  },
  monthViewContainer: {
    flex: 1,
  },
  emptyState: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: spacing.xl,
  },
  emptyStateText: {
    fontSize: typography.fontSize.base,
    color: colors.text.secondary,
    textAlign: 'center',
    marginBottom: spacing.md,
  },
  createButton: {
    marginTop: spacing.sm,
  },
  // Removed fab styles (inlineAddButton replaces it)
  eventsContainer: {
    marginTop: spacing.md,
  },

  // New row under tabs: Today on left, subtle add on right
  topActionsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.md,
  },
  inlineAddTop: {
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
    borderRadius: spacing.xs,
  },

  timeBlock: {
    marginBottom: spacing.lg,
    backgroundColor: colors.surface,
    borderRadius: spacing.sm,
    padding: spacing.md,
    shadowColor: colors.text.primary,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 2,
  },
  timeBlockHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: spacing.sm,
    paddingBottom: spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: colors.border.light,
  },
  timeBlockTitle: {
    fontSize: typography.fontSize.lg,
    fontWeight: typography.fontWeight.bold as any,
    color: colors.text.primary,
  },
  timeBlockTime: {
    fontSize: typography.fontSize.sm,
    color: colors.text.secondary,
    fontWeight: typography.fontWeight.medium as any,
  },
  emptyTimeBlock: {
    padding: spacing.md,
    alignItems: 'center',
  },
  emptyTimeBlockText: {
    fontSize: typography.fontSize.sm,
    color: colors.text.disabled,
    fontStyle: 'italic',
  },
  eventsList: {
    gap: spacing.sm,
  },
  eventCardContainer: {
    marginBottom: spacing.sm,
  },
  dateGroup: {
    marginBottom: spacing.lg,
    backgroundColor: colors.surface,
    borderRadius: spacing.sm,
    padding: spacing.md,
    shadowColor: colors.text.primary,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 2,
  },
  dateGroupHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: spacing.sm,
    paddingBottom: spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: colors.border.light,
  },
  dateGroupTitle: {
    fontSize: typography.fontSize.lg,
    fontWeight: typography.fontWeight.bold as any,
    color: colors.text.primary,
  },
  dateGroupDate: {
    fontSize: typography.fontSize.sm,
    color: colors.text.secondary,
    fontWeight: typography.fontWeight.medium as any,
  },
  emptyDateGroup: {
    padding: spacing.md,
    alignItems: 'center',
  },
  emptyDateGroupText: {
    fontSize: typography.fontSize.sm,
    color: colors.text.disabled,
    fontStyle: 'italic',
  },
  goalsSection: {
    padding: spacing.md,
    backgroundColor: colors.background.primary,
  },
  goalsHeader: {
    marginBottom: spacing.md,
  },
  goalsTitle: {
    fontSize: typography.fontSize.lg,
    fontWeight: typography.fontWeight.bold as any,
    color: colors.text.primary,
    marginBottom: spacing.xs,
  },
  goalsSubtitle: {
    fontSize: typography.fontSize.sm,
    color: colors.text.secondary,
    fontWeight: typography.fontWeight.medium as any,
  },
  emptyGoals: {
    padding: spacing.lg,
    alignItems: 'center',
  },
  emptyGoalsText: {
    fontSize: typography.fontSize.sm,
    color: colors.text.disabled,
    fontStyle: 'italic',
  },
  goalsList: {
    gap: spacing.sm,
  },
  goalCard: {
    backgroundColor: colors.surface,
    borderRadius: spacing.sm,
    padding: spacing.md,
    marginBottom: spacing.sm,
    shadowColor: colors.text.primary,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 2,
  },
  goalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: spacing.sm,
  },
  goalTitle: {
    fontSize: typography.fontSize.base,
    fontWeight: typography.fontWeight.bold as any,
    color: colors.text.primary,
    flex: 1,
  },
  goalDate: {
    fontSize: typography.fontSize.sm,
    color: colors.text.secondary,
    fontWeight: typography.fontWeight.medium as any,
  },
  goalDescription: {
    fontSize: typography.fontSize.sm,
    color: colors.text.secondary,
    marginBottom: spacing.sm,
  },
  goalCategory: {
    alignSelf: 'flex-start',
    backgroundColor: colors.primary,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
    borderRadius: spacing.xs,
    marginBottom: spacing.sm,
  },
  goalCategoryText: {
    fontSize: typography.fontSize.xs,
    color: colors.secondary,
    fontWeight: typography.fontWeight.medium as any,
  },
  goalProgress: {
    marginTop: spacing.xs,
  },
  goalProgressText: {
    fontSize: typography.fontSize.xs,
    color: colors.text.secondary,
    fontWeight: typography.fontWeight.medium as any,
  },
  monthGoalsSection: {
    padding: spacing.md,
    backgroundColor: colors.background.primary,
    borderTopWidth: 1,
    borderTopColor: colors.border.light,
  },
  legendContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-start',
    gap: spacing.md,
    paddingHorizontal: spacing.md,
    paddingTop: spacing.sm,
    paddingBottom: spacing.sm,
  },
  legendItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
  legendDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  legendLabel: {
    fontSize: typography.fontSize.xs,
    color: colors.text.secondary,
    fontWeight: typography.fontWeight.medium as any,
  },
  lapsedBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    marginHorizontal: spacing.md,
    marginTop: spacing.sm,
    marginBottom: spacing.sm,
    backgroundColor: colors.background.surface,
    borderRadius: spacing.sm,
    borderWidth: 1,
    borderColor: colors.border.light,
  },
  lapsedLeft: {
    flex: 1,
    paddingRight: spacing.sm,
  },
  lapsedTitle: {
    fontSize: typography.fontSize.sm,
    fontWeight: typography.fontWeight.bold as any,
    color: colors.text.primary,
    marginBottom: 2,
  },
  lapsedSubtitle: {
    fontSize: typography.fontSize.xs,
    color: colors.text.secondary,
  },
  lapsedButton: {
    backgroundColor: colors.primary,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    borderRadius: spacing.xs,
  },
  lapsedButtonText: {
    color: colors.secondary,
    fontSize: typography.fontSize.sm,
    fontWeight: typography.fontWeight.medium as any,
  },
  monthGoalsTitle: {
    fontSize: typography.fontSize.lg,
    fontWeight: typography.fontWeight.bold as any,
    color: colors.text.primary,
    marginBottom: spacing.sm,
  },
  quickActionsSection: {
    padding: spacing.md,
    backgroundColor: colors.background.primary,
    borderTopWidth: 1,
    borderTopColor: colors.border.light,
  },
  quickActionsTitle: {
    fontSize: typography.fontSize.lg,
    fontWeight: typography.fontWeight.bold as any,
    color: colors.text.primary,
    marginBottom: spacing.sm,
  },
  quickActionsGrid: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    flexWrap: 'wrap',
  },
  quickActionButton: {
    width: '45%', // Adjust as needed for grid layout
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.sm,
    borderRadius: spacing.sm,
    backgroundColor: colors.primary,
    alignItems: 'center',
    marginVertical: spacing.xs,
  },
  quickActionButtonText: {
    fontSize: typography.fontSize.base,
    fontWeight: typography.fontWeight.medium as any,
    color: colors.secondary,
  },
});

const enhance = withObservables(['database'], ({ database }) => ({
  events: database.collections.get('calendar_events').query(
    Q.where('status', Q.notEq('pending_delete'))
  ).observe(),
  tasks: database.collections.get('tasks').query().observe(),
  goals: database.collections.get('goals').query().observe(),
}));

const EnhancedCalendarScreen = enhance(CalendarScreen);

const CalendarScreenWithDatabase = (props: any) => {
  const database = useDatabase();
  return <EnhancedCalendarScreen {...props} database={database} />;
};

export default CalendarScreenWithDatabase;
