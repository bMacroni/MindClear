import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TextInput,
  TouchableOpacity,
  ScrollView,
  Alert,
  Switch,
  FlatList,
  Dimensions,
} from 'react-native';
import DateTimePickerModal from 'react-native-modal-datetime-picker';
import { colors } from '../../themes/colors';
import { spacing, borderRadius } from '../../themes/spacing';
import { typography } from '../../themes/typography';
import { formatRelativeDueLabel } from '../../utils/dateUtils';
import Icon from 'react-native-vector-icons/Octicons';

interface Task {
  id?: string;
  title: string;
  description?: string;
  priority: 'low' | 'medium' | 'high';
  status: 'not_started' | 'in_progress' | 'completed';
  due_date?: string;
  category?: string;
  goal_id?: string;
  estimated_duration_minutes?: number;
  // Auto-scheduling fields
  auto_schedule_enabled?: boolean;
  weather_dependent?: boolean;
  location?: string;
  preferred_time_windows?: string[];
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

interface TaskFormProps {
  task?: Task;
  goals?: Goal[];
  onSave: (task: Partial<Task>) => void;
  onCancel: () => void;
  loading?: boolean;
  saveSignal?: number; // optional trigger from parent header icon
  stickyFooter?: boolean;
}

// Category options based on database schema
const categoryOptions = [
  { value: 'career', label: 'Career' },
  { value: 'health', label: 'Health' },
  { value: 'personal', label: 'Personal' },
  { value: 'education', label: 'Education' },
  { value: 'finance', label: 'Finance' },
  { value: 'relationships', label: 'Relationships' },
  { value: 'other', label: 'Other' },
];

export const TaskForm: React.FC<TaskFormProps> = ({
  task,
  goals = [],
  onSave,
  onCancel,
  loading = false,
  saveSignal,
  stickyFooter = false,
}) => {
  const [formData, setFormData] = useState<Partial<Task>>({
    title: '',
    description: '',
    priority: 'medium',
    status: 'not_started',
    due_date: undefined,
    category: '',
    goal_id: undefined,
    estimated_duration_minutes: undefined,
    // Auto-scheduling defaults
    auto_schedule_enabled: false,
    weather_dependent: false,
    location: '',
    preferred_time_windows: [],
    travel_time_minutes: 0,
    // Required backend fields with defaults
    preferred_time_of_day: 'morning',
    deadline_type: 'soft',
    recurrence_pattern: 'none',
    scheduling_preferences: null,
    max_daily_tasks: 10,
    buffer_time_minutes: 15,
    task_type: 'other',
  });

  const [showDatePicker, setShowDatePicker] = useState(false);
  const [selectedDate, setSelectedDate] = useState<Date | null>(null);
  const [showCategoryDropdown, setShowCategoryDropdown] = useState(false);
  const [showGoalDropdown, setShowGoalDropdown] = useState(false);
  const [goalDropdownPosition, setGoalDropdownPosition] = useState({ x: 0, y: 0, width: 0 });
  const [categoryDropdownPosition, setCategoryDropdownPosition] = useState({ x: 0, y: 0, width: 0 });

  useEffect(() => {
    if (task) {
      setFormData({
        ...task,
        due_date: task.due_date ? new Date(task.due_date).toISOString() : undefined,
        // Ensure auto-scheduling fields are included
        auto_schedule_enabled: task.auto_schedule_enabled ?? false,
        weather_dependent: task.weather_dependent ?? false,
        location: task.location ?? '',
        preferred_time_windows: task.preferred_time_windows ?? [],
        travel_time_minutes: task.travel_time_minutes ?? 0,
        // Ensure required backend fields have defaults
        preferred_time_of_day: task.preferred_time_of_day ?? 'morning',
        deadline_type: task.deadline_type ?? 'soft',
        recurrence_pattern: task.recurrence_pattern ?? 'none',
        scheduling_preferences: task.scheduling_preferences ?? null,
        max_daily_tasks: task.max_daily_tasks ?? 10,
        buffer_time_minutes: task.buffer_time_minutes ?? 15,
        task_type: task.task_type ?? 'other',      });
      if (task.due_date) {
        setSelectedDate(new Date(task.due_date));
      }
    }
  }, [task]);

  const handleInputChange = (field: keyof Task, value: any) => {
    setFormData(prev => ({ ...prev, [field]: value }));
  };



  const handleSave = () => {
    if (!formData.title?.trim()) {
      Alert.alert('Error', 'Task title is required');
      return;
    }

    onSave(formData);
  };

  // Respond to parent header save icon taps
  useEffect(() => {
    if (saveSignal && typeof saveSignal === 'number') {
      handleSave();
    }
  }, [saveSignal]);

  const clearDueDate = () => {
    setSelectedDate(null);
    handleInputChange('due_date', undefined);
  };

  const formatDate = (date: Date) => {
    return date.toLocaleDateString();
  };

  const getPriorityColor = (priority: string) => {
    switch (priority) {
      case 'high':
        return colors.error;
      case 'medium':
        return colors.warning;
      default:
        return colors.success;
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'completed':
        return colors.success;
      case 'in_progress':
        return colors.warning;
      default:
        return colors.info;
    }
  };

  const renderSwitch = (
    label: string,
    value: boolean,
    onValueChange: (value: boolean) => void,
    description?: string
  ) => (
    <View style={styles.switchGroup}>
      <View style={styles.switchHeader}>
        <Text style={styles.switchLabel}>{label}</Text>
        <Switch
          value={value}
          onValueChange={onValueChange}
          trackColor={{ false: colors.border.light, true: colors.primary }}
          thumbColor={colors.secondary}
        />
      </View>
      {description && (
        <Text style={styles.switchDescription}>{description}</Text>
      )}
    </View>
  );

  const renderTimeWindowSelector = () => {
    const timeWindows = [
      { label: 'Morning (9 AM - 12 PM)', value: 'morning' },
      { label: 'Afternoon (12 PM - 5 PM)', value: 'afternoon' },
      { label: 'Evening (5 PM - 9 PM)', value: 'evening' },
      { label: 'Flexible', value: 'flexible' },
    ];

    return (
      <View style={styles.field}>
        <Text style={styles.label}>Preferred Time Windows</Text>
        <View style={styles.timeWindowsContainer}>
          {timeWindows.map((window) => (
            <TouchableOpacity
              key={window.value}
              style={[
                styles.timeWindowButton,
                formData.preferred_time_windows?.includes(window.value) && 
                styles.timeWindowButtonSelected
              ]}
              onPress={() => {
                const currentWindows = formData.preferred_time_windows || [];
                const newWindows = currentWindows.includes(window.value)
                  ? currentWindows.filter(w => w !== window.value)
                  : [...currentWindows, window.value];
                handleInputChange('preferred_time_windows', newWindows);
              }}
            >
              <Text style={[
                styles.timeWindowText,
                formData.preferred_time_windows?.includes(window.value) && 
                styles.timeWindowTextSelected
              ]}>
                {window.label}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
      </View>
    );
  };

  const getCategoryLabel = (category?: string) => {
    if (!category) {return 'Select category';}
    const option = categoryOptions.find(opt => opt.value === category);
    return option?.label || category;
  };

  const handleCategorySelect = (category: string) => {
    handleInputChange('category', category);
    setShowCategoryDropdown(false);
  };

  const getGoalLabel = (goalId?: string) => {
    if (!goalId) {return 'Select a goal';}
    const goal = goals.find(g => g.id === goalId);
    return goal?.title || 'Unknown Goal';
  };

  const handleGoalSelect = (goalId?: string) => {
    handleInputChange('goal_id', goalId);
    setShowGoalDropdown(false);
  };

  const goalOptions = [
    { id: 'no-goal', title: 'No Goal', goalId: undefined },
    ...goals.map(goal => ({ id: goal.id, title: goal.title, goalId: goal.id }))
  ];

  const handleGoalDropdownPress = (event: any) => {
    // Close category dropdown if open
    if (showCategoryDropdown) {
      setShowCategoryDropdown(false);
    }
    
    event.target.measure((x: number, y: number, width: number, height: number, pageX: number, pageY: number) => {
      setGoalDropdownPosition({ x: pageX, y: pageY + height, width });
      setShowGoalDropdown(!showGoalDropdown);
    });
  };

  const handleCategoryDropdownPress = (event: any) => {
    // Close goal dropdown if open
    if (showGoalDropdown) {
      setShowGoalDropdown(false);
    }
    
    event.target.measure((x: number, y: number, width: number, height: number, pageX: number, pageY: number) => {
      setCategoryDropdownPosition({ x: pageX, y: pageY + height, width });
      setShowCategoryDropdown(!showCategoryDropdown);
    });
  };

  const dueMeta = formatRelativeDueLabel(formData.due_date);

  return (
    <View style={styles.container}>
      <ScrollView 
        style={styles.scrollView} 
        showsVerticalScrollIndicator={false}
        scrollEnabled={!showCategoryDropdown && !showGoalDropdown}
        contentContainerStyle={[styles.scrollContent, stickyFooter ? { paddingBottom: spacing['2xl'] } : null]}
      >
        <View style={styles.content}>
          {/* Meta row to mirror TaskCard */}
          <View style={styles.metaRow}>
            {!!formData.goal_id && (
              <View style={styles.goalBadge}><Text style={styles.goalText}>{getGoalLabel(formData.goal_id)}</Text></View>
            )}
            {Number.isFinite((formData as any).estimated_duration_minutes) && (
              <View style={styles.durationBadge}>
                <Icon name="clock" size={14} color={colors.text.secondary} />
                <Text style={styles.durationText}>{(formData as any).estimated_duration_minutes}m</Text>
              </View>
            )}
          </View>
          {/* Title */}
          <View style={styles.field}>
            <Text style={styles.label}>Title</Text>
            <TextInput
              style={styles.textInput}
              value={formData.title}
              onChangeText={(text) => handleInputChange('title', text)}
              placeholder="Enter task title"
              placeholderTextColor={colors.text.disabled}
            />
          </View>

          {/* Description */}
          <View style={styles.field}>
            <Text style={styles.label}>Description</Text>
            <TextInput
              style={styles.textInput}
              value={formData.description}
              onChangeText={(text) => handleInputChange('description', text)}
              placeholder="Enter task description"
              placeholderTextColor={colors.text.disabled}
              multiline
              numberOfLines={3}
            />
          </View>

          {/* Status */}
          <View style={styles.field}>
            <Text style={styles.label}>Status</Text>
            <View style={styles.segmentedControl}>
              {(['not_started', 'in_progress', 'completed'] as const).map((status) => (
                <TouchableOpacity
                  key={status}
                  style={[
                    styles.segment,
                    formData.status === status && {
                      backgroundColor: getStatusColor(status),
                    },
                  ]}
                  onPress={() => handleInputChange('status', status)}
                >
                  <Text
                    style={[
                      styles.segmentText,
                      formData.status === status && styles.segmentTextActive,
                    ]}
                  >
                    {status === 'not_started' ? 'Not Started' : 
                     status === 'in_progress' ? 'In Progress' : 'Completed'}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>

          {/* Priority */}
          <View style={styles.field}>
            <Text style={styles.label}>Priority</Text>
            <View style={styles.segmentedControl}>
              {(['low', 'medium', 'high'] as const).map((priority) => (
                <TouchableOpacity
                  key={priority}
                  style={[
                    styles.segment,
                    formData.priority === priority && {
                      backgroundColor: getPriorityColor(priority),
                    },
                  ]}
                  onPress={() => handleInputChange('priority', priority)}
                >
                  <Text
                    style={[
                      styles.segmentText,
                      formData.priority === priority && styles.segmentTextActive,
                    ]}
                  >
                    {priority.charAt(0).toUpperCase() + priority.slice(1)}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>

          {/* Due Date */}
          <View style={styles.field}>
            <Text style={styles.label}>Due Date</Text>
            <View style={styles.dateContainer}>
              <TouchableOpacity
                style={styles.dateButton}
                onPress={() => setShowDatePicker(true)}
              >
                <Text style={styles.dateButtonText}>
                  {selectedDate ? formatDate(selectedDate) : 'Select date'}
                </Text>
              </TouchableOpacity>
              {selectedDate && (
                <TouchableOpacity
                  style={styles.clearDateButton}
                  onPress={clearDueDate}
                >
                  <Text style={styles.clearDateText}>Clear</Text>
                </TouchableOpacity>
              )}
            </View>
            {dueMeta?.tone === 'overdue' && (
              <View style={styles.noticeRow}>
                <Icon name="alert" size={14} color={colors.error} />
                <Text style={styles.noticeText}>{dueMeta.label}</Text>
              </View>
            )}
            <DateTimePickerModal
              isVisible={showDatePicker}
              mode="date"
              onConfirm={(date) => {
                setSelectedDate(date);
                handleInputChange('due_date', date.toISOString());
                setShowDatePicker(false);
              }}
              onCancel={() => setShowDatePicker(false)}
              date={selectedDate || new Date()}
              minimumDate={new Date()}
            />
          </View>

          {/* Category */}
          <View style={styles.field}>
            <Text style={styles.label}>Category</Text>
            <View style={styles.dropdownContainer}>
              <TouchableOpacity
                style={styles.dropdownButton}
                onPress={handleCategoryDropdownPress}
              >
                <Text style={styles.dropdownButtonText}>
                  {getCategoryLabel(formData.category)}
                </Text>
                <Icon 
                  name={showCategoryDropdown ? "chevron-up" : "chevron-down"} 
                  size={16} 
                  color={colors.text.secondary} 
                />
              </TouchableOpacity>
            </View>
          </View>

          {/* Goal */}
          {goals.length > 0 && (
            <View style={styles.field}>
              <Text style={styles.label}>Linked Goal</Text>
              <View style={styles.dropdownContainer}>
                <TouchableOpacity
                  style={styles.dropdownButton}
                  onPress={handleGoalDropdownPress}
                >
                  <Text style={styles.dropdownButtonText}>
                    {getGoalLabel(formData.goal_id)}
                  </Text>
                  <Icon 
                    name={showGoalDropdown ? "chevron-up" : "chevron-down"} 
                    size={16} 
                    color={colors.text.secondary} 
                  />
                </TouchableOpacity>
              </View>
            </View>
          )}

          {/* Estimated Duration */}
          <View style={styles.field}>
            <Text style={styles.label}>Estimated Duration (minutes)</Text>
            <TextInput
              style={styles.textInput}
              value={formData.estimated_duration_minutes?.toString() || ''}
              onChangeText={(text) => {
                const value = parseInt(text, 10) || undefined;
                handleInputChange('estimated_duration_minutes', value);
              }}
              placeholder="Enter estimated duration"
              placeholderTextColor={colors.text.disabled}
              keyboardType="numeric"
            />
          </View>

          {/* Auto-Scheduling Section */}
          <View style={styles.autoScheduleSection}>
            <Text style={styles.sectionTitle}>Auto-Scheduling</Text>
            
            {renderSwitch(
              'Enable Auto-Scheduling',
              formData.auto_schedule_enabled || false,
              (value) => handleInputChange('auto_schedule_enabled', value),
              'Automatically schedule this task based on your preferences'
            )}

            {formData.auto_schedule_enabled && (
              <>
                {/* Location */}
                <View style={styles.field}>
                  <Text style={styles.label}>Location</Text>
                  <View style={styles.locationInputContainer}>
                    <Icon name="location" size={16} color={colors.text.secondary} />
                    <TextInput
                      style={styles.locationInput}
                      value={formData.location}
                      onChangeText={(text) => handleInputChange('location', text)}
                      placeholder="Enter location (optional)"
                      placeholderTextColor={colors.text.disabled}
                    />
                  </View>
                </View>

                {/* Weather Dependency */}
                {renderSwitch(
                  'Weather Dependent',
                  formData.weather_dependent || false,
                  (value) => handleInputChange('weather_dependent', value),
                  'Only schedule when weather is suitable for outdoor tasks'
                )}

                {/* Preferred Time Windows */}
                {renderTimeWindowSelector()}
              </>
            )}
          </View>

          {/* Bottom actions */}
          {stickyFooter ? null : (
            <View style={styles.actions}>
              <TouchableOpacity style={[styles.footerIconBtn]} onPress={onCancel} accessibilityLabel="Cancel">
                <Icon name="x" size={22} color={colors.text.primary} />
              </TouchableOpacity>
              <TouchableOpacity style={[styles.footerIconBtn]} onPress={handleSave} disabled={loading} accessibilityLabel="Save task">
                <Icon name="check" size={22} color={colors.text.primary} />
              </TouchableOpacity>
            </View>
          )}
        </View>
      </ScrollView>

      {stickyFooter && (
        <View style={styles.stickyFooter}>
          <TouchableOpacity style={styles.footerIconBtn} onPress={onCancel} accessibilityLabel="Cancel">
            <Icon name="x" size={24} color={colors.text.primary} />
          </TouchableOpacity>
          <TouchableOpacity style={styles.footerIconBtn} onPress={handleSave} disabled={loading} accessibilityLabel="Save task">
            <Icon name="check" size={24} color={colors.text.primary} />
          </TouchableOpacity>
        </View>
      )}

      {/* Category Dropdown Overlay */}
      {showCategoryDropdown && (
        <View style={styles.dropdownOverlay}>
          <TouchableOpacity
            style={styles.dropdownOverlayTouchable}
            activeOpacity={1}
            onPress={() => setShowCategoryDropdown(false)}
          />
          <View style={[
            styles.dropdownOverlayContent,
            {
              left: categoryDropdownPosition.x,
              top: categoryDropdownPosition.y,
              width: categoryDropdownPosition.width,
            }
          ]}>
            <FlatList
              data={categoryOptions}
              renderItem={({ item }) => (
                <TouchableOpacity
                  style={[
                    styles.dropdownOption,
                    formData.category === item.value && styles.dropdownOptionSelected
                  ]}
                  onPress={() => handleCategorySelect(item.value)}
                >
                  <Text style={[
                    styles.dropdownOptionText,
                    formData.category === item.value && styles.dropdownOptionTextSelected
                  ]}>
                    {item.label}
                  </Text>
                </TouchableOpacity>
              )}
              keyExtractor={(item) => item.value}
              style={styles.dropdownOverlayList}
              showsVerticalScrollIndicator={true}
              scrollEnabled={true}
              keyboardShouldPersistTaps="handled"
            />
          </View>
        </View>
      )}

      {/* Goal Dropdown Overlay */}
      {showGoalDropdown && (
        <View style={styles.dropdownOverlay}>
          <TouchableOpacity
            style={styles.dropdownOverlayTouchable}
            activeOpacity={1}
            onPress={() => setShowGoalDropdown(false)}
          />
          <View style={[
            styles.dropdownOverlayContent,
            {
              left: goalDropdownPosition.x,
              top: goalDropdownPosition.y,
              width: goalDropdownPosition.width,
            }
          ]}>
            <FlatList
              data={goalOptions}
              renderItem={({ item }) => (
                <TouchableOpacity
                  style={[
                    styles.dropdownOption,
                    formData.goal_id === item.goalId && styles.dropdownOptionSelected
                  ]}
                  onPress={() => handleGoalSelect(item.goalId)}
                >
                  <Text style={[
                    styles.dropdownOptionText,
                    formData.goal_id === item.goalId && styles.dropdownOptionTextSelected
                  ]}>
                    {item.title}
                  </Text>
                </TouchableOpacity>
              )}
              keyExtractor={(item) => item.id}
              style={styles.dropdownOverlayList}
              showsVerticalScrollIndicator={true}
              scrollEnabled={true}
              keyboardShouldPersistTaps="handled"
            />
          </View>
        </View>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background.primary,
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    paddingBottom: spacing.md,
  },
  content: {
    padding: spacing.md,
  },
  title: {
    fontSize: typography.fontSize['2xl'],
    fontWeight: typography.fontWeight.bold as any,
    color: colors.text.primary,
    marginBottom: spacing.lg,
    textAlign: 'center',
  },
  field: {
    marginBottom: spacing.lg,
  },
  label: {
    fontSize: typography.fontSize.sm,
    fontWeight: typography.fontWeight.medium as any,
    color: colors.text.primary,
    marginBottom: spacing.xs,
  },
  textInput: {
    borderWidth: 1,
    borderColor: colors.border.light,
    borderRadius: borderRadius.md,
    padding: spacing.md,
    fontSize: typography.fontSize.base,
    color: colors.text.primary,
    backgroundColor: colors.secondary,
  },
  textArea: {
    height: 100,
    textAlignVertical: 'top',
  },
  segmentedControl: {
    flexDirection: 'row',
    borderRadius: borderRadius.md,
    borderWidth: 1,
    borderColor: colors.border.light,
    overflow: 'hidden',
  },
  segment: {
    flex: 1,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.xs,
    alignItems: 'center',
    backgroundColor: colors.background.surface,
  },
  segmentText: {
    fontSize: typography.fontSize.sm,
    color: colors.text.secondary,
    fontWeight: typography.fontWeight.medium as any,
  },
  segmentTextActive: {
    color: colors.secondary,
    fontWeight: typography.fontWeight.bold as any,
  },
  dateContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  dateButton: {
    flex: 1,
    borderWidth: 1,
    borderColor: colors.border.light,
    borderRadius: borderRadius.md,
    padding: spacing.md,
    backgroundColor: colors.secondary,
  },
  dateButtonText: {
    fontSize: typography.fontSize.base,
    color: colors.text.primary,
  },
  clearDateButton: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  clearDateText: {
    fontSize: typography.fontSize.sm,
    color: colors.error,
    fontWeight: typography.fontWeight.medium as any,
  },
  dropdownContainer: {
    position: 'relative',
    zIndex: 1000,
  },
  dropdownButton: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: colors.border.light,
    borderRadius: borderRadius.md,
    padding: spacing.md,
    backgroundColor: colors.secondary,
    minHeight: 48,
  },
  dropdownButtonText: {
    fontSize: typography.fontSize.base,
    color: colors.text.primary,
    flex: 1,
  },
  dropdownOptions: {
    position: 'absolute',
    top: '100%',
    left: 0,
    right: 0,
    backgroundColor: colors.secondary,
    borderWidth: 1,
    borderColor: colors.border.light,
    borderRadius: borderRadius.md,
    marginTop: 2,
    zIndex: 1002,
    elevation: 8,
    shadowColor: colors.primary,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 8,
    overflow: 'hidden',
  },
  dropdownScrollView: {
    flex: 1,
    zIndex: 1002,
  },
  dropdownContentContainer: {
    paddingVertical: spacing.sm,
  },
  dropdownOption: {
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: colors.border.light,
    backgroundColor: colors.secondary,
  },
  dropdownOptionSelected: {
    backgroundColor: colors.primary,
  },
  dropdownOptionText: {
    fontSize: typography.fontSize.base,
    color: colors.text.primary,
    fontWeight: typography.fontWeight.medium as any,
  },
  dropdownOptionTextSelected: {
    color: colors.secondary,
    fontWeight: typography.fontWeight.semibold as any,
  },
  pickerContainer: {
    borderWidth: 1,
    borderColor: colors.border.light,
    borderRadius: borderRadius.md,
    backgroundColor: colors.secondary,
  },
  pickerButton: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: spacing.sm,
  },
  pickerButtonText: {
    fontSize: typography.fontSize.base,
    color: colors.text.primary,
    flex: 1,
  },
  // Auto-scheduling styles
  autoScheduleSection: {
    marginTop: spacing.xl,
    paddingTop: spacing.lg,
    borderTopWidth: 1,
    borderTopColor: colors.border.light,
  },
  sectionTitle: {
    fontSize: typography.fontSize.lg,
    fontWeight: typography.fontWeight.semibold as any,
    color: colors.text.primary,
    marginBottom: spacing.md,
  },
  switchGroup: {
    marginBottom: spacing.md,
  },
  switchHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: spacing.xs,
  },
  switchLabel: {
    fontSize: typography.fontSize.base,
    fontWeight: typography.fontWeight.medium as any,
    color: colors.text.primary,
    flex: 1,
  },
  switchDescription: {
    fontSize: typography.fontSize.sm,
    color: colors.text.secondary,
    lineHeight: typography.lineHeight.normal * typography.fontSize.sm,
  },
  locationInputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: colors.border.light,
    borderRadius: borderRadius.md,
    paddingHorizontal: spacing.sm,
    backgroundColor: colors.secondary,
  },
  locationInput: {
    flex: 1,
    paddingVertical: spacing.sm,
    fontSize: typography.fontSize.base,
    color: colors.text.primary,
    marginLeft: spacing.xs,
  },
  timeWindowsContainer: {
    gap: spacing.xs,
  },
  timeWindowButton: {
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.sm,
    borderRadius: borderRadius.sm,
    borderWidth: 1,
    borderColor: colors.border.light,
    backgroundColor: colors.background.surface,
  },
  timeWindowButtonSelected: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  timeWindowText: {
    fontSize: typography.fontSize.sm,
    color: colors.text.secondary,
    fontWeight: typography.fontWeight.medium as any,
  },
  timeWindowTextSelected: {
    color: colors.secondary,
  },
  actions: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: spacing.xl,
  },
  footerIconBtn: {
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    borderRadius: borderRadius.sm,
    backgroundColor: 'transparent',
  },
  cancelButton: {
    flex: 1,
  },
  saveButton: {
    flex: 1,
  },
  dropdownOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    zIndex: 1001,
  },
  dropdownOverlayTouchable: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
  },
  dropdownOverlayContent: {
    position: 'absolute',
    backgroundColor: colors.secondary,
    borderRadius: borderRadius.md,
    borderWidth: 1,
    borderColor: colors.border.light,
    elevation: 8,
    shadowColor: colors.primary,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 8,
    zIndex: 1001,
  },
  dropdownOverlayList: {
    maxHeight: Dimensions.get('window').height * 0.4, // Adjust as needed
  },
  stickyFooter: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    backgroundColor: colors.background.primary,
    borderTopWidth: 1,
    borderTopColor: colors.border.light,
  },
  noticeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: spacing.xs,
  },
  noticeText: {
    fontSize: typography.fontSize.sm,
    color: colors.error,
    fontWeight: typography.fontWeight.medium as any,
  },
  // Meta row styles for task badges
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginBottom: spacing.md,
  },
  goalBadge: {
    backgroundColor: colors.primary,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
    borderRadius: borderRadius.sm,
  },
  goalText: {
    fontSize: typography.fontSize.sm,
    color: colors.secondary,
    fontWeight: typography.fontWeight.medium as any,
  },
  durationBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.background.surface,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
    borderRadius: borderRadius.sm,
    borderWidth: 1,
    borderColor: colors.border.light,
  },
  durationText: {
    fontSize: typography.fontSize.sm,
    color: colors.text.secondary,
    fontWeight: typography.fontWeight.medium as any,
    marginLeft: spacing.xs,
  },
});
