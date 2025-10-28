import { errorHandlingService, ErrorCategory, ErrorContext, UserFriendlyError } from './errorHandling';
import { authService } from './auth';
import { configService } from './config';
import secureConfigService from './secureConfig';
import logger from '../utils/logger';

// Helper function to get secure API base URL
const getSecureApiBaseUrl = (): string => {
  try {
    return secureConfigService.getApiBaseUrl();
  } catch (error) {
    logger.warn('Failed to get secure API base URL, falling back to config service:', error);
    return configService.getBaseUrl();
  }
};

// Real API implementation for backend integration

// Enhanced API wrapper with retry logic and error handling
class EnhancedAPI {
  private async makeRequest<T>(
    url: string,
    options: RequestInit,
    category: ErrorCategory,
    operation: string,
    retryCount: number = 0
  ): Promise<T> {
    const context: ErrorContext = {
      operation,
      endpoint: url,
      timestamp: Date.now(),
      retryCount,
    };

    try {
      // Add auth token if not present
      if (!options.headers || !(options.headers as Record<string, string>).Authorization) {
        const token = await authService.getAuthToken();
        options.headers = {
          ...options.headers,
          'Authorization': `Bearer ${token}`,
        };
      }

      const response = await fetch(url, options);

      if (!response.ok) {
        const errorText = await response.text();
        const error = new Error(`HTTP error! status: ${response.status}, body: ${errorText}`);
        (error as any).status = response.status;
        (error as any).response = { status: response.status, data: errorText };
        
        // Handle error with retry logic
        const userError = await errorHandlingService.handleError(error, category, context);
        
        // Check if we should retry
        if (userError.retryable && retryCount < 3) {
          const delay = Math.pow(2, retryCount) * 1000; // Exponential backoff
          await new Promise(resolve => setTimeout(resolve, delay));
          return this.makeRequest(url, options, category, operation, retryCount + 1);
        }
        
        throw userError;
      }

      // Handle empty responses (common for DELETE operations)
      const text = await response.text();
      if (text.trim() === '') {
        return undefined as T;
      }
      
      try {
        return JSON.parse(text);
      } catch (parseError) {
        const error = new Error(`Failed to parse JSON response: ${parseError instanceof Error ? parseError.message : 'Unknown error'}`);
        (error as any).originalError = parseError;
        (error as any).responseText = text.substring(0, 200); // Log first 200 chars
        throw error;
      }    } catch (error) {
      // If it's already a UserFriendlyError, re-throw it
      if ((error as any).title && (error as any).message) {
        throw error;
      }
      
      // Handle the error and potentially retry
      const userError = await errorHandlingService.handleError(error, category, context);
      
      // Check if we should retry
      if (userError.retryable && retryCount < 3) {
        const delay = Math.pow(2, retryCount) * 1000; // Exponential backoff
        await new Promise(resolve => setTimeout(resolve, delay));
        return this.makeRequest(url, options, category, operation, retryCount + 1);
      }
      
      throw userError;
    }
  }

  // Calendar API methods
  async getEvents(maxResults: number = 100, since?: string): Promise<any> {
    let url = `${getSecureApiBaseUrl()}/calendar/events?maxResults=${maxResults}`;
    if (since) {
      url += `&since=${encodeURIComponent(since)}`;
    }
    return this.makeRequest(
      url,
      { method: 'GET' },
      ErrorCategory.CALENDAR,
      'getEvents'
    );
  }

  async getEventsForDate(date: string): Promise<any> {
    return this.makeRequest(
      `${getSecureApiBaseUrl()}/calendar/events/date?date=${date}`,
      { method: 'GET' },
      ErrorCategory.CALENDAR,
      'getEventsForDate'
    );
  }

  async getEventsForTask(taskId: string): Promise<any> {
    return this.makeRequest(
      `${getSecureApiBaseUrl()}/calendar/events/task/${taskId}`,
      { method: 'GET' },
      ErrorCategory.CALENDAR,
      'getEventsForTask'
    );
  }

