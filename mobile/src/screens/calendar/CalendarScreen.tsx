import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  RefreshControl,
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
  CalendarEvent,
  Task,
  ViewType,
  CalendarState,
  DayViewEvent,
  WeekViewEvent,
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
import Icon from 'react-native-vector-icons/Octicons';

// const { width } = Dimensions.get('window');

export default function CalendarScreen() {
  const insets = useSafeAreaInsets();
  const navigation = useNavigation<any>();
  const dayViewScrollRef = useRef<ScrollView>(null);
  
  // Animation hooks
  const { } = useFadeAnimation(1); // animations disabled for now
  const { } = useScaleAnimation(1);
  
  // Stagger animation for event cards (disabled)
  // const eventAnimations = useRef<Animated.Value[]>([]).current;
  
  const [state, setState] = useState<CalendarState>({
    selectedDate: new Date(),
    viewType: 'month',
    events: [],
    tasks: [],
    goals: [],
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

  // Filtered state for search and filtering
  const [filteredEvents, setFilteredEvents] = useState<CalendarEvent[]>([]);
  const [filteredTasks, setFilteredTasks] = useState<Task[]>([]);

  // Handle filter changes
  const handleFilterChange = useCallback((nextFilteredEvents: CalendarEvent[], nextFilteredTasks: Task[]) => {
    setFilteredEvents(nextFilteredEvents);
    setFilteredTasks(nextFilteredTasks);
  }, []);

  // Load calendar data with enhanced error handling
  const loadCalendarData = useCallback(async (page = 1, append = false) => {
    if (page === 1) {
      setState(prev => ({ ...prev, loading: true, error: null }));
      setCurrentError(null);
      // Only fade out content if we're not in initial load
      // Temporarily disabled animations for debugging
      // if (!append) {
      //   contentFadeOut(); // Fade out content while loading
      // }
    } else {
      setLoadingMore(true);
    }
    
    try {
      // loading calendar data
      
      // Load events from backend with proper pagination using enhanced API
      // For initial load, request a larger number to get all upcoming events
      const initialMaxResults = 500; // Increased from 50 to get more events initially
      const maxResults = page === 1 ? initialMaxResults : 50 * page;
      const events = await enhancedAPI.getEvents(maxResults);
      // events loaded
      
      // Load tasks from backend using enhanced API
      const tasks = await enhancedAPI.getTasks();
      // tasks loaded
      
      // Load goals from backend using enhanced API
      const goals = await enhancedAPI.getGoals();
      // goals loaded
      
      setState(prev => ({
        ...prev,
        events: append ? [...prev.events, ...(events || [])] : (events || []),
        tasks: tasks || [],
        goals: goals || [],
        loading: false,
        error: null,
      }));
      
      // Initialize filtered state with all data
      if (!append) {
        setFilteredEvents(events || []);
        setFilteredTasks(tasks || []);
        // calendar data loaded
      }
      
      // Animate content in for initial load
      if (page === 1) {
        // Temporarily disabled animations for debugging
        // contentFadeIn();
        // // Initialize event animations for stagger effect
        // const totalEvents = (events?.length || 0) + (tasks?.length || 0);
        // eventAnimations.length = 0; // Clear existing animations
        // for (let i = 0; i < totalEvents; i++) {
        //   eventAnimations.push(new Animated.Value(0));
        // }
        
        // // Stagger animation for event cards
        // setTimeout(() => {
        //   const animations = eventAnimations.map((anim, index) => 
        //     Animated.timing(anim, {
        //       toValue: 1,
        //       duration: 300,
        //       delay: index * 50,
        //       useNativeDriver: true,
        //     })
        //   );
        //   Animated.parallel(animations).start();
        // }, 100);
      }
      
      // Update pagination state
      setCurrentPage(page);
      setHasMoreEvents((events?.length || 0) >= 50); // Check if we got a full page
      setLoadingMore(false);
    } catch (_error) {
      // error loading calendar data
      
      // Handle error with enhanced error handling service
      if (_error && typeof _error === 'object' && 'title' in _error) {
        // This is a UserFriendlyError from our enhanced API
        setCurrentError(_error as UserFriendlyError);
        setErrorVisible(true);
      } else {
        // Fallback error handling
        const userError = await errorHandlingService.handleError(
          _error,
          ErrorCategory.CALENDAR,
          {
            operation: 'loadCalendarData',
            endpoint: 'calendar/events',
            timestamp: Date.now(),
            retryCount: 0,
          }
        );
        setCurrentError(userError);
        setErrorVisible(true);
      }
      
      setState(prev => ({
        ...prev,
        loading: false,
        error: 'Failed to load calendar data',
      }));
      setLoadingMore(false);
      // Ensure content is visible even on error
      // contentFadeIn();
    }
  }, []);

  // Load more events (unused handler removed to satisfy linter)

  // Refresh data
  const onRefresh = useCallback(async () => {
    hapticFeedback.light();
    setRefreshing(true);
    await loadCalendarData(1, false);
    setRefreshing(false);
  }, [loadCalendarData]);

  // Load data on mount
  useEffect(() => {
    loadCalendarData();
    setIsFirstLoad(false);
  }, [loadCalendarData]);

  // Refresh data when screen comes into focus (e.g., when user navigates to calendar tab)
  useFocusEffect(
    React.useCallback(() => {
      // Skip refresh on first load to avoid double loading
      if (!isFirstLoad) {
        loadCalendarData();
      }
    }, [isFirstLoad, loadCalendarData])
  );

  // Check first-visit import conditions
  useEffect(() => {
    const checkImportPrompt = async () => {
      try {
        const status = await enhancedAPI.getCalendarStatus();
        const prefs = await enhancedAPI.getAppPreferences();
        const completed = !!(prefs && (prefs as any).calendar_first_import_completed);
        if (status && status.connected === true && !completed) {
          setShowImportPrompt(true);
        }
      } catch (_e) {
        // non-blocking
      }
    };
    checkImportPrompt();
  }, []);

  const handleImportNow = useCallback(async () => {
    try {
      setImporting(true);
      await enhancedAPI.importCalendarFirstRun();
      await loadCalendarData(1, false);
      setShowImportPrompt(false);
    } catch (_e) {
      // leave prompt for retry
    } finally {
      setImporting(false);
    }
  }, [loadCalendarData]);

  const handleNotNow = useCallback(async () => {
    try {
      setShowImportPrompt(false);
      await enhancedAPI.updateAppPreferences({ calendar_import_prompt_dismissed_at: new Date().toISOString() });
    } catch (_e) {
      // ignore
    }
  }, []);

  const handleImportModalComplete = useCallback(() => {
    // Refresh calendar data after successful import
    loadCalendarData(1, false);
    setShowImportPrompt(false);
  }, [loadCalendarData]);

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

  // Handle event edit
  const handleEventEdit = useCallback((event: CalendarEvent | Task) => {
    hapticFeedback.medium();
    setEditingEvent(event);
    setFormModalVisible(true);
  }, []);

  // Handle event delete with optimistic updates
  const handleEventDelete = useCallback(async (eventId: string) => {
    let deletedEvent: CalendarEvent | undefined;

    try {
      // Find the event to delete
      deletedEvent = state.events.find(e => e.id === eventId);

      if (!deletedEvent) {
        throw new Error('Event not found');
      }

      // Optimistic update: immediately remove the event from UI
      setState(prev => ({
        ...prev,
        events: prev.events.filter(e => e.id !== eventId)
      }));

      // Also remove from filtered events if it exists there
      setFilteredEvents(prev => prev.filter(e => e.id !== eventId));

      hapticFeedback.success();

      // Make the API call in the background
      try {
        await enhancedAPI.deleteEvent(eventId);
        // Success - optimistic update was correct, no further action needed
      } catch (apiError) {
        // API call failed - restore the event and show error
        if (deletedEvent) {
          setState(prev => ({
            ...prev,
            events: [...prev.events, deletedEvent!]
          }));
          setFilteredEvents(prev => [...prev, deletedEvent!]);
        }

        hapticFeedback.error();

        // Handle error with enhanced error handling
        if (apiError && typeof apiError === 'object' && 'title' in apiError) {
          setCurrentError(apiError as UserFriendlyError);
          setErrorVisible(true);
        } else {
          const userError = await errorHandlingService.handleError(
            apiError,
            ErrorCategory.CALENDAR,
            {
              operation: 'deleteEvent',
              endpoint: `calendar/events/${eventId}`,
              timestamp: Date.now(),
              retryCount: 0,
            }
          );
          setCurrentError(userError);
          setErrorVisible(true);
        }
      }
    } catch (initialError) {
      // Error finding event or other initial error
      hapticFeedback.error();

      if (initialError && typeof initialError === 'object' && 'title' in initialError) {
        setCurrentError(initialError as UserFriendlyError);
        setErrorVisible(true);
      } else {
        const userError = await errorHandlingService.handleError(
          initialError,
          ErrorCategory.CALENDAR,
          {
            operation: 'deleteEvent',
            endpoint: `calendar/events/${eventId}`,
            timestamp: Date.now(),
            retryCount: 0,
          }
        );
        setCurrentError(userError);
        setErrorVisible(true);
      }
    }
  }, [state.events]);

  // Handle task completion with enhanced error handling
  const handleTaskComplete = useCallback(async (taskId: string) => {
    // Find the task in the current state
    const taskIndex = state.tasks.findIndex(t => t.id === taskId);
    if (taskIndex === -1) {
      throw new Error('Task not found');
    }

    const currentTask = state.tasks[taskIndex];
    const isCurrentlyCompleted = currentTask.status === 'completed';
    const newStatus = isCurrentlyCompleted ? 'in_progress' : 'completed';

    try {
      // Optimistic update - immediately update the UI
      setState(prev => ({
        ...prev,
        tasks: prev.tasks.map(task => 
          task.id === taskId 
            ? { ...task, status: newStatus }
            : task
        )
      }));

      // Update the backend using enhanced API
      await enhancedAPI.updateTask(taskId, { status: newStatus });
      
      // Success - no need to reload, UI is already updated
      hapticFeedback.success();
    } catch (_error) {
      // error completing task
      hapticFeedback.error();
      
      // Revert the optimistic update on error
      setState(prev => ({
        ...prev,
        tasks: prev.tasks.map(task => 
          task.id === taskId 
            ? { ...task, status: currentTask.status } // Revert to original status
            : task
        )
      }));
      
      // Handle error with enhanced error handling
      if (_error && typeof _error === 'object' && 'title' in _error) {
        setCurrentError(_error as UserFriendlyError);
        setErrorVisible(true);
      } else {
        const userError = await errorHandlingService.handleError(
          _error,
          ErrorCategory.TASKS,
          {
            operation: 'completeTask',
            endpoint: `tasks/${taskId}`,
            timestamp: Date.now(),
            retryCount: 0,
          }
        );
        setCurrentError(userError);
        setErrorVisible(true);
      }
    }
  }, [state.tasks]);

  // Handle event rescheduling with enhanced error handling
  const handleReschedule = useCallback(async (eventId: string, newDate: Date) => {
    let event: CalendarEvent | undefined;
    
    try {
      // Only reschedule calendar events from Calendar screen
      event = state.events.find(e => e.id === eventId);
      
      if (event) {
        const startTime = event.start_time || event.start?.dateTime;
        const endTime = event.end_time || event.end?.dateTime;
        
        if (startTime && endTime) {
          const startDate = new Date(startTime);
          const endDate = new Date(endTime);
          const duration = endDate.getTime() - startDate.getTime();
          
          // Calculate new start and end times
          const newStartTime = new Date(newDate);
          const newEndTime = new Date(newStartTime.getTime() + duration);
          
          await enhancedAPI.updateEvent(eventId, {
            summary: event.summary || event.title || 'Untitled Event',
            description: event.description,
            startTime: newStartTime.toISOString(),
            endTime: newEndTime.toISOString(),
            location: event.location,
          });
        }
      } else {
        throw new Error('Event not found');
      }
      
      // Refresh data
      await loadCalendarData();
      hapticFeedback.success();
    } catch (_error) {
      // error rescheduling event
      hapticFeedback.error();
      
      // Handle error with enhanced error handling
      if (_error && typeof _error === 'object' && 'title' in _error) {
        setCurrentError(_error as UserFriendlyError);
        setErrorVisible(true);
      } else {
        const userError = await errorHandlingService.handleError(
          _error,
          ErrorCategory.CALENDAR,
          {
            operation: 'rescheduleEvent',
            endpoint: `calendar/events/${eventId}`,
            timestamp: Date.now(),
            retryCount: 0,
          }
        );
        setCurrentError(userError);
        setErrorVisible(true);
      }
    }
  }, [state.events, loadCalendarData]);

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
              obj?.start_time ||
              obj?.end_time ||
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

          await enhancedAPI.updateEvent(editingEvent.id, {
            summary: formData.title,
            description: formData.description,
            startTime: formData.startTime.toISOString(),
            endTime: formData.endTime.toISOString(),
            location: formData.location,
            eventType: preservedEventType,
            taskId: preservedTaskId,
            goalId: preservedGoalId,
          });
        } else {
          // Editing a task: create a linked calendar event for the task
          await enhancedAPI.createEvent({
            summary: formData.title,
            description: formData.description,
            startTime: formData.startTime.toISOString(),
            endTime: formData.endTime.toISOString(),
            location: formData.location,
            eventType: 'task',
            taskId: (editingEvent as any).id,
          });
        }
      } else {
        // Create new event
        await enhancedAPI.createEvent({
          summary: formData.title,
          description: formData.description,
          startTime: formData.startTime.toISOString(),
          endTime: formData.endTime.toISOString(),
          location: formData.location,
        });
      }
      
      // Refresh data
      await loadCalendarData();
      hapticFeedback.success();
    } catch (error) {
      // error saving event
      hapticFeedback.error();
      throw error;
    } finally {
      setFormLoading(false);
    }
  }, [editingEvent, loadCalendarData]);

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
    loadCalendarData(1, false);
  }, [loadCalendarData]);

  // Compute lapsed goals (overdue target date and not completed)
  const getLapsedGoals = useCallback(() => {
    const todayKey = formatDateToYYYYMMDD(new Date());
    return state.goals.filter((goal: any) => {
      if (!goal?.target_completion_date) {return false;}
      try {
        const goalKey = formatDateToYYYYMMDD(new Date(goal.target_completion_date));
        const isOverdue = goalKey < todayKey;
        const isCompleted = goal?.status === 'completed' || (Array.isArray(goal?.milestones) && goal.milestones.length > 0 && goal.milestones.every((m: any) => m.completed || ((m.steps || []).every((s: any) => s.completed))));
        return isOverdue && !isCompleted;
      } catch {
        return false;
      }
    });
  }, [state.goals]);

  // Get events for selected date (only calendar events; tasks are no longer rendered directly as events)
  const getEventsForSelectedDate = useCallback(() => {
    const selectedDateStr = formatDateToYYYYMMDD(state.selectedDate);
    const dayEvents: DayViewEvent[] = [];
    const goalsDueToday: any[] = [];

    // Add calendar events (skip goal markers)
    filteredEvents.forEach((event) => {
      try {
        if ((event as any).event_type === 'goal') {return;}
        // Handle both database format and Google Calendar API format
        let eventStartTime: string;
        let eventEndTime: string;
        
        if (event.start_time && event.end_time) {
          // Database format
          eventStartTime = event.start_time;
          eventEndTime = event.end_time;

        } else if (event.start?.dateTime && event.end?.dateTime) {
          // Google Calendar API format
          eventStartTime = event.start.dateTime;
          eventEndTime = event.end.dateTime;

        } else {
          // invalid event format
          return;
        }

        const eventDate = new Date(eventStartTime);
        const eventDateStr = getLocalDateKey(eventDate);
        
        if (eventDateStr === selectedDateStr) {
          const dayEvent = {
            id: event.id,
            title: event.summary || event.title || 'Untitled Event',
            startTime: new Date(eventStartTime),
            endTime: new Date(eventEndTime),
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

    // Do not render raw tasks as events anymore; tasks should appear as linked calendar events via task_id

    // Collect goals due today for a lightweight summary card in Day view
    state.goals.forEach(goal => {
      if (!goal.target_completion_date) {return;}
      try {
        const goalDate = new Date(goal.target_completion_date);
        if (getLocalDateKey(goalDate) === selectedDateStr) {
          goalsDueToday.push(goal);
        }
      } catch {}
    });

    // Attach as property for renderDayView to read (avoid prop threading for now)
    (getEventsForSelectedDate as any)._goalsDueToday = goalsDueToday;

    return dayEvents.sort((a, b) => a.startTime.getTime() - b.startTime.getTime());
  }, [filteredEvents, state.selectedDate]);

  // Get goals due in the current month
  const getGoalsForCurrentMonth = useCallback(() => {
    const currentMonth = state.selectedDate.getMonth();
    const currentYear = state.selectedDate.getFullYear();
    
    return state.goals.filter(goal => {
      if (!goal.target_completion_date) {return false;}
      
      try {
        const goalDate = new Date(goal.target_completion_date);
        return goalDate.getMonth() === currentMonth && goalDate.getFullYear() === currentYear;
      } catch (_error) {
        // invalid goal date
        return false;
      }
    }).sort((a, b) => {
      // Sort by completion date, then by title
      const dateA = new Date(a.target_completion_date || '');
      const dateB = new Date(b.target_completion_date || '');
      if (dateA.getTime() !== dateB.getTime()) {
        return dateA.getTime() - dateB.getTime();
      }
      return a.title.localeCompare(b.title);
    });
  }, [state.goals, state.selectedDate]);

  // Get marked dates for calendar
  const getMarkedDates = useCallback(() => {
    const marked: Record<string, { marked: boolean; dots: Array<{ color: string }> }> = {};

    const ensureEntry = (date: string) => {
      if (!marked[date]) {
        marked[date] = { marked: true, dots: [] };
      }
      return marked[date];
    };

    // Events → blue dot (info) for regular events, green dot (success) for task-linked events; skip goal markers
    filteredEvents.forEach(event => {
      try {
        let eventStartTime: string | undefined;
        if (event.start_time) {
          eventStartTime = event.start_time;
        } else if (event.start?.dateTime) {
          eventStartTime = event.start.dateTime;
        }
        if (!eventStartTime) {return;}
        // Skip goal markers in events array
        if ((event as any).event_type === 'goal') {return;}
        const date = getLocalDateKey(new Date(eventStartTime));
        const entry = ensureEntry(date);

        // Determine dot color based on whether event is linked to a task
        const dotColor = (event as any).task_id ? colors.success : colors.info;

        if (!entry.dots.some(d => d.color === dotColor)) {
          entry.dots.push({ color: dotColor });
        }
      } catch {}
    });

    // Task-linked events get green dots, regular events get blue dots

    // Goals → amber dot (warning)
    state.goals.forEach(goal => {
      if (!goal.target_completion_date) {return;}
      try {
        const date = getLocalDateKey(new Date(goal.target_completion_date));
        const entry = ensureEntry(date);
        if (!entry.dots.some(d => d.color === colors.warning)) {
          entry.dots.push({ color: colors.warning });
        }
      } catch {}
    });

    return marked;
  }, [filteredEvents, state.goals]);

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
        const eventDate = new Date(event.start_time || event.start?.dateTime || '');
        const eventDateStr = getLocalDateKey(eventDate);
        
        const group = dateGroups.find(g => g.dateString === eventDateStr);
        if (group) {
          group.events.push({
            id: event.id,
            title: event.title || event.summary || 'Untitled Event',
            startTime: eventDate,
            endTime: new Date(event.end_time || event.end?.dateTime || eventDate.getTime() + 60 * 60 * 1000),
            day: eventDate.getDay(),
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
    state.goals.forEach(goal => {
      if (!goal.target_completion_date) {return;}
      try {
        const goalDateStr = getLocalDateKey(new Date(goal.target_completion_date));
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
      } catch {}
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
  }, [filteredEvents, filteredTasks, handleCreateEvent, handleEventDelete, handleEventEdit, handleReschedule, handleTaskComplete, onRefresh, refreshing, state.selectedDate]);

  // Render month view
  const renderMonthView = () => {
    const monthGoals = getGoalsForCurrentMonth();
    // Determine the next upcoming goal (by target date or created date), and derive current milestone and next step
    const nextGoal = monthGoals
      .filter(g => !!g)
      .sort((a, b) => {
        const aDate = a.target_completion_date ? new Date(a.target_completion_date).getTime() : Number.MAX_SAFE_INTEGER;
        const bDate = b.target_completion_date ? new Date(b.target_completion_date).getTime() : Number.MAX_SAFE_INTEGER;
        if (aDate !== bDate) {return aDate - bDate;}
        const aCreated = a.created_at ? new Date(a.created_at).getTime() : 0;
        const bCreated = b.created_at ? new Date(b.created_at).getTime() : 0;
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
              if (count <= 0) {return null;}
              return (
                <View style={[styles.lapsedBanner, { marginTop: spacing.md }]}> 
                  <View style={styles.lapsedLeft}>
                    <Text style={styles.lapsedTitle}>Lapsed goals</Text>
                    <Text style={styles.lapsedSubtitle}>{count} {count === 1 ? 'goal needs review' : 'goals need review'}</Text>
                  </View>
                  <TouchableOpacity
                    style={styles.lapsedButton}
                    onPress={() => {
                      try { navigation.navigate('Goals', { focus: 'needsReview' }); } catch {}
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
  if (state.loading && currentPage === 1) {
    return (
      <View style={[styles.container, { paddingTop: insets.top }]}>
        <View style={styles.header}>
          <Text style={styles.title}>Calendar</Text>
        </View>
        <LoadingSkeleton type="event" count={5} />
      </View>
    );
  }

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      {/* Error Banner for critical errors */}
      {currentError && currentError.severity === 'CRITICAL' && (
        <ErrorBanner
          error={currentError}
          onRetry={() => {
            setCurrentError(null);
            setErrorVisible(false);
            loadCalendarData();
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
            <TouchableOpacity 
              onPress={() => setShowImportModal(true)} 
              style={styles.importButton}
            >
              <Icon name="download" size={18} color={colors.text.secondary} />
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
          <Icon name="plus" size={20} color={colors.text.secondary} />
        </TouchableOpacity>
      </View>

      {/* Search and Filter */}
      <SearchAndFilter
        events={state.events}
        tasks={state.tasks}
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
            loadCalendarData();
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
        onSubmit={handleFormSubmit}
        loading={formLoading}
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
