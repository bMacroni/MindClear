import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, Alert, TextInput, Switch, ActivityIndicator } from 'react-native';
import { useRoute, useNavigation, RouteProp } from '@react-navigation/native';
import { PencilEdit01Icon, FloppyDiskIcon, Cancel01Icon, Delete01Icon } from '@hugeicons/core-free-icons';
import { HugeiconsIcon as Icon } from '@hugeicons/react-native';
import { useRoutines } from '../../contexts/RoutineContext';
import { colors } from '../../themes/colors';
import { CreateRoutinePayload } from '../../services/routineService';

type RoutineDetailScreenParams = {
    routineId: string;
};

type RoutineDetailRouteProp = RouteProp<{ RoutineDetail: RoutineDetailScreenParams }, 'RoutineDetail'>;

export default function RoutineDetailScreen() {
    const route = useRoute<RoutineDetailRouteProp>();
    const navigation = useNavigation();
    const { routineId } = route.params;
    const { routines, updateRoutine, deleteRoutine } = useRoutines();

    const [routine, setRoutine] = useState(routines.find(r => r.id === routineId));
    const [isEditing, setIsEditing] = useState(false);
    const [saving, setSaving] = useState(false);

    // Edit form state
    const [formData, setFormData] = useState<Partial<CreateRoutinePayload>>({});

    useEffect(() => {
        const found = routines.find(r => r.id === routineId);
        if (found) {
            setRoutine(found);
            setFormData({
                title: found.title,
                description: found.description,
                frequency_type: found.frequency_type,
                target_count: found.target_count,
                time_window: found.time_window,
                reminder_enabled: found.reminder_enabled,
            });
        }
    }, [routineId, routines]);

    const handleSave = async () => {
        if (!routine) return;
        setSaving(true);
        try {
            const success = await updateRoutine(routine.id, formData);
            if (success) {
                setIsEditing(false);
            } else {
                Alert.alert('Error', 'Failed to update routine. Please try again.');
            }
        } catch (error) {
            console.error('Error updating routine:', error);
            Alert.alert('Error', 'An unexpected error occurred.');
        } finally {
            setSaving(false);
        }
    };

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
            <View style={styles.topBar}>
                <TouchableOpacity onPress={() => navigation.goBack()}>
                    <Text style={styles.backText}>Back</Text>
                </TouchableOpacity>
                <View style={styles.actions}>
                    {isEditing ? (
                        <>
                            <TouchableOpacity onPress={() => setIsEditing(false)} style={styles.actionButton}>
                                <Icon icon={Cancel01Icon} size={24} color={colors.text.secondary} />
                            </TouchableOpacity>
                            <TouchableOpacity onPress={handleSave} style={styles.actionButton} disabled={saving}>
                                {saving ? <ActivityIndicator size="small" color={colors.primary} /> : <Icon icon={FloppyDiskIcon} size={24} color={colors.primary} />}
                            </TouchableOpacity>
                        </>
                    ) : (
                        <TouchableOpacity onPress={() => setIsEditing(true)} style={styles.actionButton}>
                            <Icon icon={PencilEdit01Icon} size={24} color={colors.primary} />
                        </TouchableOpacity>
                    )}
                </View>
            </View>

            <View style={styles.header}>
                <View style={styles.iconContainer}>
                    <Text style={styles.icon}>{routine.icon}</Text>
                </View>

                {isEditing ? (
                    <View style={styles.editHeaderContainer}>
                        <TextInput
                            style={styles.editTitle}
                            value={formData.title}
                            onChangeText={t => setFormData(prev => ({ ...prev, title: t }))}
                            placeholder="Routine Name"
                            accessibilityLabel="Routine title"
                            accessibilityHint="Enter the name of your routine"
                        />
                        <TextInput
                            style={styles.editDescription}
                            value={formData.description}
                            onChangeText={t => setFormData(prev => ({ ...prev, description: t }))}
                            placeholder="Description (optional)"
                            multiline
                            accessibilityLabel="Routine description"
                            accessibilityHint="Enter an optional description for your routine"
                        />
                    </View>) : (
                    <>
                        <Text style={styles.title}>{routine.title}</Text>
                        <Text style={styles.subtitle}>{routine.description || 'No description'}</Text>
                    </>
                )}
            </View>

            {/* Stats are read-only */}
            <View style={styles.statsContainer}>
                <View style={styles.statBox}>
                    <Text style={styles.statValue}>{routine.current_streak ?? 0}</Text>
                    <Text style={styles.statLabel}>Current Streak</Text>
                </View>
                <View style={styles.statBox}>
                    <Text style={styles.statValue}>{routine.longest_streak ?? 0}</Text>
                    <Text style={styles.statLabel}>Best Streak</Text>
                </View>
                <View style={styles.statBox}>
                    <Text style={styles.statValue}>{routine.total_completions ?? 0}</Text>
                    <Text style={styles.statLabel}>Total</Text>
                </View>
            </View>

            <View style={styles.section}>
                <Text style={styles.sectionTitle}>Settings</Text>

                {/* Frequency */}
                <View style={styles.row}>
                    <Text style={styles.label}>Frequency</Text>
                    {isEditing ? (
                        <View style={styles.optionRow}>
                            {(['daily', 'weekly', 'monthly'] as const).map(f => (
                                <TouchableOpacity
                                    key={f}
                                    style={[styles.optionChip, formData.frequency_type === f && styles.optionChipSelected]}
                                    onPress={() => setFormData(prev => ({ ...prev, frequency_type: f }))}
                                    accessibilityRole="button"
                                    accessibilityState={{ selected: formData.frequency_type === f }}
                                    accessibilityLabel={`Frequency ${f}`}
                                    accessibilityHint={`Sets routine frequency to ${f}`}
                                >
                                    <Text style={[styles.optionText, formData.frequency_type === f && styles.optionTextSelected]}>{f}</Text>
                                </TouchableOpacity>
                            ))}
                        </View>
                    ) : (
                        <Text style={styles.value}>{routine.frequency_type}</Text>
                    )}
                </View>

                {/* Target Count */}
                <View style={styles.row}>
                    <Text style={styles.label}>Target Count</Text>
                    {isEditing ? (
                        <View style={styles.counterRow}>
                            <TouchableOpacity
                                onPress={() => setFormData(prev => ({ ...prev, target_count: Math.max(1, (prev.target_count || 1) - 1) }))}
                                style={styles.counterButton}
                                accessibilityRole="button"
                                accessibilityLabel="Decrease target count"
                            >
                                <Text style={styles.counterButtonText}>-</Text>
                            </TouchableOpacity>
                            <Text style={styles.counterValue}>{formData.target_count}</Text>
                            <TouchableOpacity
                                onPress={() => setFormData(prev => ({ ...prev, target_count: Math.min(10, (prev.target_count || 1) + 1) }))}
                                style={styles.counterButton}
                                accessibilityRole="button"
                                accessibilityLabel="Increase target count"
                            >
                                <Text style={styles.counterButtonText}>+</Text>
                            </TouchableOpacity>
                        </View>
                    ) : (
                        <Text style={styles.value}>{routine.target_count}x per period</Text>
                    )}
                </View>

                {/* Time Window */}
                <View style={styles.row}>
                    <Text style={styles.label}>Time Window</Text>
                    {isEditing ? (
                        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.scrollOptions}>
                            {(['morning', 'afternoon', 'evening', 'anytime'] as const).map(tw => (
                                <TouchableOpacity
                                    key={tw}
                                    style={[styles.optionChip, formData.time_window === tw && styles.optionChipSelected]}
                                    onPress={() => setFormData(prev => ({ ...prev, time_window: tw }))}
                                >
                                    <Text style={[styles.optionText, formData.time_window === tw && styles.optionTextSelected]}>{tw}</Text>
                                </TouchableOpacity>
                            ))}
                        </ScrollView>
                    ) : (
                        <Text style={styles.value}>{routine.time_window}</Text>
                    )}
                </View>

                {/* Reminders */}
                <View style={styles.row}>
                    <Text style={styles.label}>Reminders</Text>
                    {isEditing ? (
                        <Switch
                            value={formData.reminder_enabled}
                            onValueChange={v => setFormData(prev => ({ ...prev, reminder_enabled: v }))}
                            trackColor={{ false: colors.text.disabled, true: colors.primary }}
                        />
                    ) : (
                        <Text style={styles.value}>{routine.reminder_enabled ? 'On' : 'Off'}</Text>
                    )}
                </View>
            </View>

            <TouchableOpacity style={styles.deleteButton} onPress={handleDelete}>
                <View style={styles.deleteContent}>
                    <Icon icon={Delete01Icon} size={20} color="white" />
                    <Text style={styles.deleteText}>Delete Routine</Text>
                </View>
            </TouchableOpacity>

            <View style={{ height: 40 }} />
        </ScrollView >
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: colors.background.primary,
    },
    topBar: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        paddingHorizontal: 20,
        paddingTop: 20,
        paddingBottom: 10,
    },
    backText: {
        color: colors.primary,
        fontSize: 16,
        fontWeight: '600',
    },
    actions: {
        flexDirection: 'row',
    },
    actionButton: {
        marginLeft: 16,
        padding: 4,
    },
    header: {
        alignItems: 'center',
        padding: 24,
        borderBottomWidth: 1,
        borderBottomColor: colors.border.light,
    },
    editHeaderContainer: {
        width: '100%',
        alignItems: 'center',
    },
    editTitle: {
        fontSize: 24,
        fontWeight: 'bold',
        color: colors.text.primary,
        marginBottom: 8,
        textAlign: 'center',
        borderBottomWidth: 1,
        borderBottomColor: colors.primary,
        width: '80%',
        paddingVertical: 4,
    },
    editDescription: {
        fontSize: 16,
        color: colors.text.secondary,
        textAlign: 'center',
        borderBottomWidth: 1,
        borderBottomColor: colors.border.medium,
        width: '80%',
        paddingVertical: 4,
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
        alignItems: 'center',
        paddingVertical: 12,
        borderBottomWidth: 1,
        borderBottomColor: colors.border.light,
        minHeight: 60,
    },
    label: {
        fontSize: 16,
        color: colors.text.secondary,
        flex: 1,
    },
    value: {
        fontSize: 16,
        fontWeight: '500',
        color: colors.text.primary,
        textTransform: 'capitalize',
    },
    optionRow: {
        flexDirection: 'row',
        flexWrap: 'wrap',
        justifyContent: 'flex-end',
        flex: 2,
    },
    optionChip: {
        paddingHorizontal: 12,
        paddingVertical: 6,
        borderRadius: 16,
        backgroundColor: colors.background.secondary,
        marginLeft: 8,
        marginBottom: 4,
    },
    optionChipSelected: {
        backgroundColor: colors.primary,
    },
    optionText: {
        fontSize: 14,
        color: colors.text.primary,
        textTransform: 'capitalize',
    },
    optionTextSelected: {
        color: 'white',
        fontWeight: '600',
    },
    counterRow: {
        flexDirection: 'row',
        alignItems: 'center',
    },
    counterButton: {
        width: 32,
        height: 32,
        borderRadius: 16,
        backgroundColor: colors.background.secondary,
        justifyContent: 'center',
        alignItems: 'center',
    },
    counterButtonText: {
        fontSize: 18,
        fontWeight: 'bold',
        color: colors.primary,
    },
    counterValue: {
        fontSize: 18,
        fontWeight: '600',
        marginHorizontal: 16,
        color: colors.text.primary,
    },
    scrollOptions: {
        flexGrow: 0,
        maxWidth: '60%',
    },
    deleteButton: {
        margin: 20,
        padding: 16,
        backgroundColor: colors.error,
        borderRadius: 12,
        alignItems: 'center',
    },
    deleteContent: {
        flexDirection: 'row',
        alignItems: 'center',
    },
    deleteText: {
        color: 'white',
        fontWeight: 'bold',
        fontSize: 16,
        marginLeft: 8,
    }
});
