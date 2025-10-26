import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  Modal,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  TextInput,
  Alert,
} from 'react-native';
import DateTimePickerModal from 'react-native-modal-datetime-picker';
import { colors } from '../../themes/colors';
import { typography } from '../../themes/typography';
import { spacing } from '../../themes/spacing';
import { Button } from '../common/Button';
import { hapticFeedback } from '../../utils/hapticFeedback';
import { useDatabase } from '../../contexts/DatabaseContext';
import { authService } from '../../services/auth';
import CalendarEvent from '../../db/models/CalendarEvent';
import Task from '../../db/models/Task';
import { v4 as uuidv4 } from 'uuid';

interface EventFormData {
  title: string;
  description?: string;
  startTime: Date;
  endTime: Date;
  location?: string;
  isRecurring: boolean;
  recurringPattern?: 'daily' | 'weekly' | 'monthly' | 'yearly';
}

interface EventFormModalProps {
  visible: boolean;
  event?: CalendarEvent | Task | null; // For editing existing events
  onClose: () => void;
}

export const EventFormModal: React.FC<EventFormModalProps> = ({
  visible,
  event,
  onClose,
}) => {
  const database = useDatabase();
  const [loading, setLoading] = useState(false);
  const [formData, setFormData] = useState<EventFormData>({
    title: '',
    description: '',
    startTime: new Date(),
    endTime: new Date(Date.now() + 60 * 60 * 1000), // 1 hour later
    location: '',
    isRecurring: false,
    recurringPattern: 'weekly',
  });

  const [showStartPicker, setShowStartPicker] = useState(false);
  const [showEndPicker, setShowEndPicker] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [linkedTaskDurationMinutes, setLinkedTaskDurationMinutes] = useState<number | null>(null);

  const isEditing = !!event;

  // Initialize form data when editing
  useEffect(() => {
    if (event) {
      // Handle different event types properly
      let startTime: Date;
      let endTime: Date;
      
      if (event instanceof CalendarEvent) {
        // It's a WatermelonDB CalendarEvent model
        startTime = event.startTime;
        endTime = event.endTime;
      } else if (event instanceof Task) {
        // It's a WatermelonDB Task model
        const task = event as Task;
        startTime = task.dueDate || new Date();
        // Default endTime from task estimated duration if available, else same as start
        endTime = task.estimatedDurationMinutes && task.estimatedDurationMinutes > 0
          ? new Date((task.dueDate || new Date()).getTime() + task.estimatedDurationMinutes * 60000)
          : new Date(task.dueDate || new Date());
      } else {
        // Fallback for safety, though should not happen with new data flow
        startTime = new Date();
        endTime = new Date(startTime.getTime() + 60 * 60 * 1000);
      }
      
      const computedTitle = event.title || '';
      setFormData({
        title: computedTitle,
        description: event.description || '',
        startTime,
        endTime,
        location: 'location' in event && event.location ? event.location : '',
        isRecurring: false, // TODO: Add recurring support
        recurringPattern: 'weekly',
      });

      // Populate linked task estimated duration for task-linked events
      (async () => {
        try {
          if (event instanceof CalendarEvent) {
            const task = await event.task.fetch();
            if (task) {
              const minutes = Number(task.estimatedDurationMinutes);
              setLinkedTaskDurationMinutes(Number.isFinite(minutes) && minutes > 0 ? minutes : null);
            }
          } else if (event instanceof Task) {
            const minutes = Number(event?.estimatedDurationMinutes);
            setLinkedTaskDurationMinutes(Number.isFinite(minutes) && minutes > 0 ? minutes : null);
          }
        } catch (_e) {
          setLinkedTaskDurationMinutes(null);
        }
      })();
    } else {
      // Reset form for new event
      const now = new Date();
      const oneHourLater = new Date(now.getTime() + 60 * 60 * 1000);
      
      setFormData({
        title: '',
        description: '',
        startTime: now,
        endTime: oneHourLater,
        location: '',
        isRecurring: false,
        recurringPattern: 'weekly',
      });
      setLinkedTaskDurationMinutes(null);
    }
    setErrors({});
  }, [event, visible]);

  const validateForm = (): boolean => {
    const newErrors: Record<string, string> = {};

    if (!formData.title.trim()) {
      newErrors.title = 'Title is required';
    }

    if (formData.startTime >= formData.endTime) {
      newErrors.endTime = 'End time must be after start time';
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = async () => {
    if (!validateForm()) {
      hapticFeedback.error();
      return;
    }

    setLoading(true);
    try {
      hapticFeedback.medium();
      const user = authService.getCurrentUser();
      if (!user) {
        throw new Error('User not authenticated');
      }

      if (isEditing && event) {
        // Update existing event based on its type
        if (event instanceof CalendarEvent) {
          const eventRecord = await database.get<CalendarEvent>('calendar_events').find(event.id);
          await database.write(async () => {
            await eventRecord.update(e => {
              e.title = formData.title;
              e.description = formData.description;
              e.startTime = formData.startTime;
              e.endTime = formData.endTime;
              e.location = formData.location;
              e.status = 'pending_update';
            });
          });
        } else if (event instanceof Task) {
          const taskRecord = await database.get<Task>('tasks').find(event.id);
          await database.write(async () => {
            await taskRecord.update(t => {
              t.title = formData.title;
              t.description = formData.description;
              t.dueDate = formData.startTime;
              // Update duration based on form times
              const duration = (formData.endTime.getTime() - formData.startTime.getTime()) / 60000;
              t.estimatedDurationMinutes = duration > 0 ? duration : 0;
              t.status = 'pending_update';
            });
          });
        } else {
          // Fallback or error for unknown event types
          console.warn('Attempted to edit an unknown event type:', event);
          Alert.alert('Error', 'Cannot edit this item type.');
          setLoading(false);
          return;
        }
      } else {
        // Create new event
        await database.write(async () => {
          const newId = uuidv4();
          await database.get<CalendarEvent>('calendar_events').create(e => {
            e._raw.id = newId; // Set the ID explicitly
            e.userId = user.id;
            e.title = formData.title;
            e.description = formData.description;
            e.startTime = formData.startTime;
            e.endTime = formData.endTime;
            e.location = formData.location;
            e.isAllDay = false; // default
            e.status = 'pending_create';
          });
        });
      }
      onClose();
    } catch (_error) {
      hapticFeedback.error();
      console.error('Failed to save event locally:', _error); // More detailed logging
      Alert.alert('Error', 'Failed to save event locally.');
    } finally {
      setLoading(false);
    }
  };

  const handleStartTimeChange = (selectedDate: Date) => {
    hapticFeedback.light();
    setFormData(prev => {
      let nextEnd = prev.endTime;
      if (linkedTaskDurationMinutes && linkedTaskDurationMinutes > 0) {
        nextEnd = new Date(selectedDate.getTime() + linkedTaskDurationMinutes * 60000);
      } else if (selectedDate > prev.endTime) {
        nextEnd = selectedDate;
      }
      return {
        ...prev,
        startTime: selectedDate,
        endTime: nextEnd,
      };
    });
    setShowStartPicker(false);
  };

  const handleEndTimeChange = (selectedDate: Date) => {
    hapticFeedback.light();
    setFormData(prev => ({
      ...prev,
      endTime: selectedDate,
    }));
    setShowEndPicker(false);
  };

  // removed unused cancel handlers

  const formatDateTime = (date: Date) => {
    return date.toLocaleString([], {
      weekday: 'short',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  return (
    <Modal
      visible={visible}
      animationType="slide"
      transparent={true}
      onRequestClose={onClose}
    >
      <View style={styles.overlay}>
        <View style={styles.modalContainer}>
          <View style={styles.header}>
            <Text style={styles.title}>
              {isEditing ? 'Edit Event' : 'Create Event'}
            </Text>
            <TouchableOpacity 
              onPress={() => {
                hapticFeedback.light();
                onClose();
              }} 
              style={styles.closeButton}
            >
              <Text style={styles.closeButtonText}>×</Text>
            </TouchableOpacity>
          </View>

          <ScrollView style={styles.content} showsVerticalScrollIndicator={false}>
            {/* Title */}
            <View style={styles.field}>
              <Text style={styles.label}>Title *</Text>
              <TextInput
                style={[styles.input, errors.title && styles.inputError]}
                value={formData.title}
                onChangeText={(text) => setFormData(prev => ({ ...prev, title: text }))}
                placeholder="Enter event title"
                placeholderTextColor={colors.text.disabled}
              />
              {errors.title && <Text style={styles.errorText}>{errors.title}</Text>}
            </View>

            {/* Description */}
            <View style={styles.field}>
              <Text style={styles.label}>Description</Text>
              <TextInput
                style={[styles.input, styles.textArea]}
                value={formData.description}
                onChangeText={(text) => setFormData(prev => ({ ...prev, description: text }))}
                placeholder="Enter event description"
                placeholderTextColor={colors.text.disabled}
                multiline
                numberOfLines={3}
                textAlignVertical="top"
              />
            </View>

            {/* Start Time */}
            <View style={styles.field}>
              <Text style={styles.label}>Start Time *</Text>
              <TouchableOpacity
                style={styles.dateTimeButton}
                onPress={() => {
                  hapticFeedback.light();
                  setShowStartPicker(true);
                }}
              >
                <Text style={styles.dateTimeText}>
                  {formatDateTime(formData.startTime)}
                </Text>
              </TouchableOpacity>
            </View>

            {/* End Time */}
            <View style={styles.field}>
              <Text style={styles.label}>End Time *</Text>
              <TouchableOpacity
                style={[styles.dateTimeButton, errors.endTime && styles.inputError]}
                onPress={() => {
                  hapticFeedback.light();
                  setShowEndPicker(true);
                }}
              >
                <Text style={styles.dateTimeText}>
                  {formatDateTime(formData.endTime)}
                </Text>
              </TouchableOpacity>
              {errors.endTime && <Text style={styles.errorText}>{errors.endTime}</Text>}
            </View>

            {/* Location */}
            <View style={styles.field}>
              <Text style={styles.label}>Location</Text>
              <TextInput
                style={styles.input}
                value={formData.location}
                onChangeText={(text) => setFormData(prev => ({ ...prev, location: text }))}
                placeholder="Enter location"
                placeholderTextColor={colors.text.disabled}
              />
            </View>

            {/* Recurring Event */}
            <View style={styles.field}>
              <View style={styles.recurringContainer}>
                <Text style={styles.label}>Recurring Event</Text>
                <TouchableOpacity
                  style={[styles.toggle, formData.isRecurring && styles.toggleActive]}
                  onPress={() => {
                    hapticFeedback.light();
                    setFormData(prev => ({ ...prev, isRecurring: !prev.isRecurring }));
                  }}
                >
                  <View style={[styles.toggleThumb, formData.isRecurring && styles.toggleThumbActive]} />
                </TouchableOpacity>
              </View>
              
              {formData.isRecurring && (
                <View style={styles.recurringOptions}>
                  <Text style={styles.subLabel}>Repeat</Text>
                  <View style={styles.radioGroup}>
                    {(['daily', 'weekly', 'monthly', 'yearly'] as const).map((pattern) => (
                      <TouchableOpacity
                        key={pattern}
                        style={[
                          styles.radioButton,
                          formData.recurringPattern === pattern && styles.radioButtonActive,
                        ]}
                        onPress={() => {
                          hapticFeedback.light();
                          setFormData(prev => ({ ...prev, recurringPattern: pattern }));
                        }}
                      >
                        <View style={[
                          styles.radioCircle,
                          formData.recurringPattern === pattern && styles.radioCircleActive,
                        ]} />
                        <Text style={[
                          styles.radioText,
                          formData.recurringPattern === pattern && styles.radioTextActive,
                        ]}>
                          {pattern.charAt(0).toUpperCase() + pattern.slice(1)}
                        </Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                </View>
              )}
            </View>
          </ScrollView>

          {/* Action Buttons */}
          <View style={styles.actions}>
            <Button
              title="Cancel"
              onPress={() => {
                hapticFeedback.light();
                onClose();
              }}
              variant="outline"
              style={styles.actionButton}
            />
            <Button
              title={loading ? 'Saving...' : (isEditing ? 'Update Event' : 'Create Event')}
              onPress={handleSubmit}
              loading={loading}
              variant="primary"
              style={styles.actionButton}
            />
          </View>
        </View>
      </View>

      {/* Date/Time Pickers */}
      <DateTimePickerModal
        isVisible={showStartPicker}
        mode="datetime"
        onConfirm={(date) => {
          handleStartTimeChange(date);
          setShowStartPicker(false);
        }}
        onCancel={() => setShowStartPicker(false)}
        date={formData.startTime}
        minimumDate={new Date()}
      />
      
      <DateTimePickerModal
        isVisible={showEndPicker}
        mode="datetime"
        onConfirm={(date) => {
          handleEndTimeChange(date);
          setShowEndPicker(false);
        }}
        onCancel={() => setShowEndPicker(false)}
        date={formData.endTime}
        minimumDate={formData.startTime}
      />
    </Modal>
  );
};

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: colors.overlay,
    justifyContent: 'center',
    alignItems: 'center',
  },
  modalContainer: {
    backgroundColor: colors.background.primary,
    borderRadius: spacing.md,
    width: '90%',
    height: '85%',
    maxHeight: '95%',
    shadowColor: colors.primary,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 8,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.border.light,
  },
  title: {
    fontSize: typography.fontSize.lg,
    fontWeight: typography.fontWeight.bold as any,
    color: colors.text.primary,
  },
  closeButton: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: colors.surface,
    justifyContent: 'center',
    alignItems: 'center',
  },
  closeButtonText: {
    fontSize: typography.fontSize.xl,
    color: colors.text.secondary,
    fontWeight: typography.fontWeight.bold as any,
  },
  content: {
    flex: 1,
    padding: spacing.md,
    paddingBottom: spacing.xl,
  },
  field: {
    marginBottom: spacing.md,
  },
  label: {
    fontSize: typography.fontSize.sm,
    fontWeight: typography.fontWeight.semibold as any,
    color: colors.text.primary,
    marginBottom: spacing.xs,
  },
  subLabel: {
    fontSize: typography.fontSize.sm,
    fontWeight: typography.fontWeight.medium as any,
    color: colors.text.secondary,
    marginBottom: spacing.xs,
  },
  input: {
    borderWidth: 1,
    borderColor: colors.border.medium,
    borderRadius: spacing.xs,
    padding: spacing.sm,
    fontSize: typography.fontSize.base,
    color: colors.text.primary,
    backgroundColor: colors.surface,
  },
  inputError: {
    borderColor: colors.error,
  },
  textArea: {
    height: 80,
    textAlignVertical: 'top',
  },
  dateTimeButton: {
    borderWidth: 1,
    borderColor: colors.border.medium,
    borderRadius: spacing.xs,
    padding: spacing.sm,
    backgroundColor: colors.surface,
  },
  dateTimeText: {
    fontSize: typography.fontSize.base,
    color: colors.text.primary,
    fontWeight: typography.fontWeight.medium as any,
  },
  errorText: {
    fontSize: typography.fontSize.xs,
    color: colors.error,
    marginTop: spacing.xs,
  },
  recurringContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  toggle: {
    width: 44,
    height: 24,
    borderRadius: 12,
    backgroundColor: colors.border.medium,
    padding: 2,
  },
  toggleActive: {
    backgroundColor: colors.primary,
  },
  toggleThumb: {
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: colors.secondary,
  },
  toggleThumbActive: {
    transform: [{ translateX: 20 }],
  },
  recurringOptions: {
    marginTop: spacing.sm,
  },
  radioGroup: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  radioButton: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: spacing.xs,
  },
  radioButtonActive: {
    backgroundColor: colors.surface,
    borderRadius: spacing.xs,
  },
  radioCircle: {
    width: 16,
    height: 16,
    borderRadius: 8,
    borderWidth: 2,
    borderColor: colors.border.medium,
    marginRight: spacing.xs,
  },
  radioCircleActive: {
    borderColor: colors.primary,
    backgroundColor: colors.primary,
  },
  radioText: {
    fontSize: typography.fontSize.sm,
    color: colors.text.secondary,
  },
  radioTextActive: {
    color: colors.text.primary,
    fontWeight: typography.fontWeight.medium as any,
  },
  actions: {
    flexDirection: 'row',
    padding: spacing.md,
    borderTopWidth: 1,
    borderTopColor: colors.border.light,
    gap: spacing.sm,
  },
  actionButton: {
    flex: 1,
  },
});