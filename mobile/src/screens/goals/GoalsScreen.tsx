import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, Alert, Platform, StatusBar, RefreshControl } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import Icon from 'react-native-vector-icons/Octicons';
import { colors } from '../../themes/colors';
import { typography } from '../../themes/typography';
import { spacing, borderRadius } from '../../themes/spacing';
import { Input, Button } from '../../components/common';
import withObservables from '@nozbe/watermelondb/react/withObservables';
import { useDatabase } from '../../contexts/DatabaseContext';
import { goalRepository } from '../../repositories/GoalRepository';
import { syncService } from '../../services/SyncService';
import { authService, AuthState } from '../../services/auth';
import { Q } from '@nozbe/watermelondb';
import GoalModel from '../../db/models/Goal';
import analyticsService from '../../services/analyticsService';
import GoalsListModal from '../../components/goals/GoalsListModal';
import AddGoalOptionsModal from '../../components/goals/AddGoalOptionsModal';
import Svg, { Circle } from 'react-native-svg';
import { format, isPast, isToday, formatDistanceToNow } from 'date-fns';
import DateTimePicker from '@react-native-community/datetimepicker';
import HelpTarget from '../../components/help/HelpTarget';
import { useHelp, HelpContent, HelpScope } from '../../contexts/HelpContext';
import { useFocusEffect } from '@react-navigation/native';
import { LoadingSkeleton } from '../../components/common/LoadingSkeleton';
import ScreenHeader from '../../components/common/ScreenHeader';

interface Step {
  id: string;
  title: string;
  description: string;
  completed: boolean;
  order: number;
}

interface Milestone {
  id: string;
  title: string;
  description: string;
  completed: boolean;
  order: number;
  steps: Step[];
}

interface Goal {
  id: string;
  title: string;
  description: string;
  completedMilestones: number;
  totalMilestones: number;
  completedSteps: number;
  totalSteps: number;
  nextMilestone: string;
  nextStep: string;
  status: 'active' | 'completed' | 'paused';
  createdAt: Date;
  milestones: Milestone[];
  targetDate?: Date;
}

interface StepItemProps {
  step: Step;
  goalId: string;
  milestoneId: string;
  onToggle: (goalId: string, milestoneId: string, stepId: string) => void;
}

// Memoized components moved outside the main component to avoid hooks issues
const StepItem = React.memo(({ 
  step, 
  goalId, 
  milestoneId, 
  onToggle 
}: StepItemProps) => (
  <View style={styles.stepRow}>
    <HelpTarget helpId={`goal-step-toggle:${goalId}:${step.id}`}>
      <TouchableOpacity
        style={styles.stepIconButton}
        onPress={() => onToggle(goalId, milestoneId, step.id)}
        accessibilityRole="button"
        accessibilityLabel={`Toggle step complete: ${step.title}`}
        accessibilityState={{ checked: step.completed }}
        accessibilityHint={step.completed ? "Tap to mark as incomplete" : "Tap to mark as complete"}
      >
        <Icon 
          name={step.completed ? 'check' : 'circle'} 
          size={16} 
          color={step.completed ? (colors.accent?.gold || colors.primary) : colors.text.secondary} 
        />
      </TouchableOpacity>
    </HelpTarget>
    <Text style={[styles.stepText, step.completed && styles.stepTextCompleted]}>
      {step.title}
    </Text>
  </View>
));

interface CircularProgressProps {
  percentage: number;
  size?: number;
}

const CircularProgress = React.memo(({ percentage, size = 56 }: CircularProgressProps) => {
  const strokeWidth = 6;
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const clamped = Math.max(0, Math.min(100, percentage));
  const strokeDashoffset = circumference - (clamped / 100) * circumference;

  return (
    <View style={{ width: size, height: size }}>
      <Svg width={size} height={size}>
        <Circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          stroke={colors.border.light}
          strokeWidth={strokeWidth}
          fill="none"
        />
        <Circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          stroke={colors.accent?.gold || colors.primary}
          strokeWidth={strokeWidth}
          fill="none"
          strokeDasharray={`${circumference} ${circumference}`}
          strokeDashoffset={strokeDashoffset}
          strokeLinecap="round"
          rotation="-90"
          origin={`${size / 2}, ${size / 2}`}
        />
      </Svg>
      <View style={styles.progressCenterTextContainer}>
        <Text style={styles.progressCenterText}>{Math.round(clamped)}%</Text>
      </View>
    </View>
  );
});

interface GoalsScreenProps {
  navigation: any;
  goals: Goal[]; // From withObservables
  milestones: Milestone[]; // From withObservables
  steps: Step[]; // From withObservables
  database: any;
}

