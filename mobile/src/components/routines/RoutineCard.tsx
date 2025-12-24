import React, { useMemo } from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { HugeiconsIcon as Icon } from '@hugeicons/react-native';
import { CheckmarkCircle01Icon } from '@hugeicons/core-free-icons';
import { Routine } from '../../services/routineService';
import { colors as themeColors, useTheme } from '../../themes/colors';

interface RoutineCardProps {
    routine: Routine;
    onPress: () => void;
    onLongPress: () => void;
}

export const RoutineCard: React.FC<RoutineCardProps> = ({ routine, onPress, onLongPress }) => {
    const theme = useTheme();
    const isComplete = routine.period_status?.is_complete;
    const progress = routine.period_status?.completions_count || 0;
    const target = routine.target_count;

    // Visual states
    const opacity = isComplete ? 0.7 : 1;
    const backgroundColor = isComplete ? theme.background.secondary : theme.background.surface;
    const borderColor = isComplete ? theme.border.medium : 'transparent';

    const streakText = useMemo(() => {
        if (routine.current_streak === 0) return "Start today!";
        const unit = routine.frequency_type === 'daily' ? 'days' :
            routine.frequency_type === 'weekly' ? 'weeks' : 'months';
        return `${routine.current_streak} ${unit}`;
    }, [routine.current_streak, routine.frequency_type]);

    const styles = useMemo(() => getStyles(theme), [theme]);

    return (
        <TouchableOpacity
            style={[styles.container, { backgroundColor, borderColor, opacity }]}
            onPress={onPress}
            onLongPress={onLongPress}
            activeOpacity={0.8}
            accessibilityRole="button"
            accessibilityLabel={`${routine.title}. ${streakText}. ${isComplete ? 'Completed' : `Progress: ${progress} of ${target}`}`}
            accessibilityState={{ disabled: false, checked: isComplete }}
            accessibilityHint="Tap to view details, long press for options"
        >
            <View style={[styles.iconContainer, { backgroundColor: theme.rgba(theme.text.primary, 0.05) }]}>
                <Text style={styles.icon}>{routine.icon}</Text>
            </View>

            <View style={styles.contentContainer}>
                <Text style={[styles.title, isComplete && styles.completedText]}>{routine.title}</Text>
                <Text style={styles.streak}>
                    {routine.current_streak > 0 ? '🔥 ' : '🌱 '}{streakText}
                </Text>
            </View>

            <View style={styles.statusContainer}>
                {isComplete ? (
                    <Icon icon={CheckmarkCircle01Icon} size={24} color={theme.primary} />
                ) : (
                    <Text style={styles.progress}>{progress}/{target}</Text>
                )}
            </View>
        </TouchableOpacity>);
};

const getStyles = (theme: typeof themeColors) => StyleSheet.create({
    container: {
        flexDirection: 'row',
        alignItems: 'center',
        padding: 16,
        borderRadius: 12,
        marginBottom: 12,
        borderWidth: 1,
        shadowColor: theme.shadow,
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.05,
        shadowRadius: 4,
        elevation: 2,
    },
    iconContainer: {
        width: 40,
        height: 40,
        borderRadius: 20,
        justifyContent: 'center',
        alignItems: 'center',
        marginRight: 12,
    },
    icon: {
        fontSize: 20,
    },
    contentContainer: {
        flex: 1,
    },
    title: {
        fontSize: 16,
        fontWeight: '600',
        color: theme.text.primary,
        marginBottom: 4,
    },
    completedText: {
        textDecorationLine: 'line-through',
        color: theme.text.secondary,
    },
    streak: {
        fontSize: 13,
        color: theme.text.secondary,
    },
    statusContainer: {
        justifyContent: 'center',
        alignItems: 'center',
        minWidth: 40,
    },
    progress: {
        fontSize: 14,
        fontWeight: 'bold',
        color: theme.text.disabled,
    }
});
