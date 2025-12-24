import React, { useState, useLayoutEffect } from 'react';
import { View, Text, StyleSheet, SectionList, TouchableOpacity, RefreshControl, ActivityIndicator, Alert } from 'react-native';
import { format } from 'date-fns';
import { HugeiconsIcon as Icon } from '@hugeicons/react-native';
import { PlusSignIcon } from '@hugeicons/react-native'; import { useRoutines } from '../../contexts/RoutineContext';
import { RoutineCard } from '../../components/routines/RoutineCard';
import { colors } from '../../themes/colors';
import { useNavigation } from '@react-navigation/native';
import { RoutineQuickAdd } from '../../components/routines/RoutineQuickAdd';

export default function RoutinesScreen() {
    const { routines, isLoading, isRefreshing, error, refreshRoutines, logCompletion, undoCompletion, resetCompletions } = useRoutines();
    const navigation = useNavigation<any>();
    const [showQuickAdd, setShowQuickAdd] = useState(false);

    React.useLayoutEffect(() => {
        navigation.setOptions({
            headerRight: () => (
                <TouchableOpacity
                    style={styles.headerIconButton}
                    onPress={() => setShowQuickAdd(true)}
                    accessibilityRole="button"
                    accessibilityLabel="Add new routine"
                    accessibilityHint="Opens the quick add routine dialog"
                >
                    <Icon icon={PlusSignIcon} size={20} color={colors.text.secondary} />
                </TouchableOpacity>
            ),
        });
    }, [navigation]);

    const handleComplete = async (routine: any) => {
        const isComplete = routine.period_status?.is_complete;
        try {
            if (isComplete) {
                await undoCompletion(routine.id);
            } else {
                await logCompletion(routine.id);
            }
        } catch (error) {
            // Error handled in context
        }
    };

    const handleReset = (routine: any) => {
        if (!routine.period_status || routine.period_status.completions_count === 0) return;

        Alert.alert(
            "Reset Progress",
            `Are you sure you want to reset all progress for "${routine.title}" for this period?`,
            [
                { text: "Cancel", style: "cancel" },
                {
                    text: "Reset",
                    style: "destructive",
                    onPress: () => resetCompletions(routine.id)
                }
            ]
        );
    };

    const activeRoutines = routines.filter(r => r.is_active);

    // Sort logic within each group: Incomplete first, then by time window
    const sortRoutines = (list: any[]) => [...list].sort((a, b) => {
        const aComplete = a.period_status?.is_complete ? 1 : 0;
        const bComplete = b.period_status?.is_complete ? 1 : 0;
        if (aComplete !== bComplete) return aComplete - bComplete;

        const windowOrder = { morning: 0, afternoon: 1, evening: 2, anytime: 3 };
        return (windowOrder[a.time_window as keyof typeof windowOrder] || 3) - (windowOrder[b.time_window as keyof typeof windowOrder] || 3);
    });

    const sections = [
        { title: 'Daily', data: sortRoutines(activeRoutines.filter(r => r.frequency_type === 'daily')) },
        { title: 'Weekly', data: sortRoutines(activeRoutines.filter(r => r.frequency_type === 'weekly')) },
        { title: 'Monthly', data: sortRoutines(activeRoutines.filter(r => r.frequency_type === 'monthly')) },
    ].filter(section => section.data.length > 0);

    if (isLoading && routines.length === 0) {
        return (
            <View style={[styles.container, styles.center]}>
                <ActivityIndicator size="large" color={colors.primary} />
            </View>
        );
    }

    if (error && routines.length === 0) {
        return (
            <View style={[styles.container, styles.center, { padding: 20 }]}>
                <Text style={styles.errorText}>{error}</Text>
                <TouchableOpacity
                    style={styles.retryButton}
                    onPress={refreshRoutines}
                    accessibilityRole="button"
                    accessibilityLabel="Retry loading routines"
                >
                    <Text style={styles.retryText}>Retry</Text>
                </TouchableOpacity>
            </View>
        );
    }
    const todayDate = format(new Date(), 'MMM dd').toUpperCase();

    return (
        <View style={styles.container}>
            <SectionList
                sections={sections}
                keyExtractor={item => item.id}
                ListHeaderComponent={
                    <View style={styles.listHeader}>
                        <Text style={styles.dateText}>{todayDate}</Text>
                        <Text style={styles.headerTitle}>Build better habits</Text>
                    </View>
                }
                renderItem={({ item }) => (
                    <RoutineCard
                        routine={item}
                        onPress={() => handleComplete(item)}
                        onLongPress={() => navigation.navigate('RoutineDetail', { routineId: item.id })}
                        onReset={() => handleReset(item)}
                    />
                )}
                renderSectionHeader={({ section: { title } }) => (
                    <View style={styles.sectionHeader}>
                        <Text style={styles.sectionTitle}>{title}</Text>
                    </View>
                )}
                contentContainerStyle={styles.listContent}
                refreshControl={
                    <RefreshControl refreshing={isRefreshing} onRefresh={refreshRoutines} />
                }
                stickySectionHeadersEnabled={false}
                ListEmptyComponent={
                    <View style={styles.emptyState}>
                        <Text style={styles.emptyText}>No routines yet. Start small!</Text>
                        <Text style={styles.emptySubtext}>Tap the + button to create your first routine.</Text>
                    </View>
                }
            />

            <RoutineQuickAdd visible={showQuickAdd} onClose={() => setShowQuickAdd(false)} />
        </View>
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: colors.background.primary,
    },
    center: {
        justifyContent: 'center',
        alignItems: 'center',
    },
    headerIconButton: {
        padding: 12,
        borderWidth: 1,
        borderColor: colors.border.light,
        borderRadius: 6,
        backgroundColor: colors.background.surface,
    }, listContent: {
        padding: 16,
        paddingBottom: 20,
    },
    listHeader: {
        marginBottom: 24,
        marginTop: 8,
    },
    dateText: {
        fontSize: 14,
        fontWeight: 'bold',
        color: colors.primary,
        letterSpacing: 1.5,
        marginBottom: 4,
    },
    headerTitle: {
        fontSize: 32,
        fontWeight: '800',
        color: colors.text.primary,
    },
    sectionHeader: {
        backgroundColor: colors.background.primary,
        paddingVertical: 12,
        paddingHorizontal: 4,
        marginTop: 8,
    },
    sectionTitle: {
        fontSize: 18,
        fontWeight: 'bold',
        color: colors.text.primary,
        textTransform: 'uppercase',
        letterSpacing: 1,
    },
    emptyState: {
        padding: 24,
        alignItems: 'center',
        marginTop: 40,
    },
    emptyText: {
        fontSize: 18,
        fontWeight: '600',
        color: colors.text.secondary,
        marginBottom: 8,
    },
    emptySubtext: {
        fontSize: 14,
        color: colors.text.disabled,
        textAlign: 'center',
    },
    errorText: {
        fontSize: 16,
        color: colors.error,
        textAlign: 'center',
        marginBottom: 16,
    },
    retryButton: {
        paddingHorizontal: 24,
        paddingVertical: 12,
        backgroundColor: colors.primary,
        borderRadius: 12,
    },
    retryText: {
        color: '#FFFFFF',
        fontWeight: '600',
        fontSize: 16,
    }
});
