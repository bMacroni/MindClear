import React, { useState, useEffect, useCallback } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, Alert, Platform } from 'react-native';
import Icon from 'react-native-vector-icons/Octicons';
import { SafeAreaView } from 'react-native-safe-area-context';
import { colors } from '../../themes/colors';
import { typography } from '../../themes/typography';
import { spacing, borderRadius } from '../../themes/spacing';
import { Input, Button } from '../../components/common';
import { goalsAPI } from '../../services/api';
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
  const isEditing = !!goalId;
  
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [milestones, setMilestones] = useState<Milestone[]>([]);
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const [loading, setLoading] = useState(false);
  const [initialLoading, setInitialLoading] = useState(isEditing);
  const [targetDate, setTargetDate] = useState<Date | undefined>(undefined);
  const [showDatePicker, setShowDatePicker] = useState(false);

  const loadExistingGoal = useCallback(async () => {
    try {
      setInitialLoading(true);
      const goalData = await goalsAPI.getGoalById(goalId);
      
      setTitle(goalData.title);
      setDescription(goalData.description);
      try {
        if (goalData.target_completion_date) {
          setTargetDate(new Date(goalData.target_completion_date));
        }
      } catch {}
      
      // Transform backend milestone format to UI format
      const uiMilestones: Milestone[] = (goalData.milestones || []).map(milestone => ({
        id: milestone.id,
        title: milestone.title,
        description: (milestone as any).description || '', // Use actual description from backend
        completed: milestone.completed,
        steps: milestone.steps,
      }));
      
      setMilestones(uiMilestones);
    } catch (error) {
      console.error('Error loading existing goal:', error);
      Alert.alert('Error', 'Failed to load goal data. Please try again.');
      navigation.goBack();
    } finally {
      setInitialLoading(false);
    }
  }, [goalId, navigation]);

  // Load existing goal data when editing
  useEffect(() => {
    if (isEditing && goalId) {
      loadExistingGoal();
    }
  }, [goalId, isEditing, loadExistingGoal]);

  const handleSave = async () => {
    if (!title.trim()) {
      Alert.alert('Error', 'Please enter a goal title.');
      return;
    }

    setLoading(true);
    
    try {
      const goalData = {
        title: title.trim(),
        description: description.trim(),
        milestones: milestones.map(m => ({
          id: m.id,
          title: m.title,
          description: m.description,
          completed: m.completed,
          order: 0, // Will be set by backend
          steps: (m.steps || []).map((s, idx) => ({ ...s, order: idx + 1 })),
        })),
        target_completion_date: targetDate ? targetDate.toISOString() : undefined,
      };

      if (isEditing) {
        // Update existing goal
        await goalsAPI.updateGoal(goalId, goalData);
        Alert.alert('Success', 'Goal updated successfully!');
      } else {
        // Create new goal
        await goalsAPI.createGoal(goalData as any);
        Alert.alert('Success', 'Goal created successfully!');
      }
      
      navigation.goBack();
    } catch (error) {
      console.error('Error saving goal:', error);
      Alert.alert('Error', 'Failed to save goal. Please try again.');
    } finally {
      setLoading(false);
    }
  };

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
      if (m.id !== milestoneId) {return m;}
      const steps = m.steps || [];
      const newStep = { id: `${Date.now()}_${steps.length + 1}`, text: '', completed: false, order: steps.length + 1 };
      return { ...m, steps: [...steps, newStep] };
    }));
  };

  const updateStep = (milestoneId: string, stepId: string, field: 'text'|'completed', value: any) => {
    setMilestones((prev) => prev.map(m => {
      if (m.id !== milestoneId) {return m;}
      const steps = (m.steps || []).map(s => s.id === stepId ? { ...s, [field]: value } : s);
      return { ...m, steps };
    }));
  };

  const deleteStep = (milestoneId: string, stepId: string) => {
    setMilestones((prev) => prev.map(m => {
      if (m.id !== milestoneId) {return m;}
      const steps = (m.steps || []).filter(s => s.id !== stepId).map((s, idx) => ({ ...s, order: idx + 1 }));
      return { ...m, steps };
    }));
  };

  const moveStep = (milestoneId: string, stepId: string, direction: 'up'|'down') => {
    setMilestones((prev) => prev.map(m => {
      if (m.id !== milestoneId) {return m;}
      const steps = [...(m.steps || [])];
      const index = steps.findIndex(s => s.id === stepId);
      if (index === -1) {return m;}
      const target = direction === 'up' ? index - 1 : index + 1;
      if (target < 0 || target >= steps.length) {return m;}
      const temp = steps[index];
      steps[index] = steps[target];
      steps[target] = temp;
      const reord = steps.map((s, i) => ({ ...s, order: i + 1 }));
      return { ...m, steps: reord };
    }));
  };

  if (initialLoading) {
    return (
      <SafeAreaView style={styles.container} edges={['top', 'left', 'right']}>
        <View style={styles.header}>
          <TouchableOpacity onPress={() => navigation.goBack()}>
            <Text style={styles.backButton}>Cancel</Text>
          </TouchableOpacity>
          <Text style={styles.headerTitle}>
            {isEditing ? 'Edit Goal' : 'New Goal'}
          </Text>
          <TouchableOpacity disabled={true}>
            <Text style={[styles.saveButton, styles.saveButtonDisabled]}>
              Loading...
            </Text>
          </TouchableOpacity>
        </View>
        <View style={styles.loadingContainer}>
          <Text style={styles.loadingText}>Loading goal data...</Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container} edges={['top', 'left', 'right']}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()}>
          <Text style={styles.backButton}>Cancel</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>
          {isEditing ? 'Edit Goal' : 'New Goal'}
        </Text>
        <TouchableOpacity onPress={handleSave} disabled={loading}>
          <Text style={[styles.saveButton, loading && styles.saveButtonDisabled]}>
            {loading ? 'Saving...' : 'Save'}
          </Text>
        </TouchableOpacity>
      </View>

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
            <Icon name="calendar" size={16} color={colors.text.secondary} />
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
                        <Icon name={isOpen ? 'chevron-up' : 'chevron-down'} size={16} color={colors.text.secondary} />
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
                                  <Icon name="chevron-up" size={16} color={colors.text.secondary} />
                                </TouchableOpacity>
                                <TouchableOpacity onPress={() => moveStep(milestone.id, step.id, 'down')} style={styles.iconBtnSmall}>
                                  <Icon name="chevron-down" size={16} color={colors.text.secondary} />
                                </TouchableOpacity>
                                <TouchableOpacity onPress={() => deleteStep(milestone.id, step.id)} style={styles.iconBtnSmall}>
                                  <Icon name="trash" size={16} color={colors.text.secondary} />
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
                            <Icon name="trash" size={16} color={colors.text.secondary} />
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