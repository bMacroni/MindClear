import * as React from 'react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, PanResponder, Animated, Dimensions, ScrollView, Modal } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import BrainDumpSubNav from './BrainDumpSubNav';
import { colors } from '../../themes/colors';
import { spacing, borderRadius } from '../../themes/spacing';
import { typography } from '../../themes/typography';
import { HugeiconsIcon as Icon } from '@hugeicons/react-native';
import { Menu01Icon } from '@hugeicons/core-free-icons';
import { SuccessToast } from '../../components/common/SuccessToast';
import { tasksAPI } from '../../services/api';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useBrainDump } from '../../contexts/BrainDumpContext';
import { taskRepository } from '../../repositories/TaskRepository';
import { BrainDumpLoadingScreen } from '../../components/brain/BrainDumpLoadingScreen';
import { OnboardingService } from '../../services/onboarding';


type Priority = 'low' | 'medium' | 'high';
type TaskItem = { id: string; text: string; priority: Priority; category?: string | null };

type DraggableTaskProps = {
  item: TaskItem;
  onDragStart: (_taskId: string) => void;
  isDragging: boolean;
};

const DraggableTask: React.FC<DraggableTaskProps> = ({ item, onDragStart, isDragging }) => {
  // Removed unused pan animated value
  const scale = useRef(new Animated.Value(1)).current;

  // Use TouchableOpacity for drag initiation instead of PanResponder
  const handleLongPress = () => {
    onDragStart(item.id);
    Animated.spring(scale, { toValue: 1.05, useNativeDriver: true }).start();
  };

  // Reset scale when dragging stops
  useEffect(() => {
    if (!isDragging) {
      Animated.spring(scale, { toValue: 1, useNativeDriver: true }).start();
    }
  }, [isDragging, scale]);

  const animatedStyle: any = {
    transform: [
      { scale: scale }
    ],
    zIndex: isDragging ? 1000 : 1,
    elevation: isDragging ? 1000 : 1,
  };

  return (
    <Animated.View style={[animatedStyle, { opacity: isDragging ? 0 : 1 }]}>
      <TouchableOpacity
        onLongPress={handleLongPress}
        delayLongPress={300}
        activeOpacity={0.8}
        accessibilityLabel={`${item.text}. Long press to drag to a priority zone.`}
        accessibilityRole="button"
        accessibilityHint="Long press to drag this task to a different priority zone"
      >
        <View style={[
          styles.card,
          item.priority === 'high' && styles.cardHigh,
          item.priority === 'medium' && styles.cardMedium,
          item.priority === 'low' && styles.cardLow,
        ]}>
          <View style={styles.row}>
            <View style={[
              styles.sectionStripe,
              item.priority === 'high' && styles.stripeHigh,
              item.priority === 'medium' && styles.stripeMedium,
              item.priority === 'low' && styles.stripeLow
            ]} />
            <Text style={styles.text} numberOfLines={3} selectable={false}>{item.text}</Text>
            <Icon
              icon={Menu01Icon}
              size={16}
              color={colors.text.secondary}
              style={{ marginLeft: 8 }}
            />
          </View>
        </View>
      </TouchableOpacity>
    </Animated.View>
  );
};


