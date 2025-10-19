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
  private timeoutStats = {
    totalRequests: 0,
    timeoutCount: 0,
    lastTimeout: null as Date | null,
  };
  private circuitBreaker = {
    isOpen: false,
    failureCount: 0,
    lastFailureTime: null as Date | null,
    failureThreshold: 3, // Open circuit after 3 consecutive failures
    recoveryTimeout: 30000, // 30 seconds before trying again
  };

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

    // Check if analytics should be temporarily disabled due to persistent failures
    if (this.shouldDisableAnalytics()) {
      logger.info(`Analytics: Temporarily disabled due to persistent failures, skipping event: ${eventName}`);
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
    // Check circuit breaker - if open and not yet time to retry, queue immediately
    if (this.circuitBreaker.isOpen) {
      const timeSinceLastFailure = Date.now() - (this.circuitBreaker.lastFailureTime?.getTime() || 0);
      if (timeSinceLastFailure < this.circuitBreaker.recoveryTimeout) {
        logger.info(`Analytics: Circuit breaker is open, queuing event instead of sending: ${event.eventName}`);
        await this.queueEvent(event);
        return;
      } else {
        // Reset circuit breaker for retry
        this.circuitBreaker.isOpen = false;
        this.circuitBreaker.failureCount = 0;
        logger.info('Analytics: Circuit breaker reset, attempting to send events again');
      }
    }

    this.timeoutStats.totalRequests++;

    try {
      // Check authentication before sending
      let token;
      try {
        const { authService } = await import('./auth');
        token = await authService.getAuthToken();
      } catch (importError) {
        logger.error('Analytics: Failed to import auth service or retrieve token', { 
          error: importError instanceof Error ? importError.message : String(importError),
          stack: importError instanceof Error ? importError.stack : undefined
        });
        await this.queueEvent(event);
        return;
      }

      if (!token) {
        logger.info(`Analytics: No auth token available, queuing event: ${event.eventName}`);
        await this.queueEvent(event);
        return;
      }

      // Reduced timeout for faster failure detection
      const response: ApiResponse<any> = await apiService.post('/analytics/track', {
        event_name: event.eventName,
        payload: event.payload,
      }, { timeoutMs: 3000 }); // Reduced to 3 seconds for even faster failure detection

      if (!response.ok) {
        const errorMessage = typeof response.data === 'object' && response.data?.error
          ? response.data.error
          : 'Failed to send analytics event';
        throw new Error(errorMessage);
      }

      // Success - reset circuit breaker
      this.circuitBreaker.failureCount = 0;
      this.circuitBreaker.isOpen = false;

    } catch (error) {
      // Update circuit breaker
      this.circuitBreaker.failureCount++;
      this.circuitBreaker.lastFailureTime = new Date();

      if (this.circuitBreaker.failureCount >= this.circuitBreaker.failureThreshold) {
        this.circuitBreaker.isOpen = true;
        logger.warn(`Analytics: Circuit breaker opened after ${this.circuitBreaker.failureCount} consecutive failures`);
      }

      // Track timeout statistics
      if (error instanceof Error && error.message.includes('timeout')) {
        this.timeoutStats.timeoutCount++;
        this.timeoutStats.lastTimeout = new Date();
        logger.warn(`Analytics: Timeout detected (${this.timeoutStats.timeoutCount}/${this.timeoutStats.totalRequests} total timeouts)`, {
          eventName: event.eventName,
          timeoutRate: (this.timeoutStats.timeoutCount / this.timeoutStats.totalRequests * 100).toFixed(1) + '%',
          circuitBreakerOpen: this.circuitBreaker.isOpen
        });
      }

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
          
          // Small delay between successful sends to avoid overwhelming the server
          await new Promise(resolve => setTimeout(resolve, 100));
        } catch (error) {
          item.retryCount += 1;

          // Keep events that have failed less than 5 times (increased from 3)
          // This gives more chances for network issues to resolve
          if (item.retryCount < 5) {
            failedEvents.push(item);
            logger.info(`Analytics: Event ${item.event.eventName} failed (attempt ${item.retryCount}/5), will retry later`);
          } else {
            logger.warn('Analytics: Dropping event after 5 failed attempts:', item.event.eventName);
          }
          
          // Add delay between failed attempts to avoid rapid retries
          await new Promise(resolve => setTimeout(resolve, 200));
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

  /**
   * Manually trigger sync of offline events (useful for testing or manual retry)
   */
  async forceSync(): Promise<void> {
    logger.info('Analytics: Manual sync triggered');
    await this.syncOfflineEvents();
  }

  /**
   * Check current network status and update internal state
   */
  async refreshNetworkStatus(): Promise<boolean> {
    try {
      const state = await NetInfo.fetch();
      const wasOnline = this.isOnline;
      this.isOnline = state.isConnected ?? false;
      
      if (!wasOnline && this.isOnline) {
        logger.info('Analytics: Network connection restored, triggering sync');
        this.syncOfflineEvents();
      }
      
      return this.isOnline;
    } catch (error) {
      logger.error('Analytics: Failed to refresh network status:', error);
      return this.isOnline;
    }
  }

  /**
   * Get timeout statistics for debugging
   */
  getTimeoutStats() {
    return {
      ...this.timeoutStats,
      timeoutRate: this.timeoutStats.totalRequests > 0 
        ? (this.timeoutStats.timeoutCount / this.timeoutStats.totalRequests * 100).toFixed(1) + '%'
        : '0%'
    };
  }

  /**
   * Reset timeout statistics
   */
  resetTimeoutStats() {
    this.timeoutStats = {
      totalRequests: 0,
      timeoutCount: 0,
      lastTimeout: null,
    };
  }

  /**
   * Get circuit breaker status
   */
  getCircuitBreakerStatus() {
    return {
      ...this.circuitBreaker,
      timeUntilRetry: this.circuitBreaker.isOpen && this.circuitBreaker.lastFailureTime
        ? Math.max(0, this.circuitBreaker.recoveryTimeout - (Date.now() - this.circuitBreaker.lastFailureTime.getTime()))
        : 0
    };
  }

  /**
   * Reset circuit breaker (for testing or manual recovery)
   */
  resetCircuitBreaker() {
    this.circuitBreaker = {
      isOpen: false,
      failureCount: 0,
      lastFailureTime: null,
      failureThreshold: 3,
      recoveryTimeout: 30000,
    };
    logger.info('Analytics: Circuit breaker manually reset');
  }

  /**
   * Check if analytics should be temporarily disabled due to persistent failures
   */
  private shouldDisableAnalytics(): boolean {
    // Disable analytics if circuit breaker has been open for more than 2 minutes
    if (this.circuitBreaker.isOpen && this.circuitBreaker.lastFailureTime) {
      const timeSinceLastFailure = Date.now() - this.circuitBreaker.lastFailureTime.getTime();
      const disableThreshold = 2 * 60 * 1000; // 2 minutes

      if (timeSinceLastFailure > disableThreshold) {
        logger.warn('Analytics: Temporarily disabled due to persistent backend failures');
        return true;
      }
    }

    // Disable analytics if timeout rate is above 90% with at least 5 requests
    if (this.timeoutStats.totalRequests >= 5) {
      const timeoutRate = this.timeoutStats.timeoutCount / this.timeoutStats.totalRequests;
      if (timeoutRate > 0.9) {
        logger.warn('Analytics: Temporarily disabled due to high timeout rate');
        return true;
      }
    }

    return false;
  }

  /**
   * Force disable analytics (for debugging or when backend is completely down)
   */
  forceDisableAnalytics(durationMinutes: number = 10): void {
    this.circuitBreaker.isOpen = true;
    this.circuitBreaker.lastFailureTime = new Date();
    this.circuitBreaker.recoveryTimeout = durationMinutes * 60 * 1000; // Convert to milliseconds
    logger.warn(`Analytics: Force disabled for ${durationMinutes} minutes`);
  }

  /**
   * Re-enable analytics (for debugging or after fixing backend issues)
   */
  reEnableAnalytics(): void {
    this.circuitBreaker.isOpen = false;
    this.circuitBreaker.failureCount = 0;
    this.circuitBreaker.lastFailureTime = null;
    this.circuitBreaker.recoveryTimeout = 30000; // Reset to default 30 seconds
    logger.info('Analytics: Force re-enabled');
  }

  /**
   * Test analytics endpoint connectivity (for debugging)
   */
  async testAnalyticsEndpoint(): Promise<{ success: boolean; error?: string; details?: any }> {
    try {
      logger.info('Analytics: Testing endpoint connectivity...');
      
      // Import authService to check token status
      let token: string | null = null;
      try {
        const { authService } = await import('./auth');
        token = await authService.getAuthToken();
      } catch (importError) {
        return {
          success: false,
          error: 'Failed to import auth service',
          details: importError
        };
      }
      logger.info('Analytics: Auth token status:', { hasToken: !!token });
      logger.info('Analytics: Auth token status:', { hasToken: !!token });
      
      const response: ApiResponse<any> = await apiService.post('/analytics/track', {
        event_name: 'connectivity_test',
        payload: { test: true, timestamp: Date.now() },
      }, { timeoutMs: 5000 });

      if (response.ok) {
        logger.info('Analytics: Endpoint test successful');
        return { success: true, details: response.data };
      } else {
        logger.warn('Analytics: Endpoint test failed with response:', response);
        return { 
          success: false, 
          error: `HTTP ${response.status}: ${JSON.stringify(response.data)}`,
          details: response.data 
        };
      }
    } catch (error) {
      logger.error('Analytics: Endpoint test failed with error:', error);
      return { 
        success: false, 
        error: error instanceof Error ? error.message : 'Unknown error',
        details: error 
      };
    }
  }
}

// Export singleton instance
const analyticsService = new AnalyticsService();

// Emergency analytics disable - only when explicitly configured
const forceDisableMinutes = process.env.ANALYTICS_FORCE_DISABLE_MINUTES;
if (forceDisableMinutes) {
  const minutes = parseInt(forceDisableMinutes, 10);
  if (!isNaN(minutes) && minutes > 0) {
    console.warn(`[Analytics] Emergency disable activated for ${minutes} minutes via ANALYTICS_FORCE_DISABLE_MINUTES`);
    analyticsService.forceDisableAnalytics(minutes);
  } else {
    console.warn(`[Analytics] Invalid ANALYTICS_FORCE_DISABLE_MINUTES value: "${forceDisableMinutes}". Must be a positive integer.`);
  }
}

export default analyticsService;

