import React, { useState, useEffect, useCallback } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, Alert, Platform } from 'react-native';
import { HugeiconsIcon as Icon } from '@hugeicons/react-native';
import { Calendar01Icon, ArrowUp01Icon, ArrowDown01Icon, Delete01Icon } from '@hugeicons/core-free-icons';
import { SafeAreaView } from 'react-native-safe-area-context';
import { colors } from '../../themes/colors';
import { typography } from '../../themes/typography';
import { spacing, borderRadius } from '../../themes/spacing';
import { Input, Button } from '../../components/common';
import { goalRepository } from '../../repositories/GoalRepository';
import { syncService } from '../../services/SyncService';
import { authService } from '../../services/auth';
import analyticsService from '../../services/analyticsService';
import DateTimePicker from '@react-native-community/datetimepicker';
import { format } from 'date-fns';

interface Milestone {
  id: string;
  title: string;
  description?: string;
  completed: boolean;
  steps?: Array<{
    id: string;
    text: string;
    completed: boolean;
    order: number;
  }>;
}

export default function GoalFormScreen({ navigation, route }: any) {
  const goalId = route.params?.goalId;
  const initialCategory = route.params?.category || '';
  const isEditing = !!goalId;

  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [milestones, setMilestones] = useState<Milestone[]>([]);
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const [loading, setLoading] = useState(false);
  const [initialLoading, setInitialLoading] = useState(isEditing);
  const [targetDate, setTargetDate] = useState<Date | undefined>(undefined);
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [category, setCategory] = useState<string>(initialCategory);

  const loadExistingGoal = useCallback(async () => {
    try {
      setInitialLoading(true);
      const goalData = await goalRepository.getGoalById(goalId);

      if (goalData) {
        setTitle(goalData.title || '');
        setDescription(goalData.description || '');
        setCategory(goalData.category || '');
        // Load milestones via database query
        const milestonesData = await goalRepository.getMilestonesForGoal(goalId);

        const mappedMilestones: Milestone[] = await Promise.all(
          milestonesData.map(async (m) => {
            const steps = await m.steps.fetch();
            return {
              id: m.id,
              title: m.title,
              description: m.description || '',
              completed: m.completed,
              steps: steps.map(s => ({
                id: s.id,
                text: s.text,
                completed: s.completed,
                order: s.order
              })).sort((a, b) => a.order - b.order)
            };
          })
        );

        setMilestones(mappedMilestones);

        if (goalData.targetCompletionDate) {
          setTargetDate(goalData.targetCompletionDate);
        }
      }
    } catch (error) {
      console.error('Error loading goal:', error);
      Alert.alert('Error', 'Failed to load goal data');
    } finally {
      setInitialLoading(false);
    }
  }, [goalId]);

  // Load existing goal data when editing
  useEffect(() => {
    if (isEditing && goalId) {
      loadExistingGoal();
    }
  }, [goalId, isEditing, loadExistingGoal]);

  const handleSave = useCallback(async () => {
    if (!title.trim()) {
      Alert.alert('Error', 'Please enter a goal title.');
      return;
    }

    setLoading(true);

    try {
      const goalData = {
        title: title.trim(),
        description: description.trim(),
        targetCompletionDate: targetDate,
        category: category.trim() || undefined,
        userId: authService.getCurrentUser()?.id,
      };

      if (isEditing) {
        await goalRepository.updateGoal(goalId, goalData);

        // Handle milestone updates
        for (const milestone of milestones) {
          if (milestone.id) {
            try {
              // Only attempt update if ID looks like a server ID or we know it exists
              // For simplicity, we wrap in try/catch as repository throws if not found
              await goalRepository.updateMilestone(milestone.id, {
                title: milestone.title,
                description: milestone.description,
                completed: milestone.completed
              });
            } catch (e) {
              // If not found (e.g. new local milestone), create it
              // Note: Ideally we should separate new vs existing in UI state
              await goalRepository.createMilestone(goalId, {
                title: milestone.title,
                description: milestone.description,
                order: milestones.indexOf(milestone)
              });
            }
          }
        }
      } else {
        // Create goal first
        const newGoal = await goalRepository.createGoal(goalData);

        // Then create milestones
        for (const m of milestones) {
          const createdMilestone = await goalRepository.createMilestone(newGoal.id, {
            title: m.title,
            description: m.description,
            order: milestones.indexOf(m)
          });

          if (m.steps) {
            for (const s of m.steps) {
              await goalRepository.createMilestoneStep(createdMilestone.id, {
                text: s.text,
                order: s.order
              });
            }
          }
        }
      }

      syncService.silentSync();
      navigation.goBack();
    } catch (error) {
      console.error('Error saving goal:', error);
      Alert.alert('Error', 'Failed to save goal');
    } finally {
      setLoading(false);
    }
  }, [title, description, targetDate, category, isEditing, goalId, milestones, navigation]);

  // Track screen view & configure header options
  // Track screen view once on mount
  React.useEffect(() => {
    analyticsService.trackScreenView('goal_form', {
      isEditing,
      goalId: goalId || null
    }).catch(error => {
      console.warn('Failed to track screen view analytics:', error);
    });
  }, []);

  // Configure header options
  React.useLayoutEffect(() => {
    navigation.setOptions({
      title: isEditing ? 'Edit Goal' : 'New Goal',
      headerLeft: () => (
        <TouchableOpacity onPress={() => navigation.goBack()}>
          <Text style={styles.backButton}>Cancel</Text>
        </TouchableOpacity>
      ),
      headerRight: () => (
        <TouchableOpacity onPress={handleSave} disabled={loading}>
          <Text style={[styles.saveButton, loading && styles.saveButtonDisabled]}>
            {loading ? 'Saving...' : 'Save'}
          </Text>
        </TouchableOpacity>
      ),
    });
  }, [navigation, isEditing, goalId, loading, handleSave]);
  const addMilestone = () => {
    const newMilestone: Milestone = {
      id: Date.now().toString(),
      title: '',
      description: '',
      completed: false,
    };
    setMilestones([...milestones, newMilestone]);
    setExpanded((p) => ({ ...p, [newMilestone.id]: true }));
  };

  const updateMilestone = (id: string, field: keyof Milestone, value: any) => {
    setMilestones(milestones.map(m =>
      m.id === id ? { ...m, [field]: value } : m
    ));
  };

  const removeMilestone = (id: string) => {
    setMilestones(milestones.filter(m => m.id !== id));
  };

  const toggleMilestone = (id: string) => {
    setMilestones(milestones.map(m =>
      m.id === id ? { ...m, completed: !m.completed } : m
    ));
  };

  const toggleExpanded = (id: string) => {
    setExpanded((p) => ({ ...p, [id]: !p[id] }));
  };

  const addStep = (milestoneId: string) => {
    setMilestones((prev) => prev.map(m => {
      if (m.id !== milestoneId) { return m; }
      const steps = m.steps || [];
      const newStep = { id: `${Date.now()}_${steps.length + 1}`, text: '', completed: false, order: steps.length + 1 };
      return { ...m, steps: [...steps, newStep] };
    }));
  };

  const updateStep = (milestoneId: string, stepId: string, field: 'text' | 'completed', value: any) => {
    setMilestones((prev) => prev.map(m => {
      if (m.id !== milestoneId) { return m; }
      const steps = (m.steps || []).map(s => s.id === stepId ? { ...s, [field]: value } : s);
      return { ...m, steps };
    }));
  };

  const deleteStep = (milestoneId: string, stepId: string) => {
    setMilestones((prev) => prev.map(m => {
      if (m.id !== milestoneId) { return m; }
      const steps = (m.steps || []).filter(s => s.id !== stepId).map((s, idx) => ({ ...s, order: idx + 1 }));
      return { ...m, steps };
    }));
  };

  const moveStep = (milestoneId: string, stepId: string, direction: 'up' | 'down') => {
    setMilestones((prev) => prev.map(m => {
      if (m.id !== milestoneId) { return m; }
      const steps = [...(m.steps || [])];
      const index = steps.findIndex(s => s.id === stepId);
      if (index === -1) { return m; }
      const target = direction === 'up' ? index - 1 : index + 1;
      if (target < 0 || target >= steps.length) { return m; }
      const temp = steps[index];
      steps[index] = steps[target];
      steps[target] = temp;
      const reord = steps.map((s, i) => ({ ...s, order: i + 1 }));
      return { ...m, steps: reord };
    }));
  };

  if (initialLoading) {
    return (
      <SafeAreaView style={styles.container} edges={['left', 'right']}>
        <View style={styles.loadingContainer}>
          <Text style={styles.loadingText}>Loading goal data...</Text>
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
        {/* Goal Details */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Goal Details</Text>

          <Input
            placeholder="What do you want to achieve?"
            value={title}
            onChangeText={setTitle}
            fullWidth
            style={styles.titleInput}
          />

          <Input
            placeholder="Describe your goal in detail..."
            value={description}
            onChangeText={setDescription}
            multiline
            numberOfLines={4}
            fullWidth
            style={styles.descriptionInput}
          />

          {/* Target Date */}
          <View style={styles.dateRow}>
            <Icon icon={Calendar01Icon} size={16} color={colors.text.secondary} />
            <TouchableOpacity
              onPress={() => setShowDatePicker(true)}
              accessibilityRole="button"
              accessibilityLabel="Set target date"
            >
              <Text style={styles.dateText}>
                {targetDate ? format(targetDate, 'EEE, MMM d, yyyy') : 'Set target date (optional)'}
              </Text>
            </TouchableOpacity>
          </View>
          {showDatePicker && (
            <DateTimePicker
              value={targetDate || new Date()}
              mode="date"
              display={Platform.OS === 'ios' ? 'inline' as any : 'default'}
              onChange={(event: any, selected?: Date) => {
                if (Platform.OS === 'android') { setShowDatePicker(false); }
                if (event?.type === 'dismissed') { return; }
                if (selected) { setTargetDate(selected); }
              }}
            />
          )}
        </View>

        {/* Milestones Section */}
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>Milestones</Text>
          </View>
          {milestones.length === 0 ? (
            <View style={styles.emptyMilestones}>
              <Text style={styles.emptyMilestonesText}>
                No milestones yet. Add them below.
              </Text>
            </View>
          ) : (
            <View style={styles.milestonesList}>
              {milestones.map((milestone, index) => {
                const total = milestone.steps?.length || 0;
                const completedSteps = (milestone.steps || []).filter(s => s.completed).length;
                const isOpen = !!expanded[milestone.id];
                return (
                  <View key={milestone.id} style={styles.milestoneCard}>
                    {/* Collapsed Header */}
                    <TouchableOpacity onPress={() => toggleExpanded(milestone.id)} activeOpacity={0.8}>
                      <View style={styles.milestoneHeaderRow}>
                        <View style={{ flex: 1 }}>
                          <Text style={styles.milestoneTitleText}>{milestone.title || `Milestone ${index + 1}`}</Text>
                          {!!milestone.description && (
                            <Text style={styles.milestoneDescriptionCollapsed}>{milestone.description}</Text>
                          )}
                        </View>
                        <View style={styles.progressPill}>
                          <Text style={styles.progressPillText}>{completedSteps}/{total}</Text>
                        </View>
                        <Icon icon={isOpen ? ArrowUp01Icon : ArrowDown01Icon} size={16} color={colors.text.secondary} />
                      </View>
                    </TouchableOpacity>

                    {/* Expanded Content */}
                    {isOpen && (
                      <View style={styles.milestoneExpanded}>
                        <Input
                          placeholder="Milestone title"
                          value={milestone.title}
                          onChangeText={(value) => updateMilestone(milestone.id, 'title', value)}
                          style={styles.milestoneTitleInput}
                        />
                        <Input
                          placeholder="Description (optional)"
                          value={milestone.description}
                          onChangeText={(value) => updateMilestone(milestone.id, 'description', value)}
                          multiline
                          numberOfLines={2}
                          style={styles.milestoneDescriptionInput}
                        />

                        {/* Steps List */}
                        <View style={styles.stepsContainer}>
                          {(milestone.steps || []).map((step, stepIndex) => (
                            <View key={step.id} style={styles.stepRow}>
                              <TouchableOpacity onPress={() => updateStep(milestone.id, step.id, 'completed', !step.completed)} style={styles.stepCheckboxBtn}>
                                <View style={[styles.checkbox, step.completed && styles.checkboxChecked]}>
                                  {step.completed && <Text style={styles.checkmark}>✓</Text>}
                                </View>
                              </TouchableOpacity>
                              <Input
                                placeholder={`Step ${stepIndex + 1}`}
                                value={step.text}
                                onChangeText={(t) => updateStep(milestone.id, step.id, 'text', t)}
                                style={styles.stepInput}
                              />
                              <View style={styles.stepActions}>
                                <TouchableOpacity onPress={() => moveStep(milestone.id, step.id, 'up')} style={styles.iconBtnSmall}>
                                  <Icon icon={ArrowUp01Icon} size={16} color={colors.text.secondary} />
                                </TouchableOpacity>
                                <TouchableOpacity onPress={() => moveStep(milestone.id, step.id, 'down')} style={styles.iconBtnSmall}>
                                  <Icon icon={ArrowDown01Icon} size={16} color={colors.text.secondary} />
                                </TouchableOpacity>
                                <TouchableOpacity onPress={() => deleteStep(milestone.id, step.id)} style={styles.iconBtnSmall}>
                                  <Icon icon={Delete01Icon} size={16} color={colors.text.secondary} />
                                </TouchableOpacity>
                              </View>
                            </View>
                          ))}
                          <TouchableOpacity onPress={() => addStep(milestone.id)}>
                            <Text style={styles.linkButton}>+ Add Step</Text>
                          </TouchableOpacity>
                        </View>

                        <View style={styles.milestoneFooterActions}>
                          <TouchableOpacity onPress={() => removeMilestone(milestone.id)} style={styles.iconBtnDanger}>
                            <Icon icon={Delete01Icon} size={16} color={colors.text.secondary} />
                            <Text style={styles.removeText}>Remove Milestone</Text>
                          </TouchableOpacity>
                        </View>
                      </View>
                    )}
                  </View>
                );
              })}
            </View>
          )}

          <Button
            title="Add Milestone"
            onPress={addMilestone}
            variant="outline"
            style={[styles.addMilestoneButton, { maxWidth: '100%' }]}
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
  headerTitle: {
    fontSize: typography.fontSize.lg,
    fontWeight: typography.fontWeight.bold,
    color: colors.text.primary,
  },
  saveButton: {
    fontSize: typography.fontSize.base,
    color: colors.primary,
    fontWeight: typography.fontWeight.bold,
  },
  saveButtonDisabled: {
    color: colors.text.disabled,
  },
  content: {
    flex: 1,
    padding: spacing.md,
  },
  scrollContent: {
    paddingBottom: spacing.xl * 2, // Extra padding for system navigation
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
  section: {
    marginBottom: spacing.xl,
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
    marginBottom: spacing.md,
  },
  aiHelpText: {
    fontSize: typography.fontSize.sm,
    color: colors.primary,
    fontWeight: typography.fontWeight.medium as any,
  },
  titleInput: {
    marginBottom: spacing.md,
  },
  descriptionInput: {
    marginBottom: spacing.sm,
  },
  dateRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    marginTop: spacing.xs,
  },
  dateText: {
    fontSize: typography.fontSize.sm,
    color: colors.text.secondary,
    fontWeight: typography.fontWeight.medium as any,
  },
  // AI flow styles removed
  emptyMilestones: {
    alignItems: 'center',
    paddingVertical: spacing.lg,
  },
  emptyMilestonesText: {
    fontSize: typography.fontSize.sm,
    color: colors.text.secondary,
    textAlign: 'center',
  },
  milestonesList: {
    gap: spacing.md,
  },
  milestoneCard: {
    backgroundColor: colors.surface,
    borderRadius: borderRadius.lg,
    padding: spacing.md,
    borderWidth: 1,
    borderColor: colors.border.light,
  },
  milestoneHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  milestoneTitleText: {
    fontSize: typography.fontSize.base,
    color: colors.text.primary,
    fontWeight: typography.fontWeight.bold as any,
  },
  milestoneDescriptionCollapsed: {
    fontSize: typography.fontSize.xs,
    color: colors.text.secondary,
    marginTop: 2,
  },
  progressPill: {
    paddingVertical: 2,
    paddingHorizontal: 8,
    borderRadius: 999,
    backgroundColor: colors.background.primary,
    borderWidth: 1,
    borderColor: colors.border.light,
    marginRight: spacing.xs,
  },
  progressPillText: {
    fontSize: typography.fontSize.xs,
    color: colors.text.secondary,
  },
  milestoneExpanded: {
    marginTop: spacing.sm,
  },
  checkbox: {
    width: 20,
    height: 20,
    borderRadius: 4,
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
    fontSize: 12,
    fontWeight: typography.fontWeight.bold,
  },
  // removed old milestone number/remove styles
  milestoneTitleInput: {
    marginBottom: spacing.sm,
  },
  milestoneDescriptionInput: {
    marginBottom: spacing.sm,
  },
  addMilestoneButton: {
    marginTop: spacing.md,
  },
  // removed old option tiles styles
  stepsContainer: {
    marginTop: spacing.sm,
    paddingLeft: 0,
  },
  stepRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: spacing.xs,
    gap: spacing.xs,
  },
  stepCheckboxBtn: {
    padding: spacing.xs,
  },
  stepInput: {
    flex: 1,
  },
  stepActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6 as any,
  },
  iconBtnSmall: {
    padding: spacing.xs,
    borderRadius: borderRadius.sm,
  },
  iconBtnDanger: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    paddingVertical: spacing.xs,
  },
  removeText: {
    fontSize: typography.fontSize.xs,
    color: colors.text.secondary,
  },
  linkButton: {
    color: colors.accent?.gold || colors.primary,
    fontSize: typography.fontSize.sm,
    fontWeight: typography.fontWeight.medium as any,
    marginTop: spacing.xs,
  },
  milestoneFooterActions: {
    marginTop: spacing.sm,
    alignItems: 'flex-start',
  },
}); 