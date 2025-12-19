import React, { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet, ScrollView, ActivityIndicator, Platform, Animated, Dimensions, Alert } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { StatusBar } from 'react-native';
import { KeyboardAvoidingView } from 'react-native';
import Icon from 'react-native-vector-icons/Octicons';
import axios from 'axios';
import { colors } from '../../themes/colors';
import { typography } from '../../themes/typography';
import { spacing, borderRadius } from '../../themes/spacing';
import ScreenHeader from '../../components/common/ScreenHeader';
import { OnboardingState, QuickAction } from '../../types/onboarding';
import { OnboardingService } from '../../services/onboarding';
import { configService } from '../../services/config';
import { authService } from '../../services/auth';
import secureConfigService from '../../services/secureConfig';
import analyticsService from '../../services/analyticsService';
import logger from '../../utils/logger';
import withObservables from '@nozbe/watermelondb/react/withObservables';
import { useDatabase } from '../../contexts/DatabaseContext';
import { Q, Database } from '@nozbe/watermelondb';
import type { Observable } from 'rxjs';
import ConversationThread from '../../db/models/ConversationThread';
import ConversationMessage from '../../db/models/ConversationMessage';
import { conversationRepository } from '../../repositories/ConversationRepository';
import { goalRepository } from '../../repositories/GoalRepository';
import { syncService } from '../../services/SyncService';
import { conversationService } from '../../services/conversationService';
import { safeParseDate } from '../../utils/dateUtils';
import { GoalData } from '../../types/goal';
import QuickActions from '../../components/ai/QuickActions';
import ScheduleDisplay from '../../components/ai/ScheduleDisplay';
import GoalBreakdownDisplay from '../../components/ai/GoalBreakdownDisplay';
import GoalTitlesDisplay from '../../components/ai/GoalTitlesDisplay';
import TaskDisplay, { Task as TaskDataFromDisplay } from '../../components/ai/TaskDisplay';
import Markdown from 'react-native-markdown-display';
import { taskRepository } from '../../repositories/TaskRepository';
import Task from '../../db/models/Task';

const validGoalCategories = ['career', 'health', 'personal', 'education', 'finance', 'relationships', 'other'];

function mapToValidCategory(input?: string): string {
  if (!input) {
    return 'other';
  }
  const lowerInput = input.toLowerCase();

  if (validGoalCategories.includes(lowerInput)) {
    return lowerInput;
  }

  const categoryMap: { [key: string]: string } = {
    work: 'career',
    business: 'career',
    job: 'career',
    fitness: 'health',
    wellbeing: 'health',
    wellness: 'health',
    learn: 'education',
    study: 'education',
    school: 'education',
    money: 'finance',
    budget: 'finance',
    family: 'relationships',
    friends: 'relationships',
    love: 'relationships',
  };

  for (const key in categoryMap) {
    if (lowerInput.includes(key)) {
      return categoryMap[key];
    }
  }

  const priorities = ['low', 'medium', 'high'];
  if (priorities.includes(lowerInput)) {
    return 'other';
  }

  return 'other';
}

const BULK_DELETE_CONCURRENCY = 3;
const BULK_DELETE_TIMEOUT_MS = 25000;

// Helper function to get secure API base URL
const getSecureApiBaseUrl = (): string => {
  try {
    return secureConfigService.getApiBaseUrl();
  } catch (error) {
    logger.warn('Failed to get secure API base URL, falling back to config service:', error);
    return configService.getBaseUrl();
  }
};

interface Message {
  id: string; // Changed to string to use WatermelonDB IDs directly
  text: string;
  sender: 'user' | 'ai';
  status?: string; // For sync status: 'synced', 'pending_create', etc.
  messageId?: string; // WatermelonDB message ID for status lookups (same as id)
}

interface Conversation {
  id: string;
  title: string;
  messages: Message[];
  isPinned: boolean;
  createdAt: Date;
  lastMessageAt: Date;
}

// Internal props interface - what the component actually uses
interface InternalAIChatScreenProps {
  threads: ConversationThread[];
  database: Database;
  navigation: any;
  route: any;
}

