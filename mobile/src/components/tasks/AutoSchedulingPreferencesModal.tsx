import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Modal,
  TouchableOpacity,
  ScrollView,
  Switch,
  Alert,
  ActivityIndicator,
} from 'react-native';
import DateTimePickerModal from 'react-native-modal-datetime-picker';
import { colors } from '../../themes/colors';
import { spacing, borderRadius } from '../../themes/spacing';
import { typography } from '../../themes/typography';
import { HugeiconsIcon as Icon } from '@hugeicons/react-native';
import { Clock01Icon, MinusSignIcon, PlusSignIcon, Cancel01Icon } from '@hugeicons/core-free-icons';
import { autoSchedulingAPI } from '../../services/api';
import { SchedulingPreferences } from '../../types/autoScheduling';

interface AutoSchedulingPreferencesModalProps {
  visible: boolean;
  onClose: () => void;
  onSave?: (preferences: SchedulingPreferences) => void;
}

const defaultPreferences: SchedulingPreferences = {
  user_id: '',
  preferred_start_time: '09:00:00',
  preferred_end_time: '17:00:00',
  work_days: [1, 2, 3, 4, 5], // Monday to Friday
  max_tasks_per_day: 5,
  buffer_time_minutes: 15,
  weather_check_enabled: true,
  travel_time_enabled: true,
  auto_scheduling_enabled: true,
};

const workDaysOptions = [
  { value: 1, label: 'Monday' },
  { value: 2, label: 'Tuesday' },
  { value: 3, label: 'Wednesday' },
  { value: 4, label: 'Thursday' },
  { value: 5, label: 'Friday' },
  { value: 6, label: 'Saturday' },
  { value: 7, label: 'Sunday' },
];

