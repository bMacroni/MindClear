import React from 'react';
import { Modal, View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { HugeiconsIcon as Icon } from '@hugeicons/react-native';
import { Cancel01Icon, Comment01Icon, ArrowRight01Icon, Target01Icon } from '@hugeicons/core-free-icons';
import { colors } from '../../themes/colors';
import { spacing, borderRadius } from '../../themes/spacing';
import { typography } from '../../themes/typography';

interface AddGoalOptionsModalProps {
  visible: boolean;
  onClose: () => void;
  onCreateManually: () => void;
  onAskAI: () => void;
}

export default function AddGoalOptionsModal({ visible, onClose, onCreateManually, onAskAI }: AddGoalOptionsModalProps) {
  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={onClose}
    >
      <SafeAreaView style={styles.container} edges={['top', 'left', 'right']}>
        <View style={styles.header}>
          <TouchableOpacity onPress={onClose} style={styles.closeButton} accessibilityRole="button" accessibilityLabel="Close add goal options">
            <Icon icon={Cancel01Icon} size={24} color={colors.text.primary} />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Add a Goal</Text>
          <View style={styles.headerSpacer} />
        </View>

        <View style={styles.content}>
          <Text style={styles.subtitle}>How would you like to add a goal?</Text>

          {/* Ask AI first (Recommended) */}
          <TouchableOpacity
            style={styles.option}
            onPress={onAskAI}
            accessibilityRole="button"
            accessibilityLabel="Ask AI to add a goal"
          >
            <View style={styles.optionIconWrap}>
              <Icon icon={Comment01Icon} size={24} color={colors.text.primary} />
            </View>
            <View style={styles.optionTextWrap}>
              <View style={styles.optionTitleRow}>
                <Text style={styles.optionTitle}>Ask AI</Text>
                <Text style={styles.recommended}>Recommended</Text>
              </View>
              <Text style={styles.optionSubtitle}>Start a chat to create a goal conversationally.</Text>
            </View>
            <Icon icon={ArrowRight01Icon} size={20} color={colors.text.secondary} />
          </TouchableOpacity>

          {/* Manual second */}
          <TouchableOpacity
            style={styles.option}
            onPress={onCreateManually}
            accessibilityRole="button"
            accessibilityLabel="Create goal manually"
          >
            <View style={styles.optionIconWrap}>
              <Icon icon={Target01Icon} size={24} color={colors.primary} />
            </View>
            <View style={styles.optionTextWrap}>
              <Text style={styles.optionTitle}>Create Manually</Text>
              <Text style={styles.optionSubtitle}>Use a simple form to set the goal details.</Text>
            </View>
            <Icon icon={ArrowRight01Icon} size={20} color={colors.text.secondary} />
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background.primary,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.border.light,
    backgroundColor: colors.background.primary,
  },
  closeButton: {
    padding: spacing.xs,
    borderRadius: borderRadius.sm,
  },
  headerTitle: {
    fontSize: typography.fontSize.lg,
    fontWeight: typography.fontWeight.bold,
    color: colors.text.primary,
  },
  headerSpacer: {
    width: 24,
    height: 24,
  },
  content: {
    padding: spacing.md,
  },
  subtitle: {
    fontSize: typography.fontSize.base,
    color: colors.text.secondary,
    marginBottom: spacing.md,
  },
  option: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: spacing.md,
    backgroundColor: colors.background.surface,
    borderRadius: borderRadius.lg,
    borderWidth: 1,
    borderColor: colors.border.light,
    marginBottom: spacing.md,
  },
  optionIconWrap: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.background.primary,
    marginRight: spacing.md,
  },
  optionTextWrap: {
    flex: 1,
  },
  optionTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
  optionTitle: {
    fontSize: typography.fontSize.base,
    fontWeight: typography.fontWeight.bold,
    color: colors.text.primary,
  },
  recommended: {
    fontSize: typography.fontSize.xs,
    color: colors.accent?.gold || colors.primary,
    borderWidth: 1,
    borderColor: colors.accent?.gold || colors.primary,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 999,
  },
  optionSubtitle: {
    fontSize: typography.fontSize.sm,
    color: colors.text.secondary,
    marginTop: spacing.xs,
  },
});


