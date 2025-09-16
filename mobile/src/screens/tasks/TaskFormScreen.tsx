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
import { tasksAPI, goalsAPI } from '../../services/api';
import Icon from 'react-native-vector-icons/Octicons';
import { SafeAreaView } from 'react-native-safe-area-context';

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
  const [task, setTask] = useState<Task | undefined>();
  const [goals, setGoals] = useState<Goal[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saveSignal, setSaveSignal] = useState(0);

  const loadData = useCallback(async () => {
    try {
      setLoading(true);
      const [goalsData, taskData] = await Promise.all([
        goalsAPI.getGoals(),
        taskId ? tasksAPI.getTaskById(taskId) : Promise.resolve(undefined),
      ]);
      setGoals(goalsData);
      setTask(taskData);
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

  const handleSave = async (taskData: Partial<Task>) => {
    try {
      setSaving(true);
      if (taskId) {
        // Update existing task
        await tasksAPI.updateTask(taskId, taskData);
      } else {
        // Create new task
        await tasksAPI.createTask(taskData);
      }
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
    <View style={styles.container}>
      <SafeAreaView edges={['top']} style={styles.headerSafeArea}>
        <View style={styles.headerBar}>
          <TouchableOpacity style={styles.headerIconBtn} onPress={handleCancel}>
            <Icon name="x" size={24} color={colors.text.primary} />
          </TouchableOpacity>
          <TouchableOpacity style={styles.headerIconBtn} onPress={() => setSaveSignal((s) => s + 1)}>
            <Icon name="check" size={24} color={colors.text.primary} />
          </TouchableOpacity>
        </View>
      </SafeAreaView>

      <TaskForm
        task={task}
        goals={goals}
        onSave={handleSave}
        onCancel={handleCancel}
        loading={saving}
        saveSignal={saveSignal}
      />
    </View>
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
