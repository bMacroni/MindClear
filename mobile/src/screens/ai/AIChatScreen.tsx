import React, { useState, useRef, useEffect, useCallback } from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet, ScrollView, ActivityIndicator, Platform, Animated, Dimensions } from 'react-native';
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
import { secureConfigService } from '../../services/secureConfig';
import analyticsService from '../../services/analyticsService';
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
import QuickActions from '../../components/ai/QuickActions';
import ScheduleDisplay from '../../components/ai/ScheduleDisplay';
import GoalBreakdownDisplay from '../../components/ai/GoalBreakdownDisplay';
import GoalTitlesDisplay from '../../components/ai/GoalTitlesDisplay';
import TaskDisplay from '../../components/ai/TaskDisplay';
import Markdown from 'react-native-markdown-display';
import { conversationService, ConversationThreadWithMessages, ConversationThread } from '../../services/conversationService';

interface Message {
  id: number;
  text: string;
  sender: 'user' | 'ai';
}

interface Conversation {
  id: string;
  title: string;
  messages: Message[];
  isPinned: boolean;
  createdAt: Date;
  lastMessageAt: Date;
}

export default function AIChatScreen({ navigation, route }: any) {
  const insets = useSafeAreaInsets();
  const screenWidth = Dimensions.get('window').width;
  
  // Animation for sidebar
  const sidebarAnimation = useRef(new Animated.Value(-screenWidth * 0.8)).current;
  const overlayAnimation = useRef(new Animated.Value(0)).current;
  
  const [conversations, setConversations] = useState<Conversation[]>([
    {
      id: '1',
      title: 'General Chat',
      messages: [{ id: 1, text: 'Hi there, and welcome to Mind Clear! I\'m here to help you structure your goals and tasks in a way that feels manageable. What would you like to do first?', sender: 'ai' }],
      isPinned: false,
      createdAt: new Date(),
      lastMessageAt: new Date(),
    },
  ]);
  
  const [currentConversationId, setCurrentConversationId] = useState('1');
  const [threadsLoaded, setThreadsLoaded] = useState(false);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [sidebarVisible, setSidebarVisible] = useState(false);

  // Onboarding state management
  const [_onboardingState, setOnboardingState] = useState<OnboardingState>({ isCompleted: false });
  const [showOnboarding, setShowOnboarding] = useState(false);
  const [hasUserInteracted, setHasUserInteracted] = useState(false);

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

  const currentConversation = conversations.find(c => c.id === currentConversationId);

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
    try {
      const thread = await conversationService.createThread('New Conversation', null);
      const newConversation: Conversation = {
        id: thread.id,
        title: thread.title || 'New Conversation',
        messages: [{ id: Date.now(), text: 'Hi there, and welcome to Mind Clear! I\'m here to help you structure your goals and tasks in a way that feels manageable. What would you like to do first?', sender: 'ai' }],
        isPinned: false,
        createdAt: new Date(thread.created_at || new Date()),
        lastMessageAt: new Date(thread.updated_at || new Date()),
      };
      setConversations(prev => [newConversation, ...prev]);
      setCurrentConversationId(thread.id);
    } catch (err) {
      console.error('Failed to create conversation thread:', err);
    } finally {
      toggleSidebar();
    }
  };

  const deleteConversation = (conversationId: string) => {
    (async () => {
      try {
        // Attempt server delete (soft delete)
        if (conversationId && conversationId.includes('-')) {
          await conversationService.deleteThread(conversationId);
        }
      } catch (err) {
        console.warn('Failed to delete server thread, removing locally anyway:', err);
      } finally {
        const updatedConversations = conversations.filter(c => c.id !== conversationId);
        setConversations(updatedConversations);
        if (conversationId === currentConversationId && updatedConversations.length > 0) {
          setCurrentConversationId(updatedConversations[0].id);
        } else if (updatedConversations.length === 0) {
          startNewConversation();
        }
      }
    })();
  };

  const togglePinConversation = (conversationId: string) => {
    setConversations(conversations.map(c => 
      c.id === conversationId ? { ...c, isPinned: !c.isPinned } : c
    ));
  };

  const clearNonPinnedConversations = () => {
    (async () => {
      try {
        const hadPinned = conversations.some(c => c.isPinned);
        if (!hadPinned) {
          // No pinned: delete ALL threads on server then create a fresh one
          const allServerIds = conversations.map(c => c.id).filter(id => id && id.includes('-'));
          if (allServerIds.length) {
            await conversationService.bulkDeleteThreads(allServerIds, { concurrency: 3, timeoutMs: 25000 });
          }
          setConversations([]);
          await startNewConversation();
          return;
        }
        // Otherwise delete only non-pinned
        const toDelete = conversations.filter(c => !c.isPinned);
        const serverIds = toDelete.map(c => c.id).filter(id => id && id.includes('-'));
        if (serverIds.length) {
          await conversationService.bulkDeleteThreads(serverIds, { concurrency: 3, timeoutMs: 25000 });
        }
      } catch (err) {
        console.warn('Failed to clear some threads on server:', err);
      } finally {
        let pinnedSnapshot: Conversation[] = [];
        setConversations(prev => {
          pinnedSnapshot = prev.filter(c => c.isPinned);
          return pinnedSnapshot;
        });
        if (pinnedSnapshot.length > 0 && !pinnedSnapshot.find(c => c.id === currentConversationId)) {
          setCurrentConversationId(pinnedSnapshot[0].id);
        } else if (pinnedSnapshot.length === 0) {
          await startNewConversation();
        }
      }
    })();
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
  // Load persisted threads on mount
  useEffect(() => {
    (async () => {
      try {
        const threads = await conversationService.listThreads();
        if (threads && threads.length > 0) {
          const mapped: Conversation[] = threads.map((t: ConversationThread) => {
            const last = t.last_message;
            const lastMsg: Message | null = last
              ? {
                  id: Date.parse(last.created_at || t.updated_at || new Date().toISOString()) || Date.now(),
                  text: last.content,
                  sender: last.role === 'user' ? 'user' : 'ai',
                }
              : null;
            return {
              id: t.id,
              title: t.title || 'Conversation',
              messages: lastMsg ? [lastMsg] : [{ id: 1, text: 'Hi there, and welcome to Mind Clear! I\'m here to help you structure your goals and tasks in a way that feels manageable. What would you like to do first?', sender: 'ai' }],
              isPinned: false,
              createdAt: new Date(t.created_at || new Date()),
              lastMessageAt: new Date(t.updated_at || new Date()),
            };
          });
          setConversations(mapped);
          setCurrentConversationId(mapped[0].id);
        }
      } catch (err) {
        console.warn('Failed to load conversation threads:', err);
      } finally {
        setThreadsLoaded(true);
      }
    })();
  }, []);

  const loadThreadMessages = useCallback(async (threadId: string) => {
    try {
      const data: ConversationThreadWithMessages = await conversationService.getThread(threadId);
      const msgs: Message[] = (data.messages || []).map(m => ({
        id: Date.parse(m.created_at) || Date.now(),
        text: m.content,
        sender: m.role === 'user' ? 'user' : 'ai',
      }));
      setConversations(prev => prev.map(c => (c.id === threadId ? {
        ...c,
        messages: msgs.length > 0 ? msgs : c.messages,
        lastMessageAt: new Date(data.thread.updated_at || new Date()),
        title: data.thread.title || c.title,
      } : c)));
    } catch (err) {
      console.warn('Failed to load thread messages:', err);
    }
  }, []);


  

  const handleHelpPress = useCallback(async () => {
    await OnboardingService.resetOnboarding();
    setShowOnboarding(true);
    setHasUserInteracted(false);
    setOnboardingState({ isCompleted: false });
    // Reset current conversation to welcome message
    const resetConversation: Conversation = {
      id: currentConversationId,
      title: 'General Chat',
      messages: [{ id: 1, text: 'Welcome to Mind Clear! How can I help you today?', sender: 'ai' }],
      isPinned: false,
      createdAt: new Date(),
      lastMessageAt: new Date(),
    };
    setConversations(prev => prev.map(c => 
      c.id === currentConversationId ? resetConversation : c
    ));
  }, [currentConversationId]);

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
    // Look for patterns that indicate goal breakdown with milestones and steps
    const goalBreakdownPatterns = [
      /\*\*goal\*\*:/i,
      /\*\*description\*\*:/i,
      /\*\*milestones\*\*:/i,
      /milestone\s+\d+/i,
      /\*\*milestone\s+\d+/i,
      /break.*down.*into/i,
      /structured.*plan/i,
      /milestone.*steps/i,
    ];
    
    // Check if the text contains milestone patterns
    const hasMilestonePatterns = goalBreakdownPatterns.some(pattern => pattern.test(text));
    
    // Check if it contains bullet points (indicating steps)
    const hasBulletPoints = /\n[•\-\*]\s*.+$/im.test(text);
    
    // Check for goal-related keywords
    const hasGoalKeywords = /goal|milestone|step|breakdown|plan/i.test(text);
    
    // Check for the specific format with **Goal:** and **Milestones:**
    const hasGoalFormat = /\*\*goal\*\*:.*\*\*milestones\*\*:/is.test(text);
    
    // Check for standardized JSON format
    const hasJsonGoalFormat = /"category":\s*"goal"/i.test(text);
    // Treat titles-only payloads differently so we render a list component
    const isTitlesOnly = /"category"\s*:\s*"goal"[\s\S]*"goals"\s*:\s*\[\s*"/.test(text);
    
    return ((hasMilestonePatterns && hasBulletPoints && hasGoalKeywords) || hasGoalFormat || hasJsonGoalFormat) && !isTitlesOnly;
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
      /\*\*goal\*\*:/i,
      /\*\*milestones\*\*:/i,
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

  const generateConversationTitle = (messages: Message[]): string => {
    // Get all user messages to analyze the conversation topic
    const userMessages = messages.filter(msg => msg.sender === 'user').map(msg => msg.text);
    
    if (userMessages.length === 0) {
      return 'New Conversation';
    }
    
    // If it's the first message, use it to generate a title
    if (userMessages.length === 1) {
      const firstMessage = userMessages[0].toLowerCase();
      
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
      
      // Check for topic patterns
      for (const topic of topicPatterns) {
        if (topic.pattern.test(firstMessage)) {
          return topic.title;
        }
      }
      
      // If no specific pattern matches, create a title from the first message
      const words = firstMessage.split(' ').filter(word => word.length > 2);
      if (words.length > 0) {
        // Take first 2-3 meaningful words and capitalize them
        const titleWords = words.slice(0, 3).map(word => 
          word.charAt(0).toUpperCase() + word.slice(1)
        );
        return titleWords.join(' ');
      }
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
    
    // Fallback: use the first few words of the first message
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

  const handleSend = useCallback(async (messageOverride?: string) => {
    const candidate = (messageOverride !== undefined ? String(messageOverride) : input).trim();
    if (!candidate || loading || !currentConversation) {return;}
    
    const userMessage = candidate;
    if (messageOverride === undefined) {
      setInput('');
    }
    setLoading(true);
    setError('');

    // Add user message to conversation
    const updatedConversations = conversations.map(c => {
      if (c.id === currentConversationId) {
        const newMessage: Message = {
          id: Date.now(),
          text: userMessage,
          sender: 'user',
        };
        
        const updatedMessages = [...c.messages, newMessage];
        const newTitle = c.title === 'New Conversation' || c.title === 'Conversation' 
          ? generateConversationTitle(updatedMessages)
          : c.title;
        
        return {
          ...c,
          messages: updatedMessages,
          lastMessageAt: new Date(),
          title: newTitle,
        };
      }
      return c;
    });
    
    setConversations(updatedConversations);

    try {
      const token = await authService.getAuthToken();
      // Ensure we have a persisted thread id for this conversation
      let threadIdToUse = currentConversationId;
      if (!threadIdToUse || !threadIdToUse.includes('-')) {
        const created = await conversationService.createThread(currentConversation?.title || 'New Conversation', null);
        threadIdToUse = created.id;
        // swap conversation id to server id
        setConversations(prev => prev.map(c => c.id === currentConversationId ? { ...c, id: created.id } : c));
        setCurrentConversationId(created.id);
      }
      const response = await axios.post(
        `${getSecureApiBaseUrl()}/ai/chat`,
        { message: userMessage, threadId: threadIdToUse },
        { headers: { Authorization: `Bearer ${token}` } }
      );
      
      // Extract message and actions from response
      const responseData = response.data || response;
      const message = responseData.message;
      const actions = responseData.actions || [];
      
      // Track AI message sent analytics
      // Track AI message sent analytics
      analyticsService.trackAIMessageSent({
        message: message ?? '',
        threadId: route.params?.threadId,
        context: null // No additional context available in this flow
      }).catch(error => {
        logger.warn('Failed to track AI message analytics:', error);
      });

      // Add AI response to conversation
      const aiMessage: Message = {
        id: Date.now() + 1,
        text: message,
        sender: 'ai',
      };
      
      setConversations(prev => prev.map(c => {
        if (c.id === currentConversationId) {
          return {
            ...c,
            messages: [...c.messages, aiMessage],
            lastMessageAt: new Date(),
          };
        }
        return c;
      }));

      // Handle actions (show toast notifications for completed actions)
      actions.forEach((action: any) => {
        // Only handle create/update/delete actions
        if (["create", "update", "delete"].includes(action.action_type)) {
          let actionVerb = '';
          if (action.action_type === 'create') actionVerb = 'created';
          if (action.action_type === 'update') actionVerb = 'updated';
          if (action.action_type === 'delete') actionVerb = 'deleted';
          const entity = action.entity_type.replace('_', ' ');
          const title = action.details?.title || action.details?.name || '';
          // Show success message
          const successMessage = `${entity.charAt(0).toUpperCase() + entity.slice(1)}${title ? ` "${title}"` : ''} ${actionVerb}.`;
          // Action completed successfully
        }
        // If error
        if (action.details && action.details.error) {
          const errorMessage = `Failed to ${action.action_type} ${action.entity_type}: ${action.details.error}`;
          console.error('❌ Action failed:', errorMessage);
        }
      });
    } catch (err: any) {
      console.error('AI Chat error:', (err as any)?.message || err);
      
      let errorMessage = 'AI failed to respond. Please try again.';
      if (err.response?.status === 401) {
        errorMessage = 'Authentication failed. Please log in again.';
      } else if (err.response?.status === 500) {
        errorMessage = 'Server error. Please try again later.';
      } else if (err.code === 'NETWORK_ERROR') {
        errorMessage = 'Network error. Please check your connection.';
      } else if (err.response?.data?.message) {
        errorMessage = err.response.data.message;
      }
      
      setError(errorMessage);
    } finally {
      setLoading(false);
    }
  }, [conversations, currentConversation, currentConversationId, input, loading]);

  // Help button should also send an initial help request to the AI
  const handleHelpPressWithSend = useCallback(async () => {
    try {
      await handleHelpPress();
      const helpMessage = 'How can you help me?';
      handleSend(helpMessage);
    } catch (e) {
      console.warn('Failed to trigger help send:', e);
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
      // Try to derive a concise title from the initial message (goal-focused)
      const deriveTitle = (msg: string): string => {
        const cleaned = String(msg || '').trim();
        // Common prefixes
        const prefixes = [
          /^help me break down this goal:\s*/i,
          /^can you help me (update|with) (the\s*)?/i,
          /^help me with (the\s*)?/i,
          /^please (help|assist) (me\s*)?(with\s*)?/i,
        ];
        let text = cleaned;
        for (const p of prefixes) {text = text.replace(p, '');}
        // Remove trailing question marks/periods and limit length
        text = text.replace(/[?.!\s]+$/g, '').trim();
        // If it still contains leading "goal:" or quotes, strip them
        text = text.replace(/^goal:\s*/i, '').replace(/^"|"$/g, '').trim();
        // Shorten to ~32 chars if very long
        if (text.length > 32) {text = text.slice(0, 32).trim() + '…';}
        return text || 'Goal Help';
      };
      const inferredTitle = deriveTitle(initialMessage);
      
      // Create a new conversation; we'll append the user's initial message once during auto-send
      // Auto-create a server thread if not provided via route
      (async () => {
        try {
          const token = await authService.getAuthToken();
          setLoading(true);
          setError('');
          let threadIdToUse = route.params?.threadId as string | undefined;
          if (!threadIdToUse) {
            const created = await conversationService.createThread(inferredTitle, null);
            threadIdToUse = created.id;
            const newConversation: Conversation = {
              id: created.id,
              title: created.title || inferredTitle,
              messages: [ { id: 1, text: 'Welcome to Mind Clear! How can I help you today?', sender: 'ai' } ],
              isPinned: false,
              createdAt: new Date(created.created_at || new Date()),
              lastMessageAt: new Date(created.updated_at || new Date()),
            };
            setConversations(prev => [newConversation, ...prev]);
            setCurrentConversationId(created.id);
          } else {
            // Prepare local conversation for existing thread id
            const thread = await conversationService.getThread(threadIdToUse);
            const msgs: Message[] = (thread.messages || []).map(m => ({ id: Date.parse(m.created_at) || Date.now(), text: m.content, sender: m.role === 'user' ? 'user' : 'ai' }));
            const conv: Conversation = {
              id: thread.thread.id,
              title: thread.thread.title || inferredTitle,
              messages: msgs.length ? msgs : [ { id: 1, text: 'Welcome to Mind Clear! How can I help you today?', sender: 'ai' } ],
              isPinned: false,
              createdAt: new Date(thread.thread.created_at || new Date()),
              lastMessageAt: new Date(thread.thread.updated_at || new Date()),
            };
            setConversations(prev => [conv, ...prev]);
            setCurrentConversationId(conv.id);
          }
          // Clear the route params to prevent re-triggering
          navigation.setParams({ initialMessage: undefined, threadId: threadIdToUse });
          const response = await axios.post(
            `${getSecureApiBaseUrl()}/ai/chat`,
            { message: initialMessage, threadId: threadIdToUse },
            { headers: { Authorization: `Bearer ${token}` } }
          );
          
          // Extract message and actions from response
          const responseData = response.data || response;
          const message = responseData.message;
          const actions = responseData.actions || [];
          
          const aiMessage: Message = { id: Date.now() + 1, text: message, sender: 'ai' };
          const threadIdFinal = (route.params?.threadId as string) || (navigation.getState && threadIdToUse) || threadIdToUse;
          if (threadIdFinal) {
            setConversations(prev => prev.map(c => (c.id === threadIdFinal ? { ...c, messages: [...c.messages, aiMessage], lastMessageAt: new Date() } : c)));
          }

          // Handle actions (show toast notifications for completed actions)
          actions.forEach((action: any) => {
            // Only handle create/update/delete actions
            if (["create", "update", "delete"].includes(action.action_type)) {
              let actionVerb = '';
              if (action.action_type === 'create') actionVerb = 'created';
              if (action.action_type === 'update') actionVerb = 'updated';
              if (action.action_type === 'delete') actionVerb = 'deleted';
              const entity = action.entity_type.replace('_', ' ');
              const title = action.details?.title || action.details?.name || '';
              // Show success message
              const successMessage = `${entity.charAt(0).toUpperCase() + entity.slice(1)}${title ? ` "${title}"` : ''} ${actionVerb}.`;
              // Action completed successfully
            }
            // If error
            if (action.details && action.details.error) {
              const errorMessage = `Failed to ${action.action_type} ${action.entity_type}: ${action.details.error}`;
              console.error('❌ Action failed:', errorMessage);
            }
          });
                 } catch (err: any) {
           console.error('AI Chat auto-send error:', (err as any)?.message || err);
          
          let errorMessage = 'AI failed to respond. Please try again.';
          if (err.response?.status === 401) {
            errorMessage = 'Authentication failed. Please log in again.';
          } else if (err.response?.status === 500) {
            errorMessage = 'Server error. Please try again later.';
          } else if (err.code === 'NETWORK_ERROR') {
            errorMessage = 'Network error. Please check your connection.';
          } else if (err.response?.data?.message) {
            errorMessage = err.response.data.message;
          }
          
          setError(errorMessage);
        } finally {
          setLoading(false);
        }
      })();
    }
  }, [route.params?.initialMessage, handleSend, navigation]);

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

  const renderMessage = (msg: Message) => {
    if (msg.sender === 'user') {
      return (
        <View key={msg.id} style={styles.userMsg}>
          <Text selectable style={styles.userMsgText}>{msg.text}</Text>
        </View>
      );
    }
    
    // Check if this is structured content
    const hasScheduleContent = isScheduleContent(msg.text);
    const hasGoalBreakdownContent = isGoalBreakdownContent(msg.text);
    const hasGoalTitlesContent = isGoalTitlesContent(msg.text);
    const hasTaskContent = isTaskContent(msg.text);
    
    // Debug: Log AI messages to see what format they're in
    // Optional debug retained for development; commented to keep console clean
    // if (msg.sender === 'ai' && msg.text.includes('schedule')) {
    
    // }
    
    // Remove JSON code blocks and (when present) the goal breakdown section
    // from AI text for conversational display, then simplify redundant lines
    const baseConversational = hasGoalBreakdownContent
      ? stripGoalBreakdownFromText(msg.text)
      : msg.text.replace(/```json[\s\S]*?```/g, '').trim();
    const conversationalText = (() => {
      let text = baseConversational
        .split('\n')
        // Drop redundant confirmations like "I've scheduled ..."
        .filter(line => !/^i['’]ve scheduled/i.test(line.trim()))
        .join('\n');
      const taskTitleFromRoute = route?.params?.taskTitle;
      if (taskTitleFromRoute) {
        // Replace generic 'your event' with the task title
        text = text.replace(/\byour event\b/gi, taskTitleFromRoute);
      }
      return text.trim();
    })();

    return (
      <View key={msg.id} style={[
        styles.aiMsg,
        // Remove padding when showing structured content to let the component control its own spacing
        (hasScheduleContent || hasGoalBreakdownContent || hasGoalTitlesContent || hasTaskContent) && styles.aiMsgNoPadding
      ]}>
        {/* Show conversational text even when structured content exists (strip JSON blocks) */}
        {conversationalText && (
          <Markdown
            style={markdownStyles}
          >
            {conversationalText}
          </Markdown>
        )}
        {hasScheduleContent && (
          <ScheduleDisplay text={msg.text} taskTitle={route?.params?.taskTitle} />
        )}
        {hasGoalBreakdownContent && (
          <GoalBreakdownDisplay text={msg.text} />
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
          <TaskDisplay text={msg.text} />
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

  const renderConversationItem = (conversation: Conversation) => {
    const isActive = conversation.id === currentConversationId;
    const lastMessage = conversation.messages[conversation.messages.length - 1];
    
    return (
      <TouchableOpacity
        key={conversation.id}
        style={[styles.conversationItem, isActive && styles.activeConversationItem]}
        onPress={async () => {
          setCurrentConversationId(conversation.id);
          await loadThreadMessages(conversation.id);
          toggleSidebar();
        }}
      >
        <View style={styles.conversationHeader}>
          <View style={styles.conversationTitleRow}>
            <Text style={[styles.conversationTitle, isActive && styles.activeConversationTitle]} numberOfLines={1}>
              {conversation.title}
            </Text>
                                      {conversation.isPinned && <Icon name="pin" size={12} color={colors.primary} style={styles.pinIcon} />}
           </View>
           <View style={styles.conversationActions}>
             <TouchableOpacity
               style={styles.actionButton}
               onPress={() => togglePinConversation(conversation.id)}
             >
               <Icon 
                 name={conversation.isPinned ? "pin-fill" : "pin"} 
                 size={16} 
                 color={colors.text.secondary} 
               />
             </TouchableOpacity>
             <TouchableOpacity
               style={styles.actionButton}
               onPress={() => deleteConversation(conversation.id)}
             >
               <Icon name="trash" size={16} color={colors.text.secondary} />
             </TouchableOpacity>
           </View>
        </View>
        <Text style={styles.conversationPreview} numberOfLines={1}>
          {lastMessage?.text || 'No messages yet'}
        </Text>
        <Text style={styles.conversationDate}>
          {conversation.lastMessageAt.toLocaleDateString()}
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
            paddingBottom: Platform.OS === 'android' ? 120 + insets.bottom : 120 
          }}
          keyboardShouldPersistTaps="handled"
        >
          {currentConversation?.messages.map((msg) => renderMessage(msg))}
          {loading && (
            <View style={styles.aiMsg}>
              <ActivityIndicator color={colors.primary} />
            </View>
          )}
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
          <TouchableOpacity style={styles.sendBtn} onPress={() => handleSend()} disabled={loading}>
            <Text style={styles.sendBtnText}>Send</Text>
          </TouchableOpacity>
        </View>
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
          
          {conversations.some(c => !c.isPinned) && (
            <TouchableOpacity style={styles.clearButton} onPress={clearNonPinnedConversations}>
              <Text style={styles.clearButtonText}>Clear Non-Pinned</Text>
            </TouchableOpacity>
          )}
        </View>

        <ScrollView style={styles.conversationsList}>
          {conversations.map(renderConversationItem)}
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
  aiMsg: {
    alignSelf: 'flex-start',
    backgroundColor: colors.aiMessage,
    borderRadius: borderRadius.lg,
    padding: spacing.md,
    marginBottom: spacing.sm,
    maxWidth: '80%',
  },
  aiMsgText: {
    color: colors.text.primary,
    fontSize: typography.fontSize.base,
  },
  aiMsgNoPadding: {
    padding: 0,
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
  headerActions: {
    flexDirection: 'row',
    alignItems: 'center',
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