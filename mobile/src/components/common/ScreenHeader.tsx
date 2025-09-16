import React from 'react';
import { View, Text, StyleSheet, ViewStyle } from 'react-native';
import { colors } from '../../themes/colors';
import { spacing, borderRadius } from '../../themes/spacing';
import { typography } from '../../themes/typography';

type ScreenHeaderProps = {
  title: string;
  leftAction?: React.ReactNode;
  rightActions?: React.ReactNode;
  containerStyle?: ViewStyle;
  withDivider?: boolean;
};

export const ScreenHeader: React.FC<ScreenHeaderProps> = ({
  title,
  leftAction,
  rightActions,
  containerStyle,
  withDivider = false,
}) => {
  return (
    <View style={[styles.container, withDivider && styles.withDivider, containerStyle]}>
      <View style={styles.leftGroup}>
        {!!leftAction && <View style={styles.action}>{leftAction}</View>}
        <Text style={styles.title}>{title}</Text>
      </View>
      {!!rightActions && <View style={styles.rightGroup}>{rightActions}</View>}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    backgroundColor: colors.secondary,
  },
  withDivider: {
    borderBottomWidth: 1,
    borderBottomColor: colors.border.light,
  },
  leftGroup: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  rightGroup: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  action: {
    marginRight: spacing.sm,
    borderRadius: borderRadius.sm,
  },
  title: {
    fontSize: typography.fontSize.xl,
    fontWeight: typography.fontWeight.bold as any,
    color: colors.text.primary,
  },
});

export default ScreenHeader;