export const AutoSchedulingPreferencesModal: React.FC<AutoSchedulingPreferencesModalProps> = ({
  visible,
  onClose,
  onSave,
}) => {
  const [preferences, setPreferences] = useState<SchedulingPreferences>(defaultPreferences);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [showStartTimePicker, setShowStartTimePicker] = useState(false);
  const [showEndTimePicker, setShowEndTimePicker] = useState(false);

  useEffect(() => {
    if (visible) {
      loadPreferences();
    }
  }, [visible]);

  const loadPreferences = async () => {
    try {
      setLoading(true);
      const prefs = await autoSchedulingAPI.getPreferences();
      setPreferences(prefs);
    } catch (error) {
      console.error('Error loading preferences:', error);
      // Use default preferences if loading fails
      setPreferences(defaultPreferences);
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async () => {
    try {
      setSaving(true);
      const updatedPrefs = await autoSchedulingAPI.updatePreferences(preferences);
      setPreferences(updatedPrefs);

      if (onSave) {
        onSave(updatedPrefs);
      }

      Alert.alert('Success', 'Auto-scheduling preferences saved successfully!');
      onClose();
    } catch (error) {
      console.error('Error saving preferences:', error);
      Alert.alert('Error', 'Failed to save preferences');
    } finally {
      setSaving(false);
    }
  };

  const updatePreference = (key: keyof SchedulingPreferences, value: any) => {
    setPreferences(prev => ({ ...prev, [key]: value }));
  };

  const toggleWorkDay = (dayValue: number) => {
    const currentWorkDays = preferences.work_days;
    const newWorkDays = currentWorkDays.includes(dayValue)
      ? currentWorkDays.filter(day => day !== dayValue)
      : [...currentWorkDays, dayValue].sort();

    updatePreference('work_days', newWorkDays);
  };

  const formatTime = (timeString: string) => {
    const [hours, minutes] = timeString.split(':');
    return `${hours}:${minutes}`;
  };

  const parseTime = (timeString: string) => {
    const [hours, minutes] = timeString.split(':');
    return `${hours}:${minutes}:00`;
  };

  const renderTimeInput = (
    label: string,
    value: string,
    onValueChange: (value: string) => void,
    isStartTime: boolean = false
  ) => {
    const [hours, minutes] = value.split(':');
    const timeDate = new Date();
    timeDate.setHours(parseInt(hours, 10), parseInt(minutes, 10), 0, 0);

    const showPicker = isStartTime ? showStartTimePicker : showEndTimePicker;
    const setShowPicker = isStartTime ? setShowStartTimePicker : setShowEndTimePicker;



    return (
      <View style={styles.inputGroup}>
        <Text style={styles.inputLabel}>{label}</Text>
        <View style={styles.timeInputContainer}>
          <TouchableOpacity
            style={styles.timeInput}
            onPress={() => setShowPicker(true)}
          >
            <Icon icon={Clock01Icon} size={16} color={colors.text.secondary} />
            <Text style={styles.timeInputText}>{formatTime(value)}</Text>
          </TouchableOpacity>
        </View>
        <DateTimePickerModal
          isVisible={showPicker}
          mode="time"
          onConfirm={(selectedTime) => {
            const hours = selectedTime.getHours().toString().padStart(2, '0');
            const minutes = selectedTime.getMinutes().toString().padStart(2, '0');
            const timeString = `${hours}:${minutes}:00`;
            onValueChange(timeString);
            setShowPicker(false);
          }}
          onCancel={() => setShowPicker(false)}
          date={timeDate}
        />
      </View>
    );
  };

  const renderNumberInput = (
    label: string,
    value: number,
    onValueChange: (value: number) => void,
    min: number = 1,
    max: number = 20
  ) => (
    <View style={styles.inputGroup}>
      <Text style={styles.inputLabel}>{label}</Text>
      <View style={styles.numberInputContainer}>
        <TouchableOpacity
          style={styles.numberButton}
          onPress={() => onValueChange(Math.max(min, value - 1))}
          disabled={value <= min}
        >
          <Icon icon={MinusSignIcon} size={16} color={colors.text.secondary} />
        </TouchableOpacity>
        <Text style={styles.numberInputText}>{value}</Text>
        <TouchableOpacity
          style={styles.numberButton}
          onPress={() => onValueChange(Math.min(max, value + 1))}
          disabled={value >= max}
        >
          <Icon icon={PlusSignIcon} size={16} color={colors.text.secondary} />
        </TouchableOpacity>
      </View>
    </View>
  );

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

  const renderWorkDaysSelector = () => (
    <View style={styles.inputGroup}>
      <Text style={styles.inputLabel}>Work Days</Text>
      <View style={styles.workDaysContainer}>
        {workDaysOptions.map(option => (
          <TouchableOpacity
            key={option.value}
            style={[
              styles.workDayButton,
              preferences.work_days.includes(option.value) && styles.workDayButtonSelected
            ]}
            onPress={() => toggleWorkDay(option.value)}
          >
            <Text style={[
              styles.workDayText,
              preferences.work_days.includes(option.value) && styles.workDayTextSelected
            ]}>
              {option.label.slice(0, 3)}
            </Text>
          </TouchableOpacity>
        ))}
      </View>
    </View>
  );

  if (loading) {
    return (
      <Modal visible={visible} animationType="slide" presentationStyle="pageSheet">
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={colors.primary} />
          <Text style={styles.loadingText}>Loading preferences...</Text>
        </View>
      </Modal>
    );
  }

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={onClose}
    >
      <View style={styles.container}>
        <View style={styles.header}>
          <TouchableOpacity onPress={onClose} style={styles.closeButton}>
            <Icon icon={Cancel01Icon} size={24} color={colors.text.secondary} />
          </TouchableOpacity>
          <Text style={styles.title}>Auto-Scheduling Preferences</Text>
          <TouchableOpacity
            onPress={handleSave}
            disabled={saving}
            style={[styles.saveButton, saving && styles.saveButtonDisabled]}
          >
            {saving ? (
              <ActivityIndicator size="small" color={colors.secondary} />
            ) : (
              <Text style={styles.saveButtonText}>Save</Text>
            )}
          </TouchableOpacity>
        </View>

        <ScrollView style={styles.content} showsVerticalScrollIndicator={false}>
          {/* Work Hours */}
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Work Hours</Text>
            {renderTimeInput(
              'Start Time',
              preferences.preferred_start_time,
              (value) => updatePreference('preferred_start_time', parseTime(value)),
              true
            )}
            {renderTimeInput(
              'End Time',
              preferences.preferred_end_time,
              (value) => updatePreference('preferred_end_time', parseTime(value)),
              false
            )}
          </View>

          {/* Work Days */}
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Work Days</Text>
            {renderWorkDaysSelector()}
          </View>

          {/* Task Limits */}
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Task Limits</Text>
            {renderNumberInput(
              'Max Tasks Per Day',
              preferences.max_tasks_per_day,
              (value) => updatePreference('max_tasks_per_day', value),
              1,
              20
            )}
            {renderNumberInput(
              'Buffer Time (minutes)',
              preferences.buffer_time_minutes,
              (value) => updatePreference('buffer_time_minutes', value),
              5,
              60
            )}
          </View>

          {/* Features */}
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Features</Text>
            {renderSwitch(
              'Auto-Scheduling',
              preferences.auto_scheduling_enabled,
              (value) => updatePreference('auto_scheduling_enabled', value),
              'Automatically schedule tasks based on your preferences'
            )}
            {renderSwitch(
              'Weather Check',
              preferences.weather_check_enabled,
              (value) => updatePreference('weather_check_enabled', value),
              'Consider weather conditions for outdoor tasks'
            )}
            {renderSwitch(
              'Travel Time',
              preferences.travel_time_enabled,
              (value) => updatePreference('travel_time_enabled', value),
              'Include travel time in task scheduling'
            )}
          </View>
        </ScrollView>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background.primary,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: spacing.md,
    paddingTop: spacing.lg,
    borderBottomWidth: 1,
    borderBottomColor: colors.border.light,
  },
  closeButton: {
    padding: spacing.xs,
  },
  title: {
    fontSize: typography.fontSize.lg,
    fontWeight: typography.fontWeight.semibold as any,
    color: colors.text.primary,
    flex: 1,
    textAlign: 'center',
  },
  saveButton: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    backgroundColor: colors.primary,
    borderRadius: borderRadius.sm,
  },
  saveButtonDisabled: {
    opacity: 0.6,
  },
  saveButtonText: {
    fontSize: typography.fontSize.sm,
    fontWeight: typography.fontWeight.medium as any,
    color: colors.secondary,
  },
  content: {
    flex: 1,
    padding: spacing.md,
  },
  section: {
    marginBottom: spacing.xl,
  },
  sectionTitle: {
    fontSize: typography.fontSize.lg,
    fontWeight: typography.fontWeight.semibold as any,
    color: colors.text.primary,
    marginBottom: spacing.md,
  },
  inputGroup: {
    marginBottom: spacing.md,
  },
  inputLabel: {
    fontSize: typography.fontSize.sm,
    fontWeight: typography.fontWeight.medium as any,
    color: colors.text.primary,
    marginBottom: spacing.xs,
  },
  timeInputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  timeInput: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    backgroundColor: colors.surface,
    borderRadius: borderRadius.sm,
    borderWidth: 1,
    borderColor: colors.border.light,
    flex: 1,
  },
  timeInputText: {
    fontSize: typography.fontSize.base,
    color: colors.text.primary,
  },
  numberInputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderRadius: borderRadius.sm,
    borderWidth: 1,
    borderColor: colors.border.light,
    overflow: 'hidden',
  },
  numberButton: {
    padding: spacing.md,
    backgroundColor: colors.surface,
  },
  numberInputText: {
    fontSize: typography.fontSize.base,
    fontWeight: typography.fontWeight.medium as any,
    color: colors.text.primary,
    paddingHorizontal: spacing.md,
    minWidth: 40,
    textAlign: 'center',
  },
  workDaysContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.xs,
  },
  workDayButton: {
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
    borderRadius: borderRadius.sm,
    borderWidth: 1,
    borderColor: colors.border.light,
    backgroundColor: colors.surface,
  },
  workDayButtonSelected: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  workDayText: {
    fontSize: typography.fontSize.sm,
    color: colors.text.secondary,
    fontWeight: typography.fontWeight.medium as any,
  },
  workDayTextSelected: {
    color: colors.secondary,
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
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: colors.background.primary,
  },
  loadingText: {
    marginTop: spacing.md,
    fontSize: typography.fontSize.base,
    color: colors.text.secondary,
  },
});