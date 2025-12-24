import React, { useState } from 'react';
import { View, Text, StyleSheet, FlatList, TouchableOpacity, RefreshControl, ActivityIndicator } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { HugeiconsIcon as Icon } from '@hugeicons/react-native';
import { PlusSignIcon } from '@hugeicons/core-free-icons';
import { useRoutines } from '../../contexts/RoutineContext';
import { RoutineCard } from '../../components/routines/RoutineCard';
import { colors } from '../../themes/colors';
import { useNavigation } from '@react-navigation/native';
import { RoutineQuickAdd } from '../../components/routines/RoutineQuickAdd';

export default function RoutinesScreen() {
    const { routines, isLoading, isRefreshing, error, refreshRoutines, logCompletion, undoCompletion } = useRoutines();
    const insets = useSafeAreaInsets();
    const navigation = useNavigation<any>();
    const [showQuickAdd, setShowQuickAdd] = useState(false);

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

    const activeRoutines = routines.filter(r => r.is_active);
    // Sort: Incomplete first, then by time window (morning > afternoon > evening > anytime)
    const sortedRoutines = [...activeRoutines].sort((a, b) => {
        const aComplete = a.period_status?.is_complete ? 1 : 0;
        const bComplete = b.period_status?.is_complete ? 1 : 0;
        if (aComplete !== bComplete) return aComplete - bComplete;

        const windowOrder = { morning: 0, afternoon: 1, evening: 2, anytime: 3 };
        return (windowOrder[a.time_window] || 3) - (windowOrder[b.time_window] || 3);
    });

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
                <TouchableOpacity style={styles.retryButton} onPress={refreshRoutines}>
                    <Text style={styles.retryText}>Retry</Text>
                </TouchableOpacity>
            </View>
        );
    }

    return (
        <View style={[styles.container, { paddingTop: insets.top }]}>
            <View style={styles.header}>
                <View>
                    <Text style={styles.headerTitle}>Build better habits</Text>
                    {/*<Text style={styles.headerSubtitle}>Build better habits</Text>*/}
                </View>
                <TouchableOpacity
                    style={styles.headerButton}
                    onPress={() => setShowQuickAdd(true)}
                >
                    <Icon icon={PlusSignIcon} size={28} color={colors.primary} />
                </TouchableOpacity>
            </View>

            <FlatList
                data={sortedRoutines}
                keyExtractor={item => item.id}
                renderItem={({ item }) => (
                    <RoutineCard
                        routine={item}
                        onPress={() => handleComplete(item)}
                        onLongPress={() => navigation.navigate('RoutineDetail', { routineId: item.id })}
                    />
                )}
                contentContainerStyle={styles.listContent}
                refreshControl={
                    <RefreshControl refreshing={isRefreshing} onRefresh={refreshRoutines} />
                }
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
    header: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        paddingHorizontal: 20,
        paddingBottom: 16,
        borderBottomWidth: 1,
        borderBottomColor: colors.border.light,
    },
    headerTitle: {
        fontSize: 28,
        fontWeight: 'bold',
        color: colors.text.primary,
    },
    headerSubtitle: {
        fontSize: 14,
        color: colors.text.secondary,
        marginTop: 4,
    },
    headerButton: {
        padding: 8,
        backgroundColor: colors.background.secondary,
        borderRadius: 12,
    },
    listContent: {
        padding: 16,
        paddingBottom: 20,
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
