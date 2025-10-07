import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
} from 'react-native';
import { colors } from '../../themes/colors';
import { spacing, borderRadius } from '../../themes/spacing';
import { typography } from '../../themes/typography';
import Icon from 'react-native-vector-icons/Octicons';

interface Task {
  id: string;
  title: string;
  description?: string;
  priority: 'low' | 'medium' | 'high';
  status: 'not_started' | 'in_progress' | 'completed';
  due_date?: string;
  category?: string;
  goal?: {
    id: string;
    title: string;
  };
}

interface CompletedTaskCardProps {
  task: Task;
  onResetStatus: (taskId: string) => void;
}

export const CompletedTaskCard: React.FC<CompletedTaskCardProps> = React.memo(({
  task,
  onResetStatus,
}) => {
  const handleResetStatus = () => {
    onResetStatus(task.id);
  };

  return (
    <View style={styles.container} testID={`completed-task-${task.id}`}>
      <View style={styles.card}>
        <View style={styles.content}>
          <Text
            style={styles.title}
            testID={`completed-task-${task.id}-title`}
            numberOfLines={2}
          >
            {task.title}
          </Text>
          
          <TouchableOpacity
            style={styles.resetButton}
            onPress={handleResetStatus}
            testID={`completed-task-${task.id}-reset`}
            accessibilityLabel="Mark task as incomplete"
            activeOpacity={0.7}
          >
            <Icon name="iterations" size={16} color={colors.text.secondary} />
          </TouchableOpacity>
        </View>
      </View>
    </View>
  );
});

const styles = StyleSheet.create({
  container: {
    marginBottom: spacing.xs,
  },
  card: {
    backgroundColor: colors.background.surface,
    borderRadius: borderRadius.sm,
    borderWidth: 1,
    borderColor: colors.border.light,
    // Subtle left border to indicate completion
    borderLeftWidth: 3,
    borderLeftColor: colors.success,
  },
  content: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: spacing.sm,
    minHeight: 44, // Ensure minimum touch target
  },
  title: {
    flex: 1,
    fontSize: typography.fontSize.sm,
    fontWeight: typography.fontWeight.medium as any,
    color: colors.text.disabled,
    textDecorationLine: 'line-through',
    marginRight: spacing.sm,
  },
  resetButton: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
    borderRadius: borderRadius.sm,
    backgroundColor: colors.background.primary,
    borderWidth: 1,
    borderColor: colors.border.light,
    minWidth: 32,
    minHeight: 32,
  },
});
