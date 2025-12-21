import React, { useMemo, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { HugeiconsIcon as Icon } from '@hugeicons/react-native';
import { Target01Icon, ArrowUp01Icon, ArrowDown01Icon, CheckmarkCircle01Icon, InformationCircleIcon } from '@hugeicons/core-free-icons';
import { colors } from '../../themes/colors';
import { typography } from '../../themes/typography';
import { spacing, borderRadius } from '../../themes/spacing';

interface GoalTitlesDisplayProps {
  text: string;
  onAction?: (_message: string, _sendNow?: boolean) => void;
}

interface ParsedTitles {
  title: string;
  goals: string[];
}

export default function GoalTitlesDisplay({ text, onAction }: GoalTitlesDisplayProps) {
  // Parse a titles-only goal payload from the AI message
  const parseTitles = (input: string): ParsedTitles | null => {
    try {
      // Prefer JSON code block first
      const jsonBlock = input.match(/```json\s*(\{[\s\S]*?\})\s*```/i);
      const candidate = jsonBlock ? jsonBlock[1] : (input.match(/\{[\s\S]*\}/)?.[0] || null);
      if (!candidate) { return null; }
      const data = JSON.parse(candidate);
      if (data && data.category === 'goal' && Array.isArray(data.goals)) {
        const titles = data.goals.filter((g: any) => typeof g === 'string');
        if (titles.length > 0) {
          return { title: data.title || 'Your Goals', goals: titles };
        }
      }
      // Some backends might wrap in details
      if (data && data.action_type === 'read' && data.entity_type === 'goal') {
        const list = Array.isArray(data.details?.goals) ? data.details.goals : [];
        const titles = list.filter((g: any) => typeof g === 'string');
        if (titles.length > 0) {
          return { title: 'Your Goals', goals: titles };
        }
      }
      return null;
    } catch {
      return null;
    }
  };

  const parsed = useMemo(() => parseTitles(text), [text]);
  const [expandedIndex, setExpandedIndex] = useState<number | null>(null);
  if (!parsed) { return null; }

  return (
    <View style={styles.container}>
      <View style={styles.headerRow}>
        <View style={styles.headerIconWrap}>
          <Icon icon={Target01Icon} size={16} color={colors.primary} />
        </View>
        <Text style={styles.title} numberOfLines={0}>{parsed.title}</Text>
      </View>
      <View style={styles.list}>
        {parsed.goals.map((g, idx) => {
          const isExpanded = expandedIndex === idx;
          return (
            <View key={idx} style={styles.itemBlock}>
              <TouchableOpacity
                activeOpacity={0.7}
                style={[styles.itemRow, isExpanded && styles.itemRowActive]}
                onPress={() => setExpandedIndex(isExpanded ? null : idx)}
              >
                <View style={styles.bullet} />
                <Text style={styles.itemText} numberOfLines={0}>{g}</Text>
                <Icon icon={isExpanded ? ArrowUp01Icon : ArrowDown01Icon} size={16} color={colors.text.secondary} />
              </TouchableOpacity>
              {isExpanded && (
                <View style={styles.inlineMenu}>
                  <TouchableOpacity
                    style={[styles.menuBtn, styles.menuPrimary]}
                    onPress={() => {
                      const prompt = `Create a task related to my goal "${g}": `;
                      onAction?.(prompt, false);
                    }}
                  >
                    <Icon icon={CheckmarkCircle01Icon} size={14} color={colors.secondary} style={styles.menuIcon} />
                    <Text style={styles.menuText}>Add step as task</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[styles.menuBtn, styles.menuSecondary]}
                    onPress={() => {
                      const prompt = `Show details for my goal "${g}"`;
                      onAction?.(prompt, true);
                    }}
                  >
                    <Icon icon={InformationCircleIcon} size={14} color={colors.text.primary} style={styles.menuIcon} />
                    <Text style={styles.menuText}>Review goal</Text>
                  </TouchableOpacity>
                </View>
              )}
            </View>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    marginTop: spacing.sm,
    marginHorizontal: spacing.md,
    padding: spacing.md,
    backgroundColor: colors.background.surface,
    borderRadius: borderRadius.md,
    borderWidth: 1,
    borderColor: colors.border.light,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: spacing.sm,
  },
  headerIconWrap: {
    width: 28,
    height: 28,
    borderRadius: 6,
    backgroundColor: (colors.background as any).muted ? (colors.background as any).muted : '#F3F4F6',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: spacing.sm,
  },
  title: {
    fontSize: typography.fontSize.lg,
    fontWeight: typography.fontWeight.bold,
    color: colors.text.primary,
    flexShrink: 1,
  },
  list: {
    marginTop: spacing.xs,
  },
  itemBlock: {
    marginBottom: spacing.sm,
  },
  itemRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    paddingVertical: spacing.xs,
    paddingHorizontal: spacing.xs,
    borderRadius: borderRadius.sm || 6,
  },
  itemRowActive: {
    backgroundColor: (colors.background as any).muted ? (colors.background as any).muted : '#F9FAFB',
  },
  bullet: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: colors.primary,
    marginTop: 8,
    marginRight: spacing.sm,
  },
  itemText: {
    fontSize: typography.fontSize.base,
    color: colors.text.primary,
    flex: 1,
  },
  inlineMenu: {
    marginTop: spacing.xs,
    marginLeft: spacing.lg,
    flexDirection: 'row',
    gap: spacing.sm,
  },
  menuBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 6,
    paddingHorizontal: 10,
    borderRadius: 999,
    borderWidth: 1,
  },
  menuPrimary: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  menuSecondary: {
    backgroundColor: colors.background.surface,
    borderColor: colors.border.light,
  },
  menuIcon: {
    marginRight: 6,
  },
  menuText: {
    fontSize: typography.fontSize.sm,
    color: colors.text.primary,
  },
});


