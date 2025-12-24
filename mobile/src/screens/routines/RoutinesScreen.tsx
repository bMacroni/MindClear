import React, { useState } from 'react';
import { View, Text, StyleSheet, FlatList, TouchableOpacity, RefreshControl, ActivityIndicator } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Add01Icon } from '@hugeicons/core-free-icons';
import { HugeiconsIcon as Icon } from '@hugeicons/react-native';
import { useRoutines } from '../../contexts/RoutineContext';
import { RoutineCard } from '../../components/routines/RoutineCard';
import { colors } from '../../themes/colors';
import { useNavigation } from '@react-navigation/native';
import { RoutineQuickAdd } from '../../components/routines/RoutineQuickAdd';

export default function RoutinesScreen() {
    const { routines, isLoading, isRefreshing, refreshRoutines, logCompletion } = useRoutines();
    const insets = useSafeAreaInsets();
    const navigation = useNavigation<any>();
    const [showQuickAdd, setShowQuickAdd] = useState(false);

    const handleComplete = async (id: string) => {
        try {
            await logCompletion(id);
            // Optional: Trigger celebration animation here
        } catch (error) {
            // Error handled in context (toast)
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

    return (
        <View style={[styles.container, { paddingTop: insets.top }]}>
            <View style={styles.header}>
                <Text style={styles.headerTitle}>Routines</Text>
                <Text style={styles.headerSubtitle}>Build better habits</Text>
            </View>

            <FlatList
                data={sortedRoutines}
                keyExtractor={item => item.id}
                renderItem={({ item }) => (
                    <RoutineCard
                        routine={item}
                        onPress={() => handleComplete(item.id)}
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

            <TouchableOpacity
                style={[styles.fab, { marginBottom: insets.bottom + 16 }]}
                onPress={() => setShowQuickAdd(true)} // Or navigate to form
            >
                <Icon icon={Add01Icon} size={32} color="white" />
            </TouchableOpacity>

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
    listContent: {
        padding: 16,
        paddingBottom: 100, // Space for FAB
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
    fab: {
        position: 'absolute',
        right: 20,
        bottom: 20,
        width: 56,
        height: 56,
        borderRadius: 28,
        backgroundColor: colors.primary,
        justifyContent: 'center',
        alignItems: 'center',
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.3,
        shadowRadius: 4,
        elevation: 8,
    }
});
