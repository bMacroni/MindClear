import React from 'react';
import { View, Text, StyleSheet, ViewStyle, TextStyle } from 'react-native';
import { RepeatIcon } from '@hugeicons/react-native';
import { colors } from '../../themes/colors';
import { spacing, borderRadius } from '../../themes/spacing';
import { typography } from '../../themes/typography';

export interface RecurringTagProps {
    label: string;
    isPaused?: boolean;
    style?: ViewStyle;
}

/**
 * A standard recurring task tag that follows the MindClear design system.
 * Uses a soft info-blue theme with a repeat icon.
 */
export const RecurringTag: React.FC<RecurringTagProps> = ({
    label,
    isPaused = false,
    style,
}) => {
    return (
        <View
            style={[
                styles.container,
                isPaused && styles.pausedContainer,
                style,
            ]}
            accessible={true}
            accessibilityRole="text"
            accessibilityLabel={isPaused ? `${label}, paused` : `${label}, recurring`}
            accessibilityState={{ disabled: isPaused }}
        >
            <Icon
                icon={RepeatIcon}
                size={12}
                color={isPaused ? colors.text.disabled : colors.info}
            />
            <Text
                style={[
                    styles.text,
                    isPaused && styles.pausedText,
                ]}
                numberOfLines={1}
            >
                {label}
            </Text>
        </View>);
};

const styles = StyleSheet.create({
    container: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 4,
        paddingHorizontal: spacing.sm,
        paddingVertical: 4,
        borderRadius: borderRadius.full,
        borderWidth: 1,
        borderColor: colors.info,
        backgroundColor: colors.rgba(colors.info, 0.1),
    },
    pausedContainer: {
        borderColor: colors.border.medium,
        backgroundColor: colors.background.secondary,
    },
    text: {
        fontSize: typography.fontSize.xs,
        color: colors.info,
        fontWeight: typography.fontWeight.medium as any,
    },
    pausedText: {
        color: colors.text.disabled,
    },
});
