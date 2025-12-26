import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  StyleSheet,
  Alert,
  ActivityIndicator,
  TouchableOpacity,
} from 'react-native';
import { colors } from '../../themes/colors';
import { TaskForm } from '../../components/tasks/TaskForm';
import { taskRepository } from '../../repositories/TaskRepository';
import { goalRepository } from '../../repositories/GoalRepository';
import { syncService } from '../../services/SyncService';
import { authService } from '../../services/auth';
import { HugeiconsIcon as Icon } from '@hugeicons/react-native';
import { Cancel01Icon, Tick01Icon } from '@hugeicons/core-free-icons';
import { SafeAreaView } from 'react-native-safe-area-context';
import Task, { RecurrencePattern } from '../../db/models/Task';

// TaskForm expects snake_case properties, different from the database Task model
interface TaskFormData {
  id?: string;
  title: string;
  description?: string;
  priority: 'low' | 'medium' | 'high';
  status: 'not_started' | 'in_progress' | 'completed';
  due_date?: string;
  category?: string;
  goal_id?: string;
  estimated_duration_minutes?: number;
  recurrence_pattern?: RecurrencePattern | null;
}

// Convert database Task model to TaskFormData
function taskToFormData(task: Task): TaskFormData {
  // Validate and normalize status with safe fallback
  const allowedStatuses = ['not_started', 'in_progress', 'completed'];
  const normalizedStatus =
    task.status && allowedStatuses.includes(task.status)
      ? (task.status as 'not_started' | 'in_progress' | 'completed')
      : 'not_started';

  return {
    id: task.id,
    title: task.title,
    description: task.description,
    priority: (task.priority as 'low' | 'medium' | 'high') || 'medium',
    status: normalizedStatus,
    due_date: task.dueDate?.toISOString(),
    category: task.category,
    goal_id: task.goalId,
    estimated_duration_minutes: task.estimatedDurationMinutes,
    recurrence_pattern: task.recurrence_pattern,
  };
}

interface Goal {
  id: string;
  title: string;
}

interface TaskFormScreenProps {
  route: {
    params?: {
      taskId?: string;
    };
  };
  navigation: any;
}

