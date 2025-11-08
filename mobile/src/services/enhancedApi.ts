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
    retryCount: number = 0,
    signal?: AbortSignal
  ): Promise<T | undefined> {
    const context: ErrorContext = {
      operation,
      endpoint: url,
      timestamp: Date.now(),
      retryCount,
    };

    // Declare timeoutId outside try block so it's accessible in catch
    let timeoutId: ReturnType<typeof setTimeout> | undefined = undefined;

    try {
      // Check if external signal is already aborted
      if (signal?.aborted) {
        throw new Error(`${operation} was cancelled`);
      }

      // Add auth token if not present and not explicitly set to empty string (for unauthenticated endpoints)
      const headers = options.headers as Record<string, string> | undefined;
      const shouldSkipAuth = headers?.Authorization === '';
      
      if (shouldSkipAuth) {
        // Remove Authorization header if explicitly set to empty (for unauthenticated endpoints)
        const { Authorization, ...restHeaders } = headers;
        options.headers = restHeaders;
      } else if (!headers || !headers.Authorization) {
        // Add auth token if not present
        const token = await authService.getAuthToken();
        options.headers = {
          ...options.headers,
          'Authorization': `Bearer ${token}`,
        };
      }

      // Add timeout to prevent hanging requests
      const timeoutMs = 30000; // 30 second timeout
      const controller = new AbortController();
      const timeoutPromise = new Promise<never>((_, reject) => {
        timeoutId = setTimeout(() => {
          controller.abort();
          reject(new Error(`Request timeout after ${timeoutMs}ms for ${operation} at ${url}`));
        }, timeoutMs);
      });

      // If external signal is provided, listen to it and abort the controller if needed
      if (signal) {
        signal.addEventListener('abort', () => {
          controller.abort();
          if (timeoutId) {
            clearTimeout(timeoutId);
          }
        }, { once: true });
      }

      // Merge signals: use the controller's signal (which respects both timeout and external cancellation)
      const fetchPromise = fetch(url, { ...options, signal: controller.signal });
      const response = await Promise.race([fetchPromise, timeoutPromise]);
      
      // Clear timeout on success
      if (timeoutId) {
        clearTimeout(timeoutId);
      }

      if (!response.ok) {
        const errorText = await response.text();
        const error = new Error(`HTTP error! status: ${response.status}, body: ${errorText}`);
        (error as any).status = response.status;
        (error as any).response = { status: response.status, data: errorText };
        
        // Handle error with retry logic
        const userError = await errorHandlingService.handleError(error, category, context);
        
        // Don't retry 404 errors - endpoint doesn't exist
        const is404 = response.status === 404;
        
        // Check if we should retry
        if (!is404 && userError.retryable && retryCount < 3 && !signal?.aborted) {
          const delay = Math.pow(2, retryCount) * 1000; // Exponential backoff
          await new Promise<void>(resolve => setTimeout(() => resolve(), delay));
          return this.makeRequest(url, options, category, operation, retryCount + 1, signal);
        }
        
        throw userError;
      }

      // Handle empty responses (common for DELETE operations)
      const text = await response.text();
      if (text.trim() === '') {
        return undefined;
      }
      
      try {
        return JSON.parse(text);
      } catch (parseError) {
        const error = new Error(`Failed to parse JSON response: ${parseError instanceof Error ? parseError.message : 'Unknown error'}`);
        (error as any).originalError = parseError;
        (error as any).responseText = text.substring(0, 200); // Log first 200 chars
        throw error;
      }
} catch (error) {
      // Clear timeout on error
      if (timeoutId) {
        clearTimeout(timeoutId);
      }
      
      // If it's already a UserFriendlyError, re-throw it
      if (error && typeof error === 'object' && 'isUserFriendlyError' in error) {
        throw error;
      }
      
      // Handle the error and potentially retry
      const userError = await errorHandlingService.handleError(error, category, context);
      
      // Don't retry 404 errors - endpoint doesn't exist
      const errorWithStatus = error as { status?: number; response?: { status?: number } } | null | undefined;
      const is404 = errorWithStatus?.status === 404 || errorWithStatus?.response?.status === 404;
      
      // Check if we should retry
      if (!is404 && userError.retryable && retryCount < 3 && !signal?.aborted) {
        const delay = Math.pow(2, retryCount) * 1000; // Exponential backoff
        await new Promise<void>(resolve => setTimeout(() => resolve(), delay));
        return this.makeRequest(url, options, category, operation, retryCount + 1, signal);
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
    const result = await this.makeRequest(
      `${getSecureApiBaseUrl()}/calendar/events/${eventId}?useSupabase=true`,
      { method: 'DELETE' },
      ErrorCategory.CALENDAR,
      'deleteEvent'
    );
    // DELETE operations may return undefined for empty responses
    return;
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
    const result = await this.makeRequest<{ connected: boolean; email?: string; lastUpdated?: string; error?: string; details?: string; }>(
      `${getSecureApiBaseUrl()}/calendar/status`,
      { method: 'GET' },
      ErrorCategory.CALENDAR,
      'getCalendarStatus'
    );
    
    if (result === undefined || result === null) {
      throw new Error('Calendar status not available');
    }
    
    return result;
  }



  async importCalendarFirstRun(): Promise<{ success: boolean; count?: number; warning?: string; error?: string; details?: string; }>{
    const result = await this.makeRequest<{ success: boolean; count?: number; warning?: string; error?: string; details?: string; }>(
      `${getSecureApiBaseUrl()}/calendar/import/first-run`,
      { method: 'POST' },
      ErrorCategory.SYNC,
      'importCalendarFirstRun'
    );
    
    if (result === undefined || result === null) {
      throw new Error('Calendar import result not available');
    }
    
    return result;
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
  async getUserConfig(signal?: AbortSignal): Promise<{ 
    supabaseUrl: string; 
    supabaseAnonKey: string;
    googleWebClientId?: string;
    googleAndroidClientId?: string;
    googleIosClientId?: string;
  }> {
    const result = await this.makeRequest<{ 
      supabaseUrl: string; 
      supabaseAnonKey: string;
      googleWebClientId?: string;
      googleAndroidClientId?: string;
      googleIosClientId?: string;
    }>(
      `${getSecureApiBaseUrl()}/user/config`,
      { method: 'GET' },
      ErrorCategory.SYNC,
      'getUserConfig',
      0,
      signal
    );
    
    if (result === undefined || result === null) {
      throw new Error('User config not available');
    }
    
    return result;
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
    const result = await this.makeRequest(
      `${getSecureApiBaseUrl()}/tasks/${taskId}`,
      { method: 'DELETE' },
      ErrorCategory.TASKS,
      'deleteTask'
    );
    // DELETE operations may return undefined for empty responses
    return;
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
    logger.debug('Creating goal', { operation: 'createGoal' });
    return await this.makeRequest(
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
    const result = await this.makeRequest(
      `${getSecureApiBaseUrl()}/goals/${goalId}`,
      { method: 'DELETE' },
      ErrorCategory.GOALS,
      'deleteGoal'
    );
    // DELETE operations may return undefined for empty responses
    return;
  }

  async getGoal(goalId: string): Promise<any> {
    return this.makeRequest(
      `${getSecureApiBaseUrl()}/goals/${goalId}`,
      { method: 'GET' },
      ErrorCategory.GOALS,
      'getGoal'
    );
  }

  // Milestone API methods
  async createMilestone(goalId: string, milestoneData: any): Promise<any> {
    return this.makeRequest(
      `${getSecureApiBaseUrl()}/goals/${goalId}/milestones`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(milestoneData),
      },
      ErrorCategory.GOALS,
      'createMilestone'
    );
  }

  async updateMilestone(milestoneId: string, milestoneData: any): Promise<any> {
    return this.makeRequest(
      `${getSecureApiBaseUrl()}/goals/milestones/${milestoneId}`,
      {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(milestoneData),
      },
      ErrorCategory.GOALS,
      'updateMilestone'
    );
  }

  async deleteMilestone(milestoneId: string): Promise<void> {
    const result = await this.makeRequest(
      `${getSecureApiBaseUrl()}/goals/milestones/${milestoneId}`,
      { method: 'DELETE' },
      ErrorCategory.GOALS,
      'deleteMilestone'
    );
    // DELETE operations may return undefined for empty responses
    return;
  }

  async getMilestone(milestoneId: string): Promise<any> {
    return this.makeRequest(
      `${getSecureApiBaseUrl()}/goals/milestones/${milestoneId}`,
      { method: 'GET' },
      ErrorCategory.GOALS,
      'getMilestone'
    );
  }

  async getMilestones(since?: string): Promise<any> {
    const url = since 
      ? `${getSecureApiBaseUrl()}/milestones?since=${encodeURIComponent(since)}`
      : `${getSecureApiBaseUrl()}/milestones`;
    
    return this.makeRequest(
      url,
      { method: 'GET' },
      ErrorCategory.GOALS,
      'getMilestones'
    );
  }

  // Step API methods
  async createStep(milestoneId: string, stepData: any): Promise<any> {
    const url = `${getSecureApiBaseUrl()}/goals/milestones/${milestoneId}/steps`;
    return this.makeRequest(
      url,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(stepData),
      },
      ErrorCategory.GOALS,
      'createStep'
    );
  }

  async updateStep(stepId: string, stepData: any): Promise<any> {
    const url = `${getSecureApiBaseUrl()}/goals/steps/${stepId}`;
    return this.makeRequest(
      url,
      {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(stepData),
      },
      ErrorCategory.GOALS,
      'updateStep'
    );
  }

  async deleteStep(stepId: string): Promise<void> {
    const result = await this.makeRequest(
      `${getSecureApiBaseUrl()}/goals/steps/${stepId}`,
      { method: 'DELETE' },
      ErrorCategory.GOALS,
      'deleteStep'
    );
    // DELETE operations may return undefined for empty responses
    return;
  }

  async getStep(stepId: string): Promise<any> {
    return this.makeRequest(
      `${getSecureApiBaseUrl()}/goals/steps/${stepId}`,
      { method: 'GET' },
      ErrorCategory.GOALS,
      'getStep'
    );
  }

  async getMilestoneSteps(since?: string): Promise<any> {
    const url = since 
      ? `${getSecureApiBaseUrl()}/milestone-steps?since=${encodeURIComponent(since)}`
      : `${getSecureApiBaseUrl()}/milestone-steps`;
    
    return this.makeRequest(
      url,
      { method: 'GET' },
      ErrorCategory.GOALS,
      'getMilestoneSteps'
    );
  }

  // Auth API methods
  async authenticateWithGoogle(
    idToken: string,
    serverAuthCode: string,
    webClientId: string
  ): Promise<{ token?: string; user?: any; refresh_token?: string; error?: string }> {
    const baseUrl = getSecureApiBaseUrl();
    const url = `${baseUrl}/auth/google/mobile-signin`;
    
    // Make unauthenticated request (no auth token needed for initial auth)
    return this.makeRequest(
      url,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Web-Client-Id': webClientId,
          // Explicitly set empty Authorization to prevent auto-addition
          'Authorization': '',
        },
        body: JSON.stringify({
          idToken,
          serverAuthCode,
          webClientId,
        }),
      },
      ErrorCategory.AUTH,
      'authenticateWithGoogle'
    ) as Promise<{ token?: string; user?: any; refresh_token?: string; error?: string }>;
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