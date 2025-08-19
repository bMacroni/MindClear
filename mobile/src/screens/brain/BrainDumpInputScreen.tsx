import React, { useCallback, useEffect, useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet, KeyboardAvoidingView, Platform, ScrollView } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import BrainDumpSubNav from './BrainDumpSubNav';
import Icon from 'react-native-vector-icons/Octicons';
import { colors } from '../../themes/colors';
import { spacing, borderRadius } from '../../themes/spacing';
import { typography } from '../../themes/typography';
import { brainDumpAPI, tasksAPI } from '../../services/api';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useBrainDump } from '../../contexts/BrainDumpContext';
import { useFocusEffect } from '@react-navigation/native';

type IncomingItem = {
  text: string;
  category?: string | null;
  stress_level: 'low' | 'medium' | 'high';
  priority: 'low' | 'medium' | 'high';
  type?: 'task' | 'goal';
  confidence?: number;
};

export default function BrainDumpInputScreen({ navigation }: any) {
  const [text, setText] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [hasSavedRefinement, setHasSavedRefinement] = useState<boolean>(false);
  const { items: sessionItems, setItems: setSessionItems, setThreadId } = useBrainDump();

  useEffect(() => {
    (async () => {
      try {
        const tid = await AsyncStorage.getItem('lastBrainDumpThreadId');
        const items = await AsyncStorage.getItem('lastBrainDumpItems');
        setHasSavedRefinement(Boolean(tid && items));
      } catch {}
    })();
  }, []);

  useFocusEffect(
    useCallback(() => {
      (async () => {
        try {
          const tid = await AsyncStorage.getItem('lastBrainDumpThreadId');
          const items = await AsyncStorage.getItem('lastBrainDumpItems');
          setHasSavedRefinement(Boolean(tid && items));
        } catch {
          setHasSavedRefinement(false);
        }
      })();
    }, [])
  );

  const normalizeKey = (s: string) => String(s || '').replace(/\r?\n|\r/g, ' ').replace(/\s+/g, ' ').trim().toLowerCase();
  const sanitizeText = (s: string) => String(s || '').replace(/\r?\n|\r/g, ' ').replace(/\s+/g, ' ').trim();

  const onSubmit = async () => {
    if (!text.trim() || loading) {return;}
    setLoading(true);
    setError('');
    try {
      const { threadId, items } = await brainDumpAPI.submit(text.trim());
      // Merge with existing saved items if any
      let mergedItems: any[] = [];
      try {
        const existingStr = await AsyncStorage.getItem('lastBrainDumpItems');
        const existing: any[] = existingStr ? JSON.parse(existingStr) : [];
        const map = new Map<string, any>();
        existing.forEach((it) => {
          const key = normalizeKey(it?.text);
          if (key) {map.set(key, { ...it, text: sanitizeText(it?.text) });}
        });
        (Array.isArray(items) ? (items as IncomingItem[]) : []).forEach((it) => {
          const key = normalizeKey(it?.text);
          if (!key) {return;}
          if (!map.has(key)) {
            map.set(key, {
              text: sanitizeText(it?.text),
              type: it?.type && /^(task|goal)$/i.test(it.type) ? (it.type as string).toLowerCase() : 'task',
              confidence: typeof it?.confidence === 'number' ? it.confidence : 0.7,
              category: it?.category ?? null,
              stress_level: /^(low|medium|high)$/i.test(it?.stress_level) ? it.stress_level.toLowerCase() : 'medium',
              priority: it?.priority && /^(low|medium|high)$/i.test(it.priority) ? (it.priority as string).toLowerCase() : (
                /^(low|medium|high)$/i.test(it?.stress_level) ? it.stress_level.toLowerCase() : 'medium'
              ),
            });
          }
        });
        mergedItems = Array.from(map.values());
      } catch {
        mergedItems = (Array.isArray(items) ? (items as IncomingItem[]) : []).map((it) => ({
          text: sanitizeText(it?.text),
          type: it?.type && /^(task|goal)$/i.test(it.type) ? (it.type as string).toLowerCase() : 'task',
          confidence: typeof it?.confidence === 'number' ? it.confidence : 0.7,
          category: it?.category ?? null,
          stress_level: /^(low|medium|high)$/i.test(it?.stress_level) ? it.stress_level.toLowerCase() : 'medium',
          priority: it?.priority && /^(low|medium|high)$/i.test(it.priority) ? (it.priority as string).toLowerCase() : (
            /^(low|medium|high)$/i.test(it?.stress_level) ? it.stress_level.toLowerCase() : 'medium'
          ),
        }));
      }
      let duplicatesRemovedCount = 0;
      try {
        // Remove items that already exist as tasks (by normalized title, excluding completed)
        const existingTasks = await tasksAPI.getTasks();
        const existingActiveTitles = new Set(
          (Array.isArray(existingTasks) ? existingTasks : [])
            .filter((t: any) => String(t?.status || '').toLowerCase() !== 'completed')
            .map((t: any) => normalizeKey(t?.title))
            .filter(Boolean)
        );
        const beforeCount = mergedItems.length;
        mergedItems = mergedItems.filter((it: any) => {
          const key = normalizeKey(it?.text);
          // Only treat tasks as duplicates; keep goals
          const isTask = (String(it?.type || 'task').toLowerCase() === 'task');
          return !(isTask && existingActiveTitles.has(key));
        });
        duplicatesRemovedCount = Math.max(0, beforeCount - mergedItems.length);

        await AsyncStorage.multiSet([
          ['lastBrainDumpThreadId', threadId],
          ['lastBrainDumpItems', JSON.stringify(mergedItems)],
        ]);
        setHasSavedRefinement(true);
      } catch {}
      // Update shared session so SubNav enables Refine/Prioritize immediately
      try {
        setThreadId(threadId);
        setSessionItems(mergedItems as any);
      } catch {}
      navigation.navigate('BrainDumpRefinement', { threadId, items: mergedItems, duplicatesRemovedCount });
    } catch (e: any) {
      setError(e?.message || 'Failed to process brain dump. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const handleBackToRefinement = async () => {
    if (navigation.canGoBack()) {
      navigation.goBack();
      return;
    }
    try {
      const [tid, itemsStr] = await AsyncStorage.multiGet(['lastBrainDumpThreadId', 'lastBrainDumpItems']).then(entries => entries.map(e => e[1]));
      if (tid && itemsStr) {
        const parsed = JSON.parse(itemsStr);
        if (Array.isArray(parsed)) {
          navigation.navigate('BrainDumpRefinement', { threadId: tid, items: parsed });
          return;
        }
      }
    } catch {}
  };

  return (
    <SafeAreaView style={styles.container} edges={['top', 'left', 'right']}>      
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
        <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
          <View style={styles.headerRow}>
            <Text style={styles.title}>Guided Brain Dump</Text>
          </View>
          <BrainDumpSubNav
            active="dump"
            navigation={navigation}
            canRefine={(Array.isArray(sessionItems) && sessionItems.some((it: any) => (it?.type || '').toLowerCase() === 'task' || (it?.type || '').toLowerCase() === 'goal')) || hasSavedRefinement}
            canPrioritize={(Array.isArray(sessionItems) && sessionItems.some((it: any) => (it?.type || '').toLowerCase() === 'task')) || hasSavedRefinement}
          />
          <Text style={styles.subtitle}>Type anything that’s on your mind. We’ll gently help you turn it into one small, doable step.</Text>
          <TextInput
            style={styles.textarea}
            placeholder="What’s on your mind?"
            multiline
            value={text}
            onChangeText={setText}
            editable={!loading}
            textAlignVertical="top"
          />
          {!!error && <Text style={styles.error}>{error}</Text>}

          <TouchableOpacity style={[styles.cta, loading && { opacity: 0.7 }]} onPress={onSubmit} disabled={loading}>
            <Icon name="north-star" size={18} color={colors.secondary} style={{ marginRight: spacing.xs }} />
            <Text style={styles.ctaText}>{loading ? 'Working…' : 'Untangle My Thoughts'}</Text>
          </TouchableOpacity>

          <View style={styles.privacyBox}>
            <Icon name="shield" size={16} color={colors.text.secondary} style={{ marginRight: spacing.xs }} />
            <Text style={styles.privacyText}>Your brain dump is private to you. We store it securely and only use it to help you organize your thoughts. You’re always in control.</Text>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background.surface },
  content: { padding: spacing.lg },
  title: { fontSize: typography.fontSize.xl, fontWeight: typography.fontWeight.bold, color: colors.text.primary, marginBottom: spacing.xs },
  headerRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  backRefineBtn: { flexDirection: 'row', alignItems: 'center', paddingVertical: spacing.xs, paddingHorizontal: spacing.sm, borderWidth: 1, borderColor: colors.border.light, borderRadius: borderRadius.sm, backgroundColor: colors.background.surface },
  backRefineText: { color: colors.text.primary, fontSize: typography.fontSize.sm, fontWeight: typography.fontWeight.medium },
  subtitle: { fontSize: typography.fontSize.sm, color: colors.text.secondary, marginBottom: spacing.md },
  textarea: {
    minHeight: 220,
    borderColor: colors.border.light,
    borderWidth: 1,
    borderRadius: borderRadius.md,
    backgroundColor: colors.secondary,
    padding: spacing.md,
    color: colors.text.primary,
    marginBottom: spacing.md,
  },
  cta: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.primary,
    paddingVertical: spacing.md,
    borderRadius: borderRadius.md,
  },
  ctaText: { color: colors.secondary, fontWeight: typography.fontWeight.bold, fontSize: typography.fontSize.base },
  privacyBox: { flexDirection: 'row', alignItems: 'flex-start', padding: spacing.md, marginTop: spacing.md },
  privacyText: { color: colors.text.secondary, fontSize: typography.fontSize.xs, flex: 1 },
  error: { color: colors.error, marginBottom: spacing.sm },
});


