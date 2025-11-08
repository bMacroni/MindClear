import React, { useEffect, useMemo, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ActivityIndicator } from 'react-native';
import Icon from 'react-native-vector-icons/Octicons';
import { colors } from '../../themes/colors';
import { typography } from '../../themes/typography';
import { spacing, borderRadius } from '../../themes/spacing';
import { tasksAPI } from '../../services/api';

export interface Task {
  id?: string;
  title: string;
  description?: string;
  dueDate?: string;
  priority?: string;
  status?: 'not_started' | 'in_progress' | 'completed';
}

interface TaskData {
  category: string;
  title: string;
  tasks: Task[];
}

interface TaskDisplayProps {
  text: string;
  onSaveTasks: (tasks: Task[]) => Promise<void>;
}

// Normalize raw payload into TaskData shape expected by the UI
const normalizeTaskPayload = (payload: any): TaskData => {
  const normalizedTasks: Task[] = (payload.tasks || []).map((t: any) => ({
    id: t.id,
    title: t.title || t.text,
    description: t.description || '',
    dueDate: t.dueDate || t.due_date,
    priority: t.priority,
    status: t.status,
  }));
  return {
    category: 'task',
    title: payload.title || 'Your Tasks',
    tasks: normalizedTasks,
  };
};

// Parse task data from text
const parseTaskData = (taskText: string): TaskData | null => {
  try {
    // Look for JSON code blocks
    const jsonMatch = taskText.match(/```json\s*(\{[\s\S]*?\})\s*```/);
    if (jsonMatch) {
      const jsonData = JSON.parse(jsonMatch[1]);
      if (jsonData.category === 'task' && jsonData.tasks) {
        return normalizeTaskPayload(jsonData);
      }
    }
    
    // Also try to parse if the text is just JSON
    const directJsonMatch = taskText.match(/\{[\s\S]*\}/);
    if (directJsonMatch) {
      const jsonData = JSON.parse(directJsonMatch[0]);
      if (jsonData.category === 'task' && jsonData.tasks) {
        return normalizeTaskPayload(jsonData);
      }
    }
    
    return null;
  } catch (_error) {
    // ignore parse errors; fall back to null
    return null;
  }
};

