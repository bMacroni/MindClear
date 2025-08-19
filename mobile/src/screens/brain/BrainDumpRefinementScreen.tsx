import React, { useEffect, useMemo, useState, useCallback } from 'react';
import { View, Text, StyleSheet, FlatList, TouchableOpacity, LayoutAnimation, Platform, UIManager, TextInput } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import BrainDumpSubNav from './BrainDumpSubNav';
import Icon from 'react-native-vector-icons/Octicons';
import { colors } from '../../themes/colors';
import { spacing, borderRadius } from '../../themes/spacing';
import { typography } from '../../themes/typography';
import { tasksAPI } from '../../services/api';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useBrainDump } from '../../contexts/BrainDumpContext';
import { SuccessToast } from '../../components/common/SuccessToast';
import { useFocusEffect } from '@react-navigation/native';

type Item = { text: string; type: 'task'|'goal'; confidence?: number; category?: string | null; stress_level: 'low'|'medium'|'high'; priority: 'low'|'medium'|'high' };

export default function BrainDumpRefinementScreen({ navigation, route }: any) {
  const params = route?.params || {};
  const { threadId, setThreadId, items, setItems } = useBrainDump();
  const [saving, setSaving] = useState(false);
  const [tab, setTab] = useState<'task'|'goal'>('task');
  const sanitizeText = (text: string): string => {
    return String(text || '')
      .replace(/\r?\n|\r/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  };
  const normalizeKey = (text: string): string => sanitizeText(text).toLowerCase();

  // Initialize with sanitized items if provided via route; otherwise we'll load from storage
  const [editedItems, setEditedItems] = useState<Item[]>(() =>
    (Array.isArray(params?.items) ? (params.items as Item[]) : (items as unknown as Item[]))
      .map((it: Item) => ({ ...it, text: sanitizeText(it.text) }))
      .filter((it: Item) => it.text.length > 0)
  );
  const [toastVisible, setToastVisible] = useState(false);
  const [toastMessage, setToastMessage] = useState('');
  const [initialToastShown, setInitialToastShown] = useState(false);
  const [inFlightKeys, setInFlightKeys] = useState<Set<string>>(new Set());

  const list = useMemo(()=> Array.isArray(editedItems) ? editedItems : [], [editedItems]);
  const tasks = useMemo(()=> list.filter(i=>i.type==='task'), [list]);
  const goals = useMemo(()=> list.filter(i=>i.type==='goal'), [list]);

  // If navigated without params, try loading last session from AsyncStorage
  useEffect(() => {
    (async () => {
      if ((params?.items && Array.isArray(params.items)) && params?.threadId) { return; }
      try {
        const [tid, itemsStr] = await AsyncStorage.multiGet(['lastBrainDumpThreadId', 'lastBrainDumpItems']).then(entries => entries.map(e => e[1]));
        const parsed = itemsStr ? JSON.parse(itemsStr) : [];
        if (tid) { setThreadId(tid); }
        if (Array.isArray(parsed) && parsed.length > 0 && editedItems.length === 0 && (items?.length ?? 0) === 0) {
          setEditedItems(parsed.map((it: Item) => ({ ...it, text: sanitizeText((it as any)?.text) } as Item)).filter((it: Item) => it.text.length > 0));
        }
      } catch {}
    })();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Show toast if duplicates were removed on entry
  useEffect(() => {
    const count = Number(params?.duplicatesRemovedCount || 0);
    if (!initialToastShown && count > 0) {
      setToastMessage(count === 1 ? '1 item was already in your Tasks and was skipped.' : `${count} items were already in your Tasks and were skipped.`);
      setToastVisible(true);
      setInitialToastShown(true);
    }
  }, [params?.duplicatesRemovedCount, initialToastShown]);

  // Persist latest refinement session so user can return later
  useEffect(() => {
    setItems(editedItems as any);
  }, [editedItems, setItems]);

  // If the shared session is cleared (e.g., after Save & Finish), clear local list
  useEffect(() => {
    if ((items?.length ?? 0) === 0 && editedItems.length > 0) {
      setEditedItems([]);
    }
  }, [items, editedItems.length]);

  // On focus, re-check storage; if nothing is saved, clear local list
  useFocusEffect(
    useCallback(() => {
      (async () => {
        try {
          const [sessionStr, lastItemsStr] = await AsyncStorage.multiGet(['brainDumpSession', 'lastBrainDumpItems']).then(entries => entries.map(e => e[1]));
          const sessionHasItems = (() => {
            try {
              const parsed = sessionStr ? JSON.parse(sessionStr) : null;
              return Array.isArray(parsed?.items) && parsed.items.length > 0;
            } catch { return false; }
          })();
          const lastHasItems = (() => {
            try {
              const parsed = lastItemsStr ? JSON.parse(lastItemsStr) : [];
              return Array.isArray(parsed) && parsed.length > 0;
            } catch { return false; }
          })();
          if (!sessionHasItems && !lastHasItems) {
            setEditedItems([]);
          }
        } catch {}
      })();
    }, [])
  );

  // LayoutAnimation enabling is a no-op in the New Architecture; avoid calling to prevent warnings.

  const createFocusTask = async (item: Item) => {
    if (saving) {return;}
    const key = normalizeKey(item.text);
    if (inFlightKeys.has(key)) {return;}
    setInFlightKeys(prev => new Set(prev).add(key));
    setSaving(true);
    try {
      // 1) Create the focus task
      await tasksAPI.createTask({
        title: sanitizeText(item.text),
        description: '',
        priority: item.priority,
        category: item.category || undefined,
        is_today_focus: true,
      } as any);

      // 2) Save remaining tasks to Inbox (non-focus)
      const remainder = tasks
        .filter(t => t.text !== item.text)
        .reduce((acc: Item[], cur) => {
          const k = normalizeKey(cur.text);
          if (!acc.some(x => normalizeKey(x.text) === k)) {acc.push(cur);}
          return acc;
        }, []);
      if (remainder.length > 0) {
        const bulk = remainder.map((it) => ({
          title: sanitizeText(it.text),
          description: '',
          priority: it.priority,
          category: it.category || undefined,
          is_today_focus: false,
        }));
        await tasksAPI.bulkCreateTasks(bulk as any);
      }

      // 3) Update UI: remove task items from refinement list
      setEditedItems(prev => prev.filter(i => i.type !== 'task'));

      // 4) Persist a flag to hint Tasks screen to refresh on focus
      try { await AsyncStorage.setItem('needsTasksRefresh', '1'); } catch {}

      // 5) Show confirmation toast
      const savedCount = remainder.length;
      const message = savedCount > 0
        ? `Set "${sanitizeText(item.text)}" as Today's Focus and saved ${savedCount} task${savedCount === 1 ? '' : 's'} to your Inbox.`
        : `Set "${sanitizeText(item.text)}" as Today's Focus.`;
      setToastMessage(message);
      setToastVisible(true);
    } catch (e) {
      setToastMessage('Something went wrong setting Today\'s Focus.');
      setToastVisible(true);
    } finally {
      setSaving(false);
      setInFlightKeys(prev => {
        const next = new Set(prev);
        next.delete(key);
        return next;
      });
    }
  };

  const startGoalBreakdown = async (item: Item) => {
    try {
      // Update conversation thread title to the goal text
      const token = await AsyncStorage.getItem('authToken');
      await fetch('http://192.168.1.66:5000/api/ai/threads/' + threadId, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
        body: JSON.stringify({ title: item.text }),
      });
    } catch {}
    // Remove the goal from the refinement list
    setEditedItems(prev => prev.filter(i => !(i.type === 'goal' && i.text === item.text)));
    // Navigate to chat with the prefilled message so title can be inferred
    navigation.navigate('AIChat', { initialMessage: `Help me break down this goal: ${item.text}`, threadId });
  };

  const saveRemainderToInbox = async () => {
    if (saving) {return;}
    setSaving(true);
    try {
      // De-dupe within the list on normalized title
      const uniqueTasks = tasks.reduce((acc: Item[], cur) => {
        const k = normalizeKey(cur.text);
        if (!acc.some(x => normalizeKey(x.text) === k)) {acc.push(cur);}
        return acc;
      }, []);
      const savedCount = uniqueTasks.length;
      const bulk = uniqueTasks.map((it)=>({
        title: sanitizeText(it.text),
        description: '',
        priority: it.priority,
        category: it.category || undefined,
        is_today_focus: false,
      }));
      await tasksAPI.bulkCreateTasks(bulk as any);
      setToastMessage(savedCount === 1 ? 'Saved 1 task to your Inbox under Tasks.' : `Saved ${savedCount} tasks to your Inbox under Tasks.`);
      setToastVisible(true);
      // Hide saved tasks from the refinement screen
      setEditedItems(prev => prev.filter(i => i.type !== 'task'));
    } catch {}
    setSaving(false);
  };

  const flipType = (target: Item) => {
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setEditedItems(prev => prev.map(it => {
      if (it.text === target.text) {
        const newType = it.type === 'task' ? 'goal' : 'task';
        setToastMessage(`Marked as ${newType}.`);
        setToastVisible(true);
        return { ...it, type: newType } as Item;
      }
      return it;
    }));
  };

  const setType = (target: Item, newType: 'task'|'goal') => {
    if (target.type === newType) {return;}
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setEditedItems(prev => prev.map(it => {
      if (it.text === target.text) {
        return { ...it, type: newType } as Item;
      }
      return it;
    }));
    setToastMessage(`Marked as ${newType}.`);
    setToastVisible(true);
  };

  const [editingKey, setEditingKey] = useState<string | null>(null);

  const onChangeItemText = (target: Item, text: string) => {
    const sanitized = sanitizeText(text);
    setEditedItems(prev => prev.map(it => (it === target || it.text === target.text) ? { ...it, text: sanitized } : it));
  };

  const goToPrioritize = () => {
    if (tasks.length === 0) {return;}
    const payload = tasks.map(t => ({ text: sanitizeText(t.text), priority: t.priority, category: t.category ?? undefined }));
    navigation.navigate('BrainDumpPrioritization', { tasks: payload });
  };

  return (
    <SafeAreaView style={styles.container} edges={['top', 'left', 'right']}>
      <View style={styles.headerRow}>
        <Text style={styles.title}>Let’s pick one small step</Text>
      </View>
      <BrainDumpSubNav active="refine" navigation={navigation} canRefine={true} canPrioritize={tasks.length>0} />
      <View style={styles.tabs}>
        <TouchableOpacity style={[styles.tabBtn, tab==='task' && styles.tabBtnActive]} onPress={()=>setTab('task')}>
          <Text style={[styles.tabText, tab==='task' && styles.tabTextActive]}>Tasks ({tasks.length})</Text>
        </TouchableOpacity>
        <TouchableOpacity style={[styles.tabBtn, tab==='goal' && styles.tabBtnActive]} onPress={()=>setTab('goal')}>
          <Text style={[styles.tabText, tab==='goal' && styles.tabTextActive]}>Goals ({goals.length})</Text>
        </TouchableOpacity>
      </View>

      <View style={styles.tipBox}>
        <Text style={styles.tipText}>Tip: Don't worry about getting it perfect. You can edit all details later.</Text>
      </View>

      <FlatList
        data={tab==='task' ? tasks : goals}
        keyExtractor={(it, idx)=>`${idx}-${it.text}`}
        contentContainerStyle={{ padding: spacing.md }}
        renderItem={({ item }) => (
          <View style={styles.card}>
            <View style={styles.badges}>
              <View style={styles.segmented}>
                <TouchableOpacity
                  onPress={() => setType(item, 'task')}
                  activeOpacity={0.8}
                  style={[styles.segment, item.type==='task' && styles.segmentActive]}
                >
                  <Icon name="checklist" size={12} color={item.type==='task' ? colors.secondary : colors.text.secondary} style={{ marginRight: 4 }} />
                  <Text style={[styles.segmentLabel, item.type==='task' && styles.segmentLabelActive]}>Task</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  onPress={() => setType(item, 'goal')}
                  activeOpacity={0.8}
                  style={[styles.segment, item.type==='goal' && styles.segmentActive]}
                >
                  <Icon name="milestone" size={12} color={item.type==='goal' ? colors.secondary : colors.text.secondary} style={{ marginRight: 4 }} />
                  <Text style={[styles.segmentLabel, item.type==='goal' && styles.segmentLabelActive]}>Goal</Text>
                </TouchableOpacity>
              </View>
              {!!item.category && (
                <View style={styles.badge}><Text style={styles.badgeText}>{item.category}</Text></View>
              )}
              <View style={[styles.badge, styles[item.priority]]}><Text style={[styles.badgeText, styles.badgeTextDark]}>{item.priority}</Text></View>
            </View>
            {editingKey === item.text ? (
              <TextInput
                style={[styles.input, { marginTop: spacing.xs }]}
                value={item.text}
                onChangeText={(t)=>onChangeItemText(item, t)}
                onBlur={()=>setEditingKey(null)}
                autoFocus
              />
            ) : (
              <Text onPress={()=>setEditingKey(item.text)} style={styles.titleText} ellipsizeMode="tail">{sanitizeText(item.text)}</Text>
            )}
            {item.type==='goal' ? (
              <TouchableOpacity onPress={() => startGoalBreakdown(item)}>
                <Text style={styles.hint}>Tap to break this goal into tiny steps</Text>
              </TouchableOpacity>
            ) : (
              <Text style={styles.hint}>Tap text to edit. Use toggles to mark as Task or Goal.</Text>
            )}
          </View>
        )}
      />

      <View style={styles.footer}>
        <TouchableOpacity testID="nextPrioritizeButton" style={[styles.primaryBtn, (tasks.length===0) && { opacity: 0.6 }]} disabled={tasks.length===0} onPress={goToPrioritize}>
          <Text style={styles.primaryBtnText}>Next: Prioritize Tasks</Text>
        </TouchableOpacity>
      </View>

      <SuccessToast
        visible={toastVisible}
        message={toastMessage}
        actionLabel="Open Tasks"
        onActionPress={() => navigation.navigate('Tasks')}
        onClose={() => setToastVisible(false)}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background.surface },
  title: { fontSize: typography.fontSize.lg, fontWeight: typography.fontWeight.bold, color: colors.text.primary, padding: spacing.md },
  headerRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  newDumpBtn: { flexDirection: 'row', alignItems: 'center', marginRight: spacing.md, paddingVertical: spacing.xs, paddingHorizontal: spacing.sm, borderWidth: 1, borderColor: colors.border.light, borderRadius: borderRadius.sm, backgroundColor: colors.background.surface },
  newDumpText: { color: colors.text.primary, fontSize: typography.fontSize.sm, fontWeight: typography.fontWeight.medium },
  tabs: { flexDirection: 'row', marginHorizontal: spacing.md, borderWidth: 1, borderColor: colors.border.light, borderRadius: borderRadius.md, overflow: 'hidden' },
  tabBtn: { flex: 1, paddingVertical: spacing.sm, alignItems: 'center', backgroundColor: colors.secondary },
  tabBtnActive: { backgroundColor: colors.primary },
  tabText: { color: colors.text.primary },
  tabTextActive: { color: colors.secondary, fontWeight: typography.fontWeight.bold },
  tipBox: { marginHorizontal: spacing.md, marginTop: spacing.sm, padding: spacing.sm, backgroundColor: colors.secondary, borderWidth: 1, borderColor: colors.border.light, borderRadius: borderRadius.md },
  tipText: { color: colors.text.secondary, fontSize: typography.fontSize.xs },
  card: { borderWidth: 1, borderColor: colors.border.light, backgroundColor: colors.secondary, borderRadius: borderRadius.md, padding: spacing.md, marginBottom: spacing.sm },
  row: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between' },
  text: { color: colors.text.primary, fontSize: typography.fontSize.base, flex: 1, paddingRight: spacing.sm },
  titleText: { color: colors.text.primary, fontSize: typography.fontSize.base, marginTop: spacing.xs },
  input: { color: colors.text.primary, fontSize: typography.fontSize.base, flex: 1, paddingRight: spacing.sm, borderWidth: 1, borderColor: colors.border.light, backgroundColor: colors.secondary, borderRadius: borderRadius.sm, paddingHorizontal: spacing.sm, paddingVertical: spacing.xs },
  badges: { flexDirection: 'row', alignItems: 'center' },
  badge: { borderWidth: 1, borderColor: colors.border.light, borderRadius: 999, paddingVertical: 2, paddingHorizontal: 8, marginLeft: spacing.xs },
  badgeType: { backgroundColor: '#E6E6E6', borderColor: '#D0D0D0' },
  badgeText: { color: colors.text.secondary, fontSize: typography.fontSize.xs },
  badgeTextDark: { color: colors.text.primary },
  segmented: {
    flexDirection: 'row',
    borderWidth: 1,
    borderColor: colors.border.light,
    borderRadius: 999,
    overflow: 'hidden',
    marginLeft: spacing.xs,
  },
  segment: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 2,
    paddingHorizontal: 8,
    backgroundColor: colors.secondary,
  },
  segmentActive: {
    backgroundColor: colors.primary,
  },
  segmentLabel: {
    color: colors.text.secondary,
    fontSize: typography.fontSize.xs,
  },
  segmentLabelActive: {
    color: colors.secondary,
    fontWeight: typography.fontWeight.bold,
  },
  low: { backgroundColor: '#E8F5E9', borderColor: '#C8E6C9' },
  medium: { backgroundColor: '#FFFDE7', borderColor: '#FFF9C4' },
  high: { backgroundColor: '#FFEBEE', borderColor: '#FFCDD2' },
  hint: { color: colors.text.secondary, fontSize: typography.fontSize.xs, marginTop: spacing.xs },
  footer: { flexDirection: 'row', justifyContent: 'space-between', padding: spacing.md, borderTopWidth: 1, borderTopColor: colors.border.light },
  secondaryBtn: { flexDirection: 'row', alignItems: 'center' },
  secondaryBtnText: { color: colors.text.primary },
  primaryBtn: { backgroundColor: colors.primary, paddingVertical: spacing.sm, paddingHorizontal: spacing.md, borderRadius: borderRadius.md },
  primaryBtnText: { color: colors.secondary, fontWeight: typography.fontWeight.bold },
});


