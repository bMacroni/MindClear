import React, { useState, useCallback } from 'react';
import {
    View,
    Text,
    StyleSheet,
    TouchableOpacity,
    TextInput,
    Switch,
    Platform,
} from 'react-native';
import DateTimePicker from '@react-native-community/datetimepicker';
import {
    RepeatIcon,
    Calendar03Icon,
    CheckmarkCircle02Icon,
    Cancel01Icon
} from '@hugeicons/react-native'; import { colors } from '../../themes/colors';
import { RecurrencePattern, formatRecurrencePattern } from '../../utils/recurrenceUtils';

interface RecurrencePatternPickerProps {
    value: RecurrencePattern | null;
    onChange: (pattern: RecurrencePattern | null) => void;
}

const DAY_BUTTONS = [
    { label: 'S', value: 0, fullName: 'Sun' },
    { label: 'M', value: 1, fullName: 'Mon' },
    { label: 'T', value: 2, fullName: 'Tue' },
    { label: 'W', value: 3, fullName: 'Wed' },
    { label: 'T', value: 4, fullName: 'Thu' },
    { label: 'F', value: 5, fullName: 'Fri' },
    { label: 'S', value: 6, fullName: 'Sat' },
];

const FREQUENCY_OPTIONS: Array<{ label: string; value: 'daily' | 'weekly' | 'monthly' }> = [
    { label: 'Daily', value: 'daily' },
    { label: 'Weekly', value: 'weekly' },
    { label: 'Monthly', value: 'monthly' },
];

const END_CONDITION_OPTIONS: Array<{ label: string; value: 'never' | 'count' | 'date' }> = [
    { label: 'Never', value: 'never' },
    { label: 'After...', value: 'count' },
    { label: 'Until date', value: 'date' },
];