const GoalsScreen: React.FC<GoalsScreenProps> = ({ navigation, goals: observableGoals, milestones: observableMilestones, steps: observableSteps, database }) => {
  const insets = useSafeAreaInsets();
  const { setHelpContent, setIsHelpOverlayActive, setHelpScope } = useHelp();
  const [goals, setGoals] = useState<Goal[]>([]);
  const [loading, setLoading] = useState(false);
  const [goalsLoading, setGoalsLoading] = useState(true);
  const [expandedGoals, setExpandedGoals] = useState<Record<string, boolean>>({});
  const [editingGoals, setEditingGoals] = useState<Record<string, boolean>>({});
  const [editDrafts, setEditDrafts] = useState<Record<string, Array<{ id: string; title: string; steps: Array<{ id: string; title: string }> }>>>({});
  const [authState, setAuthState] = useState<AuthState>({
    user: null,
    token: null,
    isLoading: true,
    isAuthenticated: false,
  });
  const [showAddOptions, setShowAddOptions] = useState(false);
  const [showGoalsModal, setShowGoalsModal] = useState(false);
  const [editingDate, setEditingDate] = useState<Record<string, boolean>>({});
  const [dateDrafts, setDateDrafts] = useState<Record<string, Date>>({});
  const [androidDatePickerVisible, setAndroidDatePickerVisible] = useState<Record<string, boolean>>({});
  const [completedExpanded, setCompletedExpanded] = useState(false);
  const [editMilestoneHeights, setEditMilestoneHeights] = useState<Record<string, Record<string, number>>>({});
  const [editStepHeights, setEditStepHeights] = useState<Record<string, Record<string, number>>>({});
  const [refreshing, setRefreshing] = useState(false);
  
  // Ensure system status bar matches header background (white) with dark content
  useEffect(() => {
    try {
      StatusBar.setBarStyle('dark-content');
      if (Platform.OS === 'android') {
        StatusBar.setBackgroundColor(colors.background.primary);
        StatusBar.setTranslucent(false);
      }
    } catch {}
  }, []);
  const [needsReviewExpanded, setNeedsReviewExpanded] = useState(false);

  const getGoalsHelpContent = React.useCallback((): HelpContent => ({
    'goals-overall': 'See your overall progress across active goals.',
    'goals-view-all': 'Open the full list of your goals.',
    'goal-edit': 'Edit the goal title, milestones, and steps inline.',
    'goal-delete': 'Delete this goal permanently.',
    'goal-target-date': 'Tap to set or change the goal’s target date.',
    'goal-steps-toggle': 'Expand to view steps in the current milestone.',
    'goal-step-toggle': 'Mark a step done or not done.',
    'goal-schedule-next-step': 'Ask AI to schedule the next step on your calendar.',
    'goal-ask-ai': 'Ask AI to help refine or plan this goal.',
    'goals-ai-entry': 'Start a new conversation with AI to create a goal.',
  }), []);

  const loadGoals = React.useCallback(async () => {
    // Goals are now provided via observableGoals prop from WatermelonDB
    // Just trigger sync to ensure data is up to date
    try {
      await syncService.silentSync();
    } catch (error) {
      console.error('Error syncing goals:', error);
    }
  }, []);

  // Subscribe to auth state changes
  useEffect(() => {
    const unsubscribe = authService.subscribe((state) => {
      setAuthState(state);
      
      // If user becomes authenticated, trigger sync
      if (state.isAuthenticated && !state.isLoading) {
        syncService.silentSync().catch(console.error);
      } else if (!state.isAuthenticated && !state.isLoading) {
        // User is not authenticated, clear goals and stop loading
        setGoals([]);
        setGoalsLoading(false);
      }
    });

    return unsubscribe;
  }, [navigation, loadGoals]);

  // Trigger sync on component mount (only if authenticated)
  useEffect(() => {
    if (authState.isAuthenticated && !authState.isLoading) {
      syncService.silentSync().catch(console.error);
    } else if (!authState.isAuthenticated && !authState.isLoading) {
      setGoalsLoading(false);
    }
  }, [authState.isAuthenticated, authState.isLoading]);

  // Transform WatermelonDB goals to the expected format with optimized batch queries
  const transformGoals = useCallback(async (watermelonGoals: Goal[], database: any) => {
    if (watermelonGoals.length === 0) return [];
    
    const goalIds = watermelonGoals.map(g => g.id);
    
    // Batch fetch all milestones for all goals (eliminates N+1 query)
    const allMilestones = await database.collections.get('milestones')
      .query(Q.where('goal_id', Q.oneOf(goalIds)))
      .fetch();
    
    // Batch fetch all steps for all milestones (eliminates N*M+1 query)
    const milestoneIds = allMilestones.map((m: any) => m.id);
    const allSteps = milestoneIds.length > 0 
      ? await database.collections.get('milestone_steps')
          .query(Q.where('milestone_id', Q.oneOf(milestoneIds)))
          .fetch()
      : [];
    
    // Group milestones by goal_id for efficient lookup
    const milestonesByGoal = allMilestones.reduce((acc: Record<string, any[]>, milestone: any) => {
      // Handle both camelCase and snake_case property names
      const goalId = milestone.goalId || milestone.goal_id;
      if (!goalId) {
        if (__DEV__) console.warn('Milestone missing goalId:', milestone);
        return acc;
      }
      if (!acc[goalId]) acc[goalId] = [];
      acc[goalId].push(milestone);
      return acc;
    }, {} as Record<string, any[]>);
    
    // Group steps by milestone_id for efficient lookup
    const stepsByMilestone = allSteps.reduce((acc: Record<string, any[]>, step: any) => {
      // Handle both camelCase and snake_case property names
      const milestoneId = step.milestoneId || step.milestone_id;
      if (!milestoneId) {
        if (__DEV__) console.warn('Step missing milestoneId:', step);
        return acc;
      }
      if (!acc[milestoneId]) acc[milestoneId] = [];
      acc[milestoneId].push(step);
      return acc;
    }, {} as Record<string, any[]>);
    
    // Transform goals using pre-fetched data
    const transformedGoals = watermelonGoals.map((goal: any) => {
      const milestones = milestonesByGoal[goal.id] || [];
      
      // Sort milestones by order before processing
      const sortedMilestones = [...milestones].sort((a: any, b: any) => {
        const orderA = a.order ?? 0;
        const orderB = b.order ?? 0;
        return orderA - orderB;
      });
      
      const milestonesWithSteps = sortedMilestones.map((milestone: any) => {
        const steps = stepsByMilestone[milestone.id] || [];
        // Sort steps by order
        const sortedSteps = [...steps].sort((a: any, b: any) => {
          const orderA = a.order ?? 0;
          const orderB = b.order ?? 0;
          return orderA - orderB;
        });
        
        // Determine if milestone is completed: either explicitly marked or all steps are complete
        const allStepsCompleted = sortedSteps.length > 0 && sortedSteps.every((s: any) => s.completed);
        const milestoneCompleted = milestone.completed === true || allStepsCompleted;
        
        return {
          id: milestone.id,
          title: milestone.title || '',
          description: milestone.description || '',
          completed: milestoneCompleted,
          order: milestone.order ?? 0,
          steps: sortedSteps
        };
      });
      
      const totalMilestones = milestonesWithSteps.length;
      const completedMilestones = milestonesWithSteps.filter((m: any) => m.completed).length;
      const totalSteps = milestonesWithSteps.reduce((total: number, milestone: any) => total + (milestone.steps?.length || 0), 0);
      const completedSteps = milestonesWithSteps.reduce((total: number, milestone: any) => total + (milestone.steps?.filter((s: any) => s.completed).length || 0), 0);
      
      // Find the first incomplete milestone (sorted by order)
      const nextMilestoneObj = milestonesWithSteps.find((m: any) => !m.completed);
      const nextMilestone = nextMilestoneObj?.title || '';
      const nextStep = nextMilestoneObj?.steps?.find((s: any) => !s.completed)?.text || '';
      
      if (__DEV__ && goal.id) {
        console.log(`Goal "${goal.title}" (${goal.id}):`);
        console.log(`  - Found ${milestones.length} milestones in grouping`);
        console.log(`  - Processed ${milestonesWithSteps.length} milestones with steps`);
        milestonesWithSteps.forEach((m: any, idx: number) => {
          console.log(`    Milestone ${idx + 1}: "${m.title || '(no title)'}" (completed: ${m.completed}, steps: ${m.steps?.length || 0})`);
        });
        console.log(`  - Current milestone: "${nextMilestone || '(none)'}"`);
        console.log(`  - Next step: "${nextStep.substring(0, 50) || '(none)'}..."`);
      }
      
      return {
        id: goal.id,
        title: goal.title,
        description: goal.description,
        completedMilestones,
        totalMilestones,
        completedSteps,
        totalSteps,
        nextMilestone,
        nextStep,
        status: goal.status || 'active',
        createdAt: goal.createdAt,
        targetDate: goal.targetCompletionDate,
        milestones: milestonesWithSteps.map((milestone: any) => ({
          id: milestone.id,
          title: milestone.title || '',
          description: milestone.description || '',
          completed: milestone.completed || false,
          order: milestone.order ?? 0,
          steps: (milestone.steps || []).map((step: any) => ({
            id: step.id,
            title: step.text || '', // Fixed: MilestoneStep model uses 'text' property, not 'title'
            description: step.description || '',
            completed: step.completed || false,
            order: step.order ?? 0,
          })),
        })),
      } as Goal;
    });
    
    return transformedGoals;
  }, []);

  // Update local goals when observable goals, milestones, or steps change
  useEffect(() => {
    if (observableGoals) {
      transformGoals(observableGoals, database).then((transformedGoals) => {
        setGoals(transformedGoals);
        setGoalsLoading(false);
      }).catch((error) => {
        console.error('Error transforming goals:', error);
        setGoalsLoading(false);
      });
    }
  }, [observableGoals, observableMilestones, observableSteps, transformGoals, database]);

  // Reset help overlay when this screen gains focus
  useFocusEffect(
    React.useCallback(() => {
      try { setHelpScope('goals'); } catch {}
      try { setHelpContent(getGoalsHelpContent()); } catch {}
      // Ensure any previously registered targets from other scopes are ignored
      // by turning the overlay off briefly on focus.
      try { setIsHelpOverlayActive(false); } catch {}
      return () => {
        try { setIsHelpOverlayActive(false); } catch {}
      };
    }, [setHelpScope, setHelpContent, getGoalsHelpContent, setIsHelpOverlayActive])
  );

  const onRefresh = React.useCallback(async () => {
    setRefreshing(true);
    try {
      // On pull-to-refresh, do a full sync to ensure complete data
      await syncService.fullSync(true);
      await loadGoals();
    } finally {
      setRefreshing(false);
    }
  }, [loadGoals]);


  const handleGoalPress = (goalId: string) => {
    setShowGoalsModal(false);
    navigation.navigate('GoalDetail', { goalId });
  };

  const handleGoalDelete = async (goalId: string) => {
    try {
      Alert.alert(
        'Delete Goal',
        'Are you sure you want to delete this goal? This action cannot be undone.',
        [
          {
            text: 'Cancel',
            style: 'cancel',
          },
          {
            text: 'Delete',
            style: 'destructive',
            onPress: async () => {
              try {
                await goalRepository.deleteGoal(goalId);
                syncService.silentSync();
                Alert.alert('Success', 'Goal deleted successfully');
              } catch (_error) {
                // error deleting goal
                Alert.alert('Error', 'Failed to delete goal. Please try again.');
              }
            },
          },
        ]
      );
    } catch (_error) {
      // error deleting goal
      Alert.alert('Error', 'Failed to delete goal. Please try again.');
    }
  };

  const startEditDate = (goalId: string, current?: Date) => {
    setEditingDate((p) => ({ ...p, [goalId]: true }));
    setDateDrafts((p) => ({ ...p, [goalId]: current || new Date() }));
    if (Platform.OS === 'android') {
      setAndroidDatePickerVisible((p) => ({ ...p, [goalId]: true }));
    }
  };

  const cancelEditDate = (goalId: string) => {
    setEditingDate((p) => ({ ...p, [goalId]: false }));
    setDateDrafts((p) => {
      const { [goalId]: _, ...rest } = p as any;
      return rest;
    });
    if (Platform.OS === 'android') {
      setAndroidDatePickerVisible((p) => ({ ...p, [goalId]: false }));
    }
  };

  const saveEditDate = async (goalId: string, pickedDate?: Date) => {
    const draft = pickedDate || dateDrafts[goalId];
    if (!draft) {return;}
    try {
      setLoading(true);
      await goalRepository.updateGoal(goalId, { targetCompletionDate: draft });
      setGoals((prev) => prev.map((g) => (g.id === goalId ? { ...g, targetDate: draft } : g)));
      setEditingDate((p) => ({ ...p, [goalId]: false }));
      setDateDrafts((p) => {
        const { [goalId]: _, ...rest } = p as any;
        return rest;
      });
      if (Platform.OS === 'android') {
        setAndroidDatePickerVisible((p) => ({ ...p, [goalId]: false }));
      }
      // Trigger background sync
      syncService.silentSync();
    } catch (e) {
      Alert.alert('Error', 'Failed to update target date.');
    } finally {
      setLoading(false);
    }
  };

  const toggleExpand = useCallback((goalId: string) => {
    setExpandedGoals((prev) => ({ ...prev, [goalId]: !prev[goalId] }));
  }, []);

  const enterEditMode = (goal: Goal) => {
    setExpandedGoals((prev) => ({ ...prev, [goal.id]: true }));
    setEditingGoals((prev) => ({ ...prev, [goal.id]: true }));
    setEditDrafts((prev) => ({
      ...prev,
      [goal.id]: goal.milestones.map((m) => ({
        id: m.id,
        title: m.title,
        steps: m.steps.map((s) => ({ id: s.id, title: s.title })),
      })),
    }));
  };

  const cancelEdit = (goalId: string) => {
    setEditingGoals((prev) => ({ ...prev, [goalId]: false }));
    setEditDrafts((prev) => {
      const { [goalId]: _, ...rest } = prev as any;
      return rest;
    });
  };

  const saveEdits = async (goalId: string) => {
    const drafts = editDrafts[goalId];
    if (!drafts) {return;}
    const original = goals.find((g) => g.id === goalId);
    if (!original) {return;}

    try {
      setLoading(true);
      // Persist milestone title changes
      for (const draftMilestone of drafts) {
        const origMilestone = original.milestones.find((m) => m.id === draftMilestone.id);
        if (origMilestone && origMilestone.title !== draftMilestone.title) {
          await goalRepository.updateMilestone(draftMilestone.id, { title: draftMilestone.title });
        }
        if (origMilestone) {
          for (const draftStep of draftMilestone.steps) {
            const origStep = origMilestone.steps.find((s) => s.id === draftStep.id);
            if (origStep && (origStep.title !== draftStep.title)) {
              await goalRepository.updateMilestoneStep(draftStep.id, { text: draftStep.title });
            }
          }
        }
      }

      // Update local state to reflect edits
      setGoals((prev) => prev.map((g) => {
        if (g.id !== goalId) {return g;}
        const updatedMilestones = g.milestones.map((m) => {
          const draft = drafts.find((dm) => dm.id === m.id);
          if (!draft) {return m;}
          return {
            ...m,
            title: draft.title,
            steps: m.steps.map((s) => {
              const dstep = draft.steps.find((ds) => ds.id === s.id);
              return dstep ? { ...s, title: dstep.title } : s;
            }),
          };
        });
        return { ...g, milestones: updatedMilestones };
      }));

      setEditingGoals((prev) => ({ ...prev, [goalId]: false }));
      setEditDrafts((prev) => {
        const { [goalId]: _, ...rest } = prev as any;
        return rest;
      });
      
      // Trigger background sync
      syncService.silentSync();
    } catch (error) {
      Alert.alert('Error', 'Failed to save edits. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const toggleStepCompleted = useCallback(async (goalId: string, milestoneId: string, stepId: string) => {
    // Find the goal and step first to get the current state
    const goal = goals.find(g => g.id === goalId);
    if (!goal) return;
    
    const milestone = goal.milestones.find(m => m.id === milestoneId);
    if (!milestone) return;
    
    const step = milestone.steps.find(s => s.id === stepId);
    if (!step) return;
    
    const newCompleted = !step.completed;
    
    // Optimistic UI update - much more efficient
    setGoals((prev) => prev.map((g) => {
      if (g.id !== goalId) return g;
      
      const updatedMilestones = g.milestones.map((m) => {
        if (m.id !== milestoneId) return m;
        
        const updatedSteps = m.steps.map((s) => {
          if (s.id !== stepId) return s;
          return { ...s, completed: newCompleted };
        });
        
        return { ...m, completed: updatedSteps.every((s) => s.completed), steps: updatedSteps };
      });
      
      // Recalculate only the necessary fields
      const totalSteps = updatedMilestones.reduce((acc, m) => acc + m.steps.length, 0);
      const completedSteps = updatedMilestones.reduce((acc, m) => acc + m.steps.filter(s => s.completed).length, 0);
      const nextMilestoneObj = updatedMilestones.find((m) => m.steps.some((s) => !s.completed));
      const nextMilestone = nextMilestoneObj?.title || '';
      const nextStep = nextMilestoneObj?.steps?.find((s) => !s.completed)?.title || '';
      const updatedCompletedMilestones = updatedMilestones.filter((m) => m.completed).length;
      const updatedTotalMilestones = updatedMilestones.length;
      
      return { 
        ...g, 
        milestones: updatedMilestones, 
        completedSteps, 
        totalSteps, 
        nextMilestone, 
        nextStep, 
        completedMilestones: updatedCompletedMilestones, 
        totalMilestones: updatedTotalMilestones 
      };
    }));

    try {
      await goalRepository.updateMilestoneStep(stepId, { completed: newCompleted });
      // Trigger background sync
      syncService.silentSync();
    } catch (error) {
      Alert.alert('Error', 'Failed to update step status.');
      // Reload to reconcile from backend on failure
      try { await loadGoals(); } catch {}
    }
  }, [goals, loadGoals]);

  const getProgressPercentage = (completed: number, total: number) => {
    return total > 0 ? (completed / total) * 100 : 0;
  };


  const formatTargetDate = (date?: Date): { text: string; tone: 'muted' | 'warn' | 'danger' } => {
    if (!date) {return { text: 'No target', tone: 'muted' };}
    if (isPast(date) && !isToday(date)) {return { text: 'Past target — tap to reschedule', tone: 'warn' };}
    if (isToday(date)) {return { text: 'Due today', tone: 'warn' };}
    const distance = formatDistanceToNow(date, { addSuffix: true });
    // If within ~7 days, keep relative string; else show absolute
    const withinWeek = /\b(day|hour|minute|week)\b/.test(distance);
    return { text: withinWeek ? distance : format(date, 'MMM d, yyyy'), tone: withinWeek ? 'warn' : 'muted' };
  };

  const isGoalCompleted = (g: Goal) => {
    const hasMilestones = Array.isArray(g.milestones) && g.milestones.length > 0;
    const milestonesComplete = hasMilestones && g.milestones.every((m) => m.completed);
    return g.status === 'completed' || milestonesComplete;
  };

  const sortGoalsByTargetDate = (arr: Goal[]) => {
    return [...arr].sort((a, b) => {
      const aDate = a.targetDate ? a.targetDate.getTime() : Number.MAX_SAFE_INTEGER;
      const bDate = b.targetDate ? b.targetDate.getTime() : Number.MAX_SAFE_INTEGER;
      if (aDate !== bDate) {return aDate - bDate;}
      const aCreated = a.createdAt ? new Date(a.createdAt).getTime() : 0;
      const bCreated = b.createdAt ? new Date(b.createdAt).getTime() : 0;
      return aCreated - bCreated;
    });
  };
 
  

  const renderGoalCard = useCallback((goal: Goal) => {
    const stepsPct = getProgressPercentage(goal.completedSteps, goal.totalSteps);
    const due = formatTargetDate(goal.targetDate);
    const currentMilestone = goal.milestones.find((m) => !m.completed);
    const currentSteps = currentMilestone?.steps || [];
    const currentCompleted = currentSteps.filter((s) => s.completed).length;
    const currentTotal = currentSteps.length;
    return (
      <View 
        key={goal.id} 
        style={styles.goalCard}
      >
        <View style={styles.goalHeader}>
          <View style={{ flex: 1, paddingRight: spacing.md }}>
            <View style={styles.titleRow}>
              <Text style={styles.goalTitle}>{goal.title}</Text>
              <View style={styles.iconActions}>
                <HelpTarget helpId={`goal-edit:${goal.id}`}>
                  <TouchableOpacity
                    style={styles.iconButton}
                    onPress={() => (editingGoals[goal.id] ? cancelEdit(goal.id) : enterEditMode(goal))}
                  >
                    <Icon name={editingGoals[goal.id] ? 'x' : 'pencil'} size={16} color={colors.text.secondary} />
                  </TouchableOpacity>
                </HelpTarget>
                <HelpTarget helpId={`goal-delete:${goal.id}`}>
                  <TouchableOpacity
                    style={styles.iconButton}
                    onPress={(e: any) => {
                      try { e?.stopPropagation?.(); } catch {}
                      handleGoalDelete(goal.id);
                    }}
                  >
                    <Icon name="trash" size={16} color={colors.text.secondary} />
                  </TouchableOpacity>
                </HelpTarget>
              </View>
            </View>
            <Text style={styles.goalDescription}>{goal.description}</Text>
            <View style={styles.dueRow}>
              <Icon name="calendar" size={14} color={colors.accent?.gold || colors.text.secondary} />
              <HelpTarget helpId={`goal-target-date:${goal.id}`}>
                <TouchableOpacity
                  onPress={() => (editingDate[goal.id] ? cancelEditDate(goal.id) : startEditDate(goal.id, goal.targetDate))}
                >
                  <Text
                    style={[
                      styles.dueText,
                      due.tone === 'warn' && { color: colors.accent?.gold || colors.warning },
                      due.tone === 'danger' && { color: colors.error },
                    ]}
                  >
                    {due.text}
                  </Text>
                </TouchableOpacity>
              </HelpTarget>
            </View>
            {editingDate[goal.id] && (
              <View style={styles.dateEditContainer}>
                {Platform.OS === 'ios' ? (
                  <DateTimePicker
                    value={dateDrafts[goal.id] || goal.targetDate || new Date()}
                    mode="date"
                    display={'inline' as any}
                    onChange={(event: any, selected?: Date) => {
                      if (selected) {
                        setDateDrafts((p) => ({ ...p, [goal.id]: selected }));
                        // Auto-save on iOS inline picker selection
                        saveEditDate(goal.id, selected);
                      }
                    }}
                  />
                ) : (
                  <>
                    {androidDatePickerVisible[goal.id] && (
                      <DateTimePicker
                        value={dateDrafts[goal.id] || goal.targetDate || new Date()}
                        mode="date"
                        display={'default'}
                        onChange={(event: any, selected?: Date) => {
                          // On Android, picker emits once on open and once on set/cancel
                          if (event?.type === 'dismissed') {
                            setAndroidDatePickerVisible((p) => ({ ...p, [goal.id]: false }));
                            return;
                          }
                          if (selected) {
                            setDateDrafts((p) => ({ ...p, [goal.id]: selected }));
                            // Auto-save on Android OK
                            saveEditDate(goal.id, selected);
                          }
                          setAndroidDatePickerVisible((p) => ({ ...p, [goal.id]: false }));
                        }}
                      />
                    )}
                    {!androidDatePickerVisible[goal.id] && (
                      <TouchableOpacity onPress={() => setAndroidDatePickerVisible((p) => ({ ...p, [goal.id]: true }))}>
                        <Text style={styles.actionText}>Change date…</Text>
                      </TouchableOpacity>
                    )}
                  </>
                )}
                <View style={styles.dateEditActions}>
                  <TouchableOpacity onPress={() => cancelEditDate(goal.id)}>
                    <Text style={styles.actionText}>Close</Text>
                  </TouchableOpacity>
                </View>
              </View>
            )}
          </View>
          <View style={styles.ringContainer}>
            <CircularProgress percentage={stepsPct} />
            <Text style={styles.ringCaption}>{goal.completedSteps}/{goal.totalSteps} steps</Text>
          </View>
        </View>
        
        <View style={styles.nextMilestoneContainer}>
          <View style={styles.inlineLabelRow}>
            <View style={styles.goldDot} />
            <Text style={styles.nextMilestoneLabel}>Current Milestone</Text>
          </View>
          <Text style={styles.nextMilestoneText}>{goal.nextMilestone}</Text>
        </View>
        <View style={styles.nextStepContainer}>
          <View style={styles.inlineLabelRow}>
            <Icon name="arrow-right" size={14} color={colors.text.secondary} />
            <Text style={styles.nextStepLabel}>Next Step</Text>
          </View>
          <Text style={styles.nextStepText}>{goal.nextStep}</Text>
        </View>

        {/* Steps expander below Next Step */}
        <HelpTarget helpId={`goal-steps-toggle:${goal.id}`} style={styles.stepsHeader}>
          <TouchableOpacity
            onPress={() => toggleExpand(goal.id)}
            accessibilityRole="button"
            accessibilityLabel="Toggle steps"
            accessibilityState={{ expanded: !!expandedGoals[goal.id] }}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          >
            <View style={styles.stepsHeaderContent}>
              <Text style={styles.stepsHeaderText}>
                Steps ({currentCompleted}/{currentTotal})
              </Text>
              <View style={styles.stepsExpandIcon}>
                <Icon name="chevron-down" size={16} color={colors.text.secondary} style={{ transform: [{ rotate: expandedGoals[goal.id] ? '180deg' : '0deg' }] as any }} />
              </View>
            </View>
          </TouchableOpacity>
        </HelpTarget>

        {expandedGoals[goal.id] && !editingGoals[goal.id] && (
          <View style={styles.stepsList}>
            {currentMilestone ? (
              <>
                {currentSteps.map((step) => (
                  <StepItem
                    key={step.id}
                    step={step}
                    goalId={goal.id}
                    milestoneId={currentMilestone.id}
                    onToggle={toggleStepCompleted}
                  />
                ))}
                <Text style={styles.unlockNote}>More steps will unlock once you complete this milestone.</Text>
              </>
            ) : (
              <Text style={styles.unlockNote}>All milestones are complete. Great job!</Text>
            )}
          </View>
        )}

        {expandedGoals[goal.id] && editingGoals[goal.id] && (
          <View style={styles.editContainer}>
            {editDrafts[goal.id]?.map((mDraft, mIndex) => (
              <View key={mDraft.id} style={styles.milestoneEditBlock}>
                <View style={styles.milestoneHeaderRow}>
                  <Text style={styles.milestoneEditLabel}>Milestone {mIndex + 1}</Text>
                  <View style={styles.milestoneHeaderActions}>
                    <TouchableOpacity
                      style={styles.iconButton}
                      onPress={async () => {
                        try {
                          setLoading(true);
                          await goalRepository.deleteMilestone(mDraft.id);
                          setGoals((prev) => prev.map((g) => g.id === goal.id ? {
                            ...g,
                            milestones: g.milestones.filter((m) => m.id !== mDraft.id),
                          } : g));
                          setEditDrafts((prev) => ({
                            ...prev,
                            [goal.id]: prev[goal.id].filter((m) => m.id !== mDraft.id),
                          }));
                          // Trigger background sync
                          syncService.silentSync();
                        } catch {
                          Alert.alert('Error', 'Failed to delete milestone.');
                        } finally {
                          setLoading(false);
                        }
                      }}
                    >
                      <Icon name="dash" size={16} color={colors.text.secondary} />
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={styles.iconButton}
                      onPress={async () => {
                        try {
                          setLoading(true);
                          const order = (goal.milestones?.length || 0) + 1;
                          const created = await goalRepository.createMilestone(goal.id, { title: 'New milestone', order });
                          setGoals((prev) => prev.map((g) => g.id === goal.id ? {
                            ...g,
                            milestones: [...g.milestones, { id: created.id, title: created.title, description: '', completed: false, order, steps: [] }],
                          } : g));
                          setEditDrafts((prev) => ({
                            ...prev,
                            [goal.id]: [...(prev[goal.id] || []), { id: created.id, title: created.title, steps: [] }],
                          }));
                          // Trigger background sync
                          syncService.silentSync();
                        } catch {
                          Alert.alert('Error', 'Failed to add milestone.');
                        } finally {
                          setLoading(false);
                        }
                      }}
                    >
                      <Icon name="plus" size={16} color={colors.text.secondary} />
                    </TouchableOpacity>
                  </View>
                </View>
                <Input
                  placeholder="Milestone title"
                  value={mDraft.title}
                  multiline
                  numberOfLines={3}
                  textAlignVertical="top"
                  style={[
                    styles.editInput,
                    editMilestoneHeights[goal.id]?.[mDraft.id]
                      ? { height: editMilestoneHeights[goal.id][mDraft.id] }
                      : null,
                  ]}
                  onContentSizeChange={(e: any) => {
                    const raw = e?.nativeEvent?.contentSize?.height || 0;
                    const clamped = Math.max(44, Math.min(raw + 12, 180));
                    setEditMilestoneHeights((prev) => ({
                      ...prev,
                      [goal.id]: { ...(prev[goal.id] || {}), [mDraft.id]: clamped },
                    }));
                  }}
                  onChangeText={(text) => setEditDrafts((prev) => ({
                    ...prev,
                    [goal.id]: prev[goal.id].map((md) => md.id === mDraft.id ? { ...md, title: text } : md),
                  }))}
                />
                {mDraft.steps.map((sDraft, sIndex) => (
                  <View key={sDraft.id} style={styles.stepEditRow}>
                    <View style={styles.stepHeaderRow}>
                      <Text style={styles.stepEditLabel}>Step {sIndex + 1}</Text>
                      <View style={styles.milestoneHeaderActions}>
                        <TouchableOpacity
                          style={styles.iconButton}
                          onPress={async () => {
                            try {
                              setLoading(true);
                              await goalRepository.deleteMilestoneStep(sDraft.id);
                              setGoals((prev) => prev.map((g) => g.id === goal.id ? {
                                ...g,
                                milestones: g.milestones.map((mm) => mm.id === mDraft.id ? { ...mm, steps: mm.steps.filter((s) => s.id !== sDraft.id) } : mm),
                              } : g));
                              setEditDrafts((prev) => ({
                                ...prev,
                                [goal.id]: prev[goal.id].map((mm) => mm.id === mDraft.id ? { ...mm, steps: mm.steps.filter((s) => s.id !== sDraft.id) } : mm),
                              }));
                              // Trigger background sync
                              syncService.silentSync();
                            } catch {
                              Alert.alert('Error', 'Failed to delete step.');
                            } finally {
                              setLoading(false);
                            }
                          }}
                        >
                          <Icon name="dash" size={16} color={colors.text.secondary} />
                        </TouchableOpacity>
                        <TouchableOpacity
                          style={styles.iconButton}
                          onPress={async () => {
                            try {
                              setLoading(true);
                              const order = (mDraft.steps?.length || 0) + 1;
                              const created = await goalRepository.createMilestoneStep(mDraft.id, { text: 'New step', order });
                              setGoals((prev) => prev.map((g) => g.id === goal.id ? {
                                ...g,
                                milestones: g.milestones.map((mm) => mm.id === mDraft.id ? { ...mm, steps: [...mm.steps, { id: created.id, title: created.text, description: '', completed: false, order }] } : mm),
                              } : g));
                              setEditDrafts((prev) => ({
                                ...prev,
                                [goal.id]: prev[goal.id].map((mm) => mm.id === mDraft.id ? { ...mm, steps: [...mm.steps, { id: created.id, title: created.text }] } : mm),
                              }));
                              // Trigger background sync
                              syncService.silentSync();
                            } catch {
                              Alert.alert('Error', 'Failed to add step.');
                            } finally {
                              setLoading(false);
                            }
                          }}
                        >
                          <Icon name="plus" size={16} color={colors.text.secondary} />
                        </TouchableOpacity>
                      </View>
                    </View>
                    <Input
                      placeholder="Step title"
                      value={sDraft.title}
                      multiline
                      numberOfLines={2}
                      textAlignVertical="top"
                      style={[
                        styles.editInput,
                        editStepHeights[goal.id]?.[sDraft.id]
                          ? { height: editStepHeights[goal.id][sDraft.id] }
                          : null,
                      ]}
                      onContentSizeChange={(e: any) => {
                        const raw = e?.nativeEvent?.contentSize?.height || 0;
                        const clamped = Math.max(44, Math.min(raw + 12, 180));
                        setEditStepHeights((prev) => ({
                          ...prev,
                          [goal.id]: { ...(prev[goal.id] || {}), [sDraft.id]: clamped },
                        }));
                      }}
                      onChangeText={(text) => setEditDrafts((prev) => ({
                        ...prev,
                        [goal.id]: prev[goal.id].map((md) => md.id === mDraft.id ? {
                          ...md,
                          steps: md.steps.map((sd) => sd.id === sDraft.id ? { ...sd, title: text } : sd),
                        } : md),
                      }))}
                    />
                  </View>
                ))}
                {/* Add new step button when there are no steps yet */}
                {mDraft.steps.length === 0 && (
                  <View style={styles.stepEditRow}>
                    <TouchableOpacity
                      style={[styles.iconButton, { alignSelf: 'flex-start' }]}
                      onPress={async () => {
                        try {
                          setLoading(true);
                          const order = 1;
                          const created = await goalRepository.createMilestoneStep(mDraft.id, { text: 'New step', order });
                          setGoals((prev) => prev.map((g) => g.id === goal.id ? {
                            ...g,
                            milestones: g.milestones.map((mm) => mm.id === mDraft.id ? { ...mm, steps: [...mm.steps, { id: created.id, title: created.text, description: '', completed: false, order }] } : mm),
                          } : g));
                          setEditDrafts((prev) => ({
                            ...prev,
                            [goal.id]: prev[goal.id].map((mm) => mm.id === mDraft.id ? { ...mm, steps: [...mm.steps, { id: created.id, title: created.text }] } : mm),
                          }));
                          // Trigger background sync
                          syncService.silentSync();
                        } catch {
                          Alert.alert('Error', 'Failed to add step.');
                        } finally {
                          setLoading(false);
                        }
                      }}
                    >
                      <Text style={styles.actionText}>+ Add step</Text>
                    </TouchableOpacity>
                  </View>
                )}
              </View>
            ))}
            {/* Add milestone button at end of list */}
            <View style={styles.editActions}>
              <TouchableOpacity
                style={styles.iconButton}
                onPress={async () => {
                  try {
                    setLoading(true);
                    const order = (goal.milestones?.length || 0) + 1;
                    const created = await goalRepository.createMilestone(goal.id, { title: 'New milestone', order });
                    setGoals((prev) => prev.map((g) => g.id === goal.id ? {
                      ...g,
                      milestones: [...g.milestones, { id: created.id, title: created.title, description: '', completed: false, order, steps: [] }],
                    } : g));
                    setEditDrafts((prev) => ({
                      ...prev,
                      [goal.id]: [...(prev[goal.id] || []), { id: created.id, title: created.title, steps: [] }],
                    }));
                    // Trigger background sync
                    syncService.silentSync();
                  } catch {
                    Alert.alert('Error', 'Failed to add milestone.');
                  } finally {
                    setLoading(false);
                  }
                }}
              >
                <Text style={styles.actionText}>+ Add milestone</Text>
              </TouchableOpacity>
            </View>
            <View style={styles.editActions}>
              <Button title={loading ? 'Saving...' : 'Save'} onPress={() => saveEdits(goal.id)} loading={loading} />
              <Button title="Cancel" onPress={() => cancelEdit(goal.id)} variant="secondary" />
            </View>
          </View>
        )}

        <View style={styles.goalActions}>
          <HelpTarget helpId={`goal-schedule-next-step:${goal.id}`} style={{ flex: 1 }}>
            <TouchableOpacity 
              style={styles.actionButton}
              onPress={() => {
              try {
                const currentMilestone = goal.milestones.find((m) => !m.completed);
                const nextStepObj = currentMilestone?.steps?.find((s) => !s.completed);
                const stepTitle = nextStepObj?.title || goal.nextStep || '';
                if (!stepTitle) {
                  Alert.alert('No next step', 'Add a step to this milestone to schedule it.');
                  return;
                }
                const dueHint = goal.targetDate ? ` Try to schedule before ${format(goal.targetDate, 'EEE, MMM d')}.` : '';
                const prompt = `Please schedule a calendar event for my next step: "${stepTitle}" (goal: "${goal.title}"). Choose an appropriate duration based on the step (generally between 15–90 minutes). Suggest 2-3 time options in the next 7 days.${dueHint}`;
                navigation.navigate('AIChat', { initialMessage: prompt });
              } catch {
                navigation.navigate('AIChat');
              }
              }}
            >
              <Text style={styles.actionButtonText}>Schedule next step</Text>
            </TouchableOpacity>
          </HelpTarget>
          <HelpTarget helpId={`goal-ask-ai:${goal.id}`} style={{ flex: 1 }}>
            <TouchableOpacity 
              style={styles.actionButton}
              onPress={() => {
              // Navigate to AI Chat tab and start a new conversation with pre-filled message
              navigation.navigate('AIChat', { 
                initialMessage: `Help me refine and improve this goal. Please ask me clarifying questions to help better establish my vision for this goal.\n\nGoal: ${goal.title}${goal.description ? `\nDescription: ${goal.description}` : ''}`
              });
              }}
            >
              <Text style={styles.actionButtonText}>Ask AI Help</Text>
            </TouchableOpacity>
          </HelpTarget>
        </View>
      </View>
    );
  }, [expandedGoals, editingGoals, editDrafts, editingDate, dateDrafts, androidDatePickerVisible, editMilestoneHeights, editStepHeights, loading, toggleStepCompleted, navigation]);

  // Memoize expensive goal calculations - MUST be before any conditional returns
  const { completedGoals, activeGoalsAll, overdueActiveGoals, nonOverdueActiveGoals, overallPct } = useMemo(() => {
    const completed = sortGoalsByTargetDate(goals.filter((g) => isGoalCompleted(g)));
    const active = goals.filter((g) => !isGoalCompleted(g));
    const isOverdueGoal = (g: Goal) => !!g.targetDate && isPast(g.targetDate) && !isToday(g.targetDate);
    const overdue = sortGoalsByTargetDate(active.filter((g) => isOverdueGoal(g)));
    const nonOverdue = sortGoalsByTargetDate(active.filter((g) => !isOverdueGoal(g)));
    const overallCompleted = active.reduce((sum, g) => sum + (g.completedSteps || 0), 0);
    const overallTotal = active.reduce((sum, g) => sum + (g.totalSteps || 0), 0);
    const overallPercentage = overallTotal > 0 ? (overallCompleted / overallTotal) * 100 : 0;
    
    return {
      completedGoals: completed,
      activeGoalsAll: active,
      overdueActiveGoals: overdue,
      nonOverdueActiveGoals: nonOverdue,
      overallPct: overallPercentage
    };
  }, [goals]);

  // Show loading state while checking authentication
  if (authState.isLoading) {
    return (
      <SafeAreaView style={styles.container} edges={['top', 'left', 'right']}>
        <StatusBar barStyle="dark-content" backgroundColor={colors.background.primary} translucent={false} />
        <ScreenHeader
          title="Goals"
          withDivider
        />
        <View style={styles.loadingContainer}>
          <Text style={styles.loadingText}>Checking authentication...</Text>
          <Text style={styles.debugText}>Debug: {authState.isAuthenticated ? 'Authenticated' : 'Not Authenticated'}</Text>
          {__DEV__ && (
            <>
              <Button
                title="Debug: Force Not Authenticated"
                onPress={() => {
                  setAuthState({
                    user: null,
                    token: null,
                    isLoading: false,
                    isAuthenticated: false,
                  });
                }}
                variant="secondary"
                style={styles.debugButton}
              />
              <Button
                title="Debug: Force Authenticated"
                onPress={() => {
                  setAuthState({
                    user: { id: 'debug-user', email: 'debug@test.com' },
                    token: 'debug-token',
                    isLoading: false,
                    isAuthenticated: true,
                  });
                }}
                variant="secondary"
                style={styles.debugButton}
              />
              <Button
                title="Debug: Re-initialize Auth"
                onPress={async () => {
                  await authService.debugReinitialize();
                }}
                variant="secondary"
                style={styles.debugButton}
              />
              <Button
                title="Debug: Check Database Contents"
                onPress={async () => {
                  await syncService.debugDatabaseContents();
                }}
                variant="secondary"
                style={styles.debugButton}
              />
              <Button
                title="Debug: Force Full Sync"
                onPress={async () => {
                  await syncService.fullSync(false);
                }}
                variant="secondary"
                style={styles.debugButton}
              />
            </>
          )}
        </View>
      </SafeAreaView>
    );
  }

  // Show login prompt if user is not authenticated
  if (!authState.isAuthenticated) {
    return (
      <SafeAreaView style={styles.container} edges={['top', 'left', 'right']}>
        <StatusBar barStyle="dark-content" backgroundColor={colors.background.primary} translucent={false} />
        <ScreenHeader title="Goals" withDivider />
        <View style={styles.authContainer}>
          <Text style={styles.authIcon}>🔐</Text>
          <Text style={styles.authTitle}>Welcome to Mind Clear</Text>
          <Text style={styles.authSubtitle}>
            Please log in to access your goals and use the AI assistant.
          </Text>
          <Button
            title="Log In"
            onPress={() => navigation.navigate('Login')}
            style={styles.authButton}
          />
          <Button
            title="Sign Up"
            onPress={() => navigation.navigate('Signup')}
            variant="outline"
            style={styles.authButton}
          />
        </View>
      </SafeAreaView>
    );
  }

  // Show loading state while fetching goals
  if (goalsLoading) {
    return (
      <SafeAreaView style={styles.container} edges={['top', 'left', 'right']}>
        <StatusBar barStyle="dark-content" backgroundColor={colors.background.primary} translucent={false} />
        <ScreenHeader title="Goals" withDivider />
        <LoadingSkeleton type="list" count={5} />
      </SafeAreaView>
    );
  }

  return (
    <HelpScope scope="goals">
    <SafeAreaView style={styles.container} edges={['top', 'left', 'right']}>
      <StatusBar barStyle="dark-content" backgroundColor={colors.background.primary} translucent={false} />
      <ScreenHeader
        title="Goals"
        rightActions={(
          <View style={styles.headerActions}>
            <TouchableOpacity
              onPress={() => setShowAddOptions(true)}
              accessibilityRole="button"
              accessibilityLabel="Add goal"
              style={styles.headerIconButton}
            >
              <Icon name="plus" size={20} color={colors.text.secondary} />
            </TouchableOpacity>
          </View>
        )}
        withDivider
      />

      <ScrollView 
        style={styles.content} 
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.scrollContent}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            colors={[colors.primary] as any}
            tintColor={colors.primary}
            progressBackgroundColor={colors.background.surface}
          />
        }
      >
        {/* Overall Progress Section */}
        <HelpTarget helpId="goals-overall" style={styles.overallSection}>
          <View style={styles.overallRow}>
            <View style={{ flex: 1 }}>
              <View style={styles.inlineLabelRow}>
                <Icon name="graph" size={16} color={colors.accent?.gold || colors.primary} />
                <Text style={styles.overallTitle}>Overall Progress</Text>
              </View>
              <Text style={styles.overallSubtext}>{activeGoalsAll.length} total goals</Text>
            </View>
            <View style={styles.overallRing}>
              <CircularProgress percentage={overallPct} size={46} />
            </View>
          </View>
        </HelpTarget>
        

        {/* Goals Section */}
        <View style={styles.goalsSection}>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>Active Goals ({nonOverdueActiveGoals.length})</Text>
            <HelpTarget helpId="goals-view-all">
              <TouchableOpacity onPress={() => setShowGoalsModal(true)}>
                <Text style={styles.viewAllText}>View All</Text>
              </TouchableOpacity>
            </HelpTarget>
          </View>

          {nonOverdueActiveGoals.length === 0 ? (
            <View style={styles.emptyState}>
              <Text style={styles.emptyStateIcon}>🎯</Text>
              <Text style={styles.emptyStateTitle}>No goals yet</Text>
              <Text style={styles.emptyStateText}>
                Start by adding your first goal.
              </Text>
              <Button
                title="Add Goal"
                onPress={() => setShowAddOptions(true)}
                style={styles.emptyStateButton}
              />
            </View>
          ) : (
            <View style={styles.goalsList}>
              {nonOverdueActiveGoals.map(renderGoalCard)}
            </View>
          )}
        </View>
        {/* Inline AI Assistant flow removed. Use Add Goal button above. */}

        {/* Needs Review (Overdue) Section */}
        <View style={styles.goalsSection}>
          <TouchableOpacity style={styles.sectionHeader} onPress={() => setNeedsReviewExpanded((p) => !p)}>
            <Text style={styles.sectionTitle}>Needs Review ({overdueActiveGoals.length})</Text>
            <Icon
              name="chevron-right"
              size={16}
              color={colors.text.secondary}
              style={{ transform: [{ rotate: needsReviewExpanded ? '90deg' : '0deg' }] as any }}
            />
          </TouchableOpacity>
          {needsReviewExpanded && (
            <>
              <Text style={styles.sectionNoteText}>These goals are past their target. No worries — tap the date to pick a new one.</Text>
              {overdueActiveGoals.length === 0 ? (
                <Text style={styles.completedEmptyText}>Nothing needs review right now.</Text>
              ) : (
                <View style={styles.goalsList}>
                  {overdueActiveGoals.map(renderGoalCard)}
                </View>
              )}
            </>
          )}
        </View>

        {/* Completed Goals Section */}
        <View style={styles.goalsSection}>
          <TouchableOpacity style={styles.sectionHeader} onPress={() => setCompletedExpanded((p) => !p)}>
            <Text style={styles.sectionTitle}>Completed Goals ({completedGoals.length})</Text>
            <Icon
              name="chevron-right"
              size={16}
              color={colors.text.secondary}
              style={{ transform: [{ rotate: completedExpanded ? '90deg' : '0deg' }] as any }}
            />
          </TouchableOpacity>

          {completedExpanded && (
            completedGoals.length === 0 ? (
              <Text style={styles.completedEmptyText}>No completed goals yet.</Text>
            ) : (
              <View style={styles.goalsList}>
                {completedGoals.map(renderGoalCard)}
              </View>
            )
          )}
        </View>

        
      </ScrollView>

      {/* Goals List Modal */}
      <GoalsListModal
        visible={showGoalsModal}
        onClose={() => setShowGoalsModal(false)}
        goals={goals}
        onGoalPress={handleGoalPress}
        onGoalDelete={handleGoalDelete}
      />

      {/* Add Goal Options Modal */}
      <AddGoalOptionsModal
        visible={showAddOptions}
        onClose={() => setShowAddOptions(false)}
        onCreateManually={() => {
          setShowAddOptions(false);
          navigation.navigate('GoalForm');
        }}
        onAskAI={() => {
          setShowAddOptions(false);
          navigation.navigate('AIChat', { initialMessage: 'I want to add a new goal' });
        }}
      />

      {/* Help icon moved into header actions */}
    </SafeAreaView>
    </HelpScope>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background.primary,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.border.light,
    backgroundColor: colors.background.primary,
  },
  headerTitle: {
    fontSize: typography.fontSize.xl,
    fontWeight: typography.fontWeight.bold,
    color: colors.text.primary,
  },
  headerActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  content: {
    flex: 1,
    padding: spacing.md,
  },
  scrollContent: {
    paddingBottom: spacing.xl * 2, // Extra padding for system navigation
  },
  aiSection: {
    backgroundColor: colors.background.surface,
    borderRadius: borderRadius.lg,
    padding: spacing.md,
    marginBottom: spacing.lg,
    borderWidth: 1,
    borderColor: colors.border.light,
  },
  overallSection: {
    backgroundColor: colors.background.surface,
    borderRadius: borderRadius.lg,
    padding: spacing.md,
    marginBottom: spacing.lg,
    borderWidth: 1,
    borderColor: colors.border.light,
  },
  overallRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  overallTitle: {
    fontSize: typography.fontSize.lg,
    fontWeight: typography.fontWeight.bold,
    color: colors.text.primary,
    marginLeft: spacing.xs,
  },
  overallSubtext: {
    fontSize: typography.fontSize.sm,
    color: colors.text.secondary,
    marginTop: spacing.xs,
  },
  overallRing: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  aiSectionCompact: {
    paddingVertical: spacing.sm,
  },
  aiHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: spacing.sm,
  },
  aiTitle: {
    fontSize: typography.fontSize.lg,
    fontWeight: typography.fontWeight.bold,
    color: colors.text.primary,
  },
  aiPrompt: {
    alignItems: 'center',
  },
  aiPromptText: {
    fontSize: typography.fontSize.base,
    color: colors.text.secondary,
    marginBottom: spacing.xs,
    textAlign: 'left',
    alignSelf: 'stretch',
  },
  aiButton: {
    minWidth: 120,
  },
  aiInputContainer: {
    marginTop: spacing.sm,
  },
  aiInput: {
    marginBottom: spacing.sm,
  },
  aiInputActions: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  aiCancelButton: {
    flex: 1,
    marginRight: spacing.sm,
  },
  aiSubmitButton: {
    flex: 1,
  },
  aiReviewContainer: {
    marginTop: spacing.sm,
  },
  aiReviewTitle: {
    fontSize: typography.fontSize.lg,
    fontWeight: typography.fontWeight.bold,
    color: colors.text.primary,
    marginBottom: spacing.md,
    textAlign: 'center',
  },
  suggestionCard: {
    backgroundColor: colors.secondary,
    borderRadius: borderRadius.lg,
    padding: spacing.md,
    marginBottom: spacing.md,
    borderWidth: 1,
    borderColor: colors.border.light,
  },
  suggestionGoalTitle: {
    fontSize: typography.fontSize.lg,
    fontWeight: typography.fontWeight.bold,
    color: colors.text.primary,
    marginBottom: spacing.sm,
  },
  suggestionGoalDescription: {
    fontSize: typography.fontSize.sm,
    color: colors.text.secondary,
    marginBottom: spacing.md,
    lineHeight: typography.lineHeight.normal * typography.fontSize.sm,
  },
  milestonesTitle: {
    fontSize: typography.fontSize.base,
    fontWeight: typography.fontWeight.bold,
    color: colors.text.primary,
    marginBottom: spacing.sm,
  },
  suggestionMilestone: {
    flexDirection: 'row',
    marginBottom: spacing.sm,
  },
  milestoneNumber: {
    fontSize: typography.fontSize.sm,
    fontWeight: typography.fontWeight.bold,
    color: colors.text.secondary,
    marginRight: spacing.sm,
    minWidth: 20,
  },
  milestoneContent: {
    flex: 1,
  },
  milestoneTitle: {
    fontSize: typography.fontSize.sm,
    fontWeight: typography.fontWeight.bold,
    color: colors.text.primary,
    marginBottom: spacing.xs,
  },
  milestoneDescription: {
    fontSize: typography.fontSize.xs,
    color: colors.text.secondary,
    lineHeight: typography.lineHeight.normal * typography.fontSize.xs,
  },
  stepsContainer: {
    marginTop: spacing.xs,
    marginLeft: spacing.sm,
  },
  suggestionStep: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: spacing.xs,
  },
  stepNumber: {
    fontSize: typography.fontSize.xs,
    color: colors.text.secondary,
    marginRight: spacing.xs,
  },
  stepTitle: {
    fontSize: typography.fontSize.xs,
    color: colors.text.secondary,
    flex: 1,
  },
  aiReviewActions: {
    flexDirection: 'column',
    gap: spacing.sm,
  },
  acceptButton: {
    flex: 1,
    minWidth: '45%',
  },
  acceptAsIsButton: {
    flex: 1,
    minWidth: '45%',
  },
  acceptButtonPrimary: {
    flex: 1,
    minWidth: '45%',
    backgroundColor: colors.primary,
  },
  acceptAsIsGold: {
    flex: 1,
    minWidth: '45%',
    backgroundColor: colors.accent?.gold || '#D4AF37',
  },
  redoButton: {
    flex: 1,
    minWidth: '45%',
  },
  cancelButton: {
    flex: 1,
    minWidth: '45%',
  },
  rowTwo: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  half: {
    flex: 1,
  },
  fullWidth: {
    width: '100%',
  },
  buttonFull: {
    width: '100%',
    maxWidth: '100%',
  },
  goalsSection: {
    marginBottom: spacing.lg,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: spacing.md,
  },
  sectionTitle: {
    fontSize: typography.fontSize.lg,
    fontWeight: typography.fontWeight.bold,
    color: colors.text.primary,
  },
  viewAllText: {
    fontSize: typography.fontSize.sm,
    color: colors.primary,
    fontWeight: typography.fontWeight.medium as any,
  },
  emptyState: {
    alignItems: 'center',
    paddingVertical: spacing.xl,
  },
  emptyStateIcon: {
    fontSize: 48,
    marginBottom: spacing.md,
  },
  emptyStateTitle: {
    fontSize: typography.fontSize.xl,
    fontWeight: typography.fontWeight.bold,
    color: colors.text.primary,
    marginBottom: spacing.sm,
  },
  emptyStateText: {
    fontSize: typography.fontSize.base,
    color: colors.text.secondary,
    textAlign: 'center',
    marginBottom: spacing.lg,
    paddingHorizontal: spacing.lg,
  },
  emptyStateButton: {
    minWidth: 200,
  },
  goalsList: {
    gap: spacing.md,
  },
  goalCard: {
    backgroundColor: colors.secondary,
    borderRadius: borderRadius.lg,
    padding: spacing.md,
    borderWidth: 1,
    borderColor: colors.border.light,
  },
  goalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: spacing.sm,
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.sm,
  },
  iconActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
  iconButton: {
    padding: spacing.xs,
    borderRadius: borderRadius.sm,
  },
  headerIconButton: {
    padding: 8,
    borderWidth: 1,
    borderColor: colors.border.light,
    borderRadius: 6,
    backgroundColor: colors.background.surface,
  },
  ringContainer: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  ringCaption: {
    marginTop: spacing.xs,
    fontSize: typography.fontSize.xs,
    color: colors.accent?.gold || colors.text.secondary,
  },
  progressCenterTextContainer: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    alignItems: 'center',
    justifyContent: 'center',
  },
  progressCenterText: {
    fontSize: typography.fontSize.xs,
    fontWeight: typography.fontWeight.bold as any,
    color: colors.text.primary,
  },
  goalTitle: {
    fontSize: typography.fontSize.lg,
    fontWeight: typography.fontWeight.bold,
    color: colors.text.primary,
    flex: 1,
  },
  goalHeaderActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  statusIndicator: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  deleteButton: {
    padding: spacing.xs,
    borderRadius: borderRadius.sm,
  },
  goalDescription: {
    fontSize: typography.fontSize.sm,
    color: colors.text.secondary,
    marginBottom: spacing.sm,
  },
  dueRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6 as any,
  },
  dueText: {
    marginLeft: spacing.xs,
    fontSize: typography.fontSize.xs,
    color: colors.text.secondary,
    fontWeight: typography.fontWeight.medium as any,
  },
  stepsHeader: {
    paddingVertical: spacing.xs,
    marginTop: spacing.xs,
    backgroundColor: colors.background.surface,
    borderRadius: borderRadius.sm,
    paddingHorizontal: spacing.sm,
    borderWidth: 1,
    borderColor: colors.border.light,
  },
  stepsHeaderContent: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  stepsHeaderText: {
    fontSize: typography.fontSize.sm,
    color: colors.accent?.gold || colors.text.primary,
    fontWeight: typography.fontWeight.medium as any,
  },
  stepsExpandIcon: {
    padding: spacing.xs,
    borderRadius: borderRadius.sm,
    backgroundColor: colors.background.primary,
    borderWidth: 1,
    borderColor: colors.border.light,
  },
  stepsList: {
    marginTop: spacing.xs,
    marginBottom: spacing.sm,
  },
  unlockNote: {
    marginTop: spacing.xs,
    fontSize: typography.fontSize.xs,
    color: colors.text.secondary,
  },
  dateEditContainer: {
    marginTop: spacing.xs,
  },
  dateEditActions: {
    flexDirection: 'row',
    gap: spacing.md,
    marginTop: spacing.xs,
  },
  actionText: {
    color: colors.accent?.gold || colors.primary,
    fontSize: typography.fontSize.sm,
    fontWeight: typography.fontWeight.medium as any,
  },
  stepRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 6,
  },
  stepIconButton: {
    padding: 14, // 14px padding on each side = 28px + 16px icon = 44px minimum touch area
    marginRight: spacing.xs,
    minWidth: 44,
    minHeight: 44,
    justifyContent: 'center',
    alignItems: 'center',
  },
  stepText: {
    fontSize: typography.fontSize.sm,
    color: colors.text.primary,
    flex: 1,
  },
  stepTextCompleted: {
    textDecorationLine: 'line-through',
    color: colors.text.secondary,
  },
  editContainer: {
    marginTop: spacing.xs,
    marginBottom: spacing.sm,
  },
  milestoneEditBlock: {
    marginBottom: spacing.sm,
  },
  milestoneHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: spacing.xs,
  },
  milestoneHeaderActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
  milestoneEditLabel: {
    fontSize: typography.fontSize.base,
    color: colors.text.primary,
    fontWeight: typography.fontWeight.bold as any,
    marginBottom: spacing.xs,
  },
  stepEditRow: {
    marginTop: spacing.xs,
  },
  stepHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: spacing.xs,
  },
  stepEditLabel: {
    fontSize: typography.fontSize.sm,
    color: colors.text.secondary,
    marginBottom: spacing.xs,
  },
  editInput: {
    paddingVertical: spacing.sm,
    minHeight: 44,
    lineHeight: typography.lineHeight.normal * typography.fontSize.sm,
  },
  editActions: {
    marginTop: spacing.xs,
    gap: spacing.xs,
  },
  
  nextMilestoneContainer: {
    flexDirection: 'column',
    alignItems: 'flex-start',
    marginBottom: spacing.md,
  },
  inlineLabelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    marginBottom: spacing.xs,
  },
  goldDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: colors.accent?.gold || colors.warning,
  },
  nextMilestoneLabel: {
    fontSize: typography.fontSize.sm,
    color: colors.text.secondary,
    marginRight: spacing.xs,
    fontWeight: typography.fontWeight.bold as any,
  },
  nextMilestoneText: {
    fontSize: typography.fontSize.sm,
    color: colors.text.primary,
    fontWeight: typography.fontWeight.medium as any,
    flex: 1,
    flexShrink: 1,
    flexWrap: 'wrap',
  },
  nextStepContainer: {
    flexDirection: 'column',
    alignItems: 'flex-start',
    marginBottom: spacing.md,
  },
  nextStepLabel: {
    fontSize: typography.fontSize.sm,
    color: colors.text.secondary,
    marginRight: spacing.xs,
    fontWeight: typography.fontWeight.bold as any,
  },
  nextStepText: {
    fontSize: typography.fontSize.sm,
    color: colors.text.primary,
    fontWeight: typography.fontWeight.medium as any,
    flex: 1,
    flexShrink: 1,
    flexWrap: 'wrap',
  },
  goalActions: {
    flexDirection: 'row',
    gap: spacing.sm,
    marginTop: spacing.md,
  },
  actionButton: {
    flex: 1,
    backgroundColor: colors.background.surface,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    borderRadius: borderRadius.md,
    alignItems: 'center',
  },
  actionButtonText: {
    fontSize: typography.fontSize.sm,
    color: colors.text.primary,
    fontWeight: typography.fontWeight.medium as any,
  },
  
  completedEmptyText: {
    fontSize: typography.fontSize.sm,
    color: colors.text.secondary,
    marginBottom: spacing.md,
  },
  sectionNoteText: {
    fontSize: typography.fontSize.xs,
    color: colors.text.secondary,
    marginBottom: spacing.sm,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: spacing.md,
  },
  loadingText: {
    fontSize: typography.fontSize.lg,
    color: colors.text.secondary,
  },
  debugText: {
    fontSize: typography.fontSize.sm,
    color: colors.text.secondary,
    marginTop: spacing.sm,
  },
  debugButton: {
    marginTop: spacing.sm,
  },
  authContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: spacing.md,
    backgroundColor: colors.background.surface,
  },
  authIcon: {
    fontSize: 60,
    marginBottom: spacing.sm,
  },
  authTitle: {
    fontSize: typography.fontSize.xl,
    fontWeight: typography.fontWeight.bold,
    color: colors.text.primary,
    marginBottom: spacing.sm,
  },
  authSubtitle: {
    fontSize: typography.fontSize.base,
    color: colors.text.secondary,
    textAlign: 'center',
    marginBottom: spacing.lg,
    paddingHorizontal: spacing.lg,
  },
  authButton: {
    minWidth: 200,
    marginBottom: spacing.sm,
  },
});

const enhance = withObservables(['database'], ({database}) => {
  const goals = database.collections.get('goals')
    .query(Q.where('status', Q.notEq('pending_delete')))
    .observe();
  
  // Also observe milestones and steps so component refreshes when they change
  const milestones = database.collections.get('milestones')
    .query()
    .observe();
  
  const steps = database.collections.get('milestone_steps')
    .query()
    .observe();
  
  return {
    goals,
    milestones,
    steps,
  };
});

const EnhancedGoalsScreen = enhance(GoalsScreen);

const GoalsScreenWithDatabase = (props: any) => {
  const database = useDatabase();
  return <EnhancedGoalsScreen {...props} database={database} />;
};

export default GoalsScreenWithDatabase;
