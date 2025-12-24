import React, { useState } from 'react';
import { View, Text, TextInput, Modal, TouchableOpacity, StyleSheet, KeyboardAvoidingView, Platform } from 'react-native';
import { Cancel01Icon } from '@hugeicons/core-free-icons';
import { HugeiconsIcon as Icon } from '@hugeicons/react-native';
import { useRoutines } from '../../contexts/RoutineContext';
import { colors } from '../../themes/colors';

interface RoutineQuickAddProps {
    visible: boolean;
    onClose: () => void;
}

export const RoutineQuickAdd: React.FC<RoutineQuickAddProps> = ({ visible, onClose }) => {
    const { createRoutine } = useRoutines();
    const [title, setTitle] = useState('');
    const [frequency, setFrequency] = useState<'daily' | 'weekly' | 'monthly'>('daily');
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const handleCreate = async () => {
        if (!title.trim()) return;

        setLoading(true);
        setError(null);
        try {
            const success = await createRoutine({
                title: title.trim(),
                frequency_type: frequency,
            });

            if (success) {
                setTitle('');
                setFrequency('daily');
                onClose();
            } else {
                setError('Failed to create routine. Please try again.');
            }
        } catch (err) {
            setError('An unexpected error occurred. Please try again.');
            console.error('[RoutineQuickAdd] Create failed:', err);
        } finally {
            setLoading(false);
        }
    };

    const handleClose = () => {
        setError(null);
        setTitle('');
        setFrequency('daily');
        onClose();
    };

    return (
        <Modal
            visible={visible}
            animationType="slide"
            transparent={true}
            onRequestClose={handleClose}
        >
            <KeyboardAvoidingView
                behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
                style={styles.modalOverlay}
            >
                <TouchableOpacity style={styles.backdrop} onPress={handleClose} activeOpacity={1} />

                <View style={styles.container}>
                    <View style={styles.header}>
                        <Text style={styles.title}>New Routine</Text>
                        <TouchableOpacity
                            onPress={handleClose}
                            accessibilityRole="button"
                            accessibilityLabel="Close"
                            accessibilityHint="Closes the new routine dialog"
                        >
                            <Icon icon={Cancel01Icon} size={24} color={colors.text.secondary} />
                        </TouchableOpacity>
                    </View>

                    <TextInput
                        style={styles.input}
                        placeholder="What habit do you want to build?"
                        placeholderTextColor={colors.text.disabled}
                        value={title}
                        onChangeText={(text) => {
                            setTitle(text);
                            if (error) setError(null);
                        }}
                        autoFocus
                        accessibilityLabel="Routine title"
                        accessibilityHint="Enter a name for your new routine"
                    />

                    {error && (
                        <Text style={styles.errorText}>{error}</Text>
                    )}

                    <View style={styles.frequencyContainer}>
                        {(['daily', 'weekly', 'monthly'] as const).map((freq) => (
                            <TouchableOpacity
                                key={freq}
                                style={[
                                    styles.freqOption,
                                    frequency === freq && styles.freqSelected
                                ]}
                                onPress={() => setFrequency(freq)}
                                accessibilityRole="button"
                                accessibilityState={{ selected: frequency === freq }}
                                accessibilityLabel={`Frequency ${freq}`}
                                accessibilityHint={`Sets frequency to ${freq}`}
                            >
                                <Text style={[
                                    styles.freqText,
                                    frequency === freq && styles.freqTextSelected
                                ]}>{freq}</Text>
                            </TouchableOpacity>
                        ))}
                    </View>

                    <TouchableOpacity
                        style={[styles.createButton, (!title.trim() || loading) && styles.disabledButton]}
                        onPress={handleCreate}
                        disabled={!title.trim() || loading}
                        accessibilityRole="button"
                        accessibilityLabel={loading ? "Creating Routine" : "Create Routine"}
                        accessibilityState={{ disabled: !title.trim() || loading, busy: loading }}
                    >
                        <Text style={styles.createButtonText}>
                            {loading ? 'Creating...' : 'Create Routine'}
                        </Text>
                    </TouchableOpacity>
                </View>
            </KeyboardAvoidingView>
        </Modal>
    );
};

const styles = StyleSheet.create({
    modalOverlay: {
        flex: 1,
        justifyContent: 'flex-end',
        backgroundColor: 'rgba(0,0,0,0.4)',
    },
    backdrop: {
        ...StyleSheet.absoluteFillObject,
    },
    container: {
        backgroundColor: colors.background.primary,
        borderTopLeftRadius: 20,
        borderTopRightRadius: 20,
        padding: 24,
        paddingBottom: 40,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: -2 },
        shadowOpacity: 0.1,
        shadowRadius: 8,
        elevation: 10,
    },
    header: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: 20,
    },
    title: {
        fontSize: 20,
        fontWeight: 'bold',
        color: colors.text.primary,
    },
    input: {
        fontSize: 18,
        color: colors.text.primary,
        borderBottomWidth: 1,
        borderBottomColor: colors.border.light,
        paddingVertical: 12,
        marginBottom: 24,
    },
    errorText: {
        color: colors.error || '#ef4444',
        fontSize: 14,
        marginBottom: 16,
        marginTop: -16,
    },
    frequencyContainer: {
        flexDirection: 'row',
        marginBottom: 24,
        backgroundColor: colors.background.secondary,
        borderRadius: 8,
        padding: 4,
    },
    freqOption: {
        flex: 1,
        paddingVertical: 8,
        alignItems: 'center',
        borderRadius: 6,
    },
    freqSelected: {
        backgroundColor: colors.background.primary,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 1 },
        shadowOpacity: 0.1,
        shadowRadius: 2,
        elevation: 2,
    },
    freqText: {
        fontSize: 14,
        color: colors.text.secondary,
        textTransform: 'capitalize',
    },
    freqTextSelected: {
        color: colors.primary,
        fontWeight: '600',
    },
    createButton: {
        backgroundColor: colors.primary,
        borderRadius: 12,
        paddingVertical: 16,
        alignItems: 'center',
    },
    disabledButton: {
        opacity: 0.5,
    },
    createButtonText: {
        color: 'white',
        fontSize: 16,
        fontWeight: 'bold',
    }
});