export const RecurrencePatternPicker: React.FC<RecurrencePatternPickerProps> = ({
    value,
    onChange,
}) => {
    const [isEnabled, setIsEnabled] = useState(!!value);
    const [showDatePicker, setShowDatePicker] = useState(false);

    // Sync isEnabled state when value prop changes (e.g., when loading existing task)
    React.useEffect(() => {
        setIsEnabled(!!value);
    }, [value]);

    // Initialize internal state from value prop
    const currentPattern: RecurrencePattern = value || {
        type: 'weekly',
        interval: 1,
        daysOfWeek: [],
        endCondition: { type: 'never' },
    };

    const handleToggle = useCallback((enabled: boolean) => {
        setIsEnabled(enabled);
        if (!enabled) {
            onChange(null);
        } else {
            onChange({
                type: 'weekly',
                interval: 1,
                daysOfWeek: [],
                endCondition: { type: 'never' },
                createdAt: new Date().toISOString(),
            });
        }
    }, [onChange]);

    const updatePattern = useCallback((updates: Partial<RecurrencePattern>) => {
        if (!isEnabled) return;
        onChange({
            ...currentPattern,
            ...updates,
        });
    }, [isEnabled, currentPattern, onChange]);

    const handleFrequencyChange = useCallback((type: 'daily' | 'weekly' | 'monthly') => {
        updatePattern({
            type,
            // Reset daysOfWeek when changing from weekly
            daysOfWeek: type === 'weekly' ? (currentPattern.daysOfWeek || []) : undefined,
        });
    }, [currentPattern, updatePattern]);

    const handleIntervalChange = useCallback((text: string) => {
        const num = parseInt(text, 10);
        if (!isNaN(num) && num >= 1 && num <= 99) {
            updatePattern({ interval: num });
        } else if (text === '') {
            updatePattern({ interval: 1 });
        }
    }, [updatePattern]);

    const handleDayToggle = useCallback((day: number) => {
        const currentDays = currentPattern.daysOfWeek || [];
        const newDays = currentDays.includes(day)
            ? currentDays.filter(d => d !== day)
            : [...currentDays, day].sort();
        updatePattern({ daysOfWeek: newDays });
    }, [currentPattern, updatePattern]);

    const handleEndConditionChange = useCallback((type: 'never' | 'count' | 'date') => {
        let endCondition: RecurrencePattern['endCondition'];
        switch (type) {
            case 'count':
                endCondition = { type: 'count', value: 5 };
                break;
            case 'date':
                const defaultEndDate = new Date();
                defaultEndDate.setMonth(defaultEndDate.getMonth() + 3);
                endCondition = { type: 'date', value: defaultEndDate.toISOString().split('T')[0] };
                break;
            default:
                endCondition = { type: 'never' };
        }
        updatePattern({ endCondition });
    }, [updatePattern]);

    const handleCountChange = useCallback((text: string) => {
        const num = parseInt(text, 10);
        if (!isNaN(num) && num >= 1 && num <= 999) {
            updatePattern({ endCondition: { type: 'count', value: num } });
        }
    }, [updatePattern]);

    const handleDateChange = useCallback((event: any, selectedDate?: Date) => {
        setShowDatePicker(Platform.OS === 'ios');
        if (selectedDate) {
            updatePattern({
                endCondition: {
                    type: 'date',
                    value: selectedDate.toISOString().split('T')[0]
                }
            });
        }
    }, [updatePattern]);

    const getIntervalLabel = () => {
        switch (currentPattern.type) {
            case 'daily': return 'days';
            case 'weekly': return 'weeks';
            case 'monthly': return 'months';
            default: return 'days';
        }
    };

    return (
        <View style={styles.container}>
            {/* Toggle Header */}
            <View style={styles.header}>
                <View style={styles.headerLeft}>
                    <Icon icon={RepeatIcon} size={20} color={colors.text.secondary} />
                    <Text style={styles.headerText}>Repeat this task</Text>
                </View>
                <Switch
                    value={isEnabled}
                    onValueChange={handleToggle}
                    trackColor={{ false: colors.border.medium, true: colors.primary }}
                    thumbColor={colors.shades.white}
                    accessibilityLabel="Enable task recurrence"
                />
            </View>

            {isEnabled && (
                <View style={styles.content}>
                    {/* Summary */}
                    {value && (
                        <View style={styles.summaryBox}>
                            <Text style={styles.summaryText}>
                                {formatRecurrencePattern(value)}
                            </Text>
                        </View>
                    )}

                    {/* Frequency Selection */}
                    <View style={styles.section}>
                        <Text style={styles.sectionLabel}>Frequency</Text>
                        <View style={styles.segmentedControl}>
                            {FREQUENCY_OPTIONS.map((option) => (
                                <TouchableOpacity
                                    key={option.value}
                                    style={[
                                        styles.segmentButton,
                                        currentPattern.type === option.value && styles.segmentButtonActive,
                                    ]}
                                    onPress={() => handleFrequencyChange(option.value)}
                                    accessibilityRole="button"
                                    accessibilityState={{ selected: currentPattern.type === option.value }}
                                >
                                    <Text
                                        style={[
                                            styles.segmentButtonText,
                                            currentPattern.type === option.value && styles.segmentButtonTextActive,
                                        ]}
                                    >
                                        {option.label}
                                    </Text>
                                </TouchableOpacity>
                            ))}
                        </View>
                    </View>

                    {/* Interval */}
                    <View style={styles.section}>
                        <Text style={styles.sectionLabel}>Interval</Text>
                        <View style={styles.intervalRow}>
                            <Text style={styles.intervalLabel}>Every</Text>
                            <TextInput
                                style={styles.intervalInput}
                                value={String(currentPattern.interval || 1)}
                                onChangeText={handleIntervalChange}
                                keyboardType="number-pad"
                                maxLength={2}
                                accessibilityLabel="Recurrence interval"
                            />
                            <Text style={styles.intervalLabel}>{getIntervalLabel()}</Text>
                        </View>
                    </View>

                    {/* Day Selection (Weekly Only) */}
                    {currentPattern.type === 'weekly' && (
                        <View style={styles.section}>
                            <Text style={styles.sectionLabel}>On days</Text>
                            <View style={styles.daysRow}>
                                {DAY_BUTTONS.map((day) => {
                                    const isSelected = (currentPattern.daysOfWeek || []).includes(day.value);
                                    return (
                                        <TouchableOpacity
                                            key={day.value}
                                            style={[
                                                styles.dayButton,
                                                isSelected && styles.dayButtonActive,
                                            ]}
                                            onPress={() => handleDayToggle(day.value)}
                                            accessibilityRole="button"
                                            accessibilityLabel={day.fullName}
                                            accessibilityState={{ selected: isSelected }}
                                        >
                                            <Text
                                                style={[
                                                    styles.dayButtonText,
                                                    isSelected && styles.dayButtonTextActive,
                                                ]}
                                            >
                                                {day.label}
                                            </Text>
                                        </TouchableOpacity>
                                    );
                                })}
                            </View>
                        </View>
                    )}

                    {/* End Condition */}
                    <View style={styles.section}>
                        <Text style={styles.sectionLabel}>Ends</Text>
                        <View style={styles.segmentedControl}>
                            {END_CONDITION_OPTIONS.map((option) => (
                                <TouchableOpacity
                                    key={option.value}
                                    style={[
                                        styles.segmentButton,
                                        currentPattern.endCondition?.type === option.value && styles.segmentButtonActive,
                                    ]}
                                    onPress={() => handleEndConditionChange(option.value)}
                                    accessibilityRole="button"
                                    accessibilityState={{ selected: currentPattern.endCondition?.type === option.value }}
                                >
                                    <Text
                                        style={[
                                            styles.segmentButtonText,
                                            currentPattern.endCondition?.type === option.value && styles.segmentButtonTextActive,
                                        ]}
                                    >
                                        {option.label}
                                    </Text>
                                </TouchableOpacity>
                            ))}
                        </View>

                        {/* Count Input */}
                        {currentPattern.endCondition?.type === 'count' && (
                            <View style={styles.endConditionDetail}>
                                <Text style={styles.intervalLabel}>After</Text>
                                <TextInput
                                    style={styles.intervalInput}
                                    value={String(currentPattern.endCondition.value || 5)}
                                    onChangeText={handleCountChange}
                                    keyboardType="number-pad"
                                    maxLength={3}
                                    accessibilityLabel="Number of occurrences"
                                />
                                <Text style={styles.intervalLabel}>times</Text>
                            </View>
                        )}

                        {/* Date Picker */}
                        {currentPattern.endCondition?.type === 'date' && (
                            <View style={styles.endConditionDetail}>
                                <TouchableOpacity
                                    style={styles.dateButton}
                                    onPress={() => setShowDatePicker(true)}
                                    accessibilityLabel="Select end date"
                                >
                                    <Icon icon={Calendar03Icon} size={18} color={colors.text.secondary} />
                                    <Text style={styles.dateButtonText}>
                                        {currentPattern.endCondition.value
                                            ? new Date(currentPattern.endCondition.value as string).toLocaleDateString()
                                            : 'Select date'}
                                    </Text>
                                </TouchableOpacity>
                                {showDatePicker && (
                                    <DateTimePicker
                                        value={
                                            currentPattern.endCondition.value
                                                ? new Date(currentPattern.endCondition.value as string)
                                                : new Date()
                                        }
                                        mode="date"
                                        display="default"
                                        onChange={handleDateChange}
                                        minimumDate={new Date()}
                                    />
                                )}
                            </View>
                        )}
                    </View>
                </View>
            )}
        </View>
    );
};

