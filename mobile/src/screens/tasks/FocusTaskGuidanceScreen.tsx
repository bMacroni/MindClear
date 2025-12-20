import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { HugeiconsIcon as Icon } from '@hugeicons/react-native';
import { Target01Icon, Tick01Icon } from '@hugeicons/core-free-icons';
import { colors } from '../../themes/colors';
import { spacing, borderRadius } from '../../themes/spacing';
import { typography } from '../../themes/typography';

export default function FocusTaskGuidanceScreen({ navigation }: any) {
  const handleGotIt = async () => {
    try {
      // Mark guidance as shown
      await AsyncStorage.setItem('focusGuidanceShown', 'true');
    } catch (error) {
      console.warn('Failed to mark focus guidance as shown:', error);
    }
    // Navigate to Tasks tab
    navigation.navigate('Tasks');
  };

  return (
    <SafeAreaView style={styles.container} edges={['top', 'left', 'right', 'bottom']}>
      <ScrollView
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.content}>
          <View style={styles.iconContainer}>
            <View style={styles.iconCircle}>
              <Icon icon={Target01Icon} size={32} color={colors.primary} />
            </View>
          </View>

          <Text style={styles.title}>Today's Focus</Text>

          <Text style={styles.subtitle}>
            One task at a time keeps you clear
          </Text>

          <View style={styles.keyPoints}>
            <View style={styles.point}>
              <Icon icon={Tick01Icon} size={20} color={colors.primary} style={styles.pointIcon} />
              <Text style={styles.pointText}>Swipe right or tap to set your focus</Text>
            </View>
            <View style={styles.point}>
              <Icon icon={Tick01Icon} size={20} color={colors.primary} style={styles.pointIcon} />
              <Text style={styles.pointText}>Complete it to feel the win</Text>
            </View>
          </View>

          <TouchableOpacity
            style={styles.primaryBtn}
            onPress={handleGotIt}
            accessibilityRole="button"
            accessibilityLabel="Got it, go to tasks"
            activeOpacity={0.8}
          >
            <Text style={styles.primaryText}>Got it</Text>
          </TouchableOpacity>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background.surface,
  },
  scrollContent: {
    flexGrow: 1,
  },
  content: {
    flex: 1,
    padding: spacing.lg,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: '100%',
  },
  iconContainer: {
    marginBottom: spacing.lg,
  },
  iconCircle: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: colors.secondary,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: colors.border.light,
    shadowColor: colors.shadow,
    shadowOffset: {
      width: 0,
      height: 2,
    },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  title: {
    fontSize: typography.fontSize['3xl'],
    fontWeight: typography.fontWeight.bold as any,
    color: colors.text.primary,
    marginBottom: spacing.sm,
    textAlign: 'center',
  },
  subtitle: {
    fontSize: typography.fontSize.lg,
    color: colors.text.secondary,
    textAlign: 'center',
    marginBottom: spacing.xl,
    lineHeight: typography.lineHeight.relaxed * typography.fontSize.lg,
  },
  keyPoints: {
    width: '100%',
    maxWidth: 400,
    marginBottom: spacing.xl,
  },
  point: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginBottom: spacing.md,
    paddingHorizontal: spacing.sm,
  },
  pointIcon: {
    marginRight: spacing.sm,
    marginTop: 2,
  },
  pointText: {
    flex: 1,
    fontSize: typography.fontSize.base,
    color: colors.text.primary,
    lineHeight: typography.lineHeight.normal * typography.fontSize.base,
  },
  primaryBtn: {
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.xl,
    borderRadius: borderRadius.md,
    backgroundColor: colors.primary,
    minWidth: 200,
    alignItems: 'center',
    shadowColor: colors.shadow,
    shadowOffset: {
      width: 0,
      height: 2,
    },
    shadowOpacity: 0.2,
    shadowRadius: 4,
    elevation: 3,
  },
  primaryText: {
    color: colors.secondary,
    fontWeight: typography.fontWeight.bold as any,
    fontSize: typography.fontSize.lg,
  },
});