export default function BrainDumpPrioritizationScreen({ navigation, route }: any) {
  const incomingTasks = (route?.params?.tasks as Array<{ text: string; priority: Priority; category?: string | null }> | undefined) ?? [];
  const { items, clearSession } = useBrainDump();
  const seeded = React.useMemo<TaskItem[]>(() => {
    const now = Date.now();
    const source = (Array.isArray(incomingTasks) && incomingTasks.length > 0)
      ? incomingTasks
      : (Array.isArray(items) ? (items as any[]).filter((i: any) => (i?.type || '').toLowerCase() === 'task') : []);
    return source.map((t: any, i: number) => ({
      id: `${now}-${i}-${t.text}`,
      text: t.text,
      priority: t.priority,
      category: t.category ?? null,
    }));
  }, [incomingTasks, items]);

  const [tasks, setTasks] = useState<TaskItem[]>(seeded);
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [highlightedZone, setHighlightedZone] = useState<Priority | null>(null);
  const [saving, setSaving] = useState(false);
  const [toastVisible, setToastVisible] = useState(false);
  const [toastMessage, setToastMessage] = useState('');
  const [showOverlay, setShowOverlay] = useState(false);
  const [showLoadingScreen, setShowLoadingScreen] = useState(false);
  const [ghostPosition, setGhostPosition] = useState<{ x: number; y: number }>({ x: 0, y: 0 });
  const [scrollEnabled, setScrollEnabled] = useState(true);
  const [zoneBoundaries, setZoneBoundaries] = useState<{
    high: { top: number; bottom: number } | null;
    medium: { top: number; bottom: number } | null;
    low: { top: number; bottom: number } | null;
  }>({
    high: null,
    medium: null,
    low: null,
  });

  // Refs for timeout cleanup to prevent memory leaks
  const outerTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const innerTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const isMountedRef = useRef(true);

  const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window');

  // Function to measure overlay zone boundaries
  const handleZoneLayout = (zone: Priority, event: any) => {
    const { y, height } = event.nativeEvent.layout;
    setZoneBoundaries(prev => ({
      ...prev,
      [zone]: { top: y, bottom: y + height }
    }));
  };

  // Single PanResponder for the entire screen to handle dragging
  const screenPanResponder = PanResponder.create({
    onMoveShouldSetPanResponder: (_evt, _gestureState) => {
      // Only respond if we're currently dragging
      return draggingId !== null;
    },
    onPanResponderMove: (evt, _gestureState) => {
      if (draggingId) {
        const dropX = evt.nativeEvent.pageX;
        const dropY = evt.nativeEvent.pageY;
        onDragMove(dropX, dropY);
      }
    },
    onPanResponderRelease: (evt, _gestureState) => {
      if (draggingId) {
        const dropX = evt.nativeEvent.pageX;
        const dropY = evt.nativeEvent.pageY;
        onDragEnd(draggingId, dropX, dropY);
      }
    }
  });

  useEffect(() => {
    // Persist order in session so it's preserved if user navigates away and back
    (async () => {
      try { await AsyncStorage.setItem('brainDumpPrioritizedTasks', JSON.stringify(tasks)); } catch { }
    })();
  }, [tasks]);

  useEffect(() => {
    (async () => {
      try {
        const cached = await AsyncStorage.getItem('brainDumpPrioritizedTasks');
        if (cached) {
          const parsed = JSON.parse(cached);
          if (Array.isArray(parsed) && parsed.length > 0) {
            const withIds = parsed.map((p: any, i: number) => ({
              id: typeof p?.id === 'string' ? p.id : `${Date.now()}-${i}-${p.text}`,
              text: p.text,
              priority: p.priority,
              category: p.category ?? null,
            }));
            setTasks(withIds);
          }
        }
      } catch { }
    })();
  }, []);

  // Fallback: if no route params and nothing cached yet, derive tasks from lastBrainDumpItems in storage
  useEffect(() => {
    (async () => {
      if (seeded.length > 0) { return; }
      try {
        const raw = await AsyncStorage.getItem('lastBrainDumpItems');
        if (!raw) { return; }
        const parsed = JSON.parse(raw);
        if (!Array.isArray(parsed)) { return; }
        const now = Date.now();
        const derived: TaskItem[] = parsed
          .filter((it: any) => (it?.type || '').toLowerCase() === 'task' && typeof it?.text === 'string')
          .map((it: any, idx: number) => ({
            id: `${now}-${idx}-${String(it.text)}`,
            text: String(it.text),
            priority: ['low', 'medium', 'high'].includes(String(it.priority)) ? String(it.priority) as any : 'medium',
            category: it?.category ?? null,
          }));
        if (derived.length > 0) {
          setTasks(derived);
        }
      } catch { }
    })();
  }, [seeded.length]);

  // Cleanup effect to clear timers and prevent setState/navigation on unmounted component
  useEffect(() => {
    isMountedRef.current = true;

    return () => {
      isMountedRef.current = false;
      // Clear both timers if they exist
      if (outerTimeoutRef.current !== null) {
        clearTimeout(outerTimeoutRef.current);
        outerTimeoutRef.current = null;
      }
      if (innerTimeoutRef.current !== null) {
        clearTimeout(innerTimeoutRef.current);
        innerTimeoutRef.current = null;
      }
    };
  }, []);

  const handleDragStart = (taskId: string) => {
    setDraggingId(taskId);
    setShowOverlay(true);
    setScrollEnabled(false); // Disable scrolling during drag
  };

  const onDragMove = (dropX: number, dropY: number) => {
    let targetZone: Priority | null = null;

    // Use measured zone boundaries if available, otherwise fall back to screen-based calculation
    if (zoneBoundaries.high && zoneBoundaries.medium && zoneBoundaries.low) {
      if (dropY >= zoneBoundaries.high.top && dropY < zoneBoundaries.high.bottom) {
        targetZone = 'high';
      } else if (dropY >= zoneBoundaries.medium.top && dropY < zoneBoundaries.medium.bottom) {
        targetZone = 'medium';
      } else if (dropY >= zoneBoundaries.low.top && dropY < zoneBoundaries.low.bottom) {
        targetZone = 'low';
      }
    } else {
      // Fallback to original calculation if zones haven't been measured yet
      const zoneHeight = SCREEN_HEIGHT / 3;
      if (dropY < zoneHeight) {
        targetZone = 'high';
      } else if (dropY < zoneHeight * 2) {
        targetZone = 'medium';
      } else {
        targetZone = 'low';
      }
    }

    setHighlightedZone(targetZone);
    setGhostPosition({ x: dropX, y: dropY });
  };

  const onDragEnd = (taskId: string, dropX: number, dropY: number) => {
    setDraggingId(null);
    setShowOverlay(false);
    setScrollEnabled(true); // Re-enable scrolling after drag
    setHighlightedZone(null); // Clear highlight

    // Determine which zone the task was dropped in based on Y position
    let targetPriority: Priority | null = null;

    // Use measured zone boundaries if available, otherwise fall back to screen-based calculation
    if (zoneBoundaries.high && zoneBoundaries.medium && zoneBoundaries.low) {
      if (dropY >= zoneBoundaries.high.top && dropY < zoneBoundaries.high.bottom) {
        targetPriority = 'high';
      } else if (dropY >= zoneBoundaries.medium.top && dropY < zoneBoundaries.medium.bottom) {
        targetPriority = 'medium';
      } else if (dropY >= zoneBoundaries.low.top && dropY < zoneBoundaries.low.bottom) {
        targetPriority = 'low';
      }
    } else {
      // Fallback to original calculation if zones haven't been measured yet
      const zoneHeight = SCREEN_HEIGHT / 3;
      if (dropY < zoneHeight) {
        targetPriority = 'high';
      } else if (dropY < zoneHeight * 2) {
        targetPriority = 'medium';
      } else {
        targetPriority = 'low';
      }
    }

    if (targetPriority) {
      // Update task priority
      setTasks(prevTasks =>
        prevTasks.map(task =>
          task.id === taskId
            ? { ...task, priority: targetPriority }
            : task
        )
      );
    }

    setHighlightedZone(null);
  };



  const sortedTasks = useMemo(() => {
    const weight: Record<Priority, number> = { high: 0, medium: 1, low: 2 };
    return [...tasks].sort((a, b) => weight[a.priority] - weight[b.priority]);
  }, [tasks]);

  const onSave = async () => {
    if (saving || tasks.length === 0) { return; }

    // Clear any existing timers before starting a new save operation
    if (outerTimeoutRef.current !== null) {
      clearTimeout(outerTimeoutRef.current);
      outerTimeoutRef.current = null;
    }
    if (innerTimeoutRef.current !== null) {
      clearTimeout(innerTimeoutRef.current);
      innerTimeoutRef.current = null;
    }

    setSaving(true);

    // Show loading screen immediately for smooth transition
    setShowLoadingScreen(true);
    const startTime = Date.now();

    try {
      const high = tasks.filter(i => i.priority === 'high');
      const medium = tasks.filter(i => i.priority === 'medium');
      const low = tasks.filter(i => i.priority === 'low');
      const focus = high[0] || medium[0] || low[0];
      const remainder = tasks.filter(i => i !== focus);

      // Prepare tasks to create
      const tasksToCreate = remainder.length > 0
        ? remainder.map(it => ({
          title: it.text,
          description: '',
          priority: it.priority,
          category: it.category || undefined,
          is_today_focus: false
        }))
        : [];

      // Create focus task and bulk create remainder tasks in parallel for better performance
      const createFocusTask = async () => {
        if (!focus) return null;

        try {
          return await tasksAPI.createTask({
            title: focus.text,
            description: '',
            priority: focus.priority,
            category: focus.category || undefined,
            is_today_focus: true
          } as any);
        } catch (error: any) {
          // If we get a focus constraint violation, handle it without fetching all tasks
          if (error?.code === 'FOCUS_CONSTRAINT_VIOLATION' ||
            String(error?.message || '').includes('already have a task set as today\'s focus')) {

            // Instead of fetching all tasks, use the error response which may contain the existing focus task ID
            // If not available, we'll handle it gracefully by just creating the task without focus
            // The sync will handle updating the focus correctly
            console.warn('Focus constraint violation, creating task without focus flag');
            return await tasksAPI.createTask({
              title: focus.text,
              description: '',
              priority: focus.priority,
              category: focus.category || undefined,
              is_today_focus: false
            } as any);
          } else {
            throw error; // Re-throw if it's not a focus constraint issue
          }
        }
      };

      const createRemainderTasks = async () => {
        if (tasksToCreate.length === 0) return [];
        return await tasksAPI.bulkCreateTasks(tasksToCreate as any);
      };

      // Execute both operations in parallel
      const [focusTaskResult, remainderTasksResult] = await Promise.all([
        createFocusTask(),
        createRemainderTasks()
      ]);

      // Write all created tasks to local database immediately so they appear in UI
      const allCreatedTasks = [
        ...(focusTaskResult ? [focusTaskResult] : []),
        ...(Array.isArray(remainderTasksResult) ? remainderTasksResult : [])
      ];

      if (allCreatedTasks.length > 0) {
        try {
          await taskRepository.createTasksFromServer(allCreatedTasks);
        } catch (localWriteError) {
          // Log but don't fail - sync will handle it
          console.warn('Failed to write tasks to local DB immediately, sync will handle:', localWriteError);
        }
      }

      try { await AsyncStorage.multiRemove(['lastBrainDumpThreadId', 'lastBrainDumpItems', 'brainDumpPrioritizedTasks']); } catch { }
      try { await clearSession(); } catch { }

      // Clear the UI on successful save
      setTasks([]);

      // Wait for minimum duration to ensure smooth transition, then navigate
      const minDuration = 1500; // 1.5 seconds minimum

      // Calculate how long the save operations took
      const elapsed = Date.now() - startTime;
      const remainingTime = Math.max(0, minDuration - elapsed);

      // Wait for remaining time (if any) plus a small fade-out delay, then navigate
      // Store timeout ID and check mounted flag to prevent memory leaks
      outerTimeoutRef.current = setTimeout(() => {
        // Check if component is still mounted before updating state
        if (!isMountedRef.current) return;

        setShowLoadingScreen(false);
        // Small delay before navigation to allow loading screen to fade out smoothly
        innerTimeoutRef.current = setTimeout(async () => {
          // Check if component is still mounted before navigating
          if (!isMountedRef.current) return;

          // Check if first session and guidance not shown yet
          try {
            const isFirstSession = await OnboardingService.isFirstSession();
            const guidanceShown = await AsyncStorage.getItem('focusGuidanceShown');

            if (isFirstSession && !guidanceShown) {
              // Navigate to Focus Task Guidance screen for first-time users
              navigation.navigate('FocusTaskGuidance');
              // Mark first session as complete (but not full onboarding)
              await OnboardingService.markFirstSessionComplete();
            } else {
              // Navigate to Tasks tab for returning users
              navigation.navigate('Tasks');
            }
          } catch (error) {
            console.warn('Error checking first session for navigation:', error);
            // Fallback to Tasks tab on error
            navigation.navigate('Tasks');
          }

          innerTimeoutRef.current = null;
        }, 200);
        outerTimeoutRef.current = null;
      }, remainingTime);
    } catch (error: any) {
      // Clear any pending timers on error
      if (outerTimeoutRef.current !== null) {
        clearTimeout(outerTimeoutRef.current);
        outerTimeoutRef.current = null;
      }
      if (innerTimeoutRef.current !== null) {
        clearTimeout(innerTimeoutRef.current);
        innerTimeoutRef.current = null;
      }

      // Hide loading screen on error
      if (isMountedRef.current) {
        setShowLoadingScreen(false);
      }

      // Handle specific focus constraint violation
      if (String(error?.message || '').includes('already have a task set as today\'s focus') ||
        error?.code === 'FOCUS_CONSTRAINT_VIOLATION') {
        if (isMountedRef.current) {
          setToastMessage('Updated your existing focus task with the new priority.');
          setToastVisible(true);
        }
      } else {
        if (isMountedRef.current) {
          setToastMessage('Failed to save tasks. Please try again.');
          setToastVisible(true);
        }
      }
    } finally {
      if (isMountedRef.current) {
        setSaving(false);
      }
    }
  };

  return (
    <SafeAreaView style={styles.container} edges={['top', 'left', 'right']} {...screenPanResponder.panHandlers}>
      <View style={styles.headerRow}>
        <Text style={styles.title}>Prioritize your tasks</Text>
      </View>
      <BrainDumpSubNav active="prioritize" navigation={navigation} canRefine={true} canPrioritize={tasks.length > 0} />

      <View style={styles.infoBanner}>
        <Icon icon={Menu01Icon} size={14} color={colors.text.secondary} style={{ marginRight: 6 }} />
        <Text style={styles.infoText}>Long-press tasks to drag them to priority zones</Text>
      </View>

      <View style={styles.legendRow}>
        <View style={styles.legendItem}>
          <View style={[styles.legendSwatch, { backgroundColor: '#F44336' }]} />
          <Text style={styles.legendText}>High</Text>
        </View>
        <View style={styles.legendItem}>
          <View style={[styles.legendSwatch, { backgroundColor: '#FF9800' }]} />
          <Text style={styles.legendText}>Medium</Text>
        </View>
        <View style={styles.legendItem}>
          <View style={[styles.legendSwatch, { backgroundColor: '#4CAF50' }]} />
          <Text style={styles.legendText}>Low</Text>
        </View>
      </View>

      <ScrollView
        style={styles.zonesContainer}
        contentContainerStyle={styles.zonesContentContainer}
        showsVerticalScrollIndicator={false}
        scrollEnabled={scrollEnabled}
      >
        {sortedTasks.map(task => (
          <DraggableTask
            key={task.id}
            item={task}
            onDragStart={handleDragStart}
            isDragging={draggingId === task.id}
          />
        ))}
      </ScrollView>

      {/* Overlay zones for drag and drop */}
      {showOverlay && (
        <View style={styles.overlayContainer}>
          <View
            style={[styles.overlayZone, styles.highZone, highlightedZone === 'high' && styles.highlightedZone]}
            onLayout={(event) => handleZoneLayout('high', event)}
          >
            <Text style={styles.overlayText}>High Priority</Text>
          </View>
          <View
            style={[styles.overlayZone, styles.mediumZone, highlightedZone === 'medium' && styles.highlightedZone]}
            onLayout={(event) => handleZoneLayout('medium', event)}
          >
            <Text style={styles.overlayText}>Medium Priority</Text>
          </View>
          <View
            style={[styles.overlayZone, styles.lowZone, highlightedZone === 'low' && styles.highlightedZone]}
            onLayout={(event) => handleZoneLayout('low', event)}
          >
            <Text style={styles.overlayText}>Low Priority</Text>
          </View>
        </View>
      )}

      {/* Drag ghost rendered above everything */}
      {draggingId && (
        <Modal transparent visible animationType="none" statusBarTranslucent>
          <View style={styles.ghostContainer} pointerEvents="none">
            <Animated.View
              style={{
                position: 'absolute',
                width: SCREEN_WIDTH - spacing.md * 2,
                transform: [
                  { translateX: ghostPosition.x - (SCREEN_WIDTH - spacing.md * 2) / 2 },
                  { translateY: ghostPosition.y - 40 },
                  { scale: 1.05 },
                ],
              }}
            >
              {(() => {
                const t = tasks.find(it => it.id === draggingId);
                if (!t) { return null; }
                return (
                  <View style={[
                    styles.card,
                    t.priority === 'high' && styles.cardHigh,
                    t.priority === 'medium' && styles.cardMedium,
                    t.priority === 'low' && styles.cardLow,
                    { opacity: 0.95 },
                  ]}>
                    <View style={styles.row}>
                      <View style={[
                        styles.sectionStripe,
                        t.priority === 'high' && styles.stripeHigh,
                        t.priority === 'medium' && styles.stripeMedium,
                        t.priority === 'low' && styles.stripeLow,
                      ]} />
                      <Text style={styles.text} numberOfLines={3} selectable={false}>{t.text}</Text>
                      <Icon icon={Menu01Icon} size={16} color={colors.text.secondary} style={{ marginLeft: 8 }} />
                    </View>
                  </View>
                );
              })()}
            </Animated.View>
          </View>
        </Modal>
      )}

      <View style={styles.footer}>
        <TouchableOpacity
          testID="saveAndFinishButton"
          style={[styles.primaryBtn, tasks.length === 0 && { opacity: 0.6 }]}
          onPress={onSave}
          disabled={saving || tasks.length === 0}
        >
          <Text style={styles.primaryText}>{saving ? 'Saving…' : 'Save and Finish'}</Text>
        </TouchableOpacity>
      </View>

      <SuccessToast visible={toastVisible} message={toastMessage} onClose={() => setToastVisible(false)} />

      {/* Loading screen modal - shows immediately when save is pressed */}
      <Modal
        visible={showLoadingScreen}
        animationType="fade"
        transparent={false}
        onRequestClose={() => { }} // Prevent closing during save
      >
        <BrainDumpLoadingScreen />
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background.surface },
  headerRow: { padding: spacing.md },
  title: { fontSize: typography.fontSize.lg, fontWeight: typography.fontWeight.bold, color: colors.text.primary },

  zonesContainer: {
    flex: 1,
  },

  zonesContentContainer: {
    padding: spacing.md,
    paddingBottom: spacing.xl,
  },

  dropZone: {
    borderRadius: borderRadius.lg,
    padding: spacing.sm,
    minHeight: 80,
  },

  dropZoneContent: {
    gap: spacing.xs,
  },

  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
    borderBottomWidth: 1,
    borderBottomColor: colors.border.light,
    marginBottom: spacing.sm,
  },

  sectionHeaderText: {
    fontSize: typography.fontSize.sm,
    fontWeight: typography.fontWeight.semibold,
    color: colors.text.secondary,
  },

  card: {
    borderWidth: 1,
    borderColor: colors.border.light,
    backgroundColor: '#FFFFFF',
    borderRadius: borderRadius.md,
    padding: spacing.md,
    marginBottom: spacing.xs,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 2,
    elevation: 2,
  },

  cardHigh: { borderLeftColor: '#F44336', borderLeftWidth: 4 },
  cardMedium: { borderLeftColor: '#FF9800', borderLeftWidth: 4 },
  cardLow: { borderLeftColor: '#4CAF50', borderLeftWidth: 4 },

  row: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    minHeight: 24,
  },

  text: {
    color: '#000000',
    fontSize: typography.fontSize.base,
    flex: 1,
    paddingRight: spacing.sm,
    lineHeight: 20,
    fontWeight: '400',
  },

  sectionStripe: {
    width: 4,
    height: 20,
    marginRight: spacing.sm,
    borderRadius: 2,
    backgroundColor: colors.border.light
  },

  stripeHigh: { backgroundColor: '#F44336' },
  stripeMedium: { backgroundColor: '#FF9800' },
  stripeLow: { backgroundColor: '#4CAF50' },

  emptyZoneText: {
    textAlign: 'center',
    color: colors.text.secondary,
    fontSize: typography.fontSize.sm,
    fontStyle: 'italic',
    paddingVertical: spacing.lg,
  },

  infoBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs
  },

  legendRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.md,
    paddingBottom: spacing.xs,
    gap: spacing.md,
  },

  legendItem: {
    flexDirection: 'row',
    alignItems: 'center',
  },

  legendSwatch: {
    width: 12,
    height: 12,
    borderRadius: 2,
    marginRight: spacing.xs,
    borderWidth: 1,
    borderColor: colors.border.light,
  },

  legendText: {
    color: colors.text.secondary,
    fontSize: typography.fontSize.xs,
  },

  infoText: {
    color: colors.text.secondary,
    fontSize: typography.fontSize.xs
  },

  footer: {
    borderTopWidth: 1,
    borderTopColor: colors.border.light,
    padding: spacing.md,
    backgroundColor: colors.background.surface,
  },

  primaryBtn: {
    backgroundColor: colors.primary,
    paddingVertical: spacing.sm,
    borderRadius: borderRadius.md,
    alignItems: 'center'
  },

  primaryText: {
    color: colors.secondary,
    fontWeight: typography.fontWeight.bold,
    fontSize: typography.fontSize.base
  },

  overlayContainer: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    zIndex: 1000,
  },

  overlayZone: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    opacity: 0.8,
  },

  highZone: {
    backgroundColor: '#FFEBEE',
  },

  mediumZone: {
    backgroundColor: '#FFFBF0',
  },

  lowZone: {
    backgroundColor: '#F1F8E9',
  },

  highlightedZone: {
    opacity: 1,
    borderWidth: 3,
    borderColor: '#000000',
    borderStyle: 'dashed',
  },

  overlayText: {
    fontSize: typography.fontSize.lg,
    fontWeight: typography.fontWeight.bold,
    color: colors.text.primary,
  },

  ghostContainer: {
    flex: 1,
  },
});