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

  // No more loading state needed - data comes reactively
  // goalId is already destructured from route.params above

  // Data comes from observables, no need to fetch

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

  const toggleStep = async (milestoneId: string, stepId: string) => {
    if (!goal || !goal.milestones) {return;}
    try {
      const milestone = goal.milestones.find(m => m.id === milestoneId);
      const step = milestone?.steps?.find(s => s.id === stepId);
      if (!step) {return;}

      const newCompleted = !step.completed;
      
      // Update in backend
      await goalsAPI.updateStep(stepId, { completed: newCompleted });
      
      // Update local state
      setGoal({
        ...goal,
        milestones: goal.milestones.map(m => 
          m.id === milestoneId ? {
            ...m,
            steps: m.steps?.map(s => 
              s.id === stepId ? { ...s, completed: newCompleted } : s
            ) || []
          } : m
        ),
      });
    } catch (error) {
      console.error('Error updating step:', error);
      Alert.alert('Error', 'Failed to update step. Please try again.');
    }
  };

  const getProgressPercentage = (completed: number, total: number) => {
    return total > 0 ? (completed / total) * 100 : 0;
  };

  const calculateProgress = () => {
    if (!goal || !goal.milestones) {return { completedMilestones: 0, totalMilestones: 0, completedSteps: 0, totalSteps: 0 };}
    
    const totalMilestones = goal.milestones.length;
    const completedMilestones = goal.milestones.filter(m => m.completed).length;
    
    const totalSteps = goal.milestones.reduce((sum, m) => sum + (m.steps?.length || 0), 0);
    const completedSteps = goal.milestones.reduce((sum, m) => 
      sum + (m.steps?.filter(s => s.completed).length || 0), 0
    );
    
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
      <SafeAreaView style={styles.container} edges={['top', 'left', 'right']}>
        <View style={styles.loadingContainer}>
          <Text style={styles.loadingText}>Loading goal...</Text>
        </View>
      </SafeAreaView>
    );
  }

  if (!goal) {
    return (
      <SafeAreaView style={styles.container} edges={['top', 'left', 'right']}>
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
    <SafeAreaView style={styles.container} edges={['top', 'left', 'right']}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()}>
          <Text style={styles.backButton}>← Back</Text>
        </TouchableOpacity>
        <TouchableOpacity onPress={() => navigation.navigate('GoalForm', { goalId: goal.id })}>
          <Text style={styles.editButton}>Edit</Text>
        </TouchableOpacity>
      </View>

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
              {goal.milestones?.find(m => !m.completed)?.title || 'All milestones completed!'}
            </Text>
            <Text style={styles.nextMilestoneDescription}>
              {goal.milestones?.find(m => !m.completed) 
                ? 'This is your next step to achieve your goal'
                : 'Congratulations! You\'ve completed all milestones.'
              }
            </Text>
          </View>
        </View>

        {/* All Milestones */}
        <View style={styles.milestonesSection}>
          <Text style={styles.sectionTitle}>All Milestones</Text>
          
          {goal.milestones?.map((milestone, index) => (
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
                  
                  {/* Steps */}
                  {milestone.steps && milestone.steps.length > 0 && (
                    <View style={styles.stepsContainer}>
                      {milestone.steps.map((step, stepIndex) => (
                        <View key={step.id} style={styles.stepItem}>
                          <TouchableOpacity
                            style={styles.stepCheckbox}
                            onPress={() => toggleStep(milestone.id, step.id)}
                          >
                            <View style={[
                              styles.stepCheckboxInner,
                              step.completed && styles.stepCheckboxChecked
                            ]}>
                              {step.completed && <Text style={styles.stepCheckmark}>✓</Text>}
                            </View>
                          </TouchableOpacity>
                          
                          <View style={styles.stepContent}>
                            <Text style={[
                              styles.stepTitle,
                              step.completed && styles.stepTitleCompleted
                            ]}>
                              {stepIndex + 1}. {step.text}
                            </Text>
                          </View>
                        </View>
                      ))}
                    </View>
                  )}
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

const enhance = withObservables(['route', 'database'], ({route, database}) => {
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
