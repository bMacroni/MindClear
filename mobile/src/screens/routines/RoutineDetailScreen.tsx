import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, Alert } from 'react-native';
import { useRoute, useNavigation } from '@react-navigation/native';
// unused import removed
import { useRoutines } from '../../contexts/RoutineContext';
import { colors } from '../../themes/colors';
import { routineService } from '../../services/routineService';

export default function RoutineDetailScreen() {
    const route = useRoute<any>();
    const navigation = useNavigation();
    const { routines, deleteRoutine, updateRoutine } = useRoutines();
    const { routineId } = route.params;

    // Use local state for full details which might include history not in list view
    const [routine, setRoutine] = useState(routines.find(r => r.id === routineId));
    const [loading, setLoading] = useState(false);

    useEffect(() => {
        // If we need more data than in the list context, fetch it here
        const fetchFullDetails = async () => {
            setLoading(true);
            try {
                // Note: service.getRoutineById fetches fresh data
                // const data = await routineService.getRoutineById(routineId); 
                // implementation of getRoutineById needed in service first if different from getAll
                // For MVP, context data is likely sufficient or we reuse find
                const found = routines.find(r => r.id === routineId);
                setRoutine(found);
            } finally {
                setLoading(false);
            }
        };
        fetchFullDetails();
    }, [routineId, routines]);

    const handleDelete = () => {
        Alert.alert(
            "Delete Routine",
            "Are you sure you want to delete this routine? This action cannot be undone.",
            [
                { text: "Cancel", style: "cancel" },
                {
                    text: "Delete",
                    style: "destructive",
                    onPress: async () => {
                        await deleteRoutine(routineId);
                        navigation.goBack();
                    }
                }
            ]
        );
    };

    if (!routine) return <View style={styles.container}><Text>Routine not found</Text></View>;

    return (
        <ScrollView style={styles.container}>
            <View style={styles.header}>
                <View style={styles.iconContainer}>
                    <Text style={styles.icon}>{routine.icon}</Text>
                </View>
                <Text style={styles.title}>{routine.title}</Text>
                <Text style={styles.subtitle}>{routine.description || 'No description'}</Text>
            </View>

            <View style={styles.statsContainer}>
                <View style={styles.statBox}>
                    <Text style={styles.statValue}>{routine.current_streak}</Text>
                    <Text style={styles.statLabel}>Current Streak</Text>
                </View>
                <View style={styles.statBox}>
                    <Text style={styles.statValue}>{routine.longest_streak}</Text>
                    <Text style={styles.statLabel}>Best Streak</Text>
                </View>
                <View style={styles.statBox}>
                    <Text style={styles.statValue}>{routine.total_completions}</Text>
                    <Text style={styles.statLabel}>Total</Text>
                </View>
            </View>

            <View style={styles.section}>
                <Text style={styles.sectionTitle}>Settings</Text>

                <View style={styles.row}>
                    <Text style={styles.label}>Frequency</Text>
                    <Text style={styles.value}>{routine.frequency_type}</Text>
                </View>
                <View style={styles.row}>
                    <Text style={styles.label}>Target</Text>
                    <Text style={styles.value}>{routine.target_count}x per period</Text>
                </View>
                <View style={styles.row}>
                    <Text style={styles.label}>Time Window</Text>
                    <Text style={styles.value}>{routine.time_window}</Text>
                </View>
                <View style={styles.row}>
                    <Text style={styles.label}>Reminders</Text>
                    <Text style={styles.value}>{routine.reminder_enabled ? 'On' : 'Off'}</Text>
                </View>
            </View>

            <TouchableOpacity style={styles.deleteButton} onPress={handleDelete}>
                <Text style={styles.deleteText}>Delete Routine</Text>
            </TouchableOpacity>
        </ScrollView>
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: colors.background.primary,
    },
    header: {
        alignItems: 'center',
        padding: 24,
        borderBottomWidth: 1,
        borderBottomColor: colors.border.light,
    },
    iconContainer: {
        width: 80,
        height: 80,
        borderRadius: 40,
        backgroundColor: colors.background.secondary,
        justifyContent: 'center',
        alignItems: 'center',
        marginBottom: 16,
    },
    icon: {
        fontSize: 40,
    },
    title: {
        fontSize: 24,
        fontWeight: 'bold',
        color: colors.text.primary,
        marginBottom: 8,
        textAlign: 'center',
    },
    subtitle: {
        fontSize: 16,
        color: colors.text.secondary,
        textAlign: 'center',
    },
    statsContainer: {
        flexDirection: 'row',
        justifyContent: 'space-around',
        padding: 24,
        backgroundColor: colors.background.surface,
        marginBottom: 16,
    },
    statBox: {
        alignItems: 'center',
    },
    statValue: {
        fontSize: 24,
        fontWeight: 'bold',
        color: colors.primary,
    },
    statLabel: {
        fontSize: 12,
        color: colors.text.secondary,
        marginTop: 4,
    },
    section: {
        padding: 20,
    },
    sectionTitle: {
        fontSize: 18,
        fontWeight: '600',
        color: colors.text.primary,
        marginBottom: 16,
    },
    row: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        paddingVertical: 12,
        borderBottomWidth: 1,
        borderBottomColor: colors.border.light,
    },
    label: {
        fontSize: 16,
        color: colors.text.secondary,
    },
    value: {
        fontSize: 16,
        fontWeight: '500',
        color: colors.text.primary,
        textTransform: 'capitalize',
    },
    deleteButton: {
        margin: 20,
        padding: 16,
        backgroundColor: colors.error,
        borderRadius: 12,
        alignItems: 'center',
    },
    deleteText: {
        color: 'white',
        fontWeight: 'bold',
        fontSize: 16,
    }
});
