import api from './api.js';

/**
 * Analytics service for tracking user interactions
 * Fire-and-forget implementation - errors are logged but don't block UI
 */
class AnalyticsService {
  /**
   * Track an analytics event
   * @param {string} eventName - Name of the event to track
   * @param {Object} payload - Optional metadata about the event
   */
  async track(eventName, payload = {}) {
    // Validate inputs
    if (!eventName || typeof eventName !== 'string') {
      console.warn('Analytics: Invalid event name provided:', eventName);
      return;
    }

    if (payload && (typeof payload !== 'object' || Array.isArray(payload))) {
      console.warn('Analytics: Invalid payload provided:', payload);
      return;
    }

    try {
      await api.post('/analytics/track', {
        event_name: eventName,
        payload: payload
      });
    } catch (error) {
      // Log error but don't throw - fire-and-forget approach
      console.warn('Analytics: Failed to track event:', eventName, error);
    }
  }

  // Common event tracking methods for convenience
  trackGoalCreated(source, goalData = {}) {
    return this.track('goal_created', {
      source, // 'manual' or 'ai'
      category: goalData.category,
      has_description: !!goalData.description,
      has_target_date: !!goalData.target_completion_date
    });
  }

  trackTaskCompleted(taskData = {}) {
    return this.track('task_completed', {
      source: taskData.source,
      has_location: !!taskData.location,
      has_estimated_duration: !!taskData.estimated_duration_minutes,
      priority: taskData.priority
    });
  }

  trackAIMessageSent(messageData = {}) {
    return this.track('ai_message_sent', {
      message_length: messageData.message?.length || 0,
      thread_id: messageData.threadId,
      has_context: !!messageData.context
    });
  }

  trackScreenView(screenName, additionalData = {}) {
    return this.track('screen_view', {
      screen_name: screenName,
      ...additionalData
    });
  }

  trackFeatureUsage(featureName, action, metadata = {}) {
    return this.track('feature_usage', {
      feature: featureName,
      action,
      ...metadata
    });
  }
}

// Export singleton instance
export default new AnalyticsService();

