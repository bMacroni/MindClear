import * as React from 'react';
import { useEffect, useMemo, useState, useCallback } from 'react';
import { View, Text, StyleSheet, FlatList, TouchableOpacity, LayoutAnimation, TextInput } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import BrainDumpSubNav from './BrainDumpSubNav';
import Icon from 'react-native-vector-icons/Octicons';
import { colors } from '../../themes/colors';
import { spacing, borderRadius } from '../../themes/spacing';
import { typography } from '../../themes/typography';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useBrainDump } from '../../contexts/BrainDumpContext';
import { authService } from '../../services/auth';
import { configService } from '../../services/config';
import { secureConfigService } from '../../services/secureConfig';
import logger from '../../utils/logger';

// Helper function to get secure API base URL
const getSecureApiBaseUrl = (): string => {
  try {
    return secureConfigService.getApiBaseUrl();
  } catch (error) {
    logger.warn('Failed to get secure API base URL, falling back to config service:', error);
    return configService.getBaseUrl();
  }
};
import { SuccessToast } from '../../components/common/SuccessToast';
import { ErrorToast } from '../../components/common/ErrorToast';
import { useFocusEffect } from '@react-navigation/native';

type Item = { id: string; text: string; type: 'task'|'goal'; confidence?: number; category?: string | null; stress_level?: 'low'|'medium'|'high'; priority: 'low'|'medium'|'high' };

export default function BrainDumpRefinementScreen({ navigation, route }: any) {
  const params = route?.params || {};
  const { threadId, setThreadId, items, setItems } = useBrainDump();
  const [tab, setTab] = useState<'task'|'goal'>('task');
  
  // Helper function to generate unique IDs
  const generateId = () => `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  
  const sanitizeText = (text: string): string => {
    return String(text || '')
      .replace(/\r?\n|\r/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  };

  // Normalize item data to handle legacy items with missing fields
  const normalizeItem = (item: any): Item => {
    return {
      id: item.id || generateId(),
      text: sanitizeText(item.text || ''),
      type: item.type || 'task', // Default to 'task' for legacy data
      confidence: item.confidence,
      category: item.category || null,
      stress_level: item.stress_level || undefined, // Keep undefined for missing stress_level
      priority: item.priority || 'medium' // Default to 'medium' priority for legacy data
    };
  };

  // Initialize with sanitized items if provided via route; otherwise we'll load from storage
  const [editedItems, setEditedItems] = useState<Item[]>(() =>
    (Array.isArray(params?.items) ? (params.items as Item[]) : (items as unknown as Item[]))
      .map((it: any) => normalizeItem(it))
      .filter((it: Item) => it.text.length > 0)
  );
  const [toastVisible, setToastVisible] = useState(false);
  const [toastMessage, setToastMessage] = useState('');
  const [errorToastVisible, setErrorToastVisible] = useState(false);
  const [errorToastMessage, setErrorToastMessage] = useState('');
  const [initialToastShown, setInitialToastShown] = useState(false);

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
          setEditedItems(parsed.map((it: any) => normalizeItem(it)).filter((it: Item) => it.text.length > 0));
        }
      } catch {}
    })();
   
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


  const startGoalBreakdown = async (item: Item) => {
    try {
      // Skip if threadId is missing
      if (!threadId) {
        return;
      }

      // Update conversation thread title to the goal text
      const token = await authService.getAuthToken();
      if (token) {
        const baseUrl = getSecureApiBaseUrl();
        
        // Create AbortController with 4 second timeout
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 4000);
        
        try {
          const response = await fetch(`${baseUrl}/ai/threads/${threadId}`, {
            method: 'PUT',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${token}`,
            },
            body: JSON.stringify({ title: item.text }),
            signal: controller.signal,
          });
          
          // Clear timeout on success
          clearTimeout(timeoutId);
          
          // Check if response is successful
          if (!response.ok) {
            throw new Error(`HTTP ${response.status}: ${response.statusText}`);
          }
        } catch (fetchError) {
          // Clear timeout on error
          clearTimeout(timeoutId);
          
          // Handle different error types
          if (fetchError instanceof Error && fetchError.name === 'AbortError') {
            setErrorToastMessage('Could not update conversation title - request timed out');
          } else if (fetchError instanceof Error) {
            setErrorToastMessage('Could not update conversation title');
          } else {
            setErrorToastMessage('Could not update conversation title');
          }
          
          // Show error toast
          setErrorToastVisible(true);
          
          // Re-throw to maintain existing error handling flow
          throw fetchError;
        }
      }
    } catch (error) {
      // Error toast is already shown above, so we don't need to show it again here
    }
    // Remove the goal from the refinement list
    setEditedItems(prev => prev.filter(i => i.id !== item.id));
    // Navigate to chat with the prefilled message so title can be inferred
    navigation.navigate('AIChat', { initialMessage: `Help me break down this goal: ${item.text}`, threadId });
  };



  const setType = (target: Item, newType: 'task'|'goal') => {
    if (target.type === newType) {return;}
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setEditedItems(prev => prev.map(it => {
      if (it.id === target.id) {
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
    setEditedItems(prev => prev.map(it => it.id === target.id ? { ...it, text: sanitized } : it));
  };

  const goToPrioritize = () => {
    if (tasks.length === 0) {return;}
    const payload = tasks.map(t => ({ id: t.id, text: sanitizeText(t.text), priority: t.priority, category: t.category ?? undefined }));
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
        keyExtractor={(it) => it.id}
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
            {editingKey === item.id ? (
              <TextInput
                style={[styles.input, { marginTop: spacing.xs }]}
                value={item.text}
                onChangeText={(t)=>onChangeItemText(item, t)}
                onBlur={()=>setEditingKey(null)}
                autoFocus
              />
            ) : (
              <Text onPress={()=>setEditingKey(item.id)} style={styles.titleText} ellipsizeMode="tail">{sanitizeText(item.text)}</Text>
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

      <ErrorToast
        visible={errorToastVisible}
        message={errorToastMessage}
        onClose={() => setErrorToastVisible(false)}
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


