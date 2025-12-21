import React, { useState, useCallback, useEffect, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Modal,
  TouchableOpacity,
  TextInput,
  Animated,
  ScrollView,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { HugeiconsIcon as Icon } from '@hugeicons/react-native';
import { ArrowRight01Icon, Delete01Icon, Cancel01Icon, Search01Icon, Target01Icon } from '@hugeicons/core-free-icons';
import { colors } from '../../themes/colors';
import { typography } from '../../themes/typography';
import { spacing, borderRadius } from '../../themes/spacing';

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
  milestones: any[];
}

interface GoalsListModalProps {
  visible: boolean;
  onClose: () => void;
  goals: Goal[];
  onGoalPress: (goalId: string) => void;
  onGoalDelete: (goalId: string) => void;
}

export default function GoalsListModal({
  visible,
  onClose,
  goals,
  onGoalPress,
  onGoalDelete,
}: GoalsListModalProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const [swipeAnimations] = useState(() =>
    goals.map(() => new Animated.Value(0))
  );
  const [fadeAnimations] = useState(() =>
    goals.map(() => new Animated.Value(0))
  );

  const filteredGoals = useMemo(() =>
    goals.filter(goal =>
      goal.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
      goal.description.toLowerCase().includes(searchQuery.toLowerCase())
    ), [goals, searchQuery]
  );

  // Animate items when they appear
  useEffect(() => {
    if (visible && filteredGoals.length > 0) {
      const animations = filteredGoals.map((_, index) =>
        Animated.timing(fadeAnimations[index], {
          toValue: 1,
          duration: 300 + (index * 100), // Staggered animation
          useNativeDriver: true,
        })
      );

      Animated.stagger(100, animations).start();
    }
  }, [visible, filteredGoals, fadeAnimations]);

  // progress helpers removed (not used)

  // (swipe helper reserved for future use)

  const handleDelete = useCallback((goalId: string, index: number) => {
    // Reset animation
    swipeAnimations[index].setValue(0);
    onGoalDelete(goalId);
  }, [swipeAnimations, onGoalDelete]);

  const handleSwipeToDelete = useCallback((goalId: string, index: number) => {
    // Animate the swipe action
    Animated.spring(swipeAnimations[index], {
      toValue: -80,
      useNativeDriver: true,
    }).start(() => {
      // After animation, trigger delete
      handleDelete(goalId, index);
    });
  }, [swipeAnimations, handleDelete]);

  const renderGoalItem = (goal: Goal, index: number) => {

    return (
      <View key={goal.id} style={styles.goalItemContainer}>
        <Animated.View
          style={[
            styles.goalItem,
            {
              transform: [{
                translateX: swipeAnimations[index]
              }],
              opacity: fadeAnimations[index],
            }
          ]}
        >
          <TouchableOpacity
            style={styles.goalContent}
            onPress={() => onGoalPress(goal.id)}
            activeOpacity={0.7}
          >
            <View style={styles.goalHeader}>
              <Text style={styles.goalTitle} numberOfLines={1}>
                {goal.title}
              </Text>
              <Icon icon={ArrowRight01Icon} size={16} color={colors.text.secondary} />
            </View>
          </TouchableOpacity>
        </Animated.View>

        {/* Swipe Actions */}
        <View style={styles.swipeActions}>
          <TouchableOpacity
            style={styles.deleteAction}
            onPress={() => handleSwipeToDelete(goal.id, index)}
          >
            <Icon icon={Delete01Icon} size={14} color={colors.secondary} />
          </TouchableOpacity>
        </View>
      </View>
    );
  };

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={onClose}
    >
      <SafeAreaView style={styles.container} edges={['top', 'left', 'right']}>
        {/* Header */}
        <View style={styles.header}>
          <TouchableOpacity onPress={onClose} style={styles.closeButton}>
            <Icon icon={Cancel01Icon} size={24} color={colors.text.primary} />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>All Goals</Text>
          <View style={styles.headerSpacer} />
        </View>

        {/* Search Bar */}
        <View style={styles.searchContainer}>
          <View style={styles.searchInputContainer}>
            <Icon icon={Search01Icon} size={16} color={colors.text.secondary} style={styles.searchIcon} />
            <TextInput
              style={styles.searchInput}
              placeholder="Search goals..."
              value={searchQuery}
              onChangeText={setSearchQuery}
              placeholderTextColor={colors.text.secondary}
            />
            {searchQuery.length > 0 && (
              <TouchableOpacity onPress={() => setSearchQuery('')} style={styles.clearButton}>
                <Icon icon={Cancel01Icon} size={16} color={colors.text.secondary} />
              </TouchableOpacity>
            )}
          </View>
        </View>

        {/* Goals List */}
        <View style={styles.content}>
          {filteredGoals.length === 0 ? (
            <View style={styles.emptyState}>
              <Icon
                icon={searchQuery ? Search01Icon : Target01Icon}
                size={48}
                color={colors.text.disabled}
              />
              <Text style={styles.emptyStateTitle}>
                {searchQuery ? 'No goals found' : 'No goals yet'}
              </Text>
              <Text style={styles.emptyStateText}>
                {searchQuery
                  ? 'Try adjusting your search terms or create a new goal'
                  : 'Create your first goal using the AI assistant'
                }
              </Text>
              {!searchQuery && (
                <TouchableOpacity
                  style={styles.createFirstGoalButton}
                  onPress={onClose}
                >
                  <Text style={styles.createFirstGoalText}>Create First Goal</Text>
                </TouchableOpacity>
              )}
            </View>
          ) : (
            <ScrollView
              style={styles.goalsList}
              showsVerticalScrollIndicator={false}
              contentContainerStyle={styles.goalsListContent}
            >
              {filteredGoals.map((goal, index) => renderGoalItem(goal, index))}
            </ScrollView>
          )}
        </View>
      </SafeAreaView>
    </Modal>
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
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: colors.border.light,
  },
  closeButton: {
    padding: spacing.sm,
    marginLeft: -spacing.sm,
  },
  headerTitle: {
    fontSize: typography.fontSize.lg,
    fontWeight: typography.fontWeight.bold,
    color: colors.text.primary,
  },
  headerSpacer: {
    width: 48, // Same width as close button for centering
  },
  searchContainer: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: colors.border.light,
  },
  searchInputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderRadius: borderRadius.lg,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  searchIcon: {
    marginRight: spacing.sm,
  },
  searchInput: {
    flex: 1,
    fontSize: typography.fontSize.base,
    color: colors.text.primary,
  },
  clearButton: {
    padding: spacing.xs,
  },
  content: {
    flex: 1,
    paddingHorizontal: spacing.md,
  },
  goalsList: {
    flex: 1,
  },
  goalsListContent: {
    paddingTop: spacing.sm,
    paddingBottom: spacing.lg,
  },
  goalItemContainer: {
    position: 'relative',
    marginBottom: spacing.sm,
  },
  goalItem: {
    backgroundColor: colors.secondary,
    borderRadius: borderRadius.lg,
    borderWidth: 1,
    borderColor: colors.border.light,
    overflow: 'hidden',
  },
  goalContent: {
    padding: spacing.md,
  },
  goalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: spacing.sm,
  },
  goalTitleContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  goalTitle: {
    fontSize: typography.fontSize.base,
    fontWeight: typography.fontWeight.bold,
    color: colors.text.primary,
    flex: 1,
    marginRight: spacing.sm,
  },
  statusDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  goalDescription: {
    fontSize: typography.fontSize.sm,
    color: colors.text.secondary,
    marginBottom: spacing.md,
    lineHeight: typography.lineHeight.normal * typography.fontSize.sm,
  },
  progressContainer: {
    marginBottom: spacing.sm,
  },
  progressBar: {
    height: 4,
    backgroundColor: colors.border.light,
    borderRadius: 2,
    marginBottom: spacing.xs,
  },
  progressFill: {
    height: '100%',
    backgroundColor: colors.primary,
    borderRadius: 2,
  },
  progressText: {
    fontSize: typography.fontSize.xs,
    color: colors.text.secondary,
  },
  goalMeta: {
    gap: spacing.xs,
  },
  metaItem: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  metaText: {
    fontSize: typography.fontSize.xs,
    color: colors.text.secondary,
    marginLeft: spacing.xs,
    flex: 1,
  },
  swipeActions: {
    position: 'absolute',
    right: 0,
    top: 0,
    bottom: 0,
    justifyContent: 'center',
    paddingRight: spacing.md,
  },
  deleteAction: {
    backgroundColor: colors.error,
    width: 32,
    height: 32,
    borderRadius: 16,
    justifyContent: 'center',
    alignItems: 'center',
  },
  emptyState: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: spacing.lg,
  },
  emptyStateTitle: {
    fontSize: typography.fontSize.lg,
    fontWeight: typography.fontWeight.bold,
    color: colors.text.primary,
    marginTop: spacing.md,
    marginBottom: spacing.sm,
  },
  emptyStateText: {
    fontSize: typography.fontSize.base,
    color: colors.text.secondary,
    textAlign: 'center',
    lineHeight: typography.lineHeight.normal * typography.fontSize.base,
  },
  createFirstGoalButton: {
    backgroundColor: colors.primary,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    borderRadius: borderRadius.lg,
    marginTop: spacing.md,
  },
  createFirstGoalText: {
    fontSize: typography.fontSize.base,
    fontWeight: typography.fontWeight.medium,
    color: colors.secondary,
    textAlign: 'center',
  },
}); 