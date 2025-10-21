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
      return;
    }

    if (payload && (typeof payload !== 'object' || Array.isArray(payload))) {
      return;
    }

    try {
      await api.post('/analytics/track', {
        event_name: eventName,
        payload: payload
      });
    } catch (error) {
      // Log error but don't throw - fire-and-forget approach
    }
  }

  // Common event tracking methods for convenience
  trackGoalCreated(source, goalData = {}) {
    const data = goalData && typeof goalData === 'object' ? goalData : {};
    return this.track('goal_created', {
      source, // 'manual' or 'ai'
      category: data.category,
      has_description: !!data.description,
      has_target_date: !!data.target_completion_date
    });
  }

  trackTaskCompleted(taskData = {}) {
    const data = taskData && typeof taskData === 'object' ? taskData : {};
    return this.track('task_completed', {
      source: data.source,
      has_location: !!data.location,
      has_estimated_duration: !!data.estimated_duration_minutes,
      priority: data.priority
    });
  }

  trackAIMessageSent(messageData = {}) {
    const data = messageData && typeof messageData === 'object' ? messageData : {};
    return this.track('ai_message_sent', {
      message_length: data.message?.length ?? 0,
      thread_id: data.threadId,
      has_context: !!data.context
    });
  }

  trackScreenView(screenName, additionalData = {}) {
    const extras = additionalData && typeof additionalData === 'object' ? additionalData : {};
    return this.track('screen_view', {
      screen_name: screenName,
      ...extras
    });
  }

  trackFeatureUsage(featureName, action, metadata = {}) {
    const meta = metadata && typeof metadata === 'object' ? metadata : {};
    return this.track('feature_usage', {
      feature: featureName,
      action,
      ...meta
    });
  }
}

// Export singleton instance
export default new AnalyticsService();

