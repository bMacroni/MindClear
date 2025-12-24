import React, { useMemo } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Animated } from 'react-native';
import { Tick02Icon } from '@hugeicons/core-free-icons';
import { HugeiconsIcon as Icon } from '@hugeicons/react-native';
import { Routine } from '../../services/routineService';
import { colors } from '../../themes/colors';

interface RoutineCardProps {
    routine: Routine;
    onPress: () => void;
    onLongPress: () => void;
}

export const RoutineCard: React.FC<RoutineCardProps> = ({ routine, onPress, onLongPress }) => {
    const isComplete = routine.period_status?.is_complete;
    const progress = routine.period_status?.completions_count || 0;
    const target = routine.target_count;

    // Visual states
    const opacity = isComplete ? 0.7 : 1;
    const backgroundColor = isComplete ? colors.background.secondary : colors.background.surface;
    const borderColor = isComplete ? colors.border.medium : 'transparent';

    const streakText = useMemo(() => {
        if (routine.current_streak === 0) return "Start today!";
        const unit = routine.frequency_type === 'daily' ? 'days' :
            routine.frequency_type === 'weekly' ? 'weeks' : 'months';
        return `${routine.current_streak} ${unit}`;
    }, [routine.current_streak, routine.frequency_type]);

    return (
        <TouchableOpacity
            style={[styles.container, { backgroundColor, borderColor, opacity }]}
            onPress={onPress}
            onLongPress={onLongPress}
            activeOpacity={0.8}
        >
            <View style={styles.iconContainer}>
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
                    <Icon icon={Tick02Icon} size={28} color={colors.primary} />
                ) : (
                    <Text style={styles.progress}>{progress}/{target}</Text>
                )}
            </View>
        </TouchableOpacity>
    );
};

const styles = StyleSheet.create({
    container: {
        flexDirection: 'row',
        alignItems: 'center',
        padding: 16,
        borderRadius: 12,
        marginBottom: 12,
        borderWidth: 1,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.05,
        shadowRadius: 4,
        elevation: 2,
    },
    iconContainer: {
        width: 40,
        height: 40,
        borderRadius: 20,
        backgroundColor: 'rgba(0,0,0,0.05)',
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
        color: colors.text.primary,
        marginBottom: 4,
    },
    completedText: {
        textDecorationLine: 'line-through',
        color: colors.text.secondary,
    },
    streak: {
        fontSize: 13,
        color: colors.text.secondary,
    },
    statusContainer: {
        justifyContent: 'center',
        alignItems: 'center',
        minWidth: 40,
    },
    progress: {
        fontSize: 14,
        fontWeight: 'bold',
        color: colors.text.disabled,
    }
});
