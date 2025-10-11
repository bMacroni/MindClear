import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Modal,
  Alert,
  ActivityIndicator,
} from 'react-native';
import { useWindowDimensions } from 'react-native';
import { colors } from '../../themes/colors';
import { spacing, borderRadius } from '../../themes/spacing';
import { typography } from '../../themes/typography';
import { TaskCard } from '../../components/tasks/TaskCard';
import { CompletedTaskCard } from '../../components/tasks/CompletedTaskCard';
import QuickScheduleRadial from '../../components/tasks/QuickScheduleRadial';
import { TaskForm } from '../../components/tasks/TaskForm';
import { AutoSchedulingPreferencesModal } from '../../components/tasks/AutoSchedulingPreferencesModal';
import { SuccessToast } from '../../components/common/SuccessToast';
import { LazyList } from '../../utils/lazyListUtils';
import { tasksAPI, goalsAPI, calendarAPI, autoSchedulingAPI, appPreferencesAPI } from '../../services/api';
import { enhancedAPI } from '../../services/enhancedApi';
import { offlineService } from '../../services/offline';
import analyticsService from '../../services/analyticsService';
import Icon from 'react-native-vector-icons/Octicons';
import { useNavigation, useFocusEffect } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { HelpIcon } from '../../components/help/HelpIcon';
import HelpTarget from '../../components/help/HelpTarget';
import { useHelp, HelpContent, HelpScope } from '../../contexts/HelpContext';
import ScreenHeader from '../../components/common/ScreenHeader';
import { SafeAreaView } from 'react-native-safe-area-context';

// Development-only logging for EOD prompt debugging
const EOD_DEBUG = true; // set false to silence
const eodLog = (...args: any[]) => {
  if (__DEV__ && EOD_DEBUG) {
    // eslint-disable-next-line no-console
    console.log('[EOD]', ...args);
  }
};

interface Task {
  id: string;
  title: string;
  description?: string;
  priority: 'low' | 'medium' | 'high';
  status: 'not_started' | 'in_progress' | 'completed';
  due_date?: string;
  category?: string;
  goal_id?: string;
  estimated_duration_minutes?: number;
  is_today_focus?: boolean;
  goal?: {
    id: string;
    title: string;
  };
  // Auto-scheduling fields
  auto_schedule_enabled?: boolean;
  weather_dependent?: boolean;
  location?: string;
  travel_time_minutes?: number;
  // Required backend fields
  preferred_time_of_day?: 'morning' | 'afternoon' | 'evening';
  deadline_type?: 'soft' | 'hard';
  recurrence_pattern?: 'none' | 'daily' | 'weekly' | 'monthly';
  scheduling_preferences?: any;
  max_daily_tasks?: number;
  buffer_time_minutes?: number;
  task_type?: 'indoor' | 'outdoor' | 'travel' | 'virtual' | 'other';
}

interface Goal {
  id: string;
  title: string;
}