  async createEvent(eventData: {
    summary: string;
    description?: string;
    startTime: string;
    endTime: string;
    timeZone?: string;
    location?: string;
    eventType?: 'event'|'task'|'goal';
    taskId?: string;
    goalId?: string;
    isAllDay?: boolean;
  }): Promise<any> {
    return this.makeRequest(
      `${getSecureApiBaseUrl()}/calendar/events`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...eventData,
          useSupabase: true,
          eventType: eventData.eventType,
          taskId: eventData.taskId,
          goalId: eventData.goalId,
          isAllDay: eventData.isAllDay,
        }),
      },
      ErrorCategory.CALENDAR,
      'createEvent'
    );
  }

  async updateEvent(eventId: string, eventData: {
    summary: string;
    description?: string;
    startTime: string;
    endTime: string;
    timeZone?: string;
    location?: string;
    eventType?: 'event'|'task'|'goal';
    taskId?: string;
    goalId?: string;
    isAllDay?: boolean;
  }): Promise<any> {
    return this.makeRequest(
      `${getSecureApiBaseUrl()}/calendar/events/${eventId}`,
      {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...eventData,
          useSupabase: true,
          eventType: eventData.eventType,
          taskId: eventData.taskId,
          goalId: eventData.goalId,
          isAllDay: eventData.isAllDay,
        }),
      },
      ErrorCategory.CALENDAR,
      'updateEvent'
    );
  }

  async deleteEvent(eventId: string): Promise<void> {
    return this.makeRequest(
      `${getSecureApiBaseUrl()}/calendar/events/${eventId}?useSupabase=true`,
      { method: 'DELETE' },
      ErrorCategory.CALENDAR,
      'deleteEvent'
    );
  }

  // Convenience: schedule a task by creating a linked calendar event
  async scheduleTaskOnCalendar(taskId: string, data: {
    summary: string;
    description?: string;
    startTime: string;
    endTime: string;
    timeZone?: string;
    location?: string;
    isAllDay?: boolean;
  }): Promise<any> {
    return this.createEvent({
      summary: data.summary,
      description: data.description,
      startTime: data.startTime,
      endTime: data.endTime,
      timeZone: data.timeZone,
      location: data.location,
      isAllDay: data.isAllDay,
      eventType: 'task',
      taskId,
    });
  }

  async syncCalendar(): Promise<any> {
    return this.makeRequest(
      `${getSecureApiBaseUrl()}/calendar/sync`,
      { method: 'POST' },
      ErrorCategory.SYNC,
      'syncCalendar'
    );
  }

  async getCalendarStatus(): Promise<{ connected: boolean; email?: string; lastUpdated?: string; error?: string; details?: string; }>{
    return this.makeRequest(
      `${getSecureApiBaseUrl()}/calendar/status`,
      { method: 'GET' },
      ErrorCategory.CALENDAR,
      'getCalendarStatus'
    );
  }



  async importCalendarFirstRun(): Promise<{ success: boolean; count?: number; warning?: string; error?: string; details?: string; }>{
    return this.makeRequest(
      `${getSecureApiBaseUrl()}/calendar/import/first-run`,
      { method: 'POST' },
      ErrorCategory.SYNC,
      'importCalendarFirstRun'
    );
  }

  async getAppPreferences(): Promise<any> {
    return this.makeRequest(
      `${getSecureApiBaseUrl()}/user/app-preferences`,
      { method: 'GET' },
      ErrorCategory.SYNC,
      'getAppPreferences'
    );
  }

  async updateAppPreferences(preferences: any): Promise<any> {
    return this.makeRequest(
      `${getSecureApiBaseUrl()}/user/app-preferences`,
      {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(preferences),
      },
      ErrorCategory.SYNC,
      'updateAppPreferences'
    );
  }

  // User config
  async getUserConfig(): Promise<{ supabaseUrl: string; supabaseAnonKey: string; }> {
    return this.makeRequest(
      `${getSecureApiBaseUrl()}/user/config`,
      { method: 'GET' },
      ErrorCategory.SYNC,
      'getUserConfig'
    );
  }

  // Tasks API methods
  async getTasks(since?: string): Promise<any> {
    const url = since 
      ? `${getSecureApiBaseUrl()}/tasks?since=${encodeURIComponent(since)}`
      : `${getSecureApiBaseUrl()}/tasks`;
    
    return this.makeRequest(
      url,
      { method: 'GET' },
      ErrorCategory.TASKS,
      'getTasks'
    );
  }

  async getTaskById(taskId: string): Promise<any> {
    return this.makeRequest(
      `${getSecureApiBaseUrl()}/tasks/${taskId}`,
      { method: 'GET' },
      ErrorCategory.TASKS,
      'getTaskById'
    );
  }

  async createTask(taskData: any): Promise<any> {
    return this.makeRequest(
      `${getSecureApiBaseUrl()}/tasks`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(taskData),
      },
      ErrorCategory.TASKS,
      'createTask'
    );
  }

  async updateTask(taskId: string, taskData: any): Promise<any> {
    return this.makeRequest(
      `${getSecureApiBaseUrl()}/tasks/${taskId}`,
      {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(taskData),
      },
      ErrorCategory.TASKS,
      'updateTask'
    );
  }

  async deleteTask(taskId: string): Promise<void> {
    return this.makeRequest(
      `${getSecureApiBaseUrl()}/tasks/${taskId}`,
      { method: 'DELETE' },
      ErrorCategory.TASKS,
      'deleteTask'
    );
  }

  // Goals API methods
  async getGoals(since?: string): Promise<any> {
    const url = since 
      ? `${getSecureApiBaseUrl()}/goals?since=${encodeURIComponent(since)}`
      : `${getSecureApiBaseUrl()}/goals`;
    
    return this.makeRequest(
      url,
      { method: 'GET' },
      ErrorCategory.GOALS,
      'getGoals'
    );
  }

  async createGoal(goalData: any): Promise<any> {
    return this.makeRequest(
      `${getSecureApiBaseUrl()}/goals`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(goalData),
      },
      ErrorCategory.GOALS,
      'createGoal'
    );
  }

  async updateGoal(goalId: string, goalData: any): Promise<any> {
    return this.makeRequest(
      `${getSecureApiBaseUrl()}/goals/${goalId}`,
      {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(goalData),
      },
      ErrorCategory.GOALS,
      'updateGoal'
    );
  }

  async deleteGoal(goalId: string): Promise<void> {
    return this.makeRequest(
      `${getSecureApiBaseUrl()}/goals/${goalId}`,
      { method: 'DELETE' },
      ErrorCategory.GOALS,
      'deleteGoal'
    );
  }

  // Auto-scheduling API methods
  async autoScheduleTasks(): Promise<any> {
    return this.makeRequest(
      `${getSecureApiBaseUrl()}/ai/auto-schedule-tasks`,
      { method: 'POST' },
      ErrorCategory.SYNC,
      'autoScheduleTasks'
    );
  }

  async getSchedulingPreferences(): Promise<any> {
    return this.makeRequest(
      `${getSecureApiBaseUrl()}/ai/scheduling-preferences`,
      { method: 'GET' },
      ErrorCategory.SYNC,
      'getSchedulingPreferences'
    );
  }

  async updateSchedulingPreferences(preferences: any): Promise<any> {
    return this.makeRequest(
      `${getSecureApiBaseUrl()}/ai/scheduling-preferences`,
      {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(preferences),
      },
      ErrorCategory.SYNC,
      'updateSchedulingPreferences'
    );
  }
}

// Export singleton instance
export const enhancedAPI = new EnhancedAPI();

// Export types for use in other files
export type { UserFriendlyError, ErrorContext }; 