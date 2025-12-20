import React from 'react';
import { View, TouchableOpacity, Text, StyleSheet } from 'react-native';
import { HugeiconsIcon as Icon } from '@hugeicons/react-native';
import { Target01Icon, CheckmarkCircle01Icon, Calendar01Icon, HelpCircleIcon } from '@hugeicons/core-free-icons';
import { colors } from '../../themes/colors';
import { typography } from '../../themes/typography';
import { spacing, borderRadius } from '../../themes/spacing';
import { QuickAction } from '../../types/onboarding';

interface QuickActionsProps {
  actions: QuickAction[];
  onActionPress: (_action: QuickAction) => void;
  visible: boolean;
}

const getIcon = (name: string) => {
  switch (name) {
    case 'milestone':
      return Target01Icon;
    case 'check-circle':
      return CheckmarkCircle01Icon;
    case 'calendar':
      return Calendar01Icon;
    default:
      return HelpCircleIcon;
  }
};

export default function QuickActions({ actions, onActionPress, visible }: QuickActionsProps) {
  if (!visible) { return null; }

  return (
    <View style={styles.container}>
      {actions.map((action) => (
        <TouchableOpacity
          key={action.id}
          style={styles.actionButton}
          onPress={() => onActionPress(action)}
          activeOpacity={0.7}
        >
          <Icon icon={getIcon(action.icon)} size={20} color={colors.primary} />
          <Text style={styles.actionText}>{action.label}</Text>
        </TouchableOpacity>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.sm,
    marginTop: spacing.sm,
  },
  actionButton: {
    flexDirection: 'column',
    alignItems: 'center',
    paddingHorizontal: spacing.xs,
    paddingVertical: spacing.sm,
    borderRadius: borderRadius.sm,
    backgroundColor: colors.background.primary,
    minWidth: 70,
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: 1,
    },
    shadowOpacity: 0.1,
    shadowRadius: 2,
    elevation: 2,
  },
  actionText: {
    marginTop: spacing.xs,
    color: colors.text.primary,
    textAlign: 'center',
    fontSize: typography.fontSize.xs,
    fontWeight: typography.fontWeight.medium as any,
  },
});
