import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, Alert, ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { colors } from '../../themes/colors';
import { typography } from '../../themes/typography';
import { spacing, borderRadius } from '../../themes/spacing';
import { Button } from '../../components/common';
import withObservables from '@nozbe/watermelondb/react/withObservables';
import { useDatabase } from '../../contexts/DatabaseContext';
import { goalRepository } from '../../repositories/GoalRepository';
import { syncService } from '../../services/SyncService';
import { Q } from '@nozbe/watermelondb';
import Goal from '../../db/models/Goal';
import Milestone from '../../db/models/Milestone';

import { Delete01Icon, PencilEdit01Icon } from '@hugeicons/core-free-icons';
import { HugeiconsIcon as Icon } from '@hugeicons/react-native';

interface GoalDetailScreenProps {
  route: { params: { goalId: string } };
  navigation: any;
  goal: Goal; // From withObservables
  milestones: Milestone[]; // From withObservables
  database: any;
}

const GoalDetailScreen: React.FC<GoalDetailScreenProps> = ({
  route,
  navigation,
  goal,
  milestones,
}) => {
  const { goalId } = route.params;

  if (!goal) {
    return (
      <View style={styles.container}>
        <ActivityIndicator size="large" />
        <Text>Loading goal...</Text>
      </View>
    );
  }

  // Data comes from observables, no need to fetch

  React.useLayoutEffect(() => {
    if (goal) {
      navigation.setOptions({
        title: goal.title || 'Goal Details',
        headerRight: () => (
          <View style={{ flexDirection: 'row', gap: spacing.sm }}>
            <TouchableOpacity onPress={() => navigation.navigate('GoalForm', { goalId: goal.id })}>
              <Icon icon={PencilEdit01Icon} size={20} color={colors.text.primary} />
            </TouchableOpacity>
          </View>
        ),
      });
    }
  }, [navigation, goal]);

  const toggleMilestone = async (milestoneId: string) => {
    try {
      const milestone = milestones.find(m => m.id === milestoneId);
      if (!milestone) return;

      await goalRepository.updateMilestone(milestoneId, {
        completed: !milestone.completed,
      });

      syncService.silentSync();
    } catch (error) {
      console.error('Error toggling milestone:', error);
      Alert.alert('Error', 'Failed to update milestone');
    }
  };

  const getProgressPercentage = (completed: number, total: number) => {
    return total > 0 ? (completed / total) * 100 : 0;
  };

  const calculateProgress = () => {
    const totalMilestones = milestones?.length || 0;
    const completedMilestones = milestones?.filter(m => m.completed).length || 0;

    // Steps are nested in milestones in the model
    let totalSteps = 0;
    let completedSteps = 0;

    // WatermelonDB milestones might need different handling for steps 
    // but if they are fetched already, we can use them.
    // For now, let's keep it simple as the model might not have array of steps.

    return { completedMilestones, totalMilestones, completedSteps, totalSteps };
  };

  const renderProgressBar = (completed: number, total: number, type: 'milestones' | 'steps') => {
    const percentage = getProgressPercentage(completed, total);

    return (
      <View style={styles.progressContainer}>
        <View style={styles.progressBar}>
          <View style={[styles.progressFill, { width: `${percentage}%` as any }]} />
        </View>
        <Text style={styles.progressText}>{completed}/{total} {type} completed</Text>
      </View>
    );
  };

  if (loading) {
    return (
      <SafeAreaView style={styles.container} edges={['left', 'right']}>
        <View style={styles.loadingContainer}>
          <Text style={styles.loadingText}>Loading goal...</Text>
        </View>
      </SafeAreaView>
    );
  }

  if (!goal) {
    return (
      <SafeAreaView style={styles.container} edges={['left', 'right']}>
        <View style={styles.errorContainer}>
          <Text style={styles.errorText}>Goal not found</Text>
          <Button
            title="Go Back"
            onPress={() => navigation.goBack()}
            style={styles.errorButton}
          />
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container} edges={['left', 'right']}>

      <ScrollView
        style={styles.content}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.scrollContent}
      >
        {/* Goal Header */}
        <View style={styles.goalHeader}>
          <View style={styles.goalTitleContainer}>
            <Text style={styles.goalTitle}>{goal.title}</Text>
            <View style={[
              styles.statusIndicator,
              { backgroundColor: goal.completed ? colors.success : colors.warning }
            ]} />
          </View>

          <Text style={styles.goalDescription}>{goal.description}</Text>

          {(() => {
            const progress = calculateProgress();
            return (
              <>
                {renderProgressBar(progress.completedMilestones, progress.totalMilestones, 'milestones')}
                {renderProgressBar(progress.completedSteps, progress.totalSteps, 'steps')}
              </>
            );
          })()}
        </View>

        {/* Next Milestone */}
        <View style={styles.nextMilestoneSection}>
          <Text style={styles.sectionTitle}>Next Milestone</Text>
          <View style={styles.nextMilestoneCard}>
            <Text style={styles.nextMilestoneTitle}>
              {milestones?.find(m => !m.completed)?.title || 'All milestones completed!'}
            </Text>
            <Text style={styles.nextMilestoneDescription}>
              {milestones?.find(m => !m.completed)
                ? 'This is your next step to achieve your goal'
                : 'Congratulations! You\'ve completed all milestones.'
              }
            </Text>
          </View>
        </View>

        {/* All Milestones */}
        <View style={styles.milestonesSection}>
          <Text style={styles.sectionTitle}>All Milestones</Text>

          {milestones?.map((milestone, index) => (
            <View key={milestone.id} style={styles.milestoneItem}>
              <View style={styles.milestoneHeader}>
                <TouchableOpacity
                  style={styles.milestoneCheckbox}
                  onPress={() => toggleMilestone(milestone.id)}
                >
                  <View style={[
                    styles.checkbox,
                    milestone.completed && styles.checkboxChecked
                  ]}>
                    {milestone.completed && <Text style={styles.checkmark}>✓</Text>}
                  </View>
                </TouchableOpacity>

                <View style={styles.milestoneContent}>
                  <Text style={[
                    styles.milestoneTitle,
                    milestone.completed && styles.milestoneTitleCompleted
                  ]}>
                    {index + 1}. {milestone.title}
                  </Text>
                </View>
              </View>
            </View>
          ))}
        </View>

        {/* Actions */}
        <View style={styles.actionsSection}>
          <Button
            title="Ask AI for Help"
            onPress={() => navigation.navigate('AIChat', {
              initialMessage: `Can you help me with the ${goal?.title || 'goal'}?`
            })}
            variant="outline"
            style={styles.aiHelpButton}
          />

          <Button
            title="Mark as Completed"
            onPress={() => {
              // TODO: Mark goal as completed
            }}
            style={styles.completeButton}
          />
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background.primary,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingText: {
    fontSize: typography.fontSize.lg,
    color: colors.text.secondary,
  },
  errorContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: spacing.lg,
  },
  errorText: {
    fontSize: typography.fontSize.lg,
    color: colors.error,
    marginBottom: spacing.lg,
    textAlign: 'center',
  },
  errorButton: {
    minWidth: 120,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.border.light,
  },
  backButton: {
    fontSize: typography.fontSize.base,
    color: colors.text.secondary,
  },
  editButton: {
    fontSize: typography.fontSize.base,
    color: colors.primary,
    fontWeight: typography.fontWeight.bold,
  },
  content: {
    flex: 1,
    padding: spacing.md,
  },
  scrollContent: {
    paddingBottom: spacing.xl * 2, // Extra padding for system navigation
  },
  goalHeader: {
    marginBottom: spacing.xl,
  },
  goalTitleContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: spacing.sm,
  },
  goalTitle: {
    fontSize: typography.fontSize['2xl'],
    fontWeight: typography.fontWeight.bold,
    color: colors.text.primary,
    flex: 1,
  },
  statusIndicator: {
    width: 12,
    height: 12,
    borderRadius: 6,
  },
  goalDescription: {
    fontSize: typography.fontSize.base,
    color: colors.text.secondary,
    marginBottom: spacing.lg,
    lineHeight: typography.lineHeight.normal * typography.fontSize.base,
  },
  progressContainer: {
    marginBottom: spacing.sm,
  },
  progressBar: {
    height: 8,
    backgroundColor: colors.border.light,
    borderRadius: 4,
    marginBottom: spacing.xs,
  },
  progressFill: {
    height: '100%',
    backgroundColor: colors.primary,
    borderRadius: 4,
  },
  progressText: {
    fontSize: typography.fontSize.sm,
    color: colors.text.secondary,
  },
  nextMilestoneSection: {
    marginBottom: spacing.xl,
  },
  sectionTitle: {
    fontSize: typography.fontSize.lg,
    fontWeight: typography.fontWeight.bold,
    color: colors.text.primary,
    marginBottom: spacing.md,
  },
  nextMilestoneCard: {
    backgroundColor: colors.surface,
    borderRadius: borderRadius.lg,
    padding: spacing.md,
    borderWidth: 1,
    borderColor: colors.border.light,
  },
  nextMilestoneTitle: {
    fontSize: typography.fontSize.lg,
    fontWeight: typography.fontWeight.bold,
    color: colors.text.primary,
    marginBottom: spacing.xs,
  },
  nextMilestoneDescription: {
    fontSize: typography.fontSize.sm,
    color: colors.text.secondary,
  },
  milestonesSection: {
    marginBottom: spacing.xl,
  },
  milestoneItem: {
    backgroundColor: colors.secondary,
    borderRadius: borderRadius.lg,
    padding: spacing.md,
    marginBottom: spacing.md,
    borderWidth: 1,
    borderColor: colors.border.light,
  },
  milestoneHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
  },
  milestoneCheckbox: {
    marginRight: spacing.md,
    marginTop: 2,
  },
  checkbox: {
    width: 24,
    height: 24,
    borderRadius: 6,
    borderWidth: 2,
    borderColor: colors.border.medium,
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkboxChecked: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  checkmark: {
    color: colors.secondary,
    fontSize: 14,
    fontWeight: typography.fontWeight.bold,
  },
  milestoneContent: {
    flex: 1,
  },
  milestoneTitle: {
    fontSize: typography.fontSize.base,
    fontWeight: typography.fontWeight.bold,
    color: colors.text.primary,
    marginBottom: spacing.xs,
  },
  milestoneTitleCompleted: {
    textDecorationLine: 'line-through',
    color: colors.text.disabled,
  },
  milestoneDescription: {
    fontSize: typography.fontSize.sm,
    color: colors.text.secondary,
    lineHeight: typography.lineHeight.normal * typography.fontSize.sm,
  },
  milestoneDescriptionCompleted: {
    color: colors.text.disabled,
  },
  stepsContainer: {
    marginTop: spacing.md,
    marginLeft: spacing.lg,
  },
  stepItem: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginBottom: spacing.sm,
  },
  stepCheckbox: {
    marginRight: spacing.sm,
    marginTop: 2,
  },
  stepCheckboxInner: {
    width: 18,
    height: 18,
    borderRadius: 4,
    borderWidth: 1.5,
    borderColor: colors.border.medium,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stepCheckboxChecked: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  stepCheckmark: {
    color: colors.secondary,
    fontSize: 12,
    fontWeight: typography.fontWeight.bold,
  },
  stepContent: {
    flex: 1,
  },
  stepTitle: {
    fontSize: typography.fontSize.sm,
    fontWeight: typography.fontWeight.medium,
    color: colors.text.primary,
    marginBottom: spacing.xs,
  },
  stepTitleCompleted: {
    textDecorationLine: 'line-through',
    color: colors.text.disabled,
  },
  stepDescription: {
    fontSize: typography.fontSize.xs,
    color: colors.text.secondary,
    lineHeight: typography.lineHeight.normal * typography.fontSize.xs,
  },
  stepDescriptionCompleted: {
    color: colors.text.disabled,
  },
  actionsSection: {
    gap: spacing.md,
    paddingBottom: spacing.xl,
  },
  aiHelpButton: {
    marginBottom: spacing.sm,
  },
  completeButton: {
    backgroundColor: colors.success,
  },
});

const enhance = withObservables(['route', 'database'], ({ route, database }) => {
  const goalId = route?.params?.goalId;

  // Guard against missing goalId
  if (!goalId) {
    return {
      goal: null,
      milestones: [],
    };
  }

  return {
    goal: database.collections.get('goals').findAndObserve(goalId),
    milestones: database.collections.get('milestones')
      .query(
        Q.where('goal_id', goalId),
        Q.where('status', Q.notEq('pending_delete')),
        Q.sortBy('order', Q.asc)
      )
      .observe(),
  };
});

const EnhancedGoalDetailScreen = enhance(GoalDetailScreen);

const GoalDetailScreenWithDatabase = (props: any) => {
  const database = useDatabase();
  return <EnhancedGoalDetailScreen {...props} database={database} />;
};

export default GoalDetailScreenWithDatabase;
