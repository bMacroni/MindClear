import React, { useCallback } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Dimensions } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import AsyncStorage from '@react-native-async-storage/async-storage';
import Icon from 'react-native-vector-icons/Octicons';
import { colors } from '../../themes/colors';
import { spacing, borderRadius } from '../../themes/spacing';
import { typography } from '../../themes/typography';

const { width } = Dimensions.get('window');

export default function BrainDumpOnboardingScreen({ navigation }: any) {
  const handleDismiss = useCallback(async () => {
    try {
      await AsyncStorage.setItem('brainDumpOnboardingDismissed', 'true');
      navigation.replace('BrainDumpInput');
    } catch (error) {
      console.warn('Error saving onboarding dismissal:', error);
      // Navigate anyway even if saving fails
      navigation.replace('BrainDumpInput');
    }
  }, [navigation]);

  return (
    <SafeAreaView style={styles.container} edges={['top', 'left', 'right']}>
      <View style={styles.content}>
        <View style={styles.step}>
          <View style={styles.iconCircle}><Icon name="pencil" size={24} color={colors.primary} /></View>
          <Text style={styles.stepTitle}>Dump</Text>
          <Text style={styles.stepText}>Write down everything on your mind.</Text>
        </View>
        <View style={styles.divider} />
        <View style={styles.step}>
          <View style={styles.iconCircle}><Icon name="wand" size={24} color={colors.primary} /></View>
          <Text style={styles.stepTitle}>Refine</Text>
          <Text style={styles.stepText}>We’ll help clean up and sort your thoughts.</Text>
        </View>
        <View style={styles.divider} />
        <View style={styles.step}>
          <View style={styles.iconCircle}><Icon name="arrow-switch" size={24} color={colors.primary} /></View>
          <Text style={styles.stepTitle}>Prioritize</Text>
          <Text style={styles.stepText}>Arrange tasks and pick one to focus on today.</Text>
        </View>

        <View style={styles.actions}>
          <TouchableOpacity style={styles.dismissBtn} onPress={handleDismiss} accessibilityRole="button" accessibilityLabel="Dismiss">
            <Text style={styles.dismissText}>Dismiss</Text>
          </TouchableOpacity>
        </View>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background.surface },
  content: { flex: 1, padding: spacing.lg, alignItems: 'center', justifyContent: 'center' },
  step: { width: Math.min(480, width - spacing.lg * 2), alignItems: 'center', marginBottom: spacing.lg },
  iconCircle: { width: 64, height: 64, borderRadius: 32, backgroundColor: colors.secondary, alignItems: 'center', justifyContent: 'center', marginBottom: spacing.sm, borderWidth: 1, borderColor: colors.border.light },
  stepTitle: { fontSize: typography.fontSize.lg, fontWeight: typography.fontWeight.bold, color: colors.text.primary, marginBottom: spacing.xs },
  stepText: { fontSize: typography.fontSize.sm, color: colors.text.secondary, textAlign: 'center' },
  divider: { height: 1, width: Math.min(480, width - spacing.lg * 2), backgroundColor: colors.border.light, marginVertical: spacing.md },
  actions: { marginTop: spacing.xl, alignItems: 'center' },
  dismissBtn: { paddingVertical: spacing.sm, paddingHorizontal: spacing.xl, borderRadius: borderRadius.md, backgroundColor: colors.primary, minWidth: 120 },
  dismissText: { color: colors.secondary, fontWeight: typography.fontWeight.bold, fontSize: typography.fontSize.base, textAlign: 'center' },
});


