import AsyncStorage from '@react-native-async-storage/async-storage';
import NetInfo from '@react-native-community/netinfo';
import { apiService } from './apiService';
import { ApiResponse } from './apiService';
import logger from '../utils/logger';

const STORAGE_KEYS = {
  OFFLINE_EVENTS: 'analytics_offline_events',
} as const;

interface AnalyticsEvent {
  id: string;
  eventName: string;
  payload: Record<string, any>;
  timestamp: number;
}

interface OfflineQueueItem {
  id: string;
  event: AnalyticsEvent;
  retryCount: number;
}

/**
 * Analytics service for tracking user interactions with offline support
 * Fire-and-forget implementation - errors are logged but don't block UI
 */
class AnalyticsService {
  private isOnline: boolean = true;
  private syncInProgress: boolean = false;

  constructor() {
    this.initializeNetworkListener();
  }

  /**
   * Initialize network status listener for offline sync
   */
  private initializeNetworkListener() {
    NetInfo.addEventListener(state => {
      const wasOnline = this.isOnline;
      this.isOnline = state.isConnected ?? false;

      // If we just came back online, trigger sync
      if (!wasOnline && this.isOnline) {
        this.syncOfflineEvents();
      }
    });
  }

  /**
   * Track an analytics event
   * @param eventName - Name of the event to track
   * @param payload - Optional metadata about the event
   */
  async track(eventName: string, payload: Record<string, any> = {}): Promise<void> {
    // Validate inputs
    if (!eventName || typeof eventName !== 'string') {
      logger.warn('Analytics: Invalid event name provided:', eventName);
      return;
    }

    if (payload && (typeof payload !== 'object' || Array.isArray(payload))) {
      logger.warn('Analytics: Invalid payload provided:', payload);
      return;
    }

    const event: AnalyticsEvent = {
      id: this.generateEventId(),
      eventName,
      payload,
      timestamp: Date.now(),
    };

    if (this.isOnline && !this.syncInProgress) {
      try {
        await this.sendEvent(event);
      } catch (error) {
        // Preserve fire-and-forget contract - errors are logged in sendEvent
        // but don't propagate to maintain non-blocking behavior
      }
    } else {
      await this.queueEvent(event);
    }
  }

  /**
   * Send event directly to backend
   */
  private async sendEvent(event: AnalyticsEvent): Promise<void> {
    try {
      const response: ApiResponse<any> = await apiService.post('/analytics/track', {
        event_name: event.eventName,
        payload: event.payload,
      });

      if (!response.ok) {
        const errorMessage = typeof response.data === 'object' && response.data?.error
          ? response.data.error
          : 'Failed to send analytics event';
        throw new Error(errorMessage);
      }
    } catch (error) {
      logger.warn('Analytics: Failed to send event, queuing for later:', event.eventName, error);
      await this.queueEvent(event);
      throw error; // Re-throw the error so callers can detect failure
    }
  }

  /**
   * Queue event for offline storage
   */
  private async queueEvent(event: AnalyticsEvent): Promise<void> {
    try {
      const existingQueue = await this.getOfflineQueue();
      const queueItem: OfflineQueueItem = {
        id: event.id,
        event,
        retryCount: 0,
      };

      existingQueue.push(queueItem);
      await AsyncStorage.setItem(STORAGE_KEYS.OFFLINE_EVENTS, JSON.stringify(existingQueue));
    } catch (error) {
      logger.error('Analytics: Failed to queue event:', error);
    }
  }

  /**
   * Get offline event queue from storage
   */
  private async getOfflineQueue(): Promise<OfflineQueueItem[]> {
    try {
      const stored = await AsyncStorage.getItem(STORAGE_KEYS.OFFLINE_EVENTS);
      return stored ? JSON.parse(stored) : [];
    } catch (error) {
      logger.error('Analytics: Failed to get offline queue:', error);
      return [];
    }
  }

  /**
   * Sync offline events when connection is restored
   */
  async syncOfflineEvents(): Promise<void> {
    if (this.syncInProgress || !this.isOnline) {
      return;
    }

    this.syncInProgress = true;

    try {
      const queue = await this.getOfflineQueue();

      if (queue.length === 0) {
        return;
      }

      logger.info(`Analytics: Syncing ${queue.length} offline events`);

      const failedEvents: OfflineQueueItem[] = [];

      for (const item of queue) {
        try {
          await this.sendEvent(item.event);
        } catch (error) {
          item.retryCount += 1;

          // Keep events that have failed less than 3 times
          if (item.retryCount < 3) {
            failedEvents.push(item);
          } else {
            logger.warn('Analytics: Dropping event after 3 failed attempts:', item.event.eventName);
          }
        }
      }

      // Update queue with only failed events
      await AsyncStorage.setItem(
        STORAGE_KEYS.OFFLINE_EVENTS,
        JSON.stringify(failedEvents)
      );

      if (failedEvents.length > 0) {
        logger.info(`Analytics: ${failedEvents.length} events remain in queue after sync`);
      } else {
        logger.info('Analytics: All offline events synced successfully');
      }
    } catch (error) {
      logger.error('Analytics: Failed to sync offline events:', error);
    } finally {
      this.syncInProgress = false;
    }
  }

  /**
   * Generate unique event ID
   */
  private generateEventId(): string {
    return `analytics_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  // Common event tracking methods for convenience
  trackGoalCreated(source: 'manual' | 'ai', goalData: Record<string, any> = {}): Promise<void> {
    return this.track('goal_created', {
      source,
      category: goalData.category,
      hasDescription: !!goalData.description,
      hasTargetDate: !!goalData.target_completion_date,
    });
  }

  trackTaskCompleted(taskData: Record<string, any> = {}): Promise<void> {
    return this.track('task_completed', {
      source: taskData.source,
      hasLocation: !!taskData.location,
      hasEstimatedDuration: !!taskData.estimated_duration_minutes,
      priority: taskData.priority,
    });
  }

  trackAIMessageSent(messageData: Record<string, any> = {}): Promise<void> {
    return this.track('ai_message_sent', {
      messageLength: messageData.message?.length || 0,
      threadId: messageData.threadId,
      hasContext: !!messageData.context,
    });
  }

  trackScreenView(screenName: string, additionalData: Record<string, any> = {}): Promise<void> {
    return this.track('screen_view', {
      screen_name: screenName,
      ...additionalData,
    });
  }

  trackFeatureUsage(featureName: string, action: string, metadata: Record<string, any> = {}): Promise<void> {
    return this.track('feature_usage', {
      feature: featureName,
      action,
      ...metadata,
    });
  }

  /**
   * Get current network status
   */
  isNetworkOnline(): boolean {
    return this.isOnline;
  }

  /**
   * Get number of pending offline events
   */
  async getPendingEventCount(): Promise<number> {
    const queue = await this.getOfflineQueue();
    return queue.length;
  }

  /**
   * Clear all offline events (for testing or reset)
   */
  async clearOfflineQueue(): Promise<void> {
    try {
      await AsyncStorage.removeItem(STORAGE_KEYS.OFFLINE_EVENTS);
    } catch (error) {
      logger.error('Analytics: Failed to clear offline queue:', error);
    }
  }
}

// Export singleton instance
export default new AnalyticsService();