const TaskFormScreen: React.FC<TaskFormScreenProps> = ({
  route,
  navigation,
}) => {
  const { taskId } = route.params || {};
  const [task, setTask] = useState<TaskFormData | undefined>();
  const [goals, setGoals] = useState<Goal[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saveSignal, setSaveSignal] = useState(0);

  const loadData = useCallback(async () => {
    try {
      setLoading(true);
      const [goalsData, taskData] = await Promise.all([
        goalRepository.getAllGoals(),
        taskId ? taskRepository.getTaskById(taskId) : Promise.resolve(undefined),
      ]);
      setGoals(goalsData);
      setTask(taskData ? taskToFormData(taskData) : undefined);
    } catch (error) {
      console.error('Error loading data:', error);
      Alert.alert('Error', 'Failed to load data');
    } finally {
      setLoading(false);
    }
  }, [taskId]);

  useEffect(() => {
    loadData();
  }, [taskId, loadData]);

  React.useLayoutEffect(() => {
    navigation.setOptions({
      title: taskId ? 'Edit Task' : 'New Task',
      headerLeft: () => (
        <TouchableOpacity style={styles.headerIconBtn} onPress={handleCancel}>
          <Icon icon={Cancel01Icon} size={24} color={colors.text.primary} />
        </TouchableOpacity>
      ),
      headerRight: () => (
        <TouchableOpacity style={styles.headerIconBtn} onPress={() => setSaveSignal((s) => s + 1)}>
          <Icon icon={Tick01Icon} size={24} color={colors.text.primary} />
        </TouchableOpacity>
      ),
    });
  }, [navigation, taskId]);

  const handleSave = async (taskData: Partial<TaskFormData>) => {
    try {
      setSaving(true);

      if (taskId) {
        // Update existing task - validate and normalize data before calling repository

        // Validate title if present (should not be empty)
        if (taskData.title !== undefined && taskData.title.trim() === '') {
          Alert.alert('Validation Error', 'Task title cannot be empty');
          return;
        }

        // Normalize due_date to Date, with validation
        let normalizedDueDate: Date | undefined = undefined;
        if (taskData.due_date !== undefined) {
          if (taskData.due_date && taskData.due_date.trim() !== '') {
            normalizedDueDate = new Date(taskData.due_date);
            // Validate the Date object
            if (isNaN(normalizedDueDate.getTime())) {
              Alert.alert('Validation Error', 'Invalid due date format');
              return;
            }
          }
          // If due_date is empty string, normalizedDueDate stays undefined (clears the date)
        }

        // Build update payload - only include fields that are defined in taskData
        const updatePayload: {
          title?: string;
          description?: string;
          priority?: 'low' | 'medium' | 'high';
          status?: 'not_started' | 'in_progress' | 'completed';
          dueDate?: Date;
          goalId?: string;
          estimatedDurationMinutes?: number;
          recurrencePattern?: RecurrencePattern | null;
        } = {};

        if (taskData.title !== undefined) updatePayload.title = taskData.title.trim();
        if (taskData.description !== undefined) updatePayload.description = taskData.description;
        if (taskData.priority !== undefined) updatePayload.priority = taskData.priority;
        if (taskData.status !== undefined) updatePayload.status = taskData.status;
        if (taskData.due_date !== undefined) updatePayload.dueDate = normalizedDueDate;
        if (taskData.goal_id !== undefined) updatePayload.goalId = taskData.goal_id;
        if (taskData.estimated_duration_minutes !== undefined) {
          updatePayload.estimatedDurationMinutes = taskData.estimated_duration_minutes;
        }
        if (taskData.recurrence_pattern !== undefined) {
          updatePayload.recurrencePattern = taskData.recurrence_pattern;
        }

        await taskRepository.updateTask(taskId, updatePayload);
      } else {
        // Create new task - validate and normalize data before calling repository

        // Validate required fields
        if (!taskData.title || taskData.title.trim() === '') {
          Alert.alert('Validation Error', 'Task title is required');
          return;
        }

        // Normalize optional fields with proper defaults
        const normalizedPriority: 'low' | 'medium' | 'high' =
          taskData.priority || 'medium';

        const normalizedStatus: 'not_started' | 'in_progress' | 'completed' =
          taskData.status || 'not_started';

        // Only convert due_date to Date when present and non-empty
        let normalizedDueDate: Date | undefined = undefined;
        if (taskData.due_date && taskData.due_date.trim() !== '') {
          normalizedDueDate = new Date(taskData.due_date);
          // Validate the Date object
          if (isNaN(normalizedDueDate.getTime())) {
            Alert.alert('Validation Error', 'Invalid due date format');
            return;
          }
        }

        // Create task with validated and normalized data
        await taskRepository.createTask({
          title: taskData.title.trim(),
          description: taskData.description,
          priority: normalizedPriority,
          status: normalizedStatus,
          dueDate: normalizedDueDate,
          goalId: taskData.goal_id,
          estimatedDurationMinutes: taskData.estimated_duration_minutes,
          recurrencePattern: taskData.recurrence_pattern,
        });
      }

      // Trigger background sync
      syncService.silentSync();

      navigation.goBack();
    } catch (error) {
      console.error('Error saving task:', error);
      Alert.alert('Error', 'Failed to save task');
    } finally {
      setSaving(false);
    }
  };

  const handleCancel = () => {
    navigation.goBack();
  };

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  }

  return (
    <SafeAreaView edges={['left', 'right']} style={styles.container}>

      <TaskForm
        task={task}
        goals={goals}
        onSave={handleSave}
        onCancel={handleCancel}
        loading={saving}
        saveSignal={saveSignal}
      />
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background.primary,
  },
  headerSafeArea: {
    backgroundColor: colors.background.primary,
  },
  headerBar: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 10,
    backgroundColor: colors.background.primary,
    borderBottomWidth: 1,
    borderBottomColor: colors.border.light,
    shadowColor: colors.primary,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.06,
    shadowRadius: 6,
    elevation: 4,
    zIndex: 2,
  },
  headerIconBtn: {
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 8,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: colors.background.primary,
  },
});

export default TaskFormScreen;