const styles = StyleSheet.create({
    container: {
        backgroundColor: colors.background.surface,
        borderRadius: 12,
        marginBottom: 16,
        overflow: 'hidden',
    },
    header: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingHorizontal: 16,
        paddingVertical: 14,
        borderBottomWidth: 0,
    },
    headerLeft: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 10,
    },
    headerText: {
        fontSize: 16,
        fontWeight: '500',
        color: colors.text.primary,
    },
    content: {
        paddingHorizontal: 16,
        paddingBottom: 16,
        borderTopWidth: 1,
        borderTopColor: colors.border.light,
    },
    summaryBox: {
        backgroundColor: colors.rgba(colors.primary, 0.05),
        paddingHorizontal: 12,
        paddingVertical: 8,
        borderRadius: 8,
        marginTop: 12,
        marginBottom: 8,
    },
    summaryText: {
        fontSize: 14,
        fontWeight: '600',
        color: colors.primary,
        textAlign: 'center',
    },
    section: {
        marginTop: 16,
    },
    sectionLabel: {
        fontSize: 13,
        fontWeight: '600',
        color: colors.text.secondary,
        marginBottom: 8,
        textTransform: 'uppercase',
        letterSpacing: 0.5,
    },
    segmentedControl: {
        flexDirection: 'row',
        backgroundColor: colors.background.secondary,
        borderRadius: 8,
        padding: 3,
    },
    segmentButton: {
        flex: 1,
        paddingVertical: 8,
        alignItems: 'center',
        borderRadius: 6,
    },
    segmentButtonActive: {
        backgroundColor: colors.shades.white,
        shadowColor: colors.shadow,
        shadowOffset: { width: 0, height: 1 },
        shadowOpacity: 0.1,
        shadowRadius: 2,
        elevation: 1,
    },
    segmentButtonText: {
        fontSize: 14,
        fontWeight: '500',
        color: colors.text.secondary,
    },
    segmentButtonTextActive: {
        color: colors.text.primary,
        fontWeight: '600',
    },
    intervalRow: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 10,
    },
    intervalLabel: {
        fontSize: 15,
        color: colors.text.primary,
    },
    intervalInput: {
        backgroundColor: colors.shades.white,
        borderWidth: 1,
        borderColor: colors.border.medium,
        borderRadius: 8,
        paddingHorizontal: 12,
        paddingVertical: 8,
        fontSize: 16,
        fontWeight: '600',
        textAlign: 'center',
        minWidth: 50,
        color: colors.text.primary,
    },
    daysRow: {
        flexDirection: 'row',
        justifyContent: 'space-between',
    },
    dayButton: {
        width: 44,
        height: 44,
        borderRadius: 22,
        backgroundColor: colors.background.secondary,
        alignItems: 'center',
        justifyContent: 'center',
    }, dayButtonActive: {
        backgroundColor: colors.primary,
    },
    dayButtonText: {
        fontSize: 14,
        fontWeight: '600',
        color: colors.text.secondary,
    },
    dayButtonTextActive: {
        color: colors.shades.white,
    },
    endConditionDetail: {
        flexDirection: 'row',
        alignItems: 'center',
        marginTop: 12,
        gap: 10,
    },
    dateButton: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: colors.shades.white,
        borderWidth: 1,
        borderColor: colors.border.medium,
        borderRadius: 8,
        paddingHorizontal: 12,
        paddingVertical: 10,
        gap: 8,
    },
    dateButtonText: {
        fontSize: 15,
        color: colors.text.primary,
    },
});

export default RecurrencePatternPicker;