export default function TaskDisplay({ text, onSaveTasks }: TaskDisplayProps) {
  const taskData = useMemo(() => parseTaskData(text), [text]);
  const [items, setItems] = useState<Task[]>(taskData?.tasks || []);
  const [updatingId, setUpdatingId] = useState<string | null>(null);
  const [showCompleted, setShowCompleted] = useState(false);

  // New state for proposal mode
  const [isSaving, setIsSaving] = useState(false);
  const [hasBeenSaved, setHasBeenSaved] = useState(false);

  const isProposal = useMemo(() => {
    return taskData?.tasks && taskData.tasks.length > 0 && taskData.tasks.some(t => !t.id);
  }, [taskData]);

  // When the incoming message changes, sync the local list once
  useEffect(() => {
    setItems(taskData?.tasks || []);
  }, [taskData]);

  const handleSave = async () => {
    if (!onSaveTasks || !taskData?.tasks) return;
    setIsSaving(true);
    try {
      await onSaveTasks(taskData.tasks);
      setHasBeenSaved(true);
    } catch (e) {
      // Parent will show alert
    } finally {
      setIsSaving(false);
    }
  };

  // If no task data found, return null to fall back to regular text display
  if (!taskData) {
    return null;
  }

  // Format date for display
  const formatDate = (dateString?: string) => {
    if (!dateString) {return '';}
    try {
      // Handle YYYY-MM-DD format to avoid timezone conversion issues
      if (/^\d{4}-\d{2}-\d{2}$/.test(dateString)) {
        const [year, month, day] = dateString.split('-');
        const date = new Date(parseInt(year), parseInt(month) - 1, parseInt(day));
        return date.toLocaleDateString('en-US', { 
          month: 'short', 
          day: 'numeric',
          year: 'numeric'
        });
      } 
      // Handle timestamp format (YYYY-MM-DDTHH:mm:ss) to avoid timezone conversion
      else if (/^\d{4}-\d{2}-\d{2}T/.test(dateString)) {
        const [datePart] = dateString.split('T');
        const [year, month, day] = datePart.split('-');
        const date = new Date(parseInt(year), parseInt(month) - 1, parseInt(day));
        return date.toLocaleDateString('en-US', { 
          month: 'short', 
          day: 'numeric',
          year: 'numeric'
        });
      } else {
        const date = new Date(dateString);
        return date.toLocaleDateString('en-US', { 
          month: 'short', 
          day: 'numeric',
          year: 'numeric'
        });
      }
    } catch {
      return dateString;
    }
  };

  // Get priority color
  const getPriorityColor = (priority?: string) => {
    switch (priority?.toLowerCase()) {
      case 'high':
        return colors.error;
      case 'medium':
        return colors.warning;
      case 'low':
        return colors.success;
      default:
        return colors.text.secondary;
    }
  };

  const handleToggleComplete = async (taskId: string) => {
    const index = items.findIndex(t => t.id === taskId);
    if (index === -1) {return;}
    const current = items[index];
    if (!current?.id) {return;}
    const newStatus: Task['status'] = current.status === 'completed' ? 'not_started' : 'completed';
    // Optimistic update by id (avoids filtered index mismatch)
    setItems(prev => prev.map(t => t.id === taskId ? { ...t, status: newStatus } : t));
    setUpdatingId(current.id);
    try {
      await tasksAPI.updateTask(current.id, { status: newStatus });
    } catch (e) {
      // Revert on failure
      setItems(prev => prev.map(t => t.id === taskId ? { ...t, status: current.status } : t));
    } finally {
      setUpdatingId(null);
    }
  };

  const activeCount = items.filter(t => t.status !== 'completed').length;
  const completedCount = items.length - activeCount;
  const filteredItems = items.filter(t => showCompleted ? t.status === 'completed' : t.status !== 'completed');

  if (isProposal) {
    return (
      <View style={styles.container}>
        <Text style={styles.displayTitle}>Here are the tasks I've drafted for you:</Text>
        <View style={styles.tasksContainer}>
          {taskData?.tasks.map((task, index) => (
            <View key={index} style={styles.taskCard}>
              <View style={styles.taskHeader}>
                <Icon name="checklist" size={18} color={colors.text.secondary} style={styles.taskIcon} />
                <Text selectable style={styles.taskTitle} numberOfLines={2}>
                  {task.title}
                </Text>
              </View>
              {!!task.dueDate && (
                <View style={styles.dueDateContainer}>
                  <Icon name="calendar" size={12} color={colors.text.secondary} style={styles.calendarIcon} />
                  <Text style={styles.dueDateText}>Due: {formatDate(task.dueDate)}</Text>
                </View>
              )}
              {index < (taskData?.tasks.length ?? 0) - 1 && <View style={styles.separator} />}
            </View>
          ))}
        </View>
        {!hasBeenSaved && (
          <TouchableOpacity style={styles.saveButton} onPress={handleSave} disabled={isSaving}>
            {isSaving ? (
              <ActivityIndicator color={colors.secondary} />
            ) : (
              <Text style={styles.saveButtonText}>Save Tasks</Text>
            )}
          </TouchableOpacity>
        )}
        {hasBeenSaved && (
          <View style={styles.savedConfirmation}>
            <Icon name="check-circle-fill" size={16} color={colors.success} />
            <Text style={styles.savedConfirmationText}>Tasks have been saved successfully!</Text>
          </View>
        )}
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <Text style={styles.displayTitle}>{taskData.title}</Text>
      <View style={styles.filterBar}>
        <TouchableOpacity
          onPress={() => setShowCompleted(false)}
          style={[styles.filterButton, !showCompleted && styles.filterButtonActive]}
        >
          <Text style={[styles.filterButtonText, !showCompleted && styles.filterButtonTextActive]}>Active ({activeCount})</Text>
        </TouchableOpacity>
        <TouchableOpacity
          onPress={() => setShowCompleted(true)}
          style={[styles.filterButton, showCompleted && styles.filterButtonActive]}
        >
          <Text style={[styles.filterButtonText, showCompleted && styles.filterButtonTextActive]}>Completed ({completedCount})</Text>
        </TouchableOpacity>
      </View>
      <View style={styles.tasksContainer}>
        {filteredItems.map((task, index) => (
          <View key={task.id ?? index} style={styles.taskCard}>
            <View style={styles.taskHeader}>
              <TouchableOpacity onPress={() => task.id && handleToggleComplete(task.id)} style={styles.checkbox} disabled={!task.id || updatingId === task.id}>
                {updatingId === task.id ? (
                  <ActivityIndicator size={14} color={colors.primary} />
                ) : (
                  <Icon name={task.status === 'completed' ? 'check-circle' : 'circle'} size={18} color={task.status === 'completed' ? colors.primary : colors.text.secondary} />
                )}
              </TouchableOpacity>
              <Text selectable style={[styles.taskTitle, task.status === 'completed' && styles.taskTitleCompleted]} numberOfLines={2}>
                {task.title}
              </Text>
              {task.priority && (
                <View style={[styles.priorityBadge, { backgroundColor: getPriorityColor(task.priority) }]}>
                  <Text style={styles.priorityText}>{task.priority.toUpperCase()}</Text>
                </View>
              )}
            </View>
            {/* Description intentionally omitted for compact list */}
            {!!task.dueDate && (
              <View style={styles.dueDateContainer}>
                <Icon name="calendar" size={12} color={colors.text.secondary} style={styles.calendarIcon} />
                <Text style={styles.dueDateText}>Due: {formatDate(task.dueDate)}</Text>
              </View>
            )}
            {index < filteredItems.length - 1 && <View style={styles.separator} />}
          </View>
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    marginTop: spacing.sm,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    maxWidth: '100%',
  },
  displayTitle: {
    fontSize: typography.fontSize.lg,
    fontWeight: typography.fontWeight.bold,
    color: colors.text.primary,
    marginBottom: spacing.md,
  },
  tasksContainer: {
    backgroundColor: colors.background.surface,
    borderRadius: borderRadius.md,
    borderWidth: 1,
    borderColor: colors.border.light,
    overflow: 'hidden',
  },
  filterBar: {
    flexDirection: 'row',
    gap: spacing.sm,
    marginBottom: spacing.sm,
  },
  filterButton: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    borderRadius: borderRadius.lg,
    backgroundColor: colors.background.surface,
    borderWidth: 1,
    borderColor: colors.border.light,
  },
  filterButtonActive: {
    backgroundColor: colors.primary + '10',
    borderColor: colors.primary,
  },
  filterButtonText: {
    color: colors.text.secondary,
    fontSize: typography.fontSize.sm,
    fontWeight: typography.fontWeight.medium,
  },
  filterButtonTextActive: {
    color: colors.primary,
  },
  taskCard: {
    padding: spacing.md,
    width: '100%',
  },
  taskHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: spacing.xs,
  },
  checkbox: {
    marginRight: spacing.sm,
    width: 22,
    height: 22,
    alignItems: 'center',
    justifyContent: 'center',
  },
  taskIcon: {
    marginRight: spacing.sm,
  },
  taskTitle: {
    fontSize: typography.fontSize.base,
    fontWeight: typography.fontWeight.medium,
    color: colors.text.primary,
    flex: 1,
  },
  taskTitleCompleted: {
    textDecorationLine: 'line-through',
    color: colors.text.secondary,
  },
  priorityBadge: {
    paddingHorizontal: spacing.xs,
    paddingVertical: 2,
    borderRadius: borderRadius.sm,
    marginLeft: spacing.sm,
  },
  priorityText: {
    color: colors.secondary,
    fontSize: typography.fontSize.xs,
    fontWeight: typography.fontWeight.bold,
  },
  taskDescription: {
    fontSize: typography.fontSize.sm,
    color: colors.text.secondary,
    marginBottom: spacing.xs,
    lineHeight: typography.lineHeight.normal,
  },
  dueDateContainer: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  calendarIcon: {
    marginRight: spacing.xs,
  },
  dueDateText: {
    fontSize: typography.fontSize.sm,
    color: colors.text.secondary,
  },
  separator: {
    height: 1,
    backgroundColor: colors.border.light,
    marginHorizontal: -spacing.md,
  },
  saveButton: {
    marginTop: spacing.md,
    backgroundColor: colors.primary,
    borderRadius: borderRadius.md,
    padding: spacing.md,
    alignItems: 'center',
  },
  saveButtonText: {
    color: colors.secondary,
    fontWeight: typography.fontWeight.bold,
    fontSize: typography.fontSize.base,
  },
  savedConfirmation: {
    marginTop: spacing.md,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing.md,
    backgroundColor: colors.success + '1A',
    borderRadius: borderRadius.md,
  },
  savedConfirmationText: {
    color: colors.success,
    fontWeight: typography.fontWeight.medium,
    marginLeft: spacing.sm,
  },
}); 