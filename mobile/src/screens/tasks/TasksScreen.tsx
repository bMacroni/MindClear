import React, { useState, useEffect, useLayoutEffect, useCallback, useMemo, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Modal,
  Alert,
  ActivityIndicator,
  Animated,
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
import { taskRepository } from '../../repositories/TaskRepository';
import { goalRepository } from '../../repositories/GoalRepository';
import { syncService } from '../../services/SyncService';
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
import { OnboardingService } from '../../services/onboarding';
import { hapticFeedback } from '../../utils/hapticFeedback';
import withObservables from '@nozbe/watermelondb/react/withObservables';
import { useDatabase } from '../../contexts/DatabaseContext';
import { Q, Database } from '@nozbe/watermelondb';
import type { Observable } from 'rxjs';
import { showToast as showToastMessage } from '../../contexts/ToastContext';
import Task from '../../db/models/Task';
import Goal from '../../db/models/Goal';
import { extractCalendarEvents } from './utils/calendarEventUtils';
import { getLifecycleStatus as extractLifecycleStatus } from './utils/statusUtils';

// Internal props interface - what the component actually uses
interface InternalTasksScreenProps {
  tasks: Task[];
  goals: Goal[];
}

const TasksScreen: React.FC<InternalTasksScreenProps> = ({ tasks: observableTasks, goals: observableGoals }) => {
  const navigation = useNavigation<any>();
  const { setHelpContent, setIsHelpOverlayActive, setHelpScope } = useHelp();
  const _insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const isCompact = width < 1000; // Icon-only on phones; show labels only on very wide/tablet screens
  
  // Use observable tasks directly but also maintain local state for forcing updates
  // This is a workaround for WatermelonDB observable not emitting on field changes
  const [tasksVersion, setTasksVersion] = React.useState(0);
  const tasksFromObservable = observableTasks || [];
  const tasks = React.useMemo(() => {
    // Force a new array reference when tasksVersion changes
    return tasksFromObservable.map(t => t);
  }, [tasksFromObservable, tasksVersion]);
  const goals = observableGoals || [];
  
  const [loading, setLoading] = useState(false); // Start with false since we have observable data
  const [refreshing, setRefreshing] = useState(false);
  const [showModal, setShowModal] = useState(false);
  const [editingTask, setEditingTask] = useState<Task | undefined>();
  const [saving, setSaving] = useState(false);
  const savingRef = useRef(false); // Ref to track saving state for double-submission prevention
  const [bulkScheduling, setBulkScheduling] = useState(false);
  const [showPreferencesModal, setShowPreferencesModal] = useState(false);
  const [showToast, setShowToast] = useState(false);
  const [toastMessage, setToastMessage] = useState('');
  const [toastScheduledTime, setToastScheduledTime] = useState<string | undefined>();
  const [toastCalendarEvent, setToastCalendarEvent] = useState(false);
  const [showInbox, setShowInbox] = useState(false);
  const [selectingFocus, setSelectingFocus] = useState(false);

  // Helper function to extract lifecycle status from combined format
  // Status can be: lifecycle status ('not_started', 'in_progress', 'completed')
  // or combined format ('pending_update:<lifecycle_status>' or 'pending_create:<lifecycle_status>')
  // or sync status ('pending_create', 'pending_update', 'pending_delete', 'synced')
  const getLifecycleStatus = React.useCallback(extractLifecycleStatus, []);

  const [showEodPrompt, setShowEodPrompt] = useState(false);
  const [quickMenuVisible, setQuickMenuVisible] = useState(false);
  const [quickAnchor, setQuickAnchor] = useState<{ x: number; y: number } | undefined>(undefined);
  const [quickOpenedAt, setQuickOpenedAt] = useState<number | undefined>(undefined);
  const [quickTaskId, setQuickTaskId] = useState<string | undefined>(undefined);
  const [momentumEnabled, setMomentumEnabled] = useState<boolean>(false);
  const [showFirstFocusHelp, setShowFirstFocusHelp] = useState(false);
  const [firstFocusHelpDismissed, setFirstFocusHelpDismissed] = useState(false);
  const [completingTaskId, setCompletingTaskId] = useState<string | null>(null);
  const [animationCompleted, setAnimationCompleted] = useState(false);
  const [showGoldBorder, setShowGoldBorder] = useState(false);
  const taskAnimations = React.useRef<Map<string, Animated.Value>>(new Map()).current;
  const taskSlideAnimations = React.useRef<Map<string, Animated.Value>>(new Map()).current;
  const taskScaleAnimations = React.useRef<Map<string, Animated.Value>>(new Map()).current;
  
  // Refs for robust mount detection of Animated.View
  const animatedViewRef = useRef<any>(null);
  const mountResolverRef = useRef<(() => void) | null>(null);
  const isMountedRef = useRef<boolean>(false);
  
  // Ref to measure original focus card dimensions
  const focusCardRef = useRef<React.ElementRef<typeof View> | null>(null);
  const focusCardDimensions = useRef<{ width: number; height: number } | null>(null);
  
  // Helper to get or create animation values with stable references
  const getAnimationValues = React.useCallback((taskId: string) => {
    if (!taskAnimations.has(taskId)) {
      taskAnimations.set(taskId, new Animated.Value(1));
    }
    if (!taskSlideAnimations.has(taskId)) {
      taskSlideAnimations.set(taskId, new Animated.Value(0));
    }
    if (!taskScaleAnimations.has(taskId)) {
      taskScaleAnimations.set(taskId, new Animated.Value(1));
    }
    return {
      opacity: taskAnimations.get(taskId)!,
      translateX: taskSlideAnimations.get(taskId)!,
      scale: taskScaleAnimations.get(taskId)!,
    };
  }, []);
  
  // Detect when Animated.View is mounted and signal readiness
  useLayoutEffect(() => {
    if (!completingTaskId) {
      // Reset mount state when completingTaskId is cleared
      isMountedRef.current = false;
      mountResolverRef.current = null;
      animatedViewRef.current = null;
      return;
    }
    
    // Reset mount state for new completing task
    isMountedRef.current = false;
    
    // If the view ref is already set, signal mount immediately
    if (animatedViewRef.current) {
      isMountedRef.current = true;
      // Resolve any pending mount promise
      if (mountResolverRef.current) {
        mountResolverRef.current();
        mountResolverRef.current = null;
      }
    }
  }, [completingTaskId]);
  
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
    'tasks-focus-complete': 'Mark today\'s focus task as done.',
    'tasks-focus-skip': 'Skip this focus and we will pick the next one.',
    'tasks-focus-change': 'Manually choose a different task as Today\'s Focus.',
    'tasks-first-focus-help': 'Swipe right (or tap) to make this Today\'s Focus',
    'task-complete': 'Mark the task complete.',
    'task-schedule': 'Open quick scheduling options for this task.',
    'task-ai': 'Ask AI for help planning or breaking down this task.',
    'task-edit': 'Edit task details.',
    'task-delete': 'Delete this task.',
    'tasks-fab-add': 'Create a new task. You can add details like due date and duration.',
  }), []);

  const getFocusTask = useCallback((): Task | undefined => {
    return tasks.find(task => task.isTodayFocus && getLifecycleStatus(task.status) !== 'completed');
  }, [tasks]);

  const inboxTasks = useMemo(() => {
    return tasks.filter(task => !task.isTodayFocus && getLifecycleStatus(task.status) !== 'completed');
  }, [tasks]);

  useEffect(() => {
    loadData();
    loadSchedulingPreferences();
  }, []);

      // Track screen view
  useEffect(() => {
    analyticsService.trackScreenView('tasks', {
      taskCount: tasks.length,
      completedCount: tasks.filter(t => getLifecycleStatus(t.status) === 'completed').length,
      focusTaskCount: tasks.filter(t => t.isTodayFocus).length
    }).catch(error => {
      console.warn('Failed to track screen view analytics:', error);
    });
  }, [tasks]);

  // Auto refresh whenever the Tasks tab/screen gains focus (silent background refresh)
  useFocusEffect(
    React.useCallback(() => {
      // Set help scope for this screen and reset overlay when leaving
      try { setHelpScope('tasks'); } catch (e) { if (__DEV__) console.warn('setHelpScope failed:', e); }
      try { setHelpContent(getTasksHelpContent()); } catch (e) { if (__DEV__) console.warn('setHelpContent failed:', e); }
      // If user navigated with overlay ON from a previous screen, ensure tooltips will populate
      // by briefly toggling it off (state stays off due to blur reset anyway)
      try { setIsHelpOverlayActive(false); } catch (e) { if (__DEV__) console.warn('setIsHelpOverlayActive failed:', e); }
      
      // Check if we should show first focus help
      (async () => {
        try {
          const guidanceShown = await AsyncStorage.getItem('focusGuidanceShown');
          const helpDismissed = await AsyncStorage.getItem('firstFocusHelpDismissed');
          const focus = getFocusTask();
          
          // Show help if: guidance was shown, help not dismissed, no focus set, and inbox has tasks
          if (guidanceShown === 'true' && !helpDismissed && !focus && inboxTasks.length > 0) {
            setShowFirstFocusHelp(true);
            setFirstFocusHelpDismissed(false);
            // Open inbox to show tasks
            setShowInbox(true);
            // Do NOT activate help overlay - this prevents cycling through all help targets
            // The HelpTarget wrapper will still render for the first focus help without global overlay
          } else {
            setShowFirstFocusHelp(false);
            if (helpDismissed === 'true') {
              setFirstFocusHelpDismissed(true);
            }
          }
        } catch (error) {
          console.warn('Error checking first focus help conditions:', error);
        }
      })();
      
      // Avoid showing a spinner if we already have content; fetch fresh in background
      loadData({ silent: true });
      return () => {
        try { setIsHelpOverlayActive(false); } catch {}
      };
    }, [setHelpScope, setIsHelpOverlayActive, setHelpContent, getTasksHelpContent, getFocusTask, inboxTasks])
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

  const loadData = async (options?: { silent?: boolean; awaitSync?: boolean }) => {
    const silent = !!options?.silent;
    const awaitSync = !!options?.awaitSync;
    
    try {
      // Don't show loading spinner on initial mount since we have observable data
      // Only show loading for explicit user actions
      if (!silent && awaitSync) {
        setLoading(true);
      }

      // Load preferences first (fast, local operation)
      try {
        const prefs = await appPreferencesAPI.get();
        if (prefs && typeof prefs === 'object') {
          setMomentumEnabled((prefs as any)?.momentum_mode_enabled ?? false);
          setTravelPreference((prefs as any)?.momentum_travel_preference === 'home_only' ? 'home_only' : 'allow_travel');
        } else {
          // Default to false if prefs is invalid
          setMomentumEnabled(false);
          setTravelPreference('allow_travel');
        }
      } catch (error) {
        console.warn('Failed to load preferences:', error);
        // Default to false on error
        setMomentumEnabled(false);
        setTravelPreference('allow_travel');
      }

      // Trigger silent sync - await only if explicitly requested (e.g., manual refresh)
      // Otherwise, run in background to avoid blocking UI
      // The component uses WatermelonDB observables which will automatically update
      // when sync completes and writes to the local database
      const syncPromise = syncService.silentSync().catch((error) => {
        // Silent sync failure - don't show alerts to user
        console.warn('Silent sync failed:', error);
      });

      if (awaitSync) {
        // For manual refresh, await sync completion
        await syncPromise;
        if (!silent) {
          setLoading(false);
        }
      } else {
        // For normal load, don't block - sync runs in background
        // Since we're using WatermelonDB observables, the UI will update automatically
        setLoading(false);
      }
    } catch (error) {
      console.error('[TasksScreen] Error loading data:', error);
      if (!silent) {
        Alert.alert('Error', 'Failed to sync data');
      }
      setLoading(false);
    }
  };

  const handleRefresh = async () => {
    setRefreshing(true);
    try {
      // Trigger sync in background without awaiting
      // WatermelonDB observables will automatically update the UI when sync completes
      syncService.silentSync().catch((error) => {
        console.warn('[TasksScreen] Manual sync failed:', error);
        // Show toast notification for sync failures
        showToastMessage('error', 'Sync failed. Please try again.');
      });
      
      // Show refresh indicator for a brief moment to give user feedback
      // Then hide it - the data will update automatically via observables
      await new Promise(resolve => setTimeout(resolve, 500));
    } finally {
      setRefreshing(false);
    }
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


  // Helper function to convert WatermelonDB Task to TaskForm's expected format
  const convertTaskForTaskForm = (task: Task | undefined) => {
    if (!task) return undefined;
    return {
      id: task.id,
      title: task.title,
      description: task.description,
      priority: (task.priority as 'low' | 'medium' | 'high') || 'medium',
      status: getLifecycleStatus(task.status),
      due_date: task.dueDate?.toISOString(),
      category: task.category,
      goal_id: task.goalId,
      estimated_duration_minutes: task.estimatedDurationMinutes,
      auto_schedule_enabled: task.autoScheduleEnabled,
      weather_dependent: false, // Default value
      is_today_focus: task.isTodayFocus,
      location: task.location,
    };
  };

  // Helper function to convert WatermelonDB Task to TaskCard's expected format
  const convertTaskForTaskCard = (task: Task) => {
    return {
      id: task.id,
      title: task.title,
      description: task.description,
      priority: (task.priority as 'low' | 'medium' | 'high') || 'medium',
      status: getLifecycleStatus(task.status),
      due_date: task.dueDate?.toISOString(),
      category: task.category,
      goal: task.goal ? {
        id: task.goal.id,
        title: task.goal.title,
      } : undefined,
      auto_schedule_enabled: task.autoScheduleEnabled,
      weather_dependent: false, // Default value
      estimated_duration_minutes: task.estimatedDurationMinutes,
      is_today_focus: task.isTodayFocus,
      location: task.location,
    };
  };

  // Helper function to convert WatermelonDB Task data to API Task format
  const convertTaskDataToApiFormat = (taskData: Partial<Task>) => {
    const apiData: any = {};
    if (taskData.title !== undefined) apiData.title = taskData.title;
    if (taskData.description !== undefined) apiData.description = taskData.description;
    if (taskData.priority !== undefined) apiData.priority = taskData.priority;
    if (taskData.estimatedDurationMinutes !== undefined) apiData.estimated_duration_minutes = taskData.estimatedDurationMinutes;
    if (taskData.dueDate !== undefined) apiData.due_date = taskData.dueDate?.toISOString();
    if (taskData.goalId !== undefined) apiData.goal_id = taskData.goalId;
    // Only include is_today_focus if it's explicitly a boolean (not null or undefined)
    // Backend validation requires boolean or absent, not null
    if (typeof taskData.isTodayFocus === 'boolean') apiData.is_today_focus = taskData.isTodayFocus;
    if (taskData.status !== undefined) apiData.status = taskData.status;
    return apiData;
  };

  const handleSaveTask = useCallback(async (taskData: any) => {
    // Prevent double-submission: if already saving, ignore subsequent calls
    // Use ref instead of state to avoid dependency array issues and race conditions
    if (savingRef.current) {
      return;
    }
    
    try {
      savingRef.current = true;
      setSaving(true);
      
      // Convert TaskForm's snake_case format to repository's camelCase format
      const repositoryData: any = {
        title: taskData.title,
        description: taskData.description,
        priority: taskData.priority,
        estimatedDurationMinutes: taskData.estimated_duration_minutes,
        dueDate: taskData.due_date ? new Date(taskData.due_date) : undefined,
        goalId: taskData.goal_id,
        isTodayFocus: taskData.is_today_focus,
        status: taskData.status || 'not_started', // Lifecycle status
      };
      
      if (editingTask) {
        // Update existing task using repository (local-first)
        await taskRepository.updateTask(editingTask.id, repositoryData);
      } else {
        // Create new task using repository (local-first)
        await taskRepository.createTask(repositoryData);
      }
      
      // Background sync will happen automatically, no need for immediate sync
      // SyncService will pick up pending changes on next sync
      
      setShowModal(false);
      setEditingTask(undefined);
    } catch (error) {
      console.error('Error saving task:', error);
      Alert.alert('Error', 'Failed to save task');
    } finally {
      savingRef.current = false;
      setSaving(false);
    }
  }, [editingTask]);

  const handleDeleteTask = useCallback(async (taskId: string) => {
    try {
      await taskRepository.deleteTask(taskId);
      // Background sync will happen automatically
    } catch (error) {
      console.error('Error deleting task:', error);
      Alert.alert('Error', 'Failed to delete task');
    }
  }, []);

  const handleToggleStatus = useCallback(async (taskId: string, newStatus: 'not_started' | 'in_progress' | 'completed') => {
    try {
      // Update using repository (local-first)
      await taskRepository.updateTaskStatus(taskId, newStatus);
      
      // Force a small delay to allow WatermelonDB to process the update
      await new Promise<void>(resolve => setTimeout(resolve, 100));
      
      // Force a re-render by incrementing tasksVersion
      // This is a workaround for WatermelonDB observable not emitting on field changes
      // The observable should emit automatically, but it doesn't detect text field changes
      setTasksVersion(prev => prev + 1);
      
      // Give React a moment to process the state update
      await new Promise<void>(resolve => setTimeout(resolve, 50));
      
      // Background sync will happen automatically
      
      // Track analytics for completed tasks (don't await to avoid blocking)
      if (newStatus === 'completed') {
        const task = tasks.find(t => t.id === taskId);
        if (task) {
          analyticsService.trackTaskCompleted({
            taskId: task.id,
            taskTitle: task.title,
            priority: task.priority,
            hasLocation: !!task.location,
            hasEstimatedDuration: !!task.estimatedDurationMinutes,
            autoScheduleEnabled: task.autoScheduleEnabled ?? false,
            isTodayFocus: task.isTodayFocus
          }).catch(error => {
            console.warn('Failed to track task completion analytics:', error);
          });
        }
      }
    } catch (error) {
      console.error('[TasksScreen] Error updating task status:', error);
      Alert.alert('Error', 'Failed to update task status');
    }
  }, [tasks, getLifecycleStatus]);

  const handleResetCompletedTask = useCallback(async (taskId: string) => {
    try {
      // Update using repository (local-first)
      await taskRepository.updateTaskStatus(taskId, 'not_started');
      
      // Handle calendar event - remove any associated calendar events since task is no longer completed
      try {
        const eventsResponse = await enhancedAPI.getEventsForTask(taskId);
        const events = extractCalendarEvents(eventsResponse);
        for (const event of events) {
          const eventId = (event as any)?.id ?? (event as any)?.event_id ?? (event as any)?.eventId;
          if (!eventId) {
            continue;
          }
          await enhancedAPI.deleteEvent(eventId);
        }
      } catch (error) {
        console.warn('Failed to remove calendar event:', error);
      }
      
      // Force a UI refresh since WatermelonDB may not emit on status change
      setTasksVersion(prev => prev + 1);

      setToastMessage('Task marked as incomplete');
      setToastCalendarEvent(false);
      setShowToast(true);
    } catch (error) {
      console.error('Error resetting task status:', error);
      Alert.alert('Error', 'Failed to reset task status');
    }
  }, []);

  // Helper function to format due date for display
  const formatDueDate = (dueDate: Date | string | undefined): string => {
    if (!dueDate) return 'none';
    try {
      const date = dueDate instanceof Date ? dueDate : new Date(dueDate);
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

      const needsDuration = !Number.isFinite(task.estimatedDurationMinutes) || task.estimatedDurationMinutes! <= 0;
      const needsDueDate = !task.dueDate;

      if (needsDuration || needsDueDate) {
        const missingParts: string[] = [];
        if (needsDuration) { missingParts.push('duration'); }
        if (needsDueDate) { missingParts.push('due date'); }

        const descriptionPart = task.description ? `\nDescription: ${task.description}` : '';
        const duePart = formatDueDate(task.dueDate);
        const durationPart = Number.isFinite(task.estimatedDurationMinutes) ? String(task.estimatedDurationMinutes) : 'none';

        const prompt = `Help me schedule this task on my calendar. Ask me conversational clarifying questions to fill any missing values and then summarize the final values. After that, suggest one tiny micro-step to help me begin.\n\nTask details:\n- Title: ${task.title}${descriptionPart}\n- Current due date: ${duePart}\n- Estimated duration (minutes): ${durationPart}\n\nMissing: ${missingParts.join(', ')}.`;

        (navigation as any).navigate('AIChat', { initialMessage: prompt, taskTitle: task.title });
        return;
      }

      const result = await calendarAPI.createEvent({
        summary: task.title || 'Task',
        description: task.description || '',
        startTime: new Date().toISOString(),
        endTime: new Date(Date.now() + ((task.estimatedDurationMinutes || 60) * 60 * 1000)).toISOString(),
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
      const duePart = formatDueDate(task.dueDate);
      const durationPart = Number.isFinite(task.estimatedDurationMinutes)
        ? String(task.estimatedDurationMinutes)
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
      const durationMinutes = task.estimatedDurationMinutes || 60;
      const endTime = new Date(target.getTime() + durationMinutes * 60 * 1000);

      // Check if a calendar event already exists for this task
      const allEventsResponse = await enhancedAPI.getEvents(500); // Get a large number to find existing events
      const allEvents = extractCalendarEvents(allEventsResponse);
      const existingEvent = allEvents.find((event: any) => {
        if (!event) {
          return false;
        }
        const taskIdFromEvent = (event as any).task_id ?? (event as any).taskId;
        return taskIdFromEvent === taskId;
      });

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

      const needsDuration = !Number.isFinite(task.estimatedDurationMinutes) || task.estimatedDurationMinutes! <= 0;
      const needsDueDate = !task.dueDate;

      if (needsDuration || needsDueDate) {
        const missingParts: string[] = [];
        if (needsDuration) { missingParts.push('duration'); }
        if (needsDueDate) { missingParts.push('due date'); }

        const descriptionPart = task.description ? `\nDescription: ${task.description}` : '';
        const duePart = formatDueDate(task.dueDate);
        const durationPart = Number.isFinite(task.estimatedDurationMinutes) ? String(task.estimatedDurationMinutes) : 'none';

        const prompt = `I want to schedule this task now. Please ask me conversationally to confirm or fill in any missing values needed for scheduling, then summarize the final values. Also propose one tiny micro-step to get started.\n\nTask details:\n- Title: ${task.title}${descriptionPart}\n- Current due date: ${duePart}\n- Estimated duration (minutes): ${durationPart}\n\nMissing: ${missingParts.join(', ')}.`;

        (navigation as any).navigate('AIChat', { initialMessage: prompt, taskTitle: task.title });
        return;
      }

      const result = await calendarAPI.createEvent({
        summary: task.title || 'Task',
        description: task.description || '',
        startTime: new Date().toISOString(),
        endTime: new Date(Date.now() + ((task.estimatedDurationMinutes || 60) * 60 * 1000)).toISOString(),
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
    return tasks.filter(task => getLifecycleStatus(task.status) !== 'completed');
  };

  const getCompletedTasks = () => {
    return tasks.filter(task => getLifecycleStatus(task.status) === 'completed');
  };

  const getAutoScheduledTasks = () => {
    return tasks.filter(task => task.autoScheduleEnabled);
  };

  const getScheduledTasks = () => {
    return tasks.filter(task => task.dueDate && task.autoScheduleEnabled);
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
    if (task.isTodayFocus) {
      setToastMessage("This task is already today's focus.");
      setToastCalendarEvent(false);
      setShowToast(true);
      setShowInbox(false);
      setSelectingFocus(false);
      return;
    }

    // Find the current focus task (if any) - we'll remove its calendar event after setting the new focus
    const currentFocusTask = tasks.find(t => t.isTodayFocus && t.id !== task.id);

    // Start the focus update process asynchronously (non-blocking)
    setSelectingFocus(false);
    setShowInbox(false);

    try {
      // Set the task as today's focus using repository (local-first)
      await taskRepository.setTaskAsFocus(task.id);

      // Dismiss first focus help if it was showing
      if (showFirstFocusHelp && !firstFocusHelpDismissed) {
        setShowFirstFocusHelp(false);
        setFirstFocusHelpDismissed(true);
        setIsHelpOverlayActive(false);
        try {
          await AsyncStorage.setItem('firstFocusHelpDismissed', 'true');
        } catch (error) {
          console.warn('Failed to save first focus help dismissed flag:', error);
        }
      }

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
              const focusEventsResponse = await enhancedAPI.getEventsForTask(currentFocusTask.id);
              const focusEvents = extractCalendarEvents(focusEventsResponse);
              for (const event of focusEvents) {
                const eventId = (event as any)?.id ?? (event as any)?.event_id ?? (event as any)?.eventId;
                if (!eventId) {
                  continue;
                }
                await enhancedAPI.deleteEvent(eventId);
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
            const taskDuration = task.estimatedDurationMinutes || 60;

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
  }, [tasks, userSchedulingPreferences, showFirstFocusHelp, firstFocusHelpDismissed, setIsHelpOverlayActive]);

  const renderTaskItem = useCallback(({ item, index }: { item: Task; index: number }) => {
    const isFirstInboxTask = showFirstFocusHelp && !firstFocusHelpDismissed && index === 0 && !item.isTodayFocus;
    const taskCard = (
      <TaskCard
        task={convertTaskForTaskCard(item)}
        onPress={(task) => {
          // Find the original WatermelonDB Task by ID
          const originalTask = tasks.find(t => t.id === task.id);
          if (!originalTask) return;
          
          if (selectingFocus) {
            handleTaskSelect(originalTask);
          } else {
            handleTaskPress(originalTask);
          }
        }}
        onDelete={handleDeleteTask}
        onToggleStatus={handleToggleStatus}
        onAddToCalendar={handleAddToCalendar}
        onToggleAutoSchedule={handleToggleAutoSchedule}
        onScheduleNow={handleScheduleNow}
        onOpenQuickSchedule={handleOpenQuickSchedule}
        onQuickSchedule={handleQuickSchedule}
        onAIHelp={(task) => {
          // Find the original WatermelonDB Task by ID
          const originalTask = tasks.find(t => t.id === task.id);
          if (!originalTask) return;
          handleAIHelp(originalTask);
        }}
      />
    );

    // Wrap first inbox task with HelpTarget if showing first focus help
    if (isFirstInboxTask) {
      return (
        <HelpTarget helpId="tasks-first-focus-help">
          {taskCard}
        </HelpTarget>
      );
    }

    return taskCard;
  }, [selectingFocus, handleTaskSelect, handleTaskPress, handleDeleteTask, handleToggleStatus, handleAddToCalendar, handleToggleAutoSchedule, handleScheduleNow, handleOpenQuickSchedule, handleQuickSchedule, handleAIHelp, showFirstFocusHelp, firstFocusHelpDismissed, tasks]);

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
      if (loading) {return;}
      const focus = getFocusTask();
      if (!focus) {return;}
      const todayStr = new Date().toISOString().slice(0, 10);
      try {
        const lastPrompt = await AsyncStorage.getItem('lastEODPromptDate');
        if (lastPrompt === todayStr) {return;}
        if (getLifecycleStatus(focus.status) !== 'completed') {
          // prevent re-open if already visible
          if (showEodPrompt) { return; }
          eodFocusIdRef.current = focus.id;
          setShowEodPrompt(true);
        }
      } catch {}
    };
    maybePromptEndOfDay();

  }, [loading, getFocusTask, showEodPrompt]);

  const markEodPrompted = async () => {
    const todayStr = new Date().toISOString().slice(0, 10);
    try {
      await AsyncStorage.setItem('lastEODPromptDate', todayStr);
    } catch (err) {
      // Silent failure - not critical
    }
  };

  const handleFocusDone = useCallback(async (task: Task) => {
    // Reset state cleanup function
    const resetState = () => {
      setCompletingTaskId(null);
      setAnimationCompleted(false);
      setShowGoldBorder(false);
    };

    // Run animations in separate try-catch - errors here should not trigger DB failure Alert
    try {
      // Trigger haptic feedback immediately (wrap in try-catch for safety)
      try {
        hapticFeedback.heavy();
      } catch (hapticError) {
        console.warn('Haptic feedback failed:', hapticError);
        // Continue even if haptic fails
      }
      
      // Create animation values for task if not exists
      if (!taskAnimations.has(task.id)) {
        taskAnimations.set(task.id, new Animated.Value(1)); // Opacity starts at 1
      }
      if (!taskSlideAnimations.has(task.id)) {
        taskSlideAnimations.set(task.id, new Animated.Value(0)); // TranslateX starts at 0
      }
      if (!taskScaleAnimations.has(task.id)) {
        taskScaleAnimations.set(task.id, new Animated.Value(1)); // Scale starts at 1
      }
      const opacityAnim = taskAnimations.get(task.id)!;
      const slideAnim = taskSlideAnimations.get(task.id)!;
      const scaleAnim = taskScaleAnimations.get(task.id)!;
      
      // Set completing state FIRST so the Animated.View renders with the animation values
      setCompletingTaskId(task.id);
      setShowGoldBorder(false); // Reset border state
      
      // Wait for Animated.View to be mounted using robust mount detection
      if (!isMountedRef.current) {
        await new Promise<void>((resolve) => {
          mountResolverRef.current = resolve;
          // Fallback timeout to prevent infinite waiting (shouldn't be needed, but safety first)
          setTimeout(() => {
            if (mountResolverRef.current === resolve) {
              mountResolverRef.current = null;
              resolve();
            }
          }, 1000);
        });
      }
      
      // Reset animation values to initial state AFTER view is mounted
      opacityAnim.setValue(1);
      slideAnim.setValue(0);
      scaleAnim.setValue(1);
      
      // Start strikethrough animation (opacity reduction from 1 to 0.5) + show gold border
      setShowGoldBorder(true); // Show gold border immediately when strikethrough starts
      await new Promise<void>((resolve) => {
        Animated.timing(opacityAnim, {
          toValue: 0.5,
          duration: 200,
          useNativeDriver: true,
        }).start(() => resolve());
      });
      
      // Wait 800ms for pause (as specified in PRD: 500-800ms)
      await new Promise(resolve => setTimeout(resolve, 800));
      
      // Start shrink animation (slow scale down) - keep gold border
      await new Promise<void>((resolve) => {
        Animated.timing(scaleAnim, {
          toValue: 0.3, // Shrink to 30% of original size
          duration: 600, // Slow shrink animation
          useNativeDriver: true,
        }).start(() => resolve());
      });
      
      // At the end of shrink, slide away to the right
      const slideAwayAnimation = Animated.parallel([
        Animated.timing(opacityAnim, {
          toValue: 0,
          duration: 300,
          useNativeDriver: true,
        }),
        Animated.timing(slideAnim, {
          toValue: width, // Slide off to the right edge of screen
          duration: 300,
          useNativeDriver: true,
        }),
      ]);
      
      // Wait for slide-away animation to complete
      await new Promise<void>((resolve) => {
        slideAwayAnimation.start(() => {
          // Mark animation as completed so empty state can show immediately
          setAnimationCompleted(true);
          resolve();
        });
      });
    } catch (animationError) {
      // Log animation errors but don't trigger DB failure Alert
      console.error('Animation error in handleFocusDone:', animationError);
      resetState();
      // Continue to database update even if animation failed
    }

    // Database update in separate try-catch - only show Alert if this fails
    try {
      // Update database after animation completes (or even if animation failed)
      await taskRepository.updateTaskStatus(task.id, 'completed');
      
      // Force UI refresh to update task lists (inboxTasks, getFocusTask, etc.)
      setTasksVersion(prev => prev + 1);
      
      // Small delay to ensure WatermelonDB processes the update
      await new Promise<void>(resolve => setTimeout(resolve, 100));
      
      // Clear completing state after database update and UI refresh
      resetState();
      
      // Remove toast notification - animation provides feedback instead

      // Momentum mode operations - errors are already handled, don't rethrow
      if (task.isTodayFocus && momentumEnabled) {
        try {
          // Get next focus task using local repository (offline-capable)
          const next = await taskRepository.getNextFocusTask({
            currentTaskId: task.id,
            travelPreference: travelPreference,
            excludeIds: [],
          });

          // Force a small delay to allow WatermelonDB to process the update
          await new Promise<void>(resolve => setTimeout(resolve, 100));
          
          // Force UI update to reflect the new focus task
          // WatermelonDB observables may not emit immediately, so we increment tasksVersion
          setTasksVersion(prev => prev + 1);
          
          // Give React a moment to process the state update
          await new Promise<void>(resolve => setTimeout(resolve, 50));

          // Handle calendar operations asynchronously (non-blocking)
          const handleMomentumCalendarOperations = async () => {
            try {
              // Remove the completed task's calendar event
              try {
                const completedEventsResponse = await enhancedAPI.getEventsForTask(task.id);
                const completedEvents = extractCalendarEvents(completedEventsResponse);
                for (const event of completedEvents) {
                  const eventId = (event as any)?.id ?? (event as any)?.event_id ?? (event as any)?.eventId;
                  if (!eventId) {
                    continue;
                  }
                  await enhancedAPI.deleteEvent(eventId);
                }
              } catch (removeError) {
                console.warn('Failed to remove completed focus task calendar event:', removeError);
              }

              // Schedule the new focus task to calendar
              try {
                const today = new Date().toISOString().split('T')[0];
                const todaysEvents = await enhancedAPI.getEventsForDate(today);
                const taskDuration = next.estimatedDurationMinutes || 60;

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
          // Check for "no candidates" error (matches backend 404 behavior)
          if (err?.message?.includes('No other tasks match your criteria') || err?.code === 404) {
            setToastMessage("Great work, you've cleared all your tasks!");
            setToastCalendarEvent(false);
            setShowToast(true);
          } else {
            console.error('Momentum mode error:', err);
            setToastMessage('Great job! Focus task completed.');
            setToastCalendarEvent(false);
            setShowToast(true);
          }
          // Don't rethrow - momentum errors are already handled with user feedback
        }
      }
    } catch (dbError) {
      // Only show Alert for actual database update failures
      console.error('Database update error in handleFocusDone:', dbError);
      resetState();
      Alert.alert('Error', 'Failed to complete focus task');
    }
  }, [momentumEnabled, travelPreference, userSchedulingPreferences, width, taskAnimations, taskSlideAnimations, taskScaleAnimations, getAnimationValues, showGoldBorder]);

  const handleEodMarkDone = useCallback(async () => {
    if (eodActionInFlightRef.current) { return; }
    eodActionInFlightRef.current = true;
    const focus = tasks.find(t => t.id === eodFocusIdRef.current) || getFocusTask();
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
    } catch (err) {
      // Error already handled in handleFocusDone
    } finally {
      eodFocusIdRef.current = undefined;
      eodActionInFlightRef.current = false;
    }
  }, [tasks, getFocusTask, handleFocusDone]);

  const handleEodRollover = useCallback(async () => {
    if (eodActionInFlightRef.current) { return; }
    eodActionInFlightRef.current = true;
    const focus = tasks.find(t => t.id === eodFocusIdRef.current) || getFocusTask();
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
      const tomorrowDate = new Date(yyyy, parseInt(mm) - 1, parseInt(dd));
      // Update using repository (local-first)
      await taskRepository.updateTask(focus.id, { dueDate: tomorrowDate });
      setToastMessage('Rolled over to tomorrow.');
      setToastCalendarEvent(false);
      setShowToast(true);
    } catch {
      Alert.alert('Error', 'Failed to roll over task');
    }
    setShowEodPrompt(false);
    eodFocusIdRef.current = undefined;
    eodActionInFlightRef.current = false;
  }, [tasks, getFocusTask, markEodPrompted]);

  const handleEodChooseNew = useCallback(async () => {
    if (eodActionInFlightRef.current) { return; }
    eodActionInFlightRef.current = true;
    try {
      setShowEodPrompt(false);
      await markEodPrompted();
      navigation.navigate('BrainDump');
    } catch (err) {
      // Silent failure - navigation will handle errors
    } finally {
      eodActionInFlightRef.current = false;
    }
  }, [navigation, markEodPrompted]);

  const _handleFocusRollover = async (task: Task) => {
    try {
      const tomorrow = new Date();
      tomorrow.setDate(tomorrow.getDate() + 1);
      // Update using repository (local-first)
      await taskRepository.updateTask(task.id, { dueDate: tomorrow });
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
      // Get next focus task using local repository (offline-capable)
      const next = await taskRepository.getNextFocusTask({
        currentTaskId: focus.id,
        travelPreference: travelPreference,
        excludeIds: [focus.id],
      });

      // Force a small delay to allow WatermelonDB to process the update
      await new Promise<void>(resolve => setTimeout(resolve, 100));
      
      // Force UI update to reflect the new focus task
      // WatermelonDB observables may not emit immediately, so we increment tasksVersion
      setTasksVersion(prev => prev + 1);
      
      // Give React a moment to process the state update
      await new Promise<void>(resolve => setTimeout(resolve, 50));

      // Handle calendar operations asynchronously (non-blocking)
      const handleSkipCalendarOperations = async () => {
        try {
          // Remove the current focus task's calendar event
          try {
            const currentEventsResponse = await enhancedAPI.getEventsForTask(focus.id);
            const currentEvents = extractCalendarEvents(currentEventsResponse);
            for (const event of currentEvents) {
              const eventId = (event as any)?.id ?? (event as any)?.event_id ?? (event as any)?.eventId;
              if (!eventId) {
                continue;
              }
              await enhancedAPI.deleteEvent(eventId);
            }
          } catch (removeError) {
            console.warn('Failed to remove current focus task calendar event:', removeError);
          }

          // Schedule the new focus task to calendar
          try {
            const today = new Date().toISOString().split('T')[0];
            const todaysEvents = await enhancedAPI.getEventsForDate(today);
            const taskDuration = next.estimatedDurationMinutes || 60;

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
      // Check for "no candidates" error (matches backend 404 behavior)
      if (err?.message?.includes('No other tasks match your criteria') || err?.code === 404) {
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
              {focus && completingTaskId !== focus.id && !animationCompleted ? (
                <View 
                  ref={focusCardRef}
                  style={styles.focusCard}
                  onLayout={(event) => {
                    const { width, height } = event.nativeEvent.layout;
                    focusCardDimensions.current = { width, height };
                  }}
                >
                  <Text style={styles.focusTaskTitle}>{focus.title}</Text>
                  <View style={styles.focusBadges}>
                    {!!focus.category && (
                      <View style={styles.badge}><Text style={styles.badgeText}>{focus.category}</Text></View>
                    )}
                    <View style={[styles.badge, (styles as any)[focus.priority || 'medium']]}><Text style={[styles.badgeText, styles.badgeTextDark]}>{focus.priority}</Text></View>
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
              ) : focus && completingTaskId === focus.id && !animationCompleted ? (
                (() => {
                  const animValues = getAnimationValues(focus.id);
                  const animatedStyle: any = {
                    opacity: animValues.opacity,
                    borderColor: showGoldBorder ? colors.accent.gold : colors.border.light, // Gold border when active
                    borderWidth: 2, // Increased border width for visibility
                    transform: [
                      { scale: animValues.scale },
                      { translateX: animValues.translateX },
                    ],
                  };
                  
                  // Apply measured dimensions to ensure initial size matches exactly
                  const cardDimensions = focusCardDimensions.current;
                  if (cardDimensions) {
                    animatedStyle.width = cardDimensions.width;
                    animatedStyle.height = cardDimensions.height;
                  }
                  
                  return (
                    <Animated.View 
                      ref={(ref) => {
                        animatedViewRef.current = ref;
                        // Signal mount when ref is set and we have a completing task
                        if (ref && completingTaskId === focus.id && !isMountedRef.current) {
                          isMountedRef.current = true;
                          if (mountResolverRef.current) {
                            mountResolverRef.current();
                            mountResolverRef.current = null;
                          }
                        }
                      }}
                      key={`animated-focus-${focus.id}`}
                      style={[
                        styles.focusCard,
                        animatedStyle,
                      ]}
                    >
                      <Text style={[
                        styles.focusTaskTitle,
                        styles.strikethroughText
                      ]}>{focus.title}</Text>
                      <View style={styles.focusBadges}>
                        {!!focus.category && (
                          <View style={styles.badge}><Text style={styles.badgeText}>{focus.category}</Text></View>
                        )}
                        <View style={[styles.badge, (styles as any)[focus.priority || 'medium']]}><Text style={[styles.badgeText, styles.badgeTextDark]}>{focus.priority}</Text></View>
                      </View>
                      {/* Include action buttons row to match original card size */}
                      <View style={styles.focusActionsRow}>
                        <View style={styles.focusIconBtn}>
                          <Icon name="check" size={22} color={colors.text.primary} />
                        </View>
                        {momentumEnabled && (
                          <View style={styles.focusIconBtn}>
                            <Icon name="arrow-right" size={22} color={colors.text.primary} />
                          </View>
                        )}
                        <View style={styles.focusIconBtn}>
                          <Icon name="arrow-switch" size={22} color={colors.text.primary} />
                        </View>
                      </View>
                    </Animated.View>
                  );
                })()
              ) : (
                <TouchableOpacity style={styles.focusCard} onPress={handleChangeFocus}>
                  <Text style={styles.focusTaskTitle}>Mind Clear. Ready for the next one?</Text>
                  <Text style={styles.emptyFocusSubtext}>Tap to choose your focus</Text>
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
                  task={convertTaskForTaskCard(task)}
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
          task={convertTaskForTaskForm(editingTask)}
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
                    <View style={[styles.badge, (styles as any)[focus.priority || 'medium']]}><Text style={[styles.badgeText, styles.badgeTextDark]}>{focus.priority}</Text></View>
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
    borderWidth: 2,
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
  strikethroughText: {
    textDecorationLine: 'line-through',
    opacity: 0.6,
  },
  emptyFocusSubtext: {
    color: colors.text.secondary,
    fontSize: typography.fontSize.sm,
    marginTop: spacing.xs,
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

// Create the enhanced component with WatermelonDB observables
// Note: withObservables automatically subscribes and re-renders when data changes
const enhance = withObservables<{ database: Database }, "tasks" | "goals">(
  ['database'],
  // @ts-expect-error - WatermelonDB's withObservables type definition expects the factory to return the keys, but implementation requires observables object
  ({ database }) => {
  const tasksQuery = database.collections.get<Task>('tasks').query(
    Q.where('status', Q.notEq('pending_delete'))
  );
  // Observe the query - WatermelonDB automatically detects all field changes
  const tasks: Observable<Task[]> = tasksQuery.observe();

  const goalsQuery = database.collections.get<Goal>('goals').query(
    Q.where('status', Q.notEq('pending_delete'))
  );
  const goals: Observable<Goal[]> = goalsQuery.observe();

  return {
    tasks,
    goals,
  };
});

const EnhancedTasksScreen = enhance(TasksScreen);

const TasksScreenWithDatabase = (props: any) => {
  const database = useDatabase();
  return <EnhancedTasksScreen {...props} database={database} />;
};

export default TasksScreenWithDatabase;