function AIChatScreen({ navigation, route, threads: observableThreads, database }: InternalAIChatScreenProps) {
  const insets = useSafeAreaInsets();
  const screenWidth = Dimensions.get('window').width;
  
  // Animation for sidebar
  const sidebarAnimation = useRef(new Animated.Value(-screenWidth * 0.8)).current;
  const overlayAnimation = useRef(new Animated.Value(0)).current;
  
  // Convert WatermelonDB threads to Conversation format and sort by most recent
  const threads = useMemo(() => {
    const allThreads = observableThreads || [];
    // Sort: pinned threads first, then by updatedAt descending (most recent first)
    return [...allThreads].sort((a, b) => {
      // Pinned threads come first
      if (a.isPinned && !b.isPinned) return -1;
      if (!a.isPinned && b.isPinned) return 1;
      // Then sort by updatedAt descending (most recent first)
      return b.updatedAt.getTime() - a.updatedAt.getTime();
    });
  }, [observableThreads]);
  const [currentConversationId, setCurrentConversationId] = useState<string>('');
  
  // Observe messages for current thread
  const messagesQuery = useMemo(() => {
    if (!currentConversationId) return null;
    return database.collections.get<ConversationMessage>('conversation_messages')
      .query(
        Q.where('thread_id', currentConversationId)
      )
      .observe();
  }, [currentConversationId, database]);
  
  // Convert threads to Conversation format for display
  const conversations: Conversation[] = useMemo(() => {
    return threads.map(thread => ({
      id: thread.id,
      title: thread.title,
      messages: [], // Will be populated from messages query
      isPinned: thread.isPinned || false,
      createdAt: thread.createdAt,
      lastMessageAt: thread.updatedAt,
    }));
  }, [threads]);
  
  // Set initial conversation ID if not set and threads exist
  useEffect(() => {
    if (!currentConversationId && threads.length > 0) {
      setCurrentConversationId(threads[0].id);
    }
  }, [threads, currentConversationId]);
  
  // Trigger background sync on mount if needed
  useEffect(() => {
    syncService.silentSync().catch(err => {
      logger.warn('Background sync failed:', err);
    });
  }, []);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [sidebarVisible, setSidebarVisible] = useState(false);
  const isSendingRef = useRef(false); // Prevent duplicate sends
  const [modelMode, setModelMode] = useState<'fast' | 'smart'>('fast');
  const [showModelPicker, setShowModelPicker] = useState(false);

  // Smoothing refs
  const streamBufferRef = useRef('');
  const displayedBufferRef = useRef('');
  const streamIntervalRef = useRef<NodeJS.Timeout | null>(null);
  
  // Clean up interval on unmount
  useEffect(() => {
    return () => {
      if (streamIntervalRef.current) {
        clearInterval(streamIntervalRef.current);
        streamIntervalRef.current = null;
      }
    };
  }, []);

  // Onboarding state management
  const [_onboardingState, setOnboardingState] = useState<OnboardingState>({ isCompleted: false });
  const [showOnboarding, setShowOnboarding] = useState(false);
  const [hasUserInteracted, setHasUserInteracted] = useState(false);
  const [pendingHelpMessage, setPendingHelpMessage] = useState<string | null>(null);

  // Quick actions configuration
  const quickActions: QuickAction[] = [
    {
      id: 'create-goal',
      label: 'Create a Goal',
      prefillText: 'Create a new goal.',
      icon: 'milestone'
    },
    {
      id: 'add-task',
      label: 'Add a Task',
      prefillText: 'I need to add a new task.',
      icon: 'check-circle'
    },
    {
      id: 'manage-calendar',
      label: 'Manage My Calendar',
      prefillText: 'I need to manage my calendar.',
      icon: 'calendar'
    }
  ];

  // Store messages in state, synced with WatermelonDB
  const [messagesByThread, setMessagesByThread] = useState<Record<string, Message[]>>({});
  
  // Helper to deduplicate messages by ID
  const deduplicateMessages = useCallback((messages: Message[]): Message[] => {
    const seen = new Map<string, Message>();
    for (const msg of messages) {
      if (!seen.has(msg.id)) {
        seen.set(msg.id, msg);
      }
    }
    return Array.from(seen.values());
  }, []);

  // Helper to get messages for a thread
  const getMessagesForThread = useCallback(async (threadId: string): Promise<Message[]> => {
    try {
      const messages = await conversationRepository.getMessagesByThreadId(threadId);
      // Sort by createdAt ascending (oldest first) to maintain conversation order
      const sortedMessages = [...messages].sort((a, b) => 
        a.createdAt.getTime() - b.createdAt.getTime()
      );
      const mappedMessages: Message[] = sortedMessages.map(m => ({
        id: m.id, // Use WatermelonDB ID directly for unique keys
        text: m.content,
        sender: (m.role === 'user' ? 'user' : 'ai') as 'user' | 'ai',
        status: m.status,
        messageId: m.id,
      }));
      // Deduplicate to prevent duplicate keys
      return deduplicateMessages(mappedMessages);
    } catch (err) {
      logger.warn('Failed to get messages for thread:', err);
      return [];
    }
  }, [deduplicateMessages]);

  // Helper function to merge real messages from DB with optimistic messages from state
  // This handles content-based deduplication and filters out temporary "Thinking..." messages
  const mergeMessagesWithOptimistic = useCallback((
    realMessages: Message[],
    optimisticMessages: Message[]
  ): Message[] => {
    const merged: Message[] = [];
    const seenContent = new Set<string>();
    
    // First, add all real messages from DB (they're already sorted chronologically)
    for (const realMsg of realMessages) {
      const contentKey = `${realMsg.sender}:${realMsg.text}`;
      if (!seenContent.has(contentKey)) {
        merged.push(realMsg);
        seenContent.add(contentKey);
      }
    }
    
    // Then, add optimistic messages that don't have a real counterpart
    // These should be newer, so they go at the end
    for (const optMsg of optimisticMessages) {
      if (optMsg.id.startsWith('temp-')) {
        // Skip "Thinking..." messages - they should be replaced by real responses
        if (optMsg.text === 'Thinking...') {
          continue;
        }
        const contentKey = `${optMsg.sender}:${optMsg.text}`;
        // Only add if we haven't seen this content yet
        if (!seenContent.has(contentKey)) {
          merged.push(optMsg);
          seenContent.add(contentKey);
        }
      } else {
        // For non-temp messages, check if we already have them from DB
        const contentKey = `${optMsg.sender}:${optMsg.text}`;
        if (!seenContent.has(contentKey)) {
          merged.push(optMsg);
          seenContent.add(contentKey);
        }
      }
    }
    
    // Final deduplication by ID to handle any edge cases
    return deduplicateMessages(merged);
  }, [deduplicateMessages]);
  
  // Load messages for current thread and subscribe to changes
  useEffect(() => {
    if (!currentConversationId) return;
    
    // Skip subscription for temporary thread IDs (they'll be migrated when real thread is created)
    if (currentConversationId.startsWith('temp-thread-')) {
      return;
    }
    
    // Initial load - always load from DB to ensure we have persisted messages
    getMessagesForThread(currentConversationId).then(msgs => {
      // Messages from getMessagesForThread are already sorted by createdAt
      // Filter out temp messages from DB
      const realMsgs = msgs.filter(m => !m.id.startsWith('temp-'));
      const deduplicated = deduplicateMessages(realMsgs);
      
      setMessagesByThread(prev => {
        const existing = prev[currentConversationId] || [];
        const merged = mergeMessagesWithOptimistic(deduplicated, existing);
        return { ...prev, [currentConversationId]: merged };
      });
    });
    
    // Subscribe to message changes for this thread
    const messagesQuery = database.collections.get<ConversationMessage>('conversation_messages')
      .query(Q.where('thread_id', currentConversationId));
    
    const subscription = messagesQuery.observe().subscribe(async () => {
      // Refresh messages when they change, but merge with optimistic messages
      const msgs = await getMessagesForThread(currentConversationId);
      // Filter out temp messages from DB
      const realMsgs = msgs.filter(m => !m.id.startsWith('temp-'));
      const deduplicated = deduplicateMessages(realMsgs);
      
      setMessagesByThread(prev => {
        const existing = prev[currentConversationId] || [];
        const merged = mergeMessagesWithOptimistic(deduplicated, existing);
        return { ...prev, [currentConversationId]: merged };
      });
    });
    
    return () => subscription.unsubscribe();
  }, [currentConversationId, getMessagesForThread, database, deduplicateMessages, mergeMessagesWithOptimistic]);

  // Get current conversation with messages
  const currentConversation = useMemo(() => {
    // Handle temporary thread IDs (for new conversations before server responds)
    if (currentConversationId.startsWith('temp-thread-')) {
      const messages = messagesByThread[currentConversationId] || [];
      return {
        id: currentConversationId,
        title: 'New Conversation',
        messages,
        isPinned: false,
        createdAt: new Date(),
        lastMessageAt: new Date(),
      };
    }
    
    const thread = threads.find(t => t.id === currentConversationId);
    if (!thread) return null;
    const messages = messagesByThread[currentConversationId] || [];
    return {
      id: thread.id,
      title: thread.title,
      messages,
      isPinned: thread.isPinned || false,
      createdAt: thread.createdAt,
      lastMessageAt: thread.updatedAt,
    };
  }, [threads, currentConversationId, messagesByThread]);

  const toggleSidebar = () => {
    if (sidebarVisible) {
      // Hide sidebar
      Animated.parallel([
        Animated.timing(sidebarAnimation, {
          toValue: -screenWidth * 0.8,
          duration: 300,
          useNativeDriver: false,
        }),
        Animated.timing(overlayAnimation, {
          toValue: 0,
          duration: 300,
          useNativeDriver: false,
        }),
      ]).start(() => setSidebarVisible(false));
    } else {
      // Show sidebar
      setSidebarVisible(true);
      Animated.parallel([
        Animated.timing(sidebarAnimation, {
          toValue: 0,
          duration: 300,
          useNativeDriver: false,
        }),
        Animated.timing(overlayAnimation, {
          toValue: 0.5,
          duration: 300,
          useNativeDriver: false,
        }),
      ]).start();
    }
  };

  const startNewConversation = async () => {
    setLoading(true);
    try {
      const thread = await conversationRepository.createThread({
        title: 'New Conversation',
        summary: null,
        isActive: true,
        isPinned: false,
      });
      setCurrentConversationId(thread.id);
      // Thread will appear in threads observable automatically
      // Add welcome message locally (mark as synced since it's a local-only message)
      const welcomeMessage = await conversationRepository.createMessage(
        thread.id,
        'Hi there, and welcome to Mind Clear! I\'m here to help you structure your goals and tasks in a way that feels manageable. What would you like to do first?',
        'assistant'
      );
      // Mark welcome message as synced (it's a local-only message, not from server)
      await conversationRepository.markMessageAsSynced(welcomeMessage.id);
      // Reload messages
      const msgs = await getMessagesForThread(thread.id);
      setMessagesByThread(prev => ({ ...prev, [thread.id]: msgs }));
    } catch (err) {
      logger.error('Failed to create conversation thread:', err);
      setError('Failed to create conversation. Please try again.');
    } finally {
      setLoading(false);
      toggleSidebar();
      // Trigger sync
      syncService.silentSync().catch(() => {});
    }
  };

  const deleteConversation = async (conversationId: string) => {
    setLoading(true);
    try {
      await conversationRepository.deleteThread(conversationId);
      // Thread will disappear from threads observable automatically
      // Switch to another conversation if needed
      const remainingThreads = threads.filter(t => t.id !== conversationId);
      if (conversationId === currentConversationId) {
        if (remainingThreads.length > 0) {
          setCurrentConversationId(remainingThreads[0].id);
        } else {
          await startNewConversation();
        }
      }
    } catch (err) {
      logger.warn('Failed to delete conversation:', err);
      setError('Failed to delete conversation. Please try again.');
    } finally {
      setLoading(false);
      // Trigger sync
      syncService.silentSync().catch(() => {});
    }
  };

  const togglePinConversation = async (conversationId: string) => {
    try {
      const thread = threads.find(t => t.id === conversationId);
      if (thread) {
        await conversationRepository.updateThread(conversationId, {
          isPinned: !thread.isPinned,
        });
        // Thread will update in observable automatically
        // Trigger sync
        syncService.silentSync().catch(() => {});
      }
    } catch (err) {
      logger.warn('Failed to toggle pin:', err);
    }
  };

  const clearNonPinnedConversations = async () => {
    setLoading(true);
    setError('');
    try {
      const pinnedThreads = threads.filter(t => t.isPinned);
      const hadPinned = pinnedThreads.length > 0;
      
      if (!hadPinned) {
        // No pinned: delete ALL threads locally then create a fresh one
        for (const thread of threads) {
          await conversationRepository.deleteThread(thread.id);
        }
        await startNewConversation();
        return;
      }
      
      // Otherwise delete only non-pinned
      const toDelete = threads.filter(t => !t.isPinned);
      for (const thread of toDelete) {
        await conversationRepository.deleteThread(thread.id);
      }
      
      // Switch to pinned thread if current is deleted
      if (toDelete.some(t => t.id === currentConversationId)) {
        if (pinnedThreads.length > 0) {
          setCurrentConversationId(pinnedThreads[0].id);
        } else {
          await startNewConversation();
        }
      }
      
      // Trigger sync
      syncService.silentSync().catch(() => {});
    } catch (err) {
      logger.warn('Failed to clear conversations:', err);
      setError('Failed to clear conversations. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  // Title updates are handled when sending messages

  // Deprecated: Removed timed follow-up onboarding message to prevent confusion during active chats

  // Onboarding flow logic
  const initializeOnboarding = useCallback(async () => {
    const state = await OnboardingService.getOnboardingState();
    setOnboardingState(state);
    
    if (!state.isCompleted) {
      setShowOnboarding(true);
    }
  }, []);

  const handleSaveGoal = async (goalData: GoalData) => {
    try {
      const goalCategory = mapToValidCategory(goalData.category);
      // If a goal with the same title exists, append milestones/steps to it instead of creating a duplicate
      const existingGoal = goalData.title ? await goalRepository.findGoalByTitle(goalData.title) : null;

      if (existingGoal) {
        const existingMilestones = await goalRepository.getMilestonesForGoal(existingGoal.id);
        const baseOrder = existingMilestones.length;

        for (const [milestoneIndex, milestone] of goalData.milestones.entries()) {
          const newMilestone = await goalRepository.createMilestone(existingGoal.id, {
            title: milestone.title,
            description: '',
            order: baseOrder + milestoneIndex,
          });

          for (const [stepIndex, step] of milestone.steps.entries()) {
            await goalRepository.createMilestoneStep(newMilestone.id, {
              text: step.text,
              order: stepIndex,
            });
          }
        }

        Alert.alert('Success', 'Goal updated with new milestones.');
      } else {
        // Create a new goal
        const newGoal = await goalRepository.createGoal({
          title: goalData.title,
          description: goalData.description,
          targetCompletionDate: goalData.dueDate ? safeParseDate(goalData.dueDate) : undefined,
          category: goalCategory,
        });

        for (const [milestoneIndex, milestone] of goalData.milestones.entries()) {
          const newMilestone = await goalRepository.createMilestone(newGoal.id, {
            title: milestone.title,
            description: '', // Milestone description not provided in GoalData
            order: milestoneIndex,
          });

          for (const [stepIndex, step] of milestone.steps.entries()) {
            await goalRepository.createMilestoneStep(newMilestone.id, {
              text: step.text,
              order: stepIndex,
            });
          }
        }

        Alert.alert('Success', 'Goal has been saved successfully!');
      }
      // Optional: trigger a sync
      syncService.silentSync().catch(err => {
        logger.warn('Background sync failed after saving goal:', err);
      });
  
    } catch (error) {
      logger.error('Failed to save goal from AIChatScreen:', error);
      Alert.alert('Error', 'There was an error saving the goal. Please try again.');
      // Re-throw to let the caller (GoalBreakdownDisplay) know it failed.
      throw error;
    }
  };

  const TASK_MATCH_THRESHOLD = 0.82;
  const DUE_DATE_MATCH_BONUS = 0.1;

  const normalizeTitleForMatch = (value?: string) =>
    String(value || '')
      .replace(/\r?\n|\r/g, ' ')
      .replace(/\s+/g, ' ')
      .trim()
      .toLowerCase();

  const bigrams = (value: string): string[] => {
    if (!value || value.length < 2) return [];
    const chars = value.split('');
    const pairs: string[] = [];
    for (let i = 0; i < chars.length - 1; i += 1) {
      pairs.push(chars[i] + chars[i + 1]);
    }
    return pairs;
  };

  const diceCoefficient = (aRaw: string, bRaw: string): number => {
    const a = bigrams(normalizeTitleForMatch(aRaw));
    const b = bigrams(normalizeTitleForMatch(bRaw));
    if (a.length === 0 || b.length === 0) return 0;

    const bCounts: Record<string, number> = {};
    b.forEach(pair => {
      bCounts[pair] = (bCounts[pair] || 0) + 1;
    });

    let intersection = 0;
    a.forEach(pair => {
      if (bCounts[pair]) {
        intersection += 1;
        bCounts[pair] -= 1;
      }
    });

    return (2 * intersection) / (a.length + b.length);
  };

  const toDateKey = (value?: Date | string | null): string | null => {
    if (!value) return null;
    const parsed = value instanceof Date ? value : new Date(value);
    if (Number.isNaN(parsed.getTime())) return null;
    return parsed.toISOString().slice(0, 10);
  };

  const buildMatchScore = (
    incomingTitle: string,
    existingTitle: string,
    incomingDueDate?: Date,
    existingDueDate?: Date | null,
  ) => {
    const baseScore = diceCoefficient(incomingTitle, existingTitle);
    const incomingKey = toDateKey(incomingDueDate);
    const existingKey = toDateKey(existingDueDate);
    const dueDateMatches = Boolean(incomingKey && existingKey && incomingKey === existingKey);
    const compositeScore = Math.min(1, baseScore + (dueDateMatches ? DUE_DATE_MATCH_BONUS : 0));
    return { compositeScore, dueDateMatches, baseScore };
  };

  const requestTaskDecision = (
    incomingTitle: string,
    existingTitle: string,
    compositeScore: number,
    dueDateMatches: boolean,
  ): Promise<'update' | 'create'> => {
    const similarityLabel = `${Math.round(compositeScore * 100)}% match`;
    const dueDateNote = dueDateMatches ? '\nDue dates also match.' : '';
    return new Promise(resolve => {
      Alert.alert(
        'Potential duplicate task',
        `We found a similar task "${existingTitle}". ${similarityLabel}.${dueDateNote}\nWould you like to update the existing task or create a new one?`,
        [
          { text: 'Update existing', onPress: () => resolve('update') },
          { text: 'Create new', style: 'cancel', onPress: () => resolve('create') },
        ],
        { cancelable: false },
      );
    });
  };

  const handleSaveTasks = async (tasks: TaskDataFromDisplay[]) => {
    try {
      let updatedCount = 0;
      let createdCount = 0;
      let existingTasks: Task[] = await taskRepository.getAllTasks();

      for (const task of tasks) {
        const dueDate = task.dueDate ? safeParseDate(task.dueDate) : undefined;

        // Update if ID provided
        if (task.id) {
          await taskRepository.updateTask(task.id, {
            title: task.title,
            description: task.description,
            dueDate,
            priority: task.priority,
          });
          logger.info('AIChatScreen: updated task by explicit ID', { title: task.title, existingId: task.id });
          updatedCount += 1;
          continue;
        }

        // Find best potential match using fuzzy similarity and due date
        let bestMatch: { task: Task; compositeScore: number; dueDateMatches: boolean } | null = null;
        for (const existing of existingTasks) {
          const { compositeScore, dueDateMatches } = buildMatchScore(task.title, existing.title || '', dueDate, existing.dueDate);
          if (!bestMatch || compositeScore > bestMatch.compositeScore) {
            bestMatch = { task: existing, compositeScore, dueDateMatches };
          }
        }

        let shouldUpdateExisting = false;
        if (bestMatch && bestMatch.compositeScore >= TASK_MATCH_THRESHOLD) {
          const userChoice = await requestTaskDecision(task.title, bestMatch.task.title || '', bestMatch.compositeScore, bestMatch.dueDateMatches);
          shouldUpdateExisting = userChoice === 'update';
        }

        if (bestMatch && shouldUpdateExisting) {
          await taskRepository.updateTask(bestMatch.task.id, {
            title: task.title,
            description: task.description,
            dueDate,
            priority: task.priority,
          });
          logger.info('AIChatScreen: updated matched task', { title: task.title, existingId: bestMatch.task.id });
          updatedCount += 1;
        } else {
          const createdTask = await taskRepository.createTask({
            title: task.title,
            description: task.description,
            dueDate,
            priority: task.priority,
          });
          logger.info('AIChatScreen: created new task', { title: task.title });
          createdCount += 1;
          existingTasks = [...existingTasks, createdTask];
        }
      }

      Alert.alert('Success', `Tasks saved. Updated ${updatedCount}, created ${createdCount}.`);
      syncService.silentSync().catch(err => {
        logger.warn('Background sync failed after saving tasks:', err);
      });
    } catch (error) {
      logger.error('Failed to save tasks from AIChatScreen:', error);
      Alert.alert('Error', 'There was an error saving the tasks. Please try again.');
      throw error; // Rethrow to let TaskDisplay know it failed.
    }
  };

  // Get messages for current conversation - observe from WatermelonDB
  const currentMessages = useMemo(() => {
    if (!messagesQuery || !currentConversationId) return [];
    // Note: We need to use subscribe pattern or transform observable
    // For now, we'll fetch messages directly when needed
    return [];
  }, [messagesQuery, currentConversationId]);



  

  const handleHelpPress = useCallback(async (messageToSend?: string) => {
    await OnboardingService.resetOnboarding();
    setShowOnboarding(true);
    setHasUserInteracted(false);
    setOnboardingState({ isCompleted: false });
    
    if (currentConversationId) {
        try {
            const messagesToDelete = await conversationRepository.getMessagesByThreadId(currentConversationId);
            if (messagesToDelete.length > 0) {
                await database.write(async () => {
                    const deletions = messagesToDelete.map(msg => msg.prepareDestroyPermanently());
                    await database.batch(...deletions);
                });
            }

            const welcomeMessage = await conversationRepository.createMessage(
                currentConversationId,
                'Welcome to Mind Clear! How can I help you today?',
                'assistant'
            );
            await conversationRepository.markMessageAsSynced(welcomeMessage.id);
        } catch (error) {
            logger.error('Failed to reset conversation for help press:', error);
        }
    }

    if (messageToSend) {
      setPendingHelpMessage(messageToSend);
    }
  }, [currentConversationId, database]);

  // Sign out is handled from Profile screen now

  // Detect if a message contains schedule content
  const isScheduleContent = (text: string): boolean => {
    // Prefer standardized JSON category detection first
    const hasJsonScheduleFormat = /"category"\s*:\s*"schedule"/i.test(text)
      || /"action_type"\s*:\s*"read"[\s\S]*?"entity_type"\s*:\s*"calendar_event"/i.test(text);

    // Look for patterns that indicate actual schedule events (not just mentions of schedule)
    const schedulePatterns = [
      // Must contain actual time ranges with "from" and "to"
      /from.*\d{1,2}:\d{2}\s*(?:AM|PM).*to.*\d{1,2}:\d{2}\s*(?:AM|PM)/i,
      /•.*from.*\d{1,2}:\d{2}\s*(?:AM|PM).*to.*\d{1,2}:\d{2}\s*(?:AM|PM)/i,
      /\*.*from.*\d{1,2}:\d{2}\s*(?:AM|PM).*to.*\d{1,2}:\d{2}\s*(?:AM|PM)/i,
      // Must have bullet points with time ranges
      /^[•\-\*]\s*.+?\s+from\s+\d{1,2}:\d{2}\s*(?:AM|PM)\s+to\s+\d{1,2}:\d{2}\s*(?:AM|PM)/im,
      // Check for schedule-related keywords with time patterns
      /schedule.*today.*\d{1,2}:\d{2}\s*(?:AM|PM)/i,
      /here.*schedule.*today.*\d{1,2}:\d{2}\s*(?:AM|PM)/i,
      /your.*schedule.*today.*\d{1,2}:\d{2}\s*(?:AM|PM)/i,
    ];
    
    // Check if the text contains actual schedule events (not just mentions)
    const hasTimeRanges = schedulePatterns.some(pattern => pattern.test(text));
    
    // Also check if it contains bullet points with time information
    const hasBulletPointsWithTimes = /\n[•\-\*]\s*.+?\s+\d{1,2}:\d{2}\s*(?:AM|PM)/i.test(text);
    
    // Check if the text contains multiple time patterns (indicating a schedule)
    const timePattern = /\d{1,2}:\d{2}\s*(?:AM|PM)/g;
    const timeMatches = text.match(timePattern);
    const hasMultipleTimes = timeMatches ? timeMatches.length >= 2 : false;
    
    // Check for schedule-related keywords
    const hasScheduleKeywords = /schedule|calendar|events|appointments/i.test(text);
    
    return hasJsonScheduleFormat || hasTimeRanges || hasBulletPointsWithTimes || (hasMultipleTimes && hasScheduleKeywords);
  };

  // Detect if a message contains goal breakdown content
  const isGoalBreakdownContent = (text: string): boolean => {
    // Check for standardized JSON format first (most reliable)
    const hasJsonGoalFormat = /"category":\s*"goal"/i.test(text);
    // Treat titles-only payloads differently so we render a list component
    const isTitlesOnly = /"category"\s*:\s*"goal"[\s\S]*"goals"\s*:\s*\[\s*"/.test(text);
    
    // If it's JSON format and not titles-only, it's definitely a goal breakdown
    if (hasJsonGoalFormat && !isTitlesOnly) {
      // Additional check: must have milestones array in JSON
      const hasMilestonesInJson = /"milestones"\s*:\s*\[/i.test(text);
      return hasMilestonesInJson;
    }
    
    // Check for explicit milestone headers (e.g., "Milestone 1:", "**Milestone 2:**")
    // This is more reliable than generic patterns
    const hasExplicitMilestoneHeaders = /(?:^|\n)\s*(?:\*\*)?milestone\s+\d+\s*(?:\*\*)?\s*:/im.test(text);
    
    // Check for the specific format with **Goal:** and **Milestones:**
    const hasGoalFormat = /(?:\*\*goal\*\*|goal):\s*.+?(?:\*\*milestones\*\*|milestones):/is.test(text);
    
    // Only use lenient detection if we have clear structural indicators
    // Require: milestone headers + multiple bullet points (indicating steps)
    const hasMilestoneHeaders = /milestone\s+\d+/i.test(text);
    const bulletPointMatches = text.match(/\n[•\-\*]\s+/g);
    const hasMultipleBulletPoints = (bulletPointMatches?.length ?? 0) >= 2;
    
    // Strict detection: only match if we have clear structural indicators
    // This prevents matching conversational text that just mentions goals/milestones
    return (
      hasExplicitMilestoneHeaders || 
      hasGoalFormat ||
      (hasMilestoneHeaders && hasMultipleBulletPoints && /"category":\s*"goal"/i.test(text))
    ) && !isTitlesOnly;
  };

  // Detect if message contains a titles-only goal list
  const isGoalTitlesContent = (text: string): boolean => {
    return /"category"\s*:\s*"goal"[\s\S]*"goals"\s*:\s*\[\s*"/i.test(text) ||
           /"action_type"\s*:\s*"read"[\s\S]*"entity_type"\s*:\s*"goal"[\s\S]*"goals"\s*:\s*\[\s*"/i.test(text);
  };

  // Detect if a message contains task content
  const isTaskContent = (text: string): boolean => {
    // Check for standardized JSON format
    const hasJsonTaskFormat = /"category":\s*"task"/i.test(text);
    
    // Check for task-related keywords
    const hasTaskKeywords = /task|todo|reminder/i.test(text);
    
    // Check for task list patterns
    const hasTaskListPatterns = /\n[•\-\*]\s*.+$/im.test(text);
    
    return hasJsonTaskFormat || (hasTaskKeywords && hasTaskListPatterns);
  };

  // Remove any goal breakdown section from conversational text so we can
  // render the structured GoalBreakdownDisplay in its place without
  // duplicating the content.
  const stripGoalBreakdownFromText = (text: string): string => {
    // First remove JSON blocks (handled elsewhere too, but keep here for safety)
    let cleaned = text.replace(/```json[\s\S]*?```/g, '');
    // Identify the first marker that usually precedes the structured list
    const patterns = [
      /goal breakdown/i,
      /(?:\*\*goal\*\*|goal):/i,
      /(?:\*\*milestones\*\*|milestones):/i,
      /^milestones:/im,
      /\bmilestone\s+1\b/i,
    ];
    let firstIndex = -1;
    for (const p of patterns) {
      const idx = cleaned.search(p);
      if (idx !== -1 && (firstIndex === -1 || idx < firstIndex)) {
        firstIndex = idx;
      }
    }
    if (firstIndex !== -1) {
      cleaned = cleaned.slice(0, firstIndex).trim();
    }
    return cleaned.trim();
  };

  // Helper function to extract meaningful title from a message
  const extractTitleFromMessage = (message: string): string => {
    let text = message.toLowerCase().trim();
    
    // Common prefixes to remove that don't add meaning to the title
    const prefixesToRemove = [
      /^let'?s\s+create\s+(a\s+)?goal\s+to\s+/i,
      /^let'?s\s+create\s+(a\s+)?/i,
      /^help\s+me\s+(to\s+)?(create\s+)?(a\s+)?(goal\s+to\s+)?/i,
      /^i\s+want\s+to\s+(create\s+)?(a\s+)?(goal\s+to\s+)?/i,
      /^i\s+need\s+to\s+(create\s+)?(a\s+)?(goal\s+to\s+)?/i,
      /^can\s+you\s+help\s+me\s+(to\s+)?(create\s+)?(a\s+)?(goal\s+to\s+)?/i,
      /^please\s+(help\s+me\s+)?(to\s+)?(create\s+)?(a\s+)?(goal\s+to\s+)?/i,
      /^create\s+(a\s+)?(goal\s+to\s+)?/i,
      /^make\s+(a\s+)?(goal\s+to\s+)?/i,
      /^set\s+(up\s+)?(a\s+)?(goal\s+to\s+)?/i,
      /^i\s+would\s+like\s+to\s+/i,
      /^i'?d\s+like\s+to\s+/i,
      /^goal:\s*/i,
      /^the\s+goal\s+is\s+to\s+/i,
      /^my\s+goal\s+is\s+to\s+/i,
    ];
    
    // Remove prefixes
    for (const prefix of prefixesToRemove) {
      text = text.replace(prefix, '');
    }
    
    // Remove trailing punctuation and question words
    text = text.replace(/[?.!\s]+$/g, '').trim();
    
    // Remove quotes if present
    text = text.replace(/^["']|["']$/g, '').trim();
    
    // Extract meaningful words (filter out common stop words and short words)
    const stopWords = new Set(['the', 'a', 'an', 'and', 'or', 'but', 'in', 'on', 'at', 'to', 'for', 'of', 'with', 'by', 'from', 'as', 'is', 'was', 'are', 'were', 'be', 'been', 'being', 'have', 'has', 'had', 'do', 'does', 'did', 'will', 'would', 'should', 'could', 'may', 'might', 'must', 'can', 'this', 'that', 'these', 'those']);
    const words = text.split(/\s+/)
      .filter(word => {
        const cleaned = word.replace(/[^\w]/g, '').toLowerCase();
        return cleaned.length > 2 && !stopWords.has(cleaned);
      });
    
    if (words.length === 0) {
      // If no meaningful words found, fall back to original message processing
      const allWords = text.split(/\s+/).filter(w => w.length > 2);
      if (allWords.length > 0) {
        return allWords.slice(0, 4).map(w => 
          w.charAt(0).toUpperCase() + w.slice(1)
        ).join(' ');
      }
      return 'New Goal';
    }
    
    // Take up to 4-5 meaningful words for a descriptive title
    const titleWords = words.slice(0, 5).map(word => {
      // Capitalize first letter of each word
      return word.charAt(0).toUpperCase() + word.slice(1);
    });
    
    return titleWords.join(' ');
  };

  const generateConversationTitle = (messages: Message[]): string => {
    // Get all user messages to analyze the conversation topic
    const userMessages = messages.filter(msg => msg.sender === 'user').map(msg => msg.text);
    
    if (userMessages.length === 0) {
      return 'New Conversation';
    }
    
    // If it's the first message, use it to generate a title
    if (userMessages.length === 1) {
      const firstMessage = userMessages[0];
      const firstMessageLower = firstMessage.toLowerCase();
      
      // Common conversation starters and their topics
      const topicPatterns = [
        { pattern: /help.*goal|goal.*help/, title: 'Goal Planning' },
        { pattern: /schedule|calendar|plan.*day/, title: 'Scheduling Help' },
        { pattern: /anxiety|stress|worry|overwhelm/, title: 'Anxiety Support' },
        { pattern: /depression|sad|down|mood/, title: 'Mood Support' },
        { pattern: /productivity|focus|concentration/, title: 'Productivity Tips' },
        { pattern: /habit|routine|consistency/, title: 'Habit Building' },
        { pattern: /work|job|career/, title: 'Work & Career' },
        { pattern: /relationship|friend|family/, title: 'Relationships' },
        { pattern: /health|fitness|exercise/, title: 'Health & Fitness' },
        { pattern: /learning|study|education/, title: 'Learning & Education' },
        { pattern: /creativity|art|writing|music/, title: 'Creative Projects' },
        { pattern: /finance|money|budget/, title: 'Financial Planning' },
        { pattern: /travel|trip|vacation/, title: 'Travel Planning' },
        { pattern: /cooking|recipe|food/, title: 'Cooking & Food' },
        { pattern: /reading|book|literature/, title: 'Reading & Books' },
        { pattern: /technology|app|software/, title: 'Technology Help' },
        { pattern: /spirituality|meditation|mindfulness/, title: 'Mindfulness' },
        { pattern: /organization|declutter|clean/, title: 'Organization' },
        { pattern: /decision|choice|advice/, title: 'Decision Making' },
        { pattern: /motivation|inspiration|encouragement/, title: 'Motivation' },
      ];
      
      // Check for topic patterns first (only if they're very specific)
      // Skip generic goal patterns to allow extraction of actual goal content
      for (const topic of topicPatterns) {
        // Skip generic goal-related patterns to allow more specific extraction
        if (topic.pattern.test(firstMessageLower) && !topic.pattern.source.includes('goal')) {
          return topic.title;
        }
      }
      
      // Extract meaningful title from the message
      const extractedTitle = extractTitleFromMessage(firstMessage);
      
      // If extracted title is too generic or short, try to improve it
      if (extractedTitle.length < 5 || extractedTitle.toLowerCase().includes('goal') || extractedTitle.toLowerCase().includes('create')) {
        // Try extracting again with more aggressive prefix removal
        let improved = extractTitleFromMessage(firstMessage);
        if (improved.length < 5) {
          // Last resort: use original message but skip first few words
          const words = firstMessage.split(/\s+/).filter(w => w.length > 2);
          if (words.length > 3) {
            // Skip first 2-3 words and take next meaningful ones
            improved = words.slice(2, 6).map(w => 
              w.charAt(0).toUpperCase() + w.slice(1)
            ).join(' ');
          }
        }
        return improved || 'New Goal';
      }
      
      return extractedTitle;
    }
    
    // For conversations with multiple messages, analyze the overall topic
    const allText = userMessages.join(' ').toLowerCase();
    
    // Check for recurring themes
    const themePatterns = [
      { pattern: /goal|objective|target/, title: 'Goal Setting' },
      { pattern: /schedule|plan|organize/, title: 'Planning & Organization' },
      { pattern: /anxiety|stress|worry/, title: 'Stress Management' },
      { pattern: /productivity|efficiency|focus/, title: 'Productivity' },
      { pattern: /habit|routine|consistency/, title: 'Habit Formation' },
      { pattern: /work|career|professional/, title: 'Work & Career' },
      { pattern: /relationship|communication/, title: 'Relationships' },
      { pattern: /health|wellness|fitness/, title: 'Health & Wellness' },
      { pattern: /learning|education|skill/, title: 'Learning' },
      { pattern: /creative|art|project/, title: 'Creative Work' },
      { pattern: /finance|money|budget/, title: 'Financial Planning' },
      { pattern: /travel|adventure/, title: 'Travel' },
      { pattern: /cooking|food|nutrition/, title: 'Food & Cooking' },
      { pattern: /reading|books|literature/, title: 'Reading' },
      { pattern: /technology|digital/, title: 'Technology' },
      { pattern: /mindfulness|meditation/, title: 'Mindfulness' },
      { pattern: /organization|declutter/, title: 'Organization' },
      { pattern: /decision|choice/, title: 'Decision Making' },
      { pattern: /motivation|inspiration/, title: 'Motivation' },
    ];
    
    for (const theme of themePatterns) {
      if (theme.pattern.test(allText)) {
        return theme.title;
      }
    }
    
    // Fallback: extract meaningful title from first message
    const extractedTitle = extractTitleFromMessage(userMessages[0]);
    if (extractedTitle && extractedTitle.length > 5) {
      return extractedTitle;
    }
    
    // Last resort: use the first few words of the first message
    const firstMessage = userMessages[0];
    const words = firstMessage.split(' ').filter(word => word.length > 2);
    if (words.length > 0) {
      const titleWords = words.slice(0, 2).map(word => 
        word.charAt(0).toUpperCase() + word.slice(1)
      );
      return titleWords.join(' ');
    }
    
    return 'Conversation';
  };

  // Extract message migration logic
  const migrateTempMessagesToServerThread = useCallback((
    tempThreadId: string,
    serverThreadId: string,
    tempAiMessageId: string,
    tempUserMessageId: string,
    tempAiMsgId: string,
    tempUserMsgId: string,
    response: { message: string },
    userMessage: string
  ) => {
    setMessagesByThread(prev => {
      const optimisticMsgs = prev[tempThreadId] || [];
      // Remove temp messages from old key
      const newState = { ...prev };
      if (tempThreadId !== serverThreadId) {
        delete newState[tempThreadId];
      }
      // Get existing messages for server thread (if any)
      const existingMsgs = newState[serverThreadId] || [];
      // Merge optimistic messages with existing, replacing "Thinking..." with real response
      const mergedMsgs = [...existingMsgs];
      for (const optMsg of optimisticMsgs) {
        // Replace "Thinking..." with real AI response
        if (optMsg.id === tempAiMessageId || (optMsg.sender === 'ai' && optMsg.text === 'Thinking...')) {
          // Check if AI response already exists (by content)
          const aiExists = mergedMsgs.some(m => 
            m.sender === 'ai' && m.text === response.message
          );
          if (!aiExists) {
            mergedMsgs.push({
              id: tempAiMsgId,
              text: response.message,
              sender: 'ai' as const,
              status: 'synced',
              messageId: tempAiMsgId,
            });
          }
        } else if (optMsg.id === tempUserMessageId) {
          // Check if user message already exists (by content) before adding
          const userExists = mergedMsgs.some(m => 
            m.sender === 'user' && m.text === userMessage
          );
          if (!userExists) {
            mergedMsgs.push({
              id: tempUserMsgId,
              text: userMessage,
              sender: 'user' as const,
              status: 'synced',
              messageId: tempUserMsgId,
            });
          }
        } else {
          // Check if this optimistic message already exists before adding
          const exists = mergedMsgs.some(m => 
            m.text === optMsg.text && m.sender === optMsg.sender
          );
          if (!exists) {
            mergedMsgs.push(optMsg);
          }
        }
      }
      // Deduplicate by ID as well (in case same message has different IDs)
      return {
        ...newState,
        [serverThreadId]: deduplicateMessages(mergedMsgs),
      };
    });
  }, [deduplicateMessages]);

  // Extract DB message creation logic
  const createMessagesInDatabase = useCallback(async (
    database: Database,
    serverThreadId: string,
    tempUserMsgId: string,
    tempAiMsgId: string,
    userId: string,
    userMessage: string,
    response: { message: string; actions?: any[] },
    now: Date
  ) => {
    try {
      await database.write(async () => {
        // Create user message
        await database.get<ConversationMessage>('conversation_messages').create(m => {
          m._raw.id = tempUserMsgId;
          m.threadId = serverThreadId;
          m.userId = userId;
          m.role = 'user';
          m.content = userMessage;
          m.status = 'synced'; // Mark as synced since backend already saved it
          m.createdAt = now;
          m.updatedAt = now;
        });
        
        // Create AI response message
        await database.get<ConversationMessage>('conversation_messages').create(m => {
          m._raw.id = tempAiMsgId;
          m.threadId = serverThreadId;
          m.userId = userId;
          m.role = 'assistant';
          m.content = response.message;
          if (response.actions && response.actions.length > 0) {
            m.metadata = JSON.stringify({ actions: response.actions });
          }
          m.status = 'synced'; // Mark as synced since backend already saved it
          m.createdAt = now;
          m.updatedAt = now;
        });
      });
    } catch (dbError: any) {
      // Messages might already exist, continue - UI is already updated
      logger.warn('Failed to create messages locally:', dbError);
    }
  }, []);

  // Extract message merging logic from DB
  const mergeRealMessagesFromDB = useCallback(async (
    serverThreadId: string,
    getMessagesForThread: (threadId: string) => Promise<Message[]>
  ) => {
    let msgs: Message[] = [];
    try {
      msgs = await getMessagesForThread(serverThreadId);
      // Filter out temp messages from DB (we already have them in state with temp IDs)
      const realMsgs = msgs.filter(m => !m.id.startsWith('temp-'));
      const deduplicated = deduplicateMessages(realMsgs);
      
      // If we got real messages from DB, merge them (they'll have proper IDs from server)
      if (deduplicated.length > 0) {
        setMessagesByThread(prev => {
          const currentMsgs = prev[serverThreadId] || [];
          const merged = mergeMessagesWithOptimistic(deduplicated, currentMsgs);
          return {
            ...prev,
            [serverThreadId]: merged,
          };
        });
      }
    } catch (msgError) {
      // If we can't get messages from DB, use current state for title generation
      msgs = messagesByThread[serverThreadId] || [];
      logger.warn('Failed to refresh messages from DB:', msgError);
    }
    return msgs;
  }, [deduplicateMessages, mergeMessagesWithOptimistic]);

  const currentStreamRef = useRef<any>(null);

  // Cleanup stream on unmount
  useEffect(() => {
    return () => {
      if (currentStreamRef.current) {
        currentStreamRef.current.close();
        currentStreamRef.current = null;
      }
    };
  }, []);

  const handleSend = useCallback(async (messageOverride?: string) => {
    const candidate = (messageOverride !== undefined ? String(messageOverride) : input).trim();
    if (!candidate || loading || isSendingRef.current) return;
    
    // Set sending flag immediately to prevent duplicates
    isSendingRef.current = true;
    
    const userMessage = candidate;
    if (messageOverride === undefined) {
      setInput('');
    }
    setError('');

    // Determine thread to use: only pass threadId if the thread is already synced on server
    const currentThreadModel = threads.find(t => t.id === currentConversationId);
    const isThreadSynced = currentThreadModel?.status === 'synced';
    const threadIdToUse = isThreadSynced ? currentConversationId : null;
    
    // For new conversations, use a temporary thread ID so optimistic messages display immediately
    const tempThreadId = threadIdToUse || `temp-thread-${Date.now()}`;
    
    // If this is a new conversation, set the temp thread ID immediately so messages show
    if (!threadIdToUse) {
      setCurrentConversationId(tempThreadId);
    }
    
    // Create temporary IDs for optimistic updates
    const tempUserMessageId = `temp-user-${Date.now()}-${Math.random()}`;
    const tempAiMessageId = `temp-ai-${Date.now()}-${Math.random()}`;
    
    // Optimistic UI: Add user message immediately
    const optimisticUserMessage: Message = {
      id: tempUserMessageId,
      text: userMessage,
      sender: 'user',
      status: 'synced',
    };
    
    // Optimistic UI: Add "Thinking..." AI message immediately
    // We will update this message in-place as tokens arrive
    const optimisticAiMessage: Message = {
      id: tempAiMessageId,
      text: 'Thinking...',
      sender: 'ai',
      status: 'pending',
    };

    // Update state immediately
    setMessagesByThread(prev => {
      const currentMsgs = prev[tempThreadId] || [];
      return {
        ...prev,
        [tempThreadId]: [...currentMsgs, optimisticUserMessage, optimisticAiMessage],
      };
    });
    
    setLoading(true);

    // Track serverThreadId so we can preserve it on error
    let serverThreadId: string | null = threadIdToUse;
    // Reset buffers
    streamBufferRef.current = '';
    displayedBufferRef.current = '';
    
    try {
      // Close previous stream if exists
      if (currentStreamRef.current) {
        currentStreamRef.current.close();
        currentStreamRef.current = null;
      }
      
      // Clear previous interval if any
      if (streamIntervalRef.current) {
        clearInterval(streamIntervalRef.current);
        streamIntervalRef.current = null;
      }

      // Start the smoothing interval
      streamIntervalRef.current = setInterval(() => {
        const target = streamBufferRef.current;
        const current = displayedBufferRef.current;
        
        if (current.length < target.length) {
          // Determine chunk size based on lag to catch up if behind
          const diff = target.length - current.length;
          // If we are very far behind (>50 chars), speed up significantly
          // If moderately behind (>10), speed up a bit
          // Otherwise 1 char per tick for smooth typing
          const chunkSize = diff > 50 ? 5 : (diff > 10 ? 2 : 1);
          
          const nextChunk = target.slice(current.length, current.length + chunkSize);
          displayedBufferRef.current += nextChunk;
          
          // Update UI state with the displayed buffer
          const targetThreadId = serverThreadId || tempThreadId;
          setMessagesByThread(prev => {
            const currentMsgs = prev[targetThreadId] || [];
            // Optimize: only update if we have the message to avoid unnecessary processing
            // (though React state updates are batched, mapping is cheap)
            const updatedMsgs = currentMsgs.map(msg => {
              if (msg.id === tempAiMessageId) {
                return {
                  ...msg,
                  text: displayedBufferRef.current,
                  status: 'streaming'
                };
              }
              return msg;
            });
            return { ...prev, [targetThreadId]: updatedMsgs };
          });
        } else {
          // Buffer empty, nothing to do. 
          // If stream finished (we need to know this), we could clear interval, 
          // but we can just let it run until component unmount or next send.
          // Or we can check a flag. For now, just idle.
        }
      }, 15); // 15ms interval ~ 66fps update rate

      // Call AI service with streaming
      const eventSource = await conversationService.streamMessage(userMessage, threadIdToUse, modelMode);
      currentStreamRef.current = eventSource;

      eventSource.addEventListener('open', () => {
        logger.info('SSE Connection opened');
      });

      eventSource.addEventListener('message', (event: any) => {
        try {
          if (!event.data) return;
          const payload = JSON.parse(event.data);

          if (payload.type === 'meta') {
            // Received real thread ID
            if (payload.threadId) {
              serverThreadId = payload.threadId;
              
              // Determine title if new conversation
              if (!threadIdToUse) {
                 const initialTitle = extractTitleFromMessage(userMessage) || 'New Conversation';
                 
                 // Create or update local thread record
                 // If we have a temp thread, we might want to migrate it or just create the real one
                 // Logic here mirrors original handleSend but inside the stream
                 const createLocalThread = async () => {
                    try {
                      let localThread = await conversationRepository.getThreadById(serverThreadId!);
                      if (!localThread) {
                        await database.write(async () => {
                          await database.get<ConversationThread>('conversation_threads').create(t => {
                            t._raw.id = serverThreadId!;
                            t.userId = authService.getCurrentUser()?.id || '';
                            t.title = initialTitle;
                            t.summary = null;
                            t.isActive = true;
                            t.isPinned = false;
                            t.status = 'synced';
                            t.createdAt = new Date();
                            t.updatedAt = new Date();
                          });
                        });
                        // Clean up pending local thread if different
                        if (currentThreadModel && currentThreadModel.id !== serverThreadId) {
                           try { await conversationRepository.deleteThread(currentThreadModel.id); } catch(e) {}
                        }
                      }
                    } catch (err) {
                      logger.warn('Error creating local thread from SSE meta:', err);
                    }
                 };
                 createLocalThread();
                 
                 // Update current conversation ID to the real one
                 if (serverThreadId !== currentConversationId) {
                   setCurrentConversationId(serverThreadId!);
                   // Migrate optimistic messages to the new ID in state
                   setMessagesByThread(prev => {
                     const msgs = prev[tempThreadId] || [];
                     const newState = { ...prev };
                     delete newState[tempThreadId];
                     newState[serverThreadId!] = msgs;
                     return newState;
                   });
                 }
              }
            }
          } else if (payload.type === 'token') {
            // Append token to buffer
            const token = payload.content || '';
            streamBufferRef.current += token;
            // Note: We don't update state here anymore; the interval handles it.
          } else if (payload.type === 'finish') {
            // Finalize message - ensure we show everything
            const finalMessage = payload.message || streamBufferRef.current;
            const actions = payload.actions;
            const modelProvider = payload.provider;
            
            // Clear interval immediately to stop typing effect and jump to final state
            if (streamIntervalRef.current) {
                clearInterval(streamIntervalRef.current);
                streamIntervalRef.current = null;
            }
            
            const targetThreadId = serverThreadId || tempThreadId;
            
            // Update state one last time
            setMessagesByThread(prev => {
              const currentMsgs = prev[targetThreadId] || [];
              const updatedMsgs = currentMsgs.map(msg => {
                if (msg.id === tempAiMessageId) {
                  return {
                    ...msg,
                    text: finalMessage,
                    status: 'synced'
                  };
                }
                return msg;
              });
              return { ...prev, [targetThreadId]: updatedMsgs };
            });

            // Persist to local DB
            // We use the temp IDs for local creation to avoid duplicates if sync runs? 
            // Actually, backend has already saved it. Sync will bring it down.
            // We should just ensure local DB reflects this state.
            // Using `createMessagesInDatabase` (adapted from original code)
            if (serverThreadId) {
               const userId = authService.getCurrentUser()?.id || '';
               const now = new Date();
               createMessagesInDatabase(
                 database,
                 serverThreadId,
                 tempUserMessageId,
                 tempAiMessageId,
                 userId,
                 userMessage,
                 { message: finalMessage, actions },
                 now
               ).then(() => {
                 // Trigger background sync to reconcile IDs
                 syncService.silentSync().catch(() => {});
                 
                 // Update title if needed (for both fast and smart modes, especially for new conversations)
                 mergeRealMessagesFromDB(serverThreadId!, getMessagesForThread).then(async (msgs) => {
                       try {
                         // Check if current title is generic
                         const currentThread = threads.find(t => t.id === serverThreadId);
                         if (!currentThread) return;
                         
                         const genericTitles = [
                           'New Conversation',
                           'New Goal',
                           'Conversation',
                           'Goal Planning',
                           'Scheduling Help'
                         ];
                         
                         const isGenericTitle = genericTitles.some(
                           generic => currentThread.title.toLowerCase() === generic.toLowerCase()
                         );
                         
                         // Only update if title is generic and we have enough messages
                         if (isGenericTitle && msgs.length >= 2) {
                           const newTitle = generateConversationTitle(msgs);
                           
                           // Only update if new title is different and more meaningful
                           if (newTitle && 
                               newTitle.toLowerCase() !== currentThread.title.toLowerCase() &&
                               newTitle.length > 5 &&
                               !genericTitles.some(gt => newTitle.toLowerCase() === gt.toLowerCase())) {
                             await conversationRepository.updateThread(serverThreadId!, {
                               title: newTitle
                             });
                             // Trigger sync to update server
                             syncService.silentSync().catch(() => {});
                           }
                         }
                       } catch (titleError) {
                         logger.warn('Failed to update conversation title:', titleError);
                         // Don't throw - title update is non-critical
                       }
                    });
               });
            }
            
            eventSource.close();
            currentStreamRef.current = null;
            setLoading(false);
            isSendingRef.current = false;
          } else if (payload.type === 'error') {
             throw new Error(payload.message || 'Stream error');
          }
        } catch (parseError) {
          logger.warn('SSE Parse Error:', parseError);
        }
      });

      eventSource.addEventListener('error', (event: any) => {
        // SSE error event doesn't always have a clear message
        logger.warn('SSE Error:', event);
        eventSource.close();
        currentStreamRef.current = null;
        
        // Clear interval
        if (streamIntervalRef.current) {
            clearInterval(streamIntervalRef.current);
            streamIntervalRef.current = null;
        }
        
        // If we haven't finished yet and received an error
        setLoading(false);
        isSendingRef.current = false;
        
        if (!streamBufferRef.current) {
           setError('Connection interrupted. Please try again.');
        } else {
           // If we have partial message, keep it but mark as error?
           // For now, assume partial success if we have text.
        }
      });

    } catch (err: any) {
      logger.error('AI Chat Setup Error:', err);
      setError('Failed to connect to AI service. Please try again.');
      setLoading(false);
      isSendingRef.current = false;
      
      // Clear interval
      if (streamIntervalRef.current) {
        clearInterval(streamIntervalRef.current);
        streamIntervalRef.current = null;
      }
      
      // Cleanup optimistic messages if nothing sent
      if (!streamBufferRef.current) {
         setMessagesByThread(prev => {
          const currentMsgs = prev[tempThreadId] || [];
          return {
            ...prev,
            [tempThreadId]: currentMsgs.filter(
              msg => msg.id !== tempUserMessageId && msg.id !== tempAiMessageId
            ),
          };
        });
      }
    }
  }, [
    currentConversationId,
    input,
    modelMode,
    loading,
    threads,
    getMessagesForThread,
    database,
    createMessagesInDatabase,
    mergeRealMessagesFromDB,
    extractTitleFromMessage,
    generateConversationTitle,
  ]);

  // After help reset completes rendering, send the pending help message once
  useEffect(() => {
    if (pendingHelpMessage && currentConversation) {
      handleSend(pendingHelpMessage);
      setPendingHelpMessage(null);
    }
  }, [pendingHelpMessage, currentConversation, handleSend]);

  // Help button should also send an initial help request to the AI
  const handleHelpPressWithSend = useCallback(async () => {
    try {
      await handleHelpPress('How can you help me?');
    } catch (e) {
      logger.warn('Failed to trigger help send:', e);
    }
  }, [handleHelpPress, handleSend]);

  const handleQuickActionPress = useCallback((action: QuickAction) => {
    setHasUserInteracted(true);
    // Pre-fill input and send
    setInput(action.prefillText);
    setTimeout(() => {
      handleSend();
    }, 100);
    // Hide onboarding after action
    setShowOnboarding(false);
    OnboardingService.setOnboardingCompleted();
  }, [handleSend]);

  // Handle initial message from navigation
  useEffect(() => {
    if (route.params?.initialMessage) {
      const initialMessage = route.params.initialMessage as string;
      // Use the improved title extraction function for consistency
      const inferredTitle = extractTitleFromMessage(initialMessage) || 'New Goal';
      
      // Create thread and send message using repository
      (async () => {
        try {
          setLoading(true);
          setError('');
          let threadIdToUse = route.params?.threadId as string | undefined;
          
          if (!threadIdToUse) {
            // Create new thread locally
            const thread = await conversationRepository.createThread({
              title: inferredTitle,
              summary: null,
              isActive: true,
              isPinned: false,
            });
            threadIdToUse = thread.id;
            setCurrentConversationId(thread.id);
          } else {
            // Use existing thread
            if (threadIdToUse) {
              const threadId = threadIdToUse; // Type narrowing
              setCurrentConversationId(threadId);
              // Load messages for existing thread
              const msgs = await getMessagesForThread(threadId);
              setMessagesByThread(prev => ({ ...prev, [threadId]: msgs }));
            }
          }

          // Clear the route params to prevent re-triggering
          navigation.setParams({ initialMessage: undefined, threadId: threadIdToUse });
          
          // Send message using handleSend
          await handleSend(initialMessage);
        } catch (err: any) {
          logger.error('AI Chat auto-send error:', (err as any)?.message || err);
          let errorMessage = 'Failed to send message. Please try again.';
          if (err.message?.includes('not authenticated')) {
            errorMessage = 'Authentication failed. Please log in again.';
          }
          setError(errorMessage);
        } finally {
          setLoading(false);
        }
      })();
    }
  }, [route.params?.initialMessage, handleSend, navigation, getMessagesForThread]);

  // Initialize onboarding on component mount
  useEffect(() => {
    initializeOnboarding();
  }, [initializeOnboarding]);

  // Track screen view
  const trackedThreadIdRef = useRef<string | null>(null);

  useEffect(() => {
    const threadKey = route.params?.threadId ?? '__default__';
    if (trackedThreadIdRef.current === threadKey) {
      return;
    }
    trackedThreadIdRef.current = threadKey;

    analyticsService.trackScreenView('ai_chat', {
      threadId: route.params?.threadId,
      hasInitialMessage: !!route.params?.initialMessage,
    }).catch(error => {
      logger.warn('Failed to track screen view analytics:', error);
    });
  }, [route.params?.threadId, route.params?.initialMessage]);

  // Cleanup timer on unmount
  // Timer removed with deprecation of follow-up; nothing to clean up here

  // Animated "Thinking..." component
  const ThinkingIndicator = () => {
    const [dots, setDots] = useState('.');
    
    useEffect(() => {
      const interval = setInterval(() => {
        setDots(prev => {
          if (prev === '.') return '..';
          if (prev === '..') return '...';
          return '.';
        });
      }, 500);
      
      return () => clearInterval(interval);
    }, []);
    
    return (
      <Text style={styles.thinkingText}>Thinking{dots}</Text>
    );
  };

  const renderMessage = (msg: Message) => {
    const isThinking = msg.sender === 'ai' && msg.status === 'pending' && msg.text === 'Thinking...';
    
    if (msg.sender === 'user') {
      return (
        <View key={msg.id} style={styles.userMsg}>
          <Text selectable style={styles.userMsgText}>{msg.text}</Text>
        </View>
      );
    }
    
    // Show "Thinking..." indicator for pending AI messages
    if (isThinking) {
      return (
        <View key={msg.id} style={styles.aiMsg}>
          <ThinkingIndicator />
        </View>
      );
    }
    
    // Check if this is structured content
    const hasScheduleContent = isScheduleContent(msg.text);
    const hasGoalBreakdownContent = isGoalBreakdownContent(msg.text);
    const hasGoalTitlesContent = isGoalTitlesContent(msg.text);
    const hasTaskContent = isTaskContent(msg.text);
    
    // Remove JSON code blocks and (when present) the goal breakdown section
    // from AI text for conversational display, then simplify redundant lines
    const baseConversational = hasGoalBreakdownContent
      ? stripGoalBreakdownFromText(msg.text)
      : msg.text.replace(/```json[\s\S]*?```/g, '').trim();
    const conversationalText = (() => {
      let text = baseConversational
        .split('\n')
        // Drop redundant confirmations like "I've scheduled ..."
        .filter(line => !/^i['']ve scheduled/i.test(line.trim()))
        .join('\n');
      const taskTitleFromRoute = route?.params?.taskTitle;
      if (taskTitleFromRoute) {
        // Replace generic 'your event' with the task title
        text = text.replace(/\byour event\b/gi, taskTitleFromRoute);
      }
      return text.trim();
    })();

    // Use full width for structured content to prevent truncation
    const shouldUseFullWidth = hasGoalBreakdownContent || hasScheduleContent || hasTaskContent || hasGoalTitlesContent;
    
    return (
      <View key={msg.id} style={[styles.aiMsg, shouldUseFullWidth && styles.aiMsgFullWidth]}>
        {/* Show conversational text - show it even with goal breakdown so user sees context */}
        {conversationalText && conversationalText.trim() && (
          <View style={styles.conversationalTextContainer}>
            <Markdown
              style={markdownStyles}
            >
              {conversationalText}
            </Markdown>
          </View>
        )}
        {/* Structured content components handle their own padding */}
        {hasScheduleContent && (
          <ScheduleDisplay text={msg.text} taskTitle={route?.params?.taskTitle} />
        )}
        {hasGoalBreakdownContent && (
          <GoalBreakdownDisplay 
            key={`goal-breakdown-${msg.id}`}
            text={msg.text} 
            onSaveGoal={handleSaveGoal} 
            conversationalText={conversationalText}
            conversationTitle={currentConversation?.title}
          />
        )}
        {hasGoalTitlesContent && (
          <GoalTitlesDisplay
            text={msg.text}
            onAction={(prefill, sendNow) => {
              setInput(prefill);
              if (sendNow) {
                setTimeout(() => {
                  handleSend();
                }, 50);
              }
            }}
          />
        )}
        {hasTaskContent && (
          <TaskDisplay text={msg.text} onSaveTasks={handleSaveTasks} />
        )}
        {showOnboarding && msg.text.includes('Hi there, and welcome to Mind Clear') && (
          <QuickActions
            actions={quickActions}
            onActionPress={handleQuickActionPress}
            visible={true}
          />
        )}
      </View>
    );
  };

  const renderConversationItem = (thread: ConversationThread) => {
    const isActive = thread.id === currentConversationId;
    const messages = messagesByThread[thread.id] || [];
    const lastMessage = messages[messages.length - 1];
    
    return (
      <TouchableOpacity
        key={thread.id}
        style={[styles.conversationItem, isActive && styles.activeConversationItem]}
        onPress={async () => {
          try {
            setCurrentConversationId(thread.id);
            // Always load messages to ensure we have the latest from database
            // This is important when app reopens and messagesByThread is empty
            const msgs = await getMessagesForThread(thread.id);
            setMessagesByThread(prev => ({ ...prev, [thread.id]: msgs }));
            toggleSidebar();
          } catch (err) {
            logger.error('Failed to switch conversation:', err);
            // Don't close sidebar on error so user can retry
          }
        }}
      >
        <View style={styles.conversationHeader}>
          <View style={styles.conversationTitleRow}>
            <Text style={[styles.conversationTitle, isActive && styles.activeConversationTitle]} numberOfLines={1}>
              {thread.title}
            </Text>
            {thread.isPinned && <Icon name="pin" size={12} color={colors.primary} style={styles.pinIcon} />}
          </View>
          <View style={styles.conversationActions}>
            <TouchableOpacity
              style={styles.actionButton}
              onPress={() => togglePinConversation(thread.id)}
            >
              <Icon 
                name={thread.isPinned ? "pin-fill" : "pin"} 
                size={16} 
                color={colors.text.secondary} 
              />
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.actionButton}
              onPress={async () => { await deleteConversation(thread.id); }}
            >
              <Icon name="trash" size={16} color={colors.text.secondary} />
            </TouchableOpacity>
          </View>
        </View>
        <Text style={styles.conversationPreview} numberOfLines={1}>
          {lastMessage?.text || 'No messages yet'}
        </Text>
        <Text style={styles.conversationDate}>
          {thread.updatedAt.toLocaleDateString()}
        </Text>
      </TouchableOpacity>
    );
  };

  return (
    <SafeAreaView style={styles.container} edges={['top', 'left', 'right']}>
      <StatusBar barStyle="dark-content" backgroundColor={colors.background.primary} translucent={false} animated />
        <ScreenHeader
          title={currentConversation?.title || 'Mind Clear AI Chat'}
          leftAction={(
            <TouchableOpacity onPress={toggleSidebar} style={styles.menuButton}>
              <Icon name="three-bars" size={20} color={colors.text.primary} />
            </TouchableOpacity>
          )}
          rightActions={(
            <TouchableOpacity style={styles.helpButton} onPress={handleHelpPressWithSend}>
              <Icon name="question" size={20} color={colors.text.primary} />
            </TouchableOpacity>
          )}
          withDivider
        />


      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        keyboardVerticalOffset={Platform.OS === 'ios' ? 0 : 20}
      >
        <ScrollView 
          style={styles.messagesContainer} 
          contentContainerStyle={{ 
            paddingBottom: Platform.OS === 'android' ? 160 + insets.bottom : 160 
          }}
          keyboardShouldPersistTaps="handled"
        >
          {/* AI Disclaimer */}
          <View style={styles.disclaimerContainer}>
            <Icon name="info" size={16} color={colors.text.secondary} />
            <Text style={styles.disclaimerText}>
              AI-generated content. Please verify important information and use your best judgment.
            </Text>
          </View>
          
          {currentConversation?.messages.map((msg) => renderMessage(msg))}
          {error ? <Text style={styles.error}>{error}</Text> : null}
        </ScrollView>
        
        <View style={styles.inputRow}>
          <TextInput
            style={styles.input}
            placeholder="Type a message..."
            placeholderTextColor={colors.text.secondary}
            value={input}
            onChangeText={(text) => {
              setInput(text);
              if (showOnboarding && !hasUserInteracted) {
                setHasUserInteracted(true);
              }
            }}
            onSubmitEditing={() => handleSend()}
            returnKeyType="send"
            editable={!loading}
            multiline
            autoCorrect={false}
            autoCapitalize="sentences"
          />
          <View style={styles.inputActions}>
            <TouchableOpacity
              accessibilityLabel={`Model: ${modelMode === 'fast' ? 'Auto/Fast' : 'Smart'}. Tap to change.`}
              accessibilityRole="button"
              style={styles.modelPill}
              onPress={() => setShowModelPicker(prev => !prev)}
            >
              <Icon
                name={modelMode === 'fast' ? 'zap' : 'comment-discussion'}
                size={16}
                color={colors.primary}
              />
              <Text style={styles.modelPillText}>{modelMode === 'fast' ? 'Auto' : 'Smart'}</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.sendBtn} onPress={() => handleSend()} disabled={loading}>
              <Text style={styles.sendBtnText}>Send</Text>
            </TouchableOpacity>
          </View>
        </View>

        {showModelPicker && (
          <View style={styles.modelDrawer}>
            <Text style={styles.modelDrawerTitle}>Choose response style</Text>
            <TouchableOpacity
              accessibilityLabel="Use Auto / Fast mode for quicker responses (Groq)"
              accessibilityRole="button"
              style={[styles.modelOption, modelMode === 'fast' && styles.modelOptionActive]}
              onPress={() => {
                setModelMode('fast');
                setShowModelPicker(false);
              }}
            >
              <View style={styles.modelOptionHeader}>
                <Icon name="zap" size={18} color={colors.primary} />
                <Text style={styles.modelOptionTitle}>Auto / Fast</Text>
              </View>
              <Text style={styles.modelOptionSubtitle}>Groq • Low latency</Text>
            </TouchableOpacity>
            <TouchableOpacity
              accessibilityLabel="Use Smart mode for deeper reasoning (Gemini)"
              accessibilityRole="button"
              style={[styles.modelOption, modelMode === 'smart' && styles.modelOptionActive]}
              onPress={() => {
                setModelMode('smart');
                setShowModelPicker(false);
              }}
            >
              <View style={styles.modelOptionHeader}>
                <Icon name="comment-discussion" size={18} color={colors.text.primary} />
                <Text style={styles.modelOptionTitle}>Smart</Text>
              </View>
              <Text style={styles.modelOptionSubtitle}>Gemini • More depth</Text>
            </TouchableOpacity>
          </View>
        )}
      </KeyboardAvoidingView>

      {/* Sidebar Overlay */}
      {sidebarVisible && (
        <Animated.View
          style={[
            styles.overlay,
            {
              opacity: overlayAnimation,
            },
          ]}
          onTouchEnd={toggleSidebar}
        />
      )}

      {/* Sidebar */}
      <Animated.View
        style={[
          styles.sidebar,
          {
            transform: [{ translateX: sidebarAnimation }],
          },
        ]}
      >
                 <View style={styles.sidebarHeader}>
           <Text style={styles.sidebarTitle}>Conversations</Text>
           <TouchableOpacity onPress={toggleSidebar} style={styles.closeButton}>
             <Icon name="x" size={18} color={colors.text.secondary} />
           </TouchableOpacity>
         </View>

        <View style={styles.sidebarActions}>
          <TouchableOpacity style={styles.newConversationButton} onPress={startNewConversation}>
            <Text style={styles.newConversationButtonText}>+ New Conversation</Text>
          </TouchableOpacity>
          
          {threads.some(t => !t.isPinned) && (
            <TouchableOpacity style={styles.clearButton} onPress={clearNonPinnedConversations}>
              <Text style={styles.clearButtonText}>Clear Non-Pinned</Text>
            </TouchableOpacity>
          )}
        </View>

        <ScrollView style={styles.conversationsList}>
          {threads.map(renderConversationItem)}
        </ScrollView>
      </Animated.View>
    </SafeAreaView>
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
    backgroundColor: colors.secondary,
  },
  menuButton: {
    padding: spacing.sm,
    borderRadius: borderRadius.sm,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitle: {
    fontSize: typography.fontSize.lg,
    fontWeight: typography.fontWeight.bold,
    color: colors.text.primary,
    flex: 1,
    textAlign: 'center',
  },
  messagesContainer: {
    flex: 1,
    padding: spacing.md,
  },
  userMsg: {
    alignSelf: 'flex-end',
    backgroundColor: colors.primary,
    borderRadius: borderRadius.lg,
    padding: spacing.md,
    marginBottom: spacing.sm,
    maxWidth: '80%',
  },
  userMsgText: {
    color: colors.secondary,
    fontSize: typography.fontSize.base,
  },
  pendingIndicator: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: spacing.xs,
    gap: spacing.xs,
  },
  pendingText: {
    color: colors.text.secondary,
    fontSize: typography.fontSize.sm,
    fontStyle: 'italic',
  },
  thinkingText: {
    color: colors.text.secondary,
    fontSize: typography.fontSize.base,
    fontStyle: 'italic',
  },
  aiMsg: {
    alignSelf: 'flex-start',
    backgroundColor: colors.aiMessage,
    borderRadius: borderRadius.lg,
    padding: spacing.md,
    marginBottom: spacing.sm,
    maxWidth: '80%',
  },
  aiMsgFullWidth: {
    maxWidth: '95%', // Slightly less than 100% to avoid edge issues
    width: '95%',
    alignSelf: 'stretch', // Allow it to expand
  },
  aiMsgText: {
    color: colors.text.primary,
    fontSize: typography.fontSize.base,
  },
  conversationalTextContainer: {
    // This container ensures conversational text has proper padding
    // while allowing structured content components to handle their own spacing
  },
  inputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: spacing.md,
    borderTopWidth: 1,
    borderTopColor: colors.border.light,
    backgroundColor: colors.background.surface,
  },
  input: {
    flex: 1,
    minHeight: 44,
    maxHeight: 100,
    borderColor: colors.border.light,
    borderWidth: 1,
    borderRadius: borderRadius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    backgroundColor: colors.secondary,
    marginRight: spacing.sm,
    textAlignVertical: 'top',
    color: '#000000', // Force black text to ensure visibility
    fontSize: typography.fontSize.base,
  },
  inputActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
  headerActions: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  modelPill: {
    minHeight: 44,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
    borderRadius: borderRadius.md,
    borderWidth: 1,
    borderColor: colors.border.light,
    backgroundColor: colors.secondary,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
  modelPillText: {
    fontSize: typography.fontSize.sm,
    color: colors.text.primary,
    fontWeight: typography.fontWeight.medium,
  },
  modelDrawer: {
    marginHorizontal: spacing.md,
    marginBottom: spacing.sm,
    padding: spacing.md,
    borderRadius: borderRadius.lg,
    backgroundColor: colors.background.surface,
    borderWidth: 1,
    borderColor: colors.border.light,
    gap: spacing.sm,
  },
  modelDrawerTitle: {
    fontSize: typography.fontSize.sm,
    fontWeight: typography.fontWeight.bold,
    color: colors.text.primary,
  },
  modelOption: {
    borderRadius: borderRadius.md,
    borderWidth: 1,
    borderColor: colors.border.light,
    padding: spacing.sm,
    backgroundColor: colors.secondary,
  },
  modelOptionActive: {
    borderColor: colors.primary,
    backgroundColor: colors.background.primary,
  },
  modelOptionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
  modelOptionTitle: {
    fontSize: typography.fontSize.base,
    fontWeight: typography.fontWeight.bold,
    color: colors.text.primary,
  },
  modelOptionSubtitle: {
    marginTop: 2,
    fontSize: typography.fontSize.xs,
    color: colors.text.secondary,
  },
  helpButton: {
    padding: spacing.sm,
    borderRadius: borderRadius.sm,
    marginRight: spacing.sm,
  },
  sendBtn: {
    backgroundColor: colors.primary,
    borderRadius: borderRadius.md,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
  },
  sendBtnText: {
    color: colors.secondary,
    fontWeight: typography.fontWeight.bold,
    fontSize: typography.fontSize.base,
  },
  error: {
    color: colors.error,
    marginTop: spacing.sm,
  },
  // sign out styles removed; sign out handled via Profile screen
  overlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'black',
    zIndex: 1000,
  },
  sidebar: {
    position: 'absolute',
    top: 0,
    left: 0,
    width: '80%',
    height: '100%',
    backgroundColor: colors.background.surface,
    borderRightWidth: 1,
    borderRightColor: colors.border.light,
    zIndex: 1001,
  },
  sidebarHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.border.light,
    paddingTop: 60, // Account for status bar
  },
  sidebarTitle: {
    fontSize: typography.fontSize.lg,
    fontWeight: typography.fontWeight.bold,
    color: colors.text.primary,
  },
  closeButton: {
    padding: spacing.sm,
    borderRadius: borderRadius.sm,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sidebarActions: {
    padding: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.border.light,
  },
  newConversationButton: {
    backgroundColor: colors.primary,
    borderRadius: borderRadius.md,
    padding: spacing.md,
    alignItems: 'center',
    marginBottom: spacing.sm,
  },
  newConversationButtonText: {
    color: colors.secondary,
    fontWeight: typography.fontWeight.bold,
    fontSize: typography.fontSize.base,
  },
  clearButton: {
    backgroundColor: colors.error,
    borderRadius: borderRadius.md,
    padding: spacing.md,
    alignItems: 'center',
  },
  clearButtonText: {
    color: colors.secondary,
    fontWeight: typography.fontWeight.bold,
    fontSize: typography.fontSize.base,
  },
  disclaimerContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.background.surface,
    padding: spacing.sm,
    margin: spacing.sm,
    borderRadius: borderRadius.md,
    borderLeftWidth: 3,
    borderLeftColor: colors.primary,
  },
  disclaimerText: {
    color: colors.text.secondary,
    fontSize: typography.fontSize.sm,
    marginLeft: spacing.xs,
    flex: 1,
    lineHeight: 18,
  },
  conversationsList: {
    flex: 1,
  },
  conversationItem: {
    padding: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.border.light,
  },
  activeConversationItem: {
    backgroundColor: colors.primary + '20',
  },
  conversationHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: spacing.xs,
  },
  conversationTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  conversationTitle: {
    fontSize: typography.fontSize.base,
    fontWeight: typography.fontWeight.bold,
    color: colors.text.primary,
    flex: 1,
  },
  activeConversationTitle: {
    color: colors.primary,
  },
  pinIcon: {
    marginLeft: spacing.xs,
  },
  conversationActions: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  actionButton: {
    padding: spacing.xs,
    marginLeft: spacing.xs,
    minWidth: 24,
    minHeight: 24,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: borderRadius.sm,
  },
  conversationPreview: {
    fontSize: typography.fontSize.sm,
    color: colors.text.secondary,
    marginBottom: spacing.xs,
  },
  conversationDate: {
    fontSize: typography.fontSize.xs,
    color: colors.text.secondary,
  },
});

// Theme-aware Markdown styles
const markdownStyles = StyleSheet.create({
  body: {
    color: colors.text.primary,
    fontSize: typography.fontSize.base,
  },
  text: {
    color: colors.text.primary,
  },
  strong: {
    fontWeight: 'bold',
    color: colors.text.primary,
  },
  bullet_list: {
    marginVertical: spacing.xs,
  },
  ordered_list: {
    marginVertical: spacing.xs,
  },
  list_item: {
    marginVertical: 2,
  },
  paragraph: {
    marginTop: 0,
    marginBottom: spacing.xs,
  },
  code_inline: {
    backgroundColor: colors.background.surface,
    paddingHorizontal: 4,
    borderRadius: borderRadius.sm,
  },
});

// Create the enhanced component with WatermelonDB observables
const enhance = withObservables<{ database: Database }, "threads">(
  ['database'],
  // @ts-expect-error - WatermelonDB's withObservables type definition expects the factory to return the keys, but implementation requires observables object
  ({ database }) => {
    // Get userId at render time, not module load time
    const userId = authService.getCurrentUser()?.id;
    if (!userId) {
      // Return empty observable if no user - use a query that returns nothing
      const emptyQuery = database.collections.get<ConversationThread>('conversation_threads').query(
        Q.where('id', 'non-existent-id')
      );
      return { threads: emptyQuery.observe() };
    }
    const threadsQuery = database.collections.get<ConversationThread>('conversation_threads').query(
      Q.where('user_id', userId),
      Q.where('status', Q.notEq('pending_delete'))
    );
    const threads: Observable<ConversationThread[]> = threadsQuery.observe();
    
    return {
      threads,
    };
  }
);

const EnhancedAIChatScreen = enhance(AIChatScreen);

const AIChatScreenWithDatabase = (props: any) => {
  const database = useDatabase();
  return <EnhancedAIChatScreen {...props} database={database} />;
};

export default AIChatScreenWithDatabase;