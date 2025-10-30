import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Alert,
  ActivityIndicator,
} from 'react-native';
import { colors } from '../../themes/colors';
import { spacing, borderRadius } from '../../themes/spacing';
import { typography } from '../../themes/typography';
import { Button } from '../../components/common/Button';
import { taskRepository } from '../../repositories/TaskRepository';
import { syncService } from '../../services/SyncService';
import withObservables from '@nozbe/watermelondb/react/withObservables';
import { useDatabase } from '../../contexts/DatabaseContext';
import Task from '../../db/models/Task';

interface TaskDetailScreenProps {
  route: {
    params: {
      taskId: string;
    };
  };
  navigation: any;
  task: Task;
  database: any;
}

const TaskDetailScreen: React.FC<TaskDetailScreenProps> = ({
  route,
  navigation,
  task,
}) => {
  const { taskId } = route.params;
  const [updating, setUpdating] = useState(false);

  if (!task) {
    return (
      <View style={styles.container}>
        <ActivityIndicator size="large" color={colors.primary} />
        <Text style={styles.loadingText}>Loading task...</Text>
      </View>
    );
  }

  const handleToggleStatus = async () => {
    if (!task) {return;}

    try {
      setUpdating(true);
      const newStatus = task.status === 'completed' ? 'not_started' : 'completed';
      await taskRepository.updateTask(taskId, { status: newStatus });
      // Trigger silent sync to push changes to server
      try {
        await syncService.silentSync();
      } catch (error) {
        // Silent sync failure - don't show alerts to user
        console.warn('Silent sync failed:', error);
      }
    } catch (error) {
      console.error('Error updating task status:', error);
      Alert.alert('Error', 'Failed to update task status');
    } finally {
      setUpdating(false);
    }
  };

  const handleDelete = () => {
    Alert.alert(
      'Delete Task',
      'Are you sure you want to delete this task?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            try {
              await taskRepository.deleteTask(taskId);
              // Trigger silent sync to push changes to server
              try {
                await syncService.silentSync();
              } catch (error) {
                // Silent sync failure - don't show alerts to user
                console.warn('Silent sync failed:', error);
              }              navigation.goBack();
            } catch (error) {
              console.error('Error deleting task:', error);
              Alert.alert('Error', 'Failed to delete task');
            }
          },
        },
      ]
    );
  };

  const handleEdit = () => {
    navigation.navigate('TaskForm', { taskId });
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

  const getStatusText = (status: string) => {
    switch (status) {
      case 'completed':
        return 'Completed';
      case 'in_progress':
        return 'In Progress';
      default:
        return 'Not Started';
    }
  };

  const getPriorityText = (priority: string) => {
    return priority.charAt(0).toUpperCase() + priority.slice(1);
  };

  const formatDueDate = (dueDate?: string) => {
    if (!dueDate) {return 'No due date';}
    const date = new Date(dueDate);
    return date.toLocaleDateString();
  };

  const formatDuration = (minutes?: number) => {
    if (!minutes) {return 'Not specified';}
    const hours = Math.floor(minutes / 60);
    const mins = minutes % 60;
    if (hours > 0) {
      return `${hours}h ${mins}m`;
    }
    return `${mins}m`;
  };

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color={colors.primary} />
        <Text style={styles.loadingText}>Loading task...</Text>
      </View>
    );
  }

  if (!task) {
    return (
      <View style={styles.errorContainer}>
        <Text style={styles.errorText}>Task not found</Text>
      </View>
    );
  }

  return (
    <ScrollView style={styles.container} showsVerticalScrollIndicator={false}>
      <View style={styles.content}>
        {/* Header */}
        <View style={styles.header}>
          <Text style={styles.title}>{task.title}</Text>
          <View style={styles.badges}>
            <View
              style={[
                styles.statusBadge,
                { backgroundColor: getStatusColor(task.status) },
              ]}
            >
              <Text style={styles.badgeText}>
                {getStatusText(task.status)}
              </Text>
            </View>
            <View
              style={[
                styles.priorityBadge,
                { backgroundColor: getPriorityColor(task.priority) },
              ]}
            >
              <Text style={styles.badgeText}>
                {getPriorityText(task.priority)}
              </Text>
            </View>
          </View>
        </View>

        {/* Description */}
        {task.description && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Description</Text>
            <Text style={styles.description}>{task.description}</Text>
          </View>
        )}

        {/* Details */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Details</Text>
          <View style={styles.detailRow}>
            <Text style={styles.detailLabel}>Due Date:</Text>
            <Text style={styles.detailValue}>{formatDueDate(task.dueDate?.toISOString())}</Text>
          </View>
          {task.category && (
            <View style={styles.detailRow}>
              <Text style={styles.detailLabel}>Category:</Text>
              <Text style={styles.detailValue}>{task.category}</Text>
            </View>
          )}
          <View style={styles.detailRow}>
            <Text style={styles.detailLabel}>Duration:</Text>
            <Text style={styles.detailValue}>{formatDuration(task.estimatedDurationMinutes)}</Text>
          </View>
          {task.goal && (
            <View style={styles.detailRow}>
              <Text style={styles.detailLabel}>Linked Goal:</Text>
              <Text style={styles.detailValue}>{task.goal.title}</Text>
            </View>
          )}
        </View>

        {/* Actions */}
        <View style={styles.actions}>
          <Button
            title={task.status === 'completed' ? 'Mark Incomplete' : 'Mark Complete'}
            onPress={handleToggleStatus}
            loading={updating}
            variant={task.status === 'completed' ? 'outline' : 'primary'}
            style={styles.actionButton}
          />
          <Button
            title="Edit Task"
            onPress={handleEdit}
            variant="outline"
            style={styles.actionButton}
          />
          <Button
            title="Delete Task"
            onPress={handleDelete}
            variant="secondary"
            style={styles.actionButton}
          />
        </View>
      </View>
    </ScrollView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background.primary,
  },
  content: {
    padding: spacing.md,
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
  errorContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: colors.background.primary,
  },
  errorText: {
    fontSize: typography.fontSize.lg,
    color: colors.text.secondary,
  },
  header: {
    marginBottom: spacing.lg,
  },
  title: {
    fontSize: typography.fontSize['2xl'],
    fontWeight: typography.fontWeight.bold as any,
    color: colors.text.primary,
    marginBottom: spacing.md,
  },
  badges: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  statusBadge: {
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
    borderRadius: borderRadius.full,
  },
  priorityBadge: {
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
    borderRadius: borderRadius.full,
  },
  badgeText: {
    color: colors.secondary,
    fontSize: typography.fontSize.sm,
    fontWeight: typography.fontWeight.medium as any,
  },
  section: {
    marginBottom: spacing.lg,
  },
  sectionTitle: {
    fontSize: typography.fontSize.lg,
    fontWeight: typography.fontWeight.semibold as any,
    color: colors.text.primary,
    marginBottom: spacing.sm,
  },
  description: {
    fontSize: typography.fontSize.base,
    color: colors.text.secondary,
    lineHeight: typography.lineHeight.normal * typography.fontSize.base,
  },
  detailRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: spacing.xs,
    borderBottomWidth: 1,
    borderBottomColor: colors.border.light,
  },
  detailLabel: {
    fontSize: typography.fontSize.sm,
    color: colors.text.secondary,
    fontWeight: typography.fontWeight.medium as any,
  },
  detailValue: {
    fontSize: typography.fontSize.sm,
    color: colors.text.primary,
    fontWeight: typography.fontWeight.medium as any,
  },
  actions: {
    marginTop: spacing.xl,
    gap: spacing.sm,
  },
  actionButton: {
    marginBottom: 0,
  },
});

// Create the enhanced component with WatermelonDB observables
const enhance = withObservables(['route'], ({route, database}) => ({
  task: database.collections.get('tasks').findAndObserve(route.params.taskId),
}));

const EnhancedTaskDetailScreen = enhance(TaskDetailScreen);

const TaskDetailScreenWithDatabase = (props: any) => {
  const database = useDatabase();
  return <EnhancedTaskDetailScreen {...props} database={database} />;
};

export default TaskDetailScreenWithDatabase;