const TasksScreen: React.FC = () => {
  const navigation = useNavigation<any>();
  const { setHelpContent, setIsHelpOverlayActive, setHelpScope } = useHelp();
  const _insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const isCompact = width < 1000; // Icon-only on phones; show labels only on very wide/tablet screens
  const [tasks, setTasks] = useState<Task[]>([]);
  const [goals, setGoals] = useState<Goal[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [showModal, setShowModal] = useState(false);
  const [editingTask, setEditingTask] = useState<Task | undefined>();
  const [saving, setSaving] = useState(false);
  const [bulkScheduling, setBulkScheduling] = useState(false);
  const [showPreferencesModal, setShowPreferencesModal] = useState(false);
  const [showToast, setShowToast] = useState(false);
  const [toastMessage, setToastMessage] = useState('');
  const [toastScheduledTime, setToastScheduledTime] = useState<string | undefined>();
  const [toastCalendarEvent, setToastCalendarEvent] = useState(false);
  const [showInbox, setShowInbox] = useState(false);
  const [selectingFocus, setSelectingFocus] = useState(false);
  const [showEodPrompt, setShowEodPrompt] = useState(false);
  const [quickMenuVisible, setQuickMenuVisible] = useState(false);
  const [quickAnchor, setQuickAnchor] = useState<{ x: number; y: number } | undefined>(undefined);
  const [quickOpenedAt, setQuickOpenedAt] = useState<number | undefined>(undefined);
  const [quickTaskId, setQuickTaskId] = useState<string | undefined>(undefined);
  const [momentumEnabled, setMomentumEnabled] = useState<boolean>(false);
  const eodActionInFlightRef = React.useRef<boolean>(false);
  const eodFocusIdRef = React.useRef<string | undefined>(undefined);
  const [travelPreference, setTravelPreference] = useState<'allow_travel' | 'home_only'>('allow_travel');
  const [_userNotificationPrefs, _setUserNotificationPrefs] = useState<any | null>(null);
  const [userSchedulingPreferences, setUserSchedulingPreferences] = useState<any>(null);

  const getTasksHelpContent = React.useCallback((): HelpContent => ({
    'tasks-header-summary': 'This shows how many tasks are auto-scheduled and how many have a scheduled time.',
    'tasks-bulk-auto-schedule': 'Tap to auto-schedule all eligible tasks using your preferences.',
    'tasks-momentum-toggle': 'Momentum mode picks your next focus task automatically when you complete one.',
    'tasks-travel-toggle': 'Switch between allowing travel or home-only tasks for momentum mode.',
    'tasks-inbox-toggle': 'Open your Inbox to choose a new focus task or view remaining tasks.',
    'tasks-focus-complete': 'Mark today’s focus task as done.',
    'tasks-focus-skip': 'Skip this focus and we will pick the next one.',
    'tasks-focus-change': 'Manually choose a different task as Today’s Focus.',
    'task-complete': 'Mark the task complete.',
    'task-schedule': 'Open quick scheduling options for this task.',
    'task-ai': 'Ask AI for help planning or breaking down this task.',
    'task-edit': 'Edit task details.',
    'task-delete': 'Delete this task.',
    'tasks-fab-add': 'Create a new task. You can add details like due date and duration.',
  }), []);
  useEffect(() => {
    loadData();
    loadSchedulingPreferences();
  }, []);

  // Track screen view
  useEffect(() => {
    analyticsService.trackScreenView('tasks', {
      taskCount: tasks.length,
      completedCount: tasks.filter(t => t.status === 'completed').length,
      focusTaskCount: tasks.filter(t => t.is_today_focus).length
    }).catch(error => {
      console.warn('Failed to track screen view analytics:', error);
    });
  }, [tasks]);

  // Auto refresh whenever the Tasks tab/screen gains focus (silent background refresh)
  useFocusEffect(
    React.useCallback(() => {
      // Set help scope for this screen and reset overlay when leaving
      try { setHelpScope('tasks'); } catch {}
      try { setHelpContent(getTasksHelpContent()); } catch {}
      // If user navigated with overlay ON from a previous screen, ensure tooltips will populate
      // by briefly toggling it off (state stays off due to blur reset anyway)
      try { setIsHelpOverlayActive(false); } catch {}
      // Avoid showing a spinner if we already have content; fetch fresh in background
      loadData({ silent: true });
      return () => {
        try { setIsHelpOverlayActive(false); } catch {}
      };
    }, [setHelpScope, setIsHelpOverlayActive, setHelpContent, getTasksHelpContent])
  );

  const loadSchedulingPreferences = async () => {
    try {
      const prefs = await (enhancedAPI as any).getSchedulingPreferences();
      setUserSchedulingPreferences(prefs);
    } catch (error) {
      console.warn('Failed to load scheduling preferences:', error);
      // Use defaults if preferences can't be loaded
      setUserSchedulingPreferences({
        preferred_start_time: '09:00:00',
        preferred_end_time: '17:00:00',
        buffer_time_minutes: 15,
        work_days: [1, 2, 3, 4, 5]
      });
    }
  };

  const loadData = async (options?: { silent?: boolean }) => {
    const silent = !!options?.silent;
    try {
      // Paint from cache immediately if available
      const [cachedTasks, cachedGoals] = await Promise.all([
        offlineService.getCachedTasks(),
        offlineService.getCachedGoals(),
      ]);
      let paintedFromCache = false;
      if (cachedTasks && Array.isArray(cachedTasks)) {
        setTasks(cachedTasks as any);
        paintedFromCache = true;
      }
      if (cachedGoals && Array.isArray(cachedGoals)) {
        setGoals(cachedGoals as any);
        paintedFromCache = true;
      }
      if (paintedFromCache) {
        // Dismiss spinner immediately; we will refresh in background
        setLoading(false);
      } else {
        if (!silent) {setLoading(true);}
      }

      // Fetch fresh in parallel
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 15000);
      const [tasksData, goalsData, prefs] = await Promise.all([
        tasksAPI.getTasks(controller.signal as any),
        goalsAPI.getGoals(controller.signal as any),
        appPreferencesAPI.get().catch(() => null),
      ]).finally(() => clearTimeout(timeout));
      setTasks(tasksData);
      setGoals(goalsData);
      if (prefs && typeof prefs === 'object') {
        setMomentumEnabled(!!(prefs as any).momentum_mode_enabled);
        setTravelPreference((prefs as any).momentum_travel_preference === 'home_only' ? 'home_only' : 'allow_travel');
      }
      // Cache raw responses
      try {
        await Promise.all([
          offlineService.cacheTasks(tasksData as any),
          offlineService.cacheGoals(goalsData as any),
        ]);
      } catch {}
    } catch (error) {
      if ((error as any)?.name === 'AbortError') {
        console.warn('Tasks/Goals fetch aborted due to timeout');
        // Keep whatever cache we already showed; avoid alert
        return;
      }
      console.error('Error loading data:', error);
      Alert.alert('Error', 'Failed to load tasks and goals');
    } finally {
      setLoading(false);
    }
  };

  const handleRefresh = async () => {
    setRefreshing(true);
    await loadData();
    setRefreshing(false);
  };

  // Honor cross-screen refresh hints
  useEffect(() => {
    (async () => {
      try {
        const flag = await AsyncStorage.getItem('needsTasksRefresh');
        if (flag === '1') {
          await loadData({ silent: true });
          await AsyncStorage.removeItem('needsTasksRefresh');
        }
      } catch {}
    })();
  }, []);

  const handleTaskPress = useCallback((task: Task) => {
    setEditingTask(task);
    setShowModal(true);
  }, []);

  const handleCreateTask = useCallback(() => {
    setEditingTask(undefined);
    setShowModal(true);
  }, []);

  const handleSaveTask = useCallback(async (taskData: Partial<Task>) => {
    try {
      setSaving(true);
      console.log('🔍 DEBUG: TasksScreen handleSaveTask called with taskData:', JSON.stringify(taskData, null, 2));
      console.log('🔍 DEBUG: editingTask:', editingTask ? 'exists' : 'null');
      
      if (editingTask) {
        // Update existing task
        console.log('🔍 DEBUG: Calling updateTask with ID:', editingTask.id);
        const updatedTask = await tasksAPI.updateTask(editingTask.id, taskData);
        setTasks(prev => prev.map(task => 
          task.id === editingTask.id ? updatedTask : task
        ));
      } else {
        // Create new task
        console.log('🔍 DEBUG: Calling createTask');
        const newTask = await tasksAPI.createTask(taskData);
        setTasks(prev => [newTask, ...prev]);
      }
      setShowModal(false);
      setEditingTask(undefined);
    } catch (error) {
      console.error('Error saving task:', error);
      Alert.alert('Error', 'Failed to save task');
    } finally {
      setSaving(false);
    }
  }, [editingTask]);

  const handleDeleteTask = useCallback(async (taskId: string) => {
    const prevTasks = tasks;
    setTasks(prev => prev.filter(task => task.id !== taskId));
    try {
      await tasksAPI.deleteTask(taskId);
    } catch (error) {
      console.error('Error deleting task:', error);
      setTasks(prevTasks);
      Alert.alert('Error', 'Failed to delete task');
    }
  }, [tasks]);

  const handleToggleStatus = useCallback(async (taskId: string, newStatus: 'not_started' | 'in_progress' | 'completed') => {
    const prevTasks = tasks;
    const prevTask = tasks.find(t => t.id === taskId);
    setTasks(prev => prev.map(task => task.id === taskId ? { ...task, status: newStatus } as any : task));
    try {
      const updatedTask = await tasksAPI.updateTask(taskId, { status: newStatus });
      setTasks(prev => prev.map(task => task.id === taskId ? updatedTask : task));

      if (newStatus === 'completed' && prevTask) {
        analyticsService.trackTaskCompleted({
          taskId: prevTask.id,
          taskTitle: prevTask.title,
          priority: prevTask.priority,
          hasLocation: !!prevTask.location,
          hasEstimatedDuration: !!prevTask.estimated_duration_minutes,
          autoScheduleEnabled: prevTask.auto_schedule_enabled,
          isTodayFocus: prevTask.is_today_focus
        }).catch(error => {
          console.warn('Failed to track task completion analytics:', error);
        });
      }
    } catch (error) {
      console.error('Error updating task status:', error);
      setTasks(prevTasks);
      Alert.alert('Error', 'Failed to update task status');
    }
  }, [tasks]);

  const handleResetCompletedTask = useCallback(async (taskId: string) => {
    const prevTasks = tasks;
    setTasks(prev => prev.map(task => task.id === taskId ? { ...task, status: 'not_started' } as any : task));
    try {
      const updatedTask = await tasksAPI.updateTask(taskId, { status: 'not_started' });
      setTasks(prev => prev.map(task => task.id === taskId ? updatedTask : task));
      
      // Handle calendar event - remove any associated calendar events since task is no longer completed
      try {
        const events = await enhancedAPI.getEventsForTask(taskId);
        for (const event of events) {
          await enhancedAPI.deleteEvent(event.id);
        }
      } catch (error) {
        console.warn('Failed to remove calendar event:', error);
      }
      
      setToastMessage('Task marked as incomplete');
      setToastCalendarEvent(false);
      setShowToast(true);
    } catch (error) {
      console.error('Error resetting task status:', error);
      setTasks(prevTasks);
      Alert.alert('Error', 'Failed to reset task status');
    }
  }, [tasks]);

  // Helper function to format due date for display
  const formatDueDate = (dueDate: string | undefined): string => {
    if (!dueDate) return 'none';
    try {
      const date = new Date(dueDate);
      return date.toLocaleDateString();
    } catch {
      return 'none';
    }
  };

  const handleAddToCalendar = useCallback(async (_taskId: string) => {
    try {
      const task = tasks.find(t => t.id === _taskId);
      if (!task) {
        Alert.alert('Error', 'Task not found');
        return;
      }

      const needsDuration = !Number.isFinite((task as any).estimated_duration_minutes) || (task as any).estimated_duration_minutes! <= 0;
      const needsDueDate = !task.due_date;

      if (needsDuration || needsDueDate) {
        const missingParts: string[] = [];
        if (needsDuration) { missingParts.push('duration'); }
        if (needsDueDate) { missingParts.push('due date'); }

        const descriptionPart = task.description ? `\nDescription: ${task.description}` : '';
        const duePart = formatDueDate(task.due_date);
        const durationPart = Number.isFinite((task as any).estimated_duration_minutes) ? String((task as any).estimated_duration_minutes) : 'none';

        const prompt = `Help me schedule this task on my calendar. Ask me conversational clarifying questions to fill any missing values and then summarize the final values. After that, suggest one tiny micro-step to help me begin.\n\nTask details:\n- Title: ${task.title}${descriptionPart}\n- Current due date: ${duePart}\n- Estimated duration (minutes): ${durationPart}\n\nMissing: ${missingParts.join(', ')}.`;

        (navigation as any).navigate('AIChat', { initialMessage: prompt, taskTitle: task.title });
        return;
      }

      const result = await calendarAPI.createEvent({
        summary: task.title || 'Task',
        description: task.description || '',
        startTime: new Date().toISOString(),
        endTime: new Date(Date.now() + (((task as any).estimated_duration_minutes || 60) * 60 * 1000)).toISOString(),
      });
      
      const startTimeStr = result?.data?.scheduled_time;
      const startTime = startTimeStr ? new Date(startTimeStr) : null;
      const now = new Date();
      const tomorrow = new Date(now);
      tomorrow.setDate(tomorrow.getDate() + 1);
      const scheduledTime = startTime
        ? (startTime.toDateString() === now.toDateString()
            ? `today at ${startTime.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`
            : (startTime.toDateString() === tomorrow.toDateString()
                ? `tomorrow at ${startTime.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`
                : `${startTime.toLocaleDateString()} at ${startTime.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`))
        : 'today';

      Alert.alert('Success', `Task scheduled for ${scheduledTime}!`);
    } catch (error) {
      console.error('Error adding task to calendar:', error);
      Alert.alert('Error', 'Failed to add task to calendar');
    }
  }, [tasks, navigation]);

  const handleOpenQuickSchedule = useCallback((taskId: string, center: { x: number; y: number }) => {
    setQuickTaskId(taskId);
    setQuickAnchor(center);
    setQuickOpenedAt(Date.now());
    setQuickMenuVisible(true);
  }, []);

  const handleAIHelp = useCallback(async (task: Task) => {
    try {
      const descriptionPart = task.description ? `\nDescription: ${task.description}` : '';
      const duePart = formatDueDate(task.due_date);
      const durationPart = Number.isFinite((task as any).estimated_duration_minutes)
        ? String((task as any).estimated_duration_minutes)
        : 'none';
      const prompt = `Help me think through and schedule this task. Ask conversational clarifying questions if needed, then summarize final values and suggest one tiny micro-step.\n\nTask details:\n- Title: ${task.title}${descriptionPart}\n- Current due date: ${duePart}\n- Estimated duration (minutes): ${durationPart}`;
      (navigation as any).navigate('AIChat', { initialMessage: prompt, taskTitle: task.title });
    } catch {
      Alert.alert('Error', 'Failed to open AI assistant');
    }
  }, [navigation]);

  // Find available time slot for today's focus
  const findAvailableTimeSlot = (events: any[], taskDuration: number = 60, userPreferences?: any) => {
    const now = new Date();
    const today = now.toISOString().split('T')[0];
    const tomorrow = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1).toISOString().split('T')[0];
    const currentHour = now.getHours();

    // Use user preferences or fall back to defaults
    const workingHours = {
      start: userPreferences?.preferred_start_time
        ? parseInt(userPreferences.preferred_start_time.split(':')[0])
        : 9,
      end: userPreferences?.preferred_end_time
        ? parseInt(userPreferences.preferred_end_time.split(':')[0])
        : 18
    };

    // Use user buffer time preference
    const bufferMinutes = userPreferences?.buffer_time_minutes || 15;

    // Convert events to time slots
    const bookedSlots: { start: Date; end: Date }[] = [];
    if (events && Array.isArray(events)) {
      events.forEach(event => {
        let startTime, endTime;
        if (event.start_time) {
          startTime = new Date(event.start_time);
          endTime = new Date(event.end_time || event.start_time);
        } else if (event.start?.dateTime) {
          startTime = new Date(event.start.dateTime);
          endTime = new Date(event.end?.dateTime || event.start.dateTime);
        } else {
          return; // Skip events without time
        }

        // Only consider events for today and tomorrow (since we might schedule for tomorrow)
        const eventDate = startTime.toISOString().split('T')[0];
        if (eventDate === today || eventDate === tomorrow) {
          bookedSlots.push({ start: startTime, end: endTime });
        }
      });
    }

    // Sort booked slots by start time
    bookedSlots.sort((a, b) => a.start.getTime() - b.start.getTime());

    const currentTime = new Date();

    // Determine if we should schedule for today or tomorrow
    const scheduleForTomorrow = currentHour >= workingHours.end; // After 6 PM

    let targetDate: Date;
    let searchStart: number;

    if (scheduleForTomorrow) {
      // Schedule for tomorrow starting from 9 AM
      targetDate = new Date(currentTime.getFullYear(), currentTime.getMonth(), currentTime.getDate() + 1);
      searchStart = workingHours.start;
    } else {
      // Schedule for today starting from current hour or 9 AM, whichever is later
      targetDate = new Date(currentTime.getFullYear(), currentTime.getMonth(), currentTime.getDate());
      searchStart = Math.max(currentHour + 1, workingHours.start); // +1 to ensure future slot
    }

    // First, try working hours (9 AM - 6 PM)
    for (let hour = searchStart; hour < workingHours.end; hour++) {
      const slotStart = new Date(targetDate.getFullYear(), targetDate.getMonth(), targetDate.getDate(), hour, 0, 0, 0);
      const slotEnd = new Date(targetDate.getFullYear(), targetDate.getMonth(), targetDate.getDate(), hour, taskDuration, 0, 0);

      // Ensure slot is in the future (respecting user buffer time)
      const minFutureTime = new Date(currentTime.getTime() + bufferMinutes * 60 * 1000);
      if (slotStart <= minFutureTime) {
        continue; // Skip slots that are too soon
      }

      // Check if this slot conflicts with any booked events
      const conflicts = bookedSlots.some(booked => {
        return (slotStart < booked.end && slotEnd > booked.start);
      });

      if (!conflicts) {
        return { start: slotStart, end: slotEnd };
      }
    }

    // If no slots found in working hours, try after 6 PM (but only if scheduling for today)
    if (!scheduleForTomorrow) {
      for (let hour = workingHours.end; hour < 22; hour++) {
        const slotStart = new Date(targetDate.getFullYear(), targetDate.getMonth(), targetDate.getDate(), hour, 0, 0, 0);
        const slotEnd = new Date(targetDate.getFullYear(), targetDate.getMonth(), targetDate.getDate(), hour, taskDuration, 0, 0);

        // Ensure slot is in the future (respecting user buffer time)
        const minFutureTime = new Date(currentTime.getTime() + bufferMinutes * 60 * 1000);
        if (slotStart <= minFutureTime) {
          continue; // Skip slots that are too soon
        }

        const conflicts = bookedSlots.some(booked => {
          return (slotStart < booked.end && slotEnd > booked.start);
        });

        if (!conflicts) {
          return { start: slotStart, end: slotEnd };
        }
      }
    }

    // If still no slots found and we were scheduling for today, try tomorrow
    if (!scheduleForTomorrow) {
      const tomorrow = new Date(currentTime.getFullYear(), currentTime.getMonth(), currentTime.getDate() + 1);
      for (let hour = workingHours.start; hour < workingHours.end; hour++) {
        const slotStart = new Date(tomorrow.getFullYear(), tomorrow.getMonth(), tomorrow.getDate(), hour, 0, 0, 0);
        const slotEnd = new Date(tomorrow.getFullYear(), tomorrow.getMonth(), tomorrow.getDate(), hour, taskDuration, 0, 0);

        const conflicts = bookedSlots.some(booked => {
          return (slotStart < booked.end && slotEnd > booked.start);
        });

        if (!conflicts) {
          return { start: slotStart, end: slotEnd };
        }
      }
    }

    return null; // No available slots
  };

  const handleQuickSchedule = async (
    taskId: string,
    preset: 'today' | 'tomorrow' | 'this_week' | 'next_week'
  ) => {
    try {
      const base = new Date();
      const target = new Date(base);

      if (preset === 'today') {
        // Schedule for 2 hours from now
        target.setHours(target.getHours() + 2);
      } else if (preset === 'tomorrow') {
        target.setDate(target.getDate() + 1);
        target.setHours(9, 0, 0, 0); // 9 AM tomorrow
      } else if (preset === 'this_week') {
        const dow = target.getDay(); // 0 Sun .. 6 Sat
        const daysLeftThisWeek = 6 - dow; // up to Saturday
        const move = Math.min(2, Math.max(1, daysLeftThisWeek));
        target.setDate(target.getDate() + (daysLeftThisWeek > 0 ? move : 0));
        target.setHours(9, 0, 0, 0); // 9 AM
      } else if (preset === 'next_week') {
        const dow = target.getDay();
        const daysUntilNextMon = ((8 - dow) % 7) || 7; // next Monday
        target.setDate(target.getDate() + daysUntilNextMon);
        target.setHours(9, 0, 0, 0); // 9 AM
      }

      // Find the task to get its details for the calendar event
      const task = tasks.find(t => t.id === taskId);
      if (!task) {
        throw new Error('Task not found');
      }

      // Calculate end time (use estimated duration or default to 1 hour)
      const durationMinutes = task.estimated_duration_minutes || 60;
      const endTime = new Date(target.getTime() + durationMinutes * 60 * 1000);

      // Check if a calendar event already exists for this task
      const allEvents = await enhancedAPI.getEvents(500); // Get a large number to find existing events
      const existingEvent = allEvents.find((event: any) => event.task_id === taskId);

      let wasRescheduled = false;

      if (existingEvent) {
        // Update existing event (reschedule it)
        await enhancedAPI.updateEvent(existingEvent.id, {
          summary: task.title,
          description: task.description,
          startTime: target.toISOString(),
          endTime: endTime.toISOString(),
          isAllDay: false,
          taskId: taskId,
          eventType: 'task'
        });
        wasRescheduled = true;
      } else {
        // Create new calendar event linked to this task
        await enhancedAPI.scheduleTaskOnCalendar(taskId, {
          summary: task.title,
          description: task.description,
          startTime: target.toISOString(),
          endTime: endTime.toISOString(),
          isAllDay: false,
        });
      }

      // Format the scheduled date/time for the toast message
      const timeString = target.toLocaleTimeString([], {
        hour: 'numeric',
        minute: '2-digit',
        hour12: true
      });
      const dateString = target.toLocaleDateString([], {
        weekday: 'short',
        month: 'short',
        day: 'numeric'
      });

      const actionText = wasRescheduled ? 'Rescheduled' : 'Scheduled';
      setToastMessage(`${actionText}: ${dateString} at ${timeString}`);
      setToastCalendarEvent(true);
      setShowToast(true);
    } catch (error) {
      console.error('Quick schedule error:', error);
      Alert.alert('Error', 'Failed to schedule task on calendar');
    }
  };

  const handleToggleAutoSchedule = async (taskId: string, enabled: boolean) => {
    try {
      await autoSchedulingAPI.toggleTaskAutoScheduling(taskId, enabled);
      setTasks(prev => prev.map(task => 
        task.id === taskId ? { ...task, auto_schedule_enabled: enabled } : task
      ));
    } catch (error) {
      console.error('Error toggling auto-schedule:', error);
      Alert.alert('Error', 'Failed to update auto-schedule setting');
    }
  };

  const handleScheduleNow = async (_taskId: string) => {
    try {
      const task = tasks.find(t => t.id === _taskId);
      if (!task) {
        Alert.alert('Error', 'Task not found');
        return;
      }

      const needsDuration = !Number.isFinite((task as any).estimated_duration_minutes) || (task as any).estimated_duration_minutes! <= 0;
      const needsDueDate = !task.due_date;

      if (needsDuration || needsDueDate) {
        const missingParts: string[] = [];
        if (needsDuration) { missingParts.push('duration'); }
        if (needsDueDate) { missingParts.push('due date'); }

        const descriptionPart = task.description ? `\nDescription: ${task.description}` : '';
        const duePart = formatDueDate(task.due_date);
        const durationPart = Number.isFinite((task as any).estimated_duration_minutes) ? String((task as any).estimated_duration_minutes) : 'none';

        const prompt = `I want to schedule this task now. Please ask me conversationally to confirm or fill in any missing values needed for scheduling, then summarize the final values. Also propose one tiny micro-step to get started.\n\nTask details:\n- Title: ${task.title}${descriptionPart}\n- Current due date: ${duePart}\n- Estimated duration (minutes): ${durationPart}\n\nMissing: ${missingParts.join(', ')}.`;

        (navigation as any).navigate('AIChat', { initialMessage: prompt, taskTitle: task.title });
        return;
      }

      const result = await calendarAPI.createEvent({
        summary: task.title || 'Task',
        description: task.description || '',
        startTime: new Date().toISOString(),
        endTime: new Date(Date.now() + (((task as any).estimated_duration_minutes || 60) * 60 * 1000)).toISOString(),
      });
      
      const startTimeStr = result?.data?.scheduled_time;
      let formatted = '';
      if (startTimeStr) {
        const start = new Date(startTimeStr);
        const now = new Date();
        const tomorrow = new Date(now);
        tomorrow.setDate(tomorrow.getDate() + 1);
        if (start.toDateString() === now.toDateString()) {
          formatted = `today at ${start.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;
        } else if (start.toDateString() === tomorrow.toDateString()) {
          formatted = `tomorrow at ${start.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;
        } else {
          formatted = `${start.toLocaleDateString()} at ${start.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;
        }
      }

      setToastMessage(formatted ? `Scheduled for ${formatted}` : 'Task scheduled successfully!');
      setToastScheduledTime(startTimeStr);
      setToastCalendarEvent(true);
      setShowToast(true);
      
      await loadData();
    } catch (error) {
      console.error('Error scheduling task:', error);
      Alert.alert('Error', 'Failed to schedule task');
    }
  };

  const handleBulkAutoSchedule = async () => {
    try {
      setBulkScheduling(true);
      const result = await autoSchedulingAPI.autoScheduleTasks();
      
      // Show results in toast
      const successfulCount = result.successful;
      
      // Show success toast
      setToastMessage(`Successfully scheduled ${successfulCount} tasks`);
      setToastScheduledTime(undefined);
      setToastCalendarEvent(false);
      setShowToast(true);
      
      // Refresh tasks to get updated scheduling info
      await loadData();
    } catch (error) {
      console.error('Error bulk auto-scheduling:', error);
      Alert.alert('Error', 'Failed to auto-schedule tasks');
    } finally {
      setBulkScheduling(false);
    }
  };

  const handleAutoScheduleSettings = () => {
    setShowPreferencesModal(true);
  };

  const handlePreferencesSave = (_preferences: any) => {
    // Refresh data to reflect any changes
    loadData();
  };

  const handleCancelModal = () => {
    setShowModal(false);
    setEditingTask(undefined);
  };

  const _getActiveTasks = () => {
    return tasks.filter(task => task.status !== 'completed');
  };

  const getCompletedTasks = () => {
    return tasks.filter(task => task.status === 'completed');
  };

  const getFocusTask = useCallback((): Task | undefined => {
    return tasks.find(task => task.is_today_focus && task.status !== 'completed');
  }, [tasks]);

  const inboxTasks = useMemo(() => {
    return tasks.filter(task => !task.is_today_focus && task.status !== 'completed');
  }, [tasks]);

  const getAutoScheduledTasks = () => {
    return tasks.filter(task => task.auto_schedule_enabled);
  };

  const getScheduledTasks = () => {
    return tasks.filter(task => task.due_date && task.auto_schedule_enabled);
  };

  const renderEmptyState = () => (
    <View style={styles.emptyState}>
      <Text style={styles.emptyStateTitle}>No tasks yet</Text>
      <Text style={styles.emptyStateSubtitle}>
        Tap the + button to create your first task
      </Text>
    </View>
  );

  // Optimized task selection handler - async and non-blocking
  const handleTaskSelect = useCallback(async (task: Task) => {
    if ((task as any).is_today_focus) {
      setToastMessage("This task is already today's focus.");
      setToastCalendarEvent(false);
      setShowToast(true);
      setShowInbox(false);
      setSelectingFocus(false);
      return;
    }

    // Find the current focus task (if any) - we'll remove its calendar event after setting the new focus
    const currentFocusTask = tasks.find(t => (t as any).is_today_focus && t.id !== task.id);

    // Start the focus update process asynchronously (non-blocking)
    setSelectingFocus(false);
    setShowInbox(false);

    try {
      // Set the task as today's focus (immediate UI feedback)
      const updated = await tasksAPI.updateTask(task.id, { ...(undefined as any), is_today_focus: true } as any);

      // Update state optimistically for immediate UI feedback
      setTasks(prev => prev.map(t => t.id === updated.id ? updated : { ...t, is_today_focus: false }));

      // Show immediate feedback
      setToastMessage("Setting as Today's Focus...");
      setToastCalendarEvent(false);
      setShowToast(true);

      // Handle calendar operations asynchronously (non-blocking)
      const handleCalendarOperations = async () => {
        try {
          // Remove any existing focus task's calendar event
          if (currentFocusTask) {
            try {
              const focusEvents = await enhancedAPI.getEventsForTask(currentFocusTask.id);
              for (const event of focusEvents) {
                await enhancedAPI.deleteEvent(event.id);
              }
            } catch (removeError) {
              console.warn('Failed to remove previous focus task calendar event:', removeError);
            }
          }

          // Try to schedule the task on today's calendar
          let availableSlot: { start: Date; end: Date } | null = null;
          try {
            const now = new Date();
            const today = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
            const todaysEvents = await enhancedAPI.getEventsForDate(today);
            const taskDuration = (task as any).estimated_duration_minutes || 60;

            availableSlot = findAvailableTimeSlot(todaysEvents, taskDuration, userSchedulingPreferences);

            if (availableSlot) {
              try {
                await enhancedAPI.scheduleTaskOnCalendar(task.id, {
                  summary: task.title,
                  description: task.description,
                  startTime: availableSlot.start.toISOString(),
                  endTime: availableSlot.end.toISOString(),
                  isAllDay: false,
                });

                const timeString = availableSlot.start.toLocaleTimeString([], {
                  hour: 'numeric',
                  minute: '2-digit',
                  hour12: true
                });

                const isTomorrow = availableSlot.start.toDateString() !== new Date().toDateString();
                const dateLabel = isTomorrow ? 'tomorrow' : 'today';

                setToastMessage(`Set as Today's Focus & scheduled ${dateLabel} at ${timeString}.`);
              } catch (apiError) {
                console.error('Calendar API error:', apiError);
                setToastMessage("Set as Today's Focus (calendar scheduling failed).");
              }
            } else {
              setToastMessage("Set as Today's Focus (no available calendar slots).");
            }
          } catch (calendarError) {
            console.warn('Failed to schedule focus task on calendar:', calendarError);
            setToastMessage("Set as Today's Focus.");
          }

          setToastCalendarEvent(availableSlot ? true : false);
          setShowToast(true);
        } catch (error) {
          console.error('Calendar operations failed:', error);
          setToastMessage("Set as Today's Focus (some operations failed).");
          setToastCalendarEvent(false);
          setShowToast(true);
        }
      };

      // Run calendar operations in background without blocking UI
      handleCalendarOperations().catch(console.error);

    } catch (error) {
      console.error('Failed to set focus task:', error);
      Alert.alert('Error', 'Failed to set Today\'s Focus');
      // Reset UI state on error
      setShowInbox(true);
      setSelectingFocus(true);
    }
  }, [tasks, userSchedulingPreferences]);

  const renderTaskItem = useCallback(({ item }: { item: Task }) => (
    <TaskCard
      task={item}
      onPress={(task) => {
        if (selectingFocus) {
          handleTaskSelect(task);
        } else {
          handleTaskPress(task);
        }
      }}
      onDelete={handleDeleteTask}
      onToggleStatus={handleToggleStatus}
      onAddToCalendar={handleAddToCalendar}
      onToggleAutoSchedule={handleToggleAutoSchedule}
      onScheduleNow={handleScheduleNow}
      onOpenQuickSchedule={handleOpenQuickSchedule}
      onQuickSchedule={handleQuickSchedule}
      onAIHelp={handleAIHelp}
    />
  ), [selectingFocus, handleTaskSelect, handleTaskPress, handleDeleteTask, handleToggleStatus, handleAddToCalendar, handleToggleAutoSchedule, handleScheduleNow, handleOpenQuickSchedule, handleQuickSchedule, handleAIHelp]);

  const keyExtractor = useCallback((item: Task) => item.id, []);

  const _renderHeaderActions = (compact?: boolean) => (
    <View style={[styles.headerActions, compact && styles.headerRightRow]}>
      <View style={[styles.actionButtons, compact && { marginTop: 0 }]}>
        <TouchableOpacity
          style={[styles.settingsButton, compact && styles.headerCompactButton]}
          onPress={handleAutoScheduleSettings}
          activeOpacity={0.7}
        >
          <Icon name="gear" size={20} color={colors.text.secondary} />
        </TouchableOpacity>
        
        <HelpTarget helpId="tasks-bulk-auto-schedule">
          <TouchableOpacity
            style={[
              styles.bulkScheduleButton,
              compact && styles.bulkScheduleButtonCompact,
              bulkScheduling && styles.bulkScheduleButtonDisabled
            ]}
            onPress={handleBulkAutoSchedule}
            disabled={bulkScheduling}
            activeOpacity={0.7}
            accessibilityRole="button"
            accessibilityLabel={bulkScheduling ? 'Scheduling all tasks' : 'Auto-schedule all tasks'}
          >
            {bulkScheduling ? (
              <ActivityIndicator size="small" color={colors.secondary} />
            ) : (
              <Icon name="checklist" size={16} color={colors.secondary} />
            )}
            <Text style={[styles.bulkScheduleText, compact && { fontSize: typography.fontSize.sm }]}> 
              {bulkScheduling ? 'Scheduling...' : 'Auto-Schedule'}
            </Text>
          </TouchableOpacity>
        </HelpTarget>
      </View>
    </View>
  );

  // End-of-day prompt logic: once per day if focus exists and is not completed
  useEffect(() => {
    const maybePromptEndOfDay = async () => {
      eodLog('maybePromptEndOfDay invoked', { loading });
      if (loading) {return;}
      const focus = getFocusTask();
      eodLog('focus task check', { hasFocus: !!focus, status: focus?.status, id: focus?.id, title: focus?.title, due_date: (focus as any)?.due_date });
      if (!focus) {return;}
      const todayStr = new Date().toISOString().slice(0, 10);
      try {
        const lastPrompt = await AsyncStorage.getItem('lastEODPromptDate');
        eodLog('storage check', { lastPrompt, todayStr });
        if (lastPrompt === todayStr) {return;}
        if (focus.status !== 'completed') {
          // prevent re-open if already visible
          if (showEodPrompt) { eodLog('prompt already visible, skipping re-open'); return; }
          eodFocusIdRef.current = focus.id;
          eodLog('showing EOD prompt (capture focus id)', { id: focus.id });
          setShowEodPrompt(true);
        }
      } catch {}
    };
    maybePromptEndOfDay();

  }, [loading, getFocusTask, showEodPrompt]);

  const markEodPrompted = async () => {
    const todayStr = new Date().toISOString().slice(0, 10);
    try {
      eodLog('markEodPrompted -> set lastEODPromptDate', { todayStr });
      await AsyncStorage.setItem('lastEODPromptDate', todayStr);
    } catch (err) {
      eodLog('markEodPrompted error', err);
    }
  };

  const handleFocusDone = useCallback(async (task: Task) => {
    try {
      // Update task status immediately for responsive UI
      const updated = await tasksAPI.updateTask(task.id, { status: 'completed' });
      setTasks(prev => prev.map(t => t.id === task.id ? updated : t));
      setToastMessage('Great job! Focus task completed.');
      setToastCalendarEvent(false);
      setShowToast(true);

      if (task.is_today_focus && momentumEnabled) {
        try {
          // Get next focus task
          const next = await tasksAPI.focusNext({
            current_task_id: task.id,
            travel_preference: travelPreference,
            exclude_ids: [],
          });

          // Update state optimistically
          setTasks(prev => {
            const mapped = prev.map(t => {
              if (t.id === task.id) { return { ...t, is_today_focus: false }; }
              if (t.id === next.id) { return next as any; }
              return t;
            });
            if (!mapped.find(t => t.id === next.id)) {
              return [next as any, ...mapped];
            }
            return mapped;
          });

          // Handle calendar operations asynchronously (non-blocking)
          const handleMomentumCalendarOperations = async () => {
            try {
              // Remove the completed task's calendar event
              try {
                const completedEvents = await enhancedAPI.getEventsForTask(task.id);
                for (const event of completedEvents) {
                  await enhancedAPI.deleteEvent(event.id);
                }
              } catch (removeError) {
                console.warn('Failed to remove completed focus task calendar event:', removeError);
              }

              // Schedule the new focus task to calendar
              try {
                const today = new Date().toISOString().split('T')[0];
                const todaysEvents = await enhancedAPI.getEventsForDate(today);
                const taskDuration = (next as any).estimated_duration_minutes || 60;

                const availableSlot = findAvailableTimeSlot(todaysEvents, taskDuration, userSchedulingPreferences);

                if (availableSlot) {
                  await enhancedAPI.scheduleTaskOnCalendar(next.id, {
                    summary: next.title,
                    description: next.description,
                    startTime: availableSlot.start.toISOString(),
                    endTime: availableSlot.end.toISOString(),
                    isAllDay: false,
                  });

                  const timeString = availableSlot.start.toLocaleTimeString([], {
                    hour: 'numeric',
                    minute: '2-digit',
                    hour12: true
                  });

                  const isTomorrow = availableSlot.start.toDateString() !== new Date().toDateString();
                  const dateLabel = isTomorrow ? 'tomorrow' : 'today';
                  setToastMessage(`Next up: ${next.title} (scheduled ${dateLabel} at ${timeString})`);
                  setToastCalendarEvent(true);
                } else {
                  setToastMessage(`Next up: ${next.title} (no available calendar slots)`);
                  setToastCalendarEvent(false);
                }
              } catch (calendarError) {
                console.warn('Failed to schedule next focus task on calendar:', calendarError);
                setToastMessage(`Next up: ${next.title}`);
                setToastCalendarEvent(false);
              }

              setShowToast(true);
            } catch (error) {
              console.error('Momentum calendar operations failed:', error);
              setToastMessage(`Next up: ${next.title}`);
              setToastCalendarEvent(false);
              setShowToast(true);
            }
          };

          // Run calendar operations in background
          handleMomentumCalendarOperations().catch(console.error);

        } catch (err: any) {
          if (err?.code === 404) {
            setToastMessage("Great work, you've cleared all your tasks!");
            setToastCalendarEvent(false);
            setShowToast(true);
          } else {
            console.error('Momentum mode error:', err);
            setToastMessage('Great job! Focus task completed.');
            setToastCalendarEvent(false);
            setShowToast(true);
          }
        }
      }
    } catch {
      Alert.alert('Error', 'Failed to complete focus task');
    }
  }, [momentumEnabled, travelPreference, userSchedulingPreferences]);

  const handleEodMarkDone = useCallback(async () => {
    if (eodActionInFlightRef.current) { eodLog('handleEodMarkDone ignored: action in flight'); return; }
    eodActionInFlightRef.current = true;
    const focus = tasks.find(t => t.id === eodFocusIdRef.current) || getFocusTask();
    eodLog('handleEodMarkDone tapped', { hasFocus: !!focus, capturedId: eodFocusIdRef.current, id: focus?.id, title: focus?.title });
    if (!focus) { 
      setShowEodPrompt(false);
      await markEodPrompted();
      eodActionInFlightRef.current = false; 
      return; 
    }
    try {
      await handleFocusDone(focus);
      setShowEodPrompt(false);
      await markEodPrompted();
      eodLog('handleEodMarkDone success');
    } catch (err) {
      eodLog('handleEodMarkDone error', err);
    } finally {
      eodFocusIdRef.current = undefined;
      eodActionInFlightRef.current = false;
    }
  }, [tasks, getFocusTask, handleFocusDone]);

  const handleEodRollover = useCallback(async () => {
    if (eodActionInFlightRef.current) { eodLog('handleEodRollover ignored: action in flight'); return; }
    eodActionInFlightRef.current = true;
    const focus = tasks.find(t => t.id === eodFocusIdRef.current) || getFocusTask();
    eodLog('handleEodRollover tapped', { hasFocus: !!focus, capturedId: eodFocusIdRef.current, id: focus?.id, title: focus?.title, prev_due: (focus as any)?.due_date });
    if (!focus) { 
      // even if focus vanished, mark prompted so the modal doesn't re-open
      await markEodPrompted();
      setShowEodPrompt(false); 
      eodActionInFlightRef.current = false; 
      return; 
    }
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    const yyyy = tomorrow.getFullYear();
    const mm = String(tomorrow.getMonth() + 1).padStart(2, '0');
    const dd = String(tomorrow.getDate()).padStart(2, '0');

    // Mark as prompted FIRST to prevent race condition
    await markEodPrompted();

    try {
      eodLog('updating task due_date -> tomorrow', { taskId: focus.id, date: `${yyyy}-${mm}-${dd}` });
      const updated = await tasksAPI.updateTask(focus.id, { due_date: `${yyyy}-${mm}-${dd}` });
      setTasks(prev => prev.map(t => t.id === focus.id ? updated : t));
      eodLog('update success, task updated', { updated_due: (updated as any)?.due_date });
      setToastMessage('Rolled over to tomorrow.');
      setToastCalendarEvent(false);
      setShowToast(true);
    } catch {
      eodLog('update failed');
      Alert.alert('Error', 'Failed to roll over task');
    }
    setShowEodPrompt(false);
    eodFocusIdRef.current = undefined;
    eodActionInFlightRef.current = false;
  }, [tasks, getFocusTask, markEodPrompted]);

  const handleEodChooseNew = useCallback(async () => {
    if (eodActionInFlightRef.current) { eodLog('handleEodChooseNew ignored: action in flight'); return; }
    eodActionInFlightRef.current = true;
    eodLog('handleEodChooseNew tapped');
    try {
      setShowEodPrompt(false);
      await markEodPrompted();
      navigation.navigate('BrainDump');
      eodLog('handleEodChooseNew success');
    } catch (err) {
      eodLog('handleEodChooseNew error', err);
    } finally {
      eodActionInFlightRef.current = false;
    }
  }, [navigation, markEodPrompted]);

  useEffect(() => {
    eodLog('showEodPrompt state changed', { visible: showEodPrompt });
  }, [showEodPrompt]);

  const _handleFocusRollover = async (task: Task) => {
    try {
      const tomorrow = new Date();
      tomorrow.setDate(tomorrow.getDate() + 1);
      const yyyy = tomorrow.getFullYear();
      const mm = String(tomorrow.getMonth() + 1).padStart(2, '0');
      const dd = String(tomorrow.getDate()).padStart(2, '0');
      const updated = await tasksAPI.updateTask(task.id, { due_date: `${yyyy}-${mm}-${dd}` });
      setTasks(prev => prev.map(t => t.id === task.id ? updated : t));
      setToastMessage('Rolled over to tomorrow.');
      setToastCalendarEvent(false);
      setShowToast(true);
    } catch {
      Alert.alert('Error', 'Failed to roll over task');
    }
  };

  const handleChangeFocus = () => {
    // Let user pick a new focus from Inbox directly
    setShowInbox(true);
    setSelectingFocus(true);
    setToastMessage("Select a task from your Inbox to set as Today's Focus.");
    setToastCalendarEvent(false);
    setShowToast(true);
  };

  const persistMomentumSettings = async (enabled: boolean, pref: 'allow_travel'|'home_only') => {
    try {
      await appPreferencesAPI.update({ momentum_mode_enabled: enabled, momentum_travel_preference: pref });
    } catch {}
  };

  const handleToggleMomentum = async () => {
    const next = !momentumEnabled;
    setMomentumEnabled(next);
    await persistMomentumSettings(next, travelPreference);
  };

  const handleToggleTravelPref = async () => {
    const next = travelPreference === 'allow_travel' ? 'home_only' : 'allow_travel';
    setTravelPreference(next);
    await persistMomentumSettings(momentumEnabled, next);
  };

  const handleFocusSkip = useCallback(async () => {
    const focus = getFocusTask();
    if (!focus) { return; }

    try {
      // Get next focus task
      const next = await tasksAPI.focusNext({
        current_task_id: focus.id,
        travel_preference: travelPreference,
        exclude_ids: [focus.id],
      });

      // Update state optimistically
      setTasks(prev => {
        const mapped = prev.map(t => {
          if (t.id === focus.id) { return { ...t, is_today_focus: false }; }
          if (t.id === next.id) { return next as any; }
          return t;
        });
        if (!mapped.find(t => t.id === next.id)) {
          return [next as any, ...mapped];
        }
        return mapped;
      });

      // Handle calendar operations asynchronously (non-blocking)
      const handleSkipCalendarOperations = async () => {
        try {
          // Remove the current focus task's calendar event
          try {
            const currentEvents = await enhancedAPI.getEventsForTask(focus.id);
            for (const event of currentEvents) {
              await enhancedAPI.deleteEvent(event.id);
            }
          } catch (removeError) {
            console.warn('Failed to remove current focus task calendar event:', removeError);
          }

          // Schedule the new focus task to calendar
          try {
            const today = new Date().toISOString().split('T')[0];
            const todaysEvents = await enhancedAPI.getEventsForDate(today);
            const taskDuration = (next as any).estimated_duration_minutes || 60;

            const availableSlot = findAvailableTimeSlot(todaysEvents, taskDuration, userSchedulingPreferences);

            if (availableSlot) {
              await enhancedAPI.scheduleTaskOnCalendar(next.id, {
                summary: next.title,
                description: next.description,
                startTime: availableSlot.start.toISOString(),
                endTime: availableSlot.end.toISOString(),
                isAllDay: false,
              });

              const timeString = availableSlot.start.toLocaleTimeString([], {
                hour: 'numeric',
                minute: '2-digit',
                hour12: true
              });

              const isTomorrow = availableSlot.start.toDateString() !== new Date().toDateString();
              const dateLabel = isTomorrow ? 'tomorrow' : 'today';
              setToastMessage(`Next up: ${next.title} (scheduled ${dateLabel} at ${timeString})`);
              setToastCalendarEvent(true);
            } else {
              setToastMessage(`Next up: ${next.title} (no available calendar slots)`);
              setToastCalendarEvent(false);
            }
          } catch (calendarError) {
            console.warn('Failed to schedule next focus task on calendar:', calendarError);
            setToastMessage(`Next up: ${next.title}`);
            setToastCalendarEvent(false);
          }

          setShowToast(true);
        } catch (error) {
          console.error('Skip calendar operations failed:', error);
          setToastMessage(`Next up: ${next.title}`);
          setToastCalendarEvent(false);
          setShowToast(true);
        }
      };

      // Run calendar operations in background
      handleSkipCalendarOperations().catch(console.error);

    } catch (err: any) {
      if (err?.code === 404) {
        setToastMessage('No other tasks match your criteria.');
        setToastCalendarEvent(false);
        setShowToast(true);
      } else {
        Alert.alert('Error', 'Failed to get next focus task');
      }
    }
  }, [travelPreference, userSchedulingPreferences]);

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color={colors.primary} />
        <Text style={styles.loadingText}>Loading tasks...</Text>
      </View>
    );
  }

  return (
    <HelpScope scope="tasks">
    <SafeAreaView style={styles.safeArea} edges={['top','left','right']}>
    <View style={styles.container}>
      <ScreenHeader title="Tasks" rightActions={(<HelpIcon />)} withDivider />
      <View style={styles.dashboardContainer}>
        <View style={styles.dashboardRow}>
          <HelpTarget helpId="tasks-header-summary" style={{ flex: 1 }}>
            <Text style={styles.dashboardText}>
              {getAutoScheduledTasks().length} auto-scheduled • {getScheduledTasks().length} scheduled • {tasks.length} tasks
            </Text>
          </HelpTarget>
          <View style={styles.dashboardActions}>
            <TouchableOpacity
              style={[styles.settingsButton, styles.headerCompactButton]}
              onPress={handleAutoScheduleSettings}
              activeOpacity={0.7}
              accessibilityLabel="Auto-scheduling settings"
            >
              <Icon name="gear" size={20} color={colors.text.secondary} />
            </TouchableOpacity>
            <HelpTarget helpId="tasks-bulk-auto-schedule">
              <TouchableOpacity
                style={[
                  styles.bulkScheduleButton,
                  styles.bulkScheduleButtonCompact,
                  bulkScheduling && styles.bulkScheduleButtonDisabled
                ]}
                onPress={handleBulkAutoSchedule}
                disabled={bulkScheduling}
                activeOpacity={0.7}
                accessibilityRole="button"
                accessibilityLabel={bulkScheduling ? 'Scheduling all tasks' : 'Auto-schedule all tasks'}
              >
                {bulkScheduling ? (
                  <ActivityIndicator size="small" color={colors.secondary} />
                ) : (
                  <Icon name="checklist" size={16} color={colors.secondary} />
                )}
                <Text style={[styles.bulkScheduleText, { fontSize: typography.fontSize.sm }]}>
                  {bulkScheduling ? 'Scheduling...' : 'Auto-Schedule'}
                </Text>
              </TouchableOpacity>
            </HelpTarget>
          </View>
        </View>
        {/* Today's Focus Card */}
        {(() => {
          const focus = getFocusTask();
          const inboxCount = inboxTasks.length;
          return (
            <View>
              <View style={styles.focusHeaderRow}>
                <Text style={styles.focusTitle}>Today's Focus</Text>
                <View style={styles.focusHeaderControls}>
                  {/* Momentum toggle placed next to Inbox; icon-only on compact */}
                  <HelpTarget helpId="tasks-momentum-toggle">
                    <TouchableOpacity
                      testID="momentumToggle"
                      style={[styles.momentumToggle, momentumEnabled && styles.momentumToggleOn, isCompact && styles.compactBtn]}
                      onPress={handleToggleMomentum}
                      activeOpacity={0.7}
                      accessibilityLabel={momentumEnabled ? 'Momentum On' : 'Momentum Off'}
                    >
                      <Icon name="zap" size={16} color={momentumEnabled ? colors.secondary : colors.text.secondary} />
                    </TouchableOpacity>
                  </HelpTarget>

                  <HelpTarget helpId="tasks-travel-toggle">
                    <TouchableOpacity
                      testID="travelPrefButton"
                      style={[styles.travelPrefButton, isCompact && styles.compactBtn]}
                      onPress={handleToggleTravelPref}
                      activeOpacity={0.7}
                      accessibilityLabel={travelPreference === 'home_only' ? 'Home Only' : 'Allow Travel'}
                    >
                      <Icon name={travelPreference === 'home_only' ? 'home' : 'globe'} size={16} color={colors.text.secondary} />
                    </TouchableOpacity>
                  </HelpTarget>

                  <HelpTarget helpId="tasks-inbox-toggle">
                    <TouchableOpacity testID="inboxToggle" style={styles.inboxButton} onPress={() => { setShowInbox(!showInbox); setSelectingFocus(false); }}>
                      <Icon name="inbox" size={14} color={colors.text.primary} />
                      <Text style={styles.inboxText}>Inbox{inboxCount > 0 ? ` (${inboxCount})` : ''}</Text>
                      <Icon name={showInbox ? 'chevron-up' : 'chevron-down'} size={14} color={colors.text.primary} />
                    </TouchableOpacity>
                  </HelpTarget>
                </View>
              </View>
              {focus ? (
                <View style={styles.focusCard}>
                  <Text style={styles.focusTaskTitle}>{focus.title}</Text>
                  <View style={styles.focusBadges}>
                    {!!focus.category && (
                      <View style={styles.badge}><Text style={styles.badgeText}>{focus.category}</Text></View>
                    )}
                    <View style={[styles.badge, styles[focus.priority]]}><Text style={[styles.badgeText, styles.badgeTextDark]}>{focus.priority}</Text></View>
                  </View>
                  <View style={styles.focusActionsRow}>
                    <HelpTarget helpId="tasks-focus-complete">
                      <TouchableOpacity testID="completeFocusButton" style={styles.focusIconBtn} onPress={() => handleFocusDone(focus)}>
                        <Icon name="check" size={22} color={colors.text.primary} />
                      </TouchableOpacity>
                    </HelpTarget>
                    {momentumEnabled && (
                      <HelpTarget helpId="tasks-focus-skip">
                        <TouchableOpacity testID="skipFocusButton" style={styles.focusIconBtn} onPress={handleFocusSkip}>
                          <Icon name="arrow-right" size={22} color={colors.text.primary} />
                        </TouchableOpacity>
                      </HelpTarget>
                    )}
                    <HelpTarget helpId="tasks-focus-change">
                      <TouchableOpacity style={styles.focusIconBtn} onPress={handleChangeFocus}>
                        <Icon name="arrow-switch" size={22} color={colors.text.primary} />
                      </TouchableOpacity>
                    </HelpTarget>
                  </View>
                </View>
              ) : (
                <TouchableOpacity style={styles.focusCard} onPress={handleChangeFocus}>
                  <Text style={styles.focusTaskTitle}>No focus set</Text>
                  <Text style={styles.badgeText}>Set Today’s Focus to keep things simple.</Text>
                </TouchableOpacity>
              )}
            </View>
          );
        })()}
      </View>

      <LazyList
        data={showInbox ? inboxTasks : []}
        renderItem={renderTaskItem}
        keyExtractor={keyExtractor}
        contentContainerStyle={styles.listContainer}
        showsVerticalScrollIndicator={false}
        onRefresh={handleRefresh}
        refreshing={refreshing}
        emptyComponent={showInbox ? renderEmptyState : () => null}
        initialLoadSize={20}
        loadMoreSize={10}
        extraFooterComponent={() => {
          if (!showInbox) {return null;}
          const completedTasks = getCompletedTasks();
          if (completedTasks.length === 0) {return null;}
          
          return (
            <View style={styles.completedSection}>
              <Text style={styles.completedSectionTitle}>Completed</Text>
              {completedTasks.slice(0, 10).map(task => (
                <CompletedTaskCard
                  key={task.id}
                  task={task}
                  onResetStatus={handleResetCompletedTask}
                />
              ))}
              {completedTasks.length > 10 && (
                <TouchableOpacity
                  onPress={() => navigation.navigate('CompletedTasks')}
                  accessibilityRole="button"
                  accessibilityLabel="View all completed tasks"
                  style={styles.showAllCompletedButton}
                >
                  <Text style={styles.showAllCompletedText}>Show all completed…</Text>
                </TouchableOpacity>
              )}
            </View>
          );
        }}
      />

      {/* Floating Action Button */}
      <HelpTarget helpId="tasks-fab-add">
        <TouchableOpacity
          style={styles.fab}
          onPress={handleCreateTask}
          activeOpacity={0.8}
        >
          <Text style={styles.fabText}>+</Text>
        </TouchableOpacity>
      </HelpTarget>

      
      {/* Task Form Modal */}
      <Modal
        visible={showModal}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={handleCancelModal}
      >
        <TaskForm
          task={editingTask}
          goals={goals}
          onSave={handleSaveTask}
          onCancel={handleCancelModal}
          loading={saving}
          stickyFooter
        />
      </Modal>

      {/* Quick Schedule Radial overlay */}
      <QuickScheduleRadial
        visible={quickMenuVisible}
        center={quickAnchor}
        openTimestamp={quickOpenedAt}
        onSelect={async (preset) => {
          setQuickMenuVisible(false);
          if (quickTaskId) {
            await handleQuickSchedule(quickTaskId, preset);
          }
        }}
        onClose={() => setQuickMenuVisible(false)}
      />

      {/* Auto-Scheduling Preferences Modal */}
      <AutoSchedulingPreferencesModal
        visible={showPreferencesModal}
        onClose={() => setShowPreferencesModal(false)}
        onSave={handlePreferencesSave}
      />

      {/* End-of-day prompt modal */}
      <Modal
        visible={showEodPrompt}
        animationType="fade"
        transparent
        onRequestClose={() => setShowEodPrompt(false)}
      >
        <View style={styles.eodOverlay}>
          <View style={styles.eodCard}>
            <Text style={styles.eodTitle}>How did today’s focus go?</Text>
            <Text style={styles.eodSubtitle}>No pressure—want to mark it done, roll it over to tomorrow, or choose something new?</Text>
            {(() => {
              const focus = getFocusTask();
              if (!focus) {return null;}
              return (
                <View style={[styles.focusCard, { marginTop: spacing.sm }]}> 
                  <Text style={styles.focusTaskTitle}>{focus.title}</Text>
                  <View style={styles.focusBadges}>
                    {!!focus.category && (
                      <View style={styles.badge}><Text style={styles.badgeText}>{focus.category}</Text></View>
                    )}
                    <View style={[styles.badge, styles[focus.priority]]}><Text style={[styles.badgeText, styles.badgeTextDark]}>{focus.priority}</Text></View>
                  </View>
                </View>
              );
            })()}
            <View style={styles.eodActionsRow}>
              <TouchableOpacity style={[styles.eodBtn, styles.eodPrimary]} onPress={handleEodMarkDone}>
                <Icon name="check" size={16} color={colors.secondary} />
                <Text style={styles.eodBtnText}>Mark done</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.eodBtn, styles.eodPrimary]} onPress={handleEodRollover}>
                <Icon name="clock" size={16} color={colors.secondary} />
                <Text style={styles.eodBtnText}>Roll over</Text>
              </TouchableOpacity>
            </View>
            <TouchableOpacity style={styles.eodSecondary} onPress={handleEodChooseNew}>
              <Text style={styles.eodSecondaryText}>Choose a new focus</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* Success Toast */}
      <SuccessToast
        visible={showToast}
        message={toastMessage}
        scheduledTime={toastScheduledTime}
        calendarEventCreated={toastCalendarEvent}
        onClose={() => setShowToast(false)}
        duration={5000}
      />
    </View>
    </SafeAreaView>
    </HelpScope>
  );
};

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: colors.background.primary,
  },
  container: {
    flex: 1,
    backgroundColor: colors.background.surface,
  },
  header: {
    padding: spacing.md,
    paddingTop: spacing.lg,
    backgroundColor: colors.background.primary,
    borderBottomWidth: 1,
    borderBottomColor: colors.border.light,
  },
  title: {
    fontSize: typography.fontSize['3xl'],
    fontWeight: typography.fontWeight.bold as any,
    color: colors.text.primary,
    marginBottom: spacing.xs,
  },
  subtitle: {
    fontSize: typography.fontSize.sm,
    color: colors.text.secondary,
    marginBottom: spacing.md,
  },
  headerActions: {
    marginTop: spacing.sm,
  },
  headerRightRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  headerCompactButton: {
    padding: spacing.sm,
  },
  focusHeaderRow: {
    marginTop: spacing.md,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  focusHeaderControls: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  focusTitle: {
    fontSize: typography.fontSize.lg,
    fontWeight: typography.fontWeight.bold as any,
    color: colors.text.primary,
  },
  inboxButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
    borderWidth: 1,
    borderColor: colors.border.light,
    borderRadius: borderRadius.sm,
    backgroundColor: colors.background.surface,
  },
  inboxText: {
    color: colors.text.primary,
    fontSize: typography.fontSize.sm,
  },
  focusCard: {
    marginTop: spacing.sm,
    borderWidth: 1,
    borderColor: colors.border.light,
    backgroundColor: colors.secondary,
    borderRadius: borderRadius.md,
    padding: spacing.md,
    // Subtle drop shadow to emphasize Today's Focus
    shadowColor: colors.primary,
    shadowOffset: {
      width: 0,
      height: 4,
    },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 6,
  },
  focusTaskTitle: {
    color: colors.text.primary,
    fontSize: typography.fontSize.base,
    fontWeight: typography.fontWeight.semibold as any,
  },
  focusBadges: {
    flexDirection: 'row',
    marginTop: spacing.xs,
  },
  badge: {
    borderWidth: 1,
    borderColor: colors.border.light,
    borderRadius: 999,
    paddingVertical: 2,
    paddingHorizontal: 8,
    marginRight: spacing.xs,
  },
  badgeText: {
    color: colors.text.secondary,
    fontSize: typography.fontSize.xs,
  },
  badgeTextDark: { color: colors.text.primary },
  low: { backgroundColor: '#E8F5E9', borderColor: '#C8E6C9' },
  medium: { backgroundColor: '#FFFDE7', borderColor: '#FFF9C4' },
  high: { backgroundColor: '#FFEBEE', borderColor: '#FFCDD2' },
  focusActionsRow: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: spacing.sm,
    marginTop: spacing.sm,
  },
  focusBtn: {
    display: 'none',
  },
  focusBtnText: { },
  focusIconBtn: {
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    borderRadius: borderRadius.sm,
    backgroundColor: 'transparent',
    borderWidth: 0,
  },
  autoScheduleSummary: {
    marginBottom: spacing.sm,
  },
  summaryText: {
    fontSize: typography.fontSize.sm,
    color: colors.text.secondary,
  },
  actionButtons: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  bulkScheduleContainer: {
    flex: 1,
    marginLeft: spacing.sm,
  },
  momentumToggle: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    backgroundColor: colors.background.surface,
    borderRadius: borderRadius.sm,
    borderWidth: 1,
    borderColor: colors.border.light,
  },
  momentumToggleOn: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  momentumText: {
    fontSize: typography.fontSize.sm,
    color: colors.text.secondary,
  },
  momentumTextOn: {
    color: colors.secondary,
    fontWeight: typography.fontWeight.semibold as any,
  },
  travelPrefButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    backgroundColor: colors.background.surface,
    borderRadius: borderRadius.sm,
    borderWidth: 1,
    borderColor: colors.border.light,
    marginLeft: spacing.sm,
  },
  compactBtn: {
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
    gap: 0,
  },
  travelPrefText: {
    fontSize: typography.fontSize.sm,
    color: colors.text.secondary,
  },
  settingsButton: {
    padding: spacing.sm,
    borderRadius: borderRadius.sm,
    backgroundColor: colors.background.surface,
    borderWidth: 1,
    borderColor: colors.border.light,
  },
  bulkScheduleButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    backgroundColor: colors.primary,
    borderRadius: borderRadius.sm,
  },
  bulkScheduleButtonCompact: {
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
    gap: 0,
  },
  bulkScheduleButtonDisabled: {
    opacity: 0.6,
  },
  bulkScheduleText: {
    fontSize: typography.fontSize.sm,
    fontWeight: typography.fontWeight.medium as any,
    color: colors.secondary,
  },
  listContainer: {
    padding: spacing.md,
    paddingBottom: spacing['2xl'], // Extra space for FAB
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: colors.background.surface,
  },
  loadingText: {
    marginTop: spacing.md,
    fontSize: typography.fontSize.base,
    color: colors.text.secondary,
  },
  emptyState: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: spacing.xl,
  },
  emptyStateTitle: {
    fontSize: typography.fontSize.xl,
    fontWeight: typography.fontWeight.bold as any,
    color: colors.text.primary,
    marginBottom: spacing.sm,
    textAlign: 'center',
  },
  emptyStateSubtitle: {
    fontSize: typography.fontSize.base,
    color: colors.text.secondary,
    textAlign: 'center',
    lineHeight: typography.lineHeight.normal * typography.fontSize.base,
  },
  fab: {
    position: 'absolute',
    bottom: spacing.lg,
    right: spacing.lg,
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: colors.primary,
    justifyContent: 'center',
    alignItems: 'center',
    elevation: 8,
    shadowColor: colors.primary,
    shadowOffset: {
      width: 0,
      height: 4,
    },
    shadowOpacity: 0.3,
    shadowRadius: 8,
  },
  fabText: {
    fontSize: typography.fontSize['2xl'],
    fontWeight: typography.fontWeight.bold as any,
    color: colors.secondary,
  },
  completedSection: {
    marginTop: spacing.xl,
    paddingTop: spacing.lg,
    borderTopWidth: 1,
    borderTopColor: colors.border.light,
  },
  completedSectionTitle: {
    fontSize: typography.fontSize.lg,
    fontWeight: typography.fontWeight.semibold as any,
    color: colors.text.secondary,
    marginBottom: spacing.md,
    paddingHorizontal: spacing.md,
  },
  showAllCompletedButton: {
    padding: spacing.md,
    alignItems: 'center',
    marginTop: spacing.sm,
  },
  showAllCompletedText: {
    color: colors.text.secondary,
    fontSize: typography.fontSize.sm,
    fontWeight: typography.fontWeight.medium as any,
  },
  eodOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.4)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  eodCard: {
    width: '88%',
    backgroundColor: colors.background.surface,
    borderRadius: borderRadius.md,
    borderWidth: 1,
    borderColor: colors.border.light,
    padding: spacing.lg,
  },
  eodTitle: {
    color: colors.text.primary,
    fontSize: typography.fontSize.lg,
    fontWeight: typography.fontWeight.bold as any,
    marginBottom: spacing.xs,
  },
  eodSubtitle: {
    color: colors.text.secondary,
    fontSize: typography.fontSize.sm,
    marginBottom: spacing.md,
  },
  eodActionsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: spacing.sm,
  },
  eodBtn: {
    flex: 1,
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 6,
    paddingVertical: spacing.sm,
    borderRadius: borderRadius.sm,
  },
  eodPrimary: {
    backgroundColor: colors.primary,
  },
  eodBtnText: {
    color: colors.secondary,
    fontWeight: typography.fontWeight.bold as any,
  },
  eodSecondary: {
    marginTop: spacing.sm,
    paddingVertical: spacing.sm,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: colors.border.light,
    borderRadius: borderRadius.sm,
  },
  eodSecondaryText: {
    color: colors.text.primary,
    fontSize: typography.fontSize.sm,
    fontWeight: typography.fontWeight.medium as any,
  },
  dashboardContainer: {
    paddingHorizontal: spacing.md,
    paddingTop: spacing.xs,
    paddingBottom: spacing.xs,
  },
  dashboardRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  dashboardText: {
    fontSize: typography.fontSize.sm,
    color: colors.text.secondary,
  },
  dashboardActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
});

export default TasksScreen;
