// Real API implementation for backend integration
// Uses secure configuration service for API base URL
import { authService } from './auth';
import secureConfigService from './secureConfig';
import { sanitizeApiError, logErrorSecurely } from '../utils/errorSanitizer';
import logger from '../utils/logger';

// Helper function to get secure API base URL
const getSecureApiBaseUrl = (): string => {
  try {
    const url = secureConfigService.getApiBaseUrl();
    if (url && url.trim().length > 0) {
      return url;
    }
  } catch (error) {
    logger.debug('Primary config service failed, falling back to configService', {
      error: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined,
    });
  }

  // Fallback to regular config service
  try {
    const { configService } = require('./config');
    const fallbackUrl = configService.getBaseUrl();
    if (fallbackUrl && fallbackUrl.trim().length > 0) {
      return fallbackUrl;
    }
  } catch (error) {
    logger.debug('configService require failed, falling back to final URL', {
      error: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined,
    });
  }

  // Final fallback based on environment
  const finalFallback = __DEV__ 
    ? 'http://localhost:5000/api'  // Development: use localhost with adb reverse
    : 'https://foci-production.up.railway.app/api';  // Production: use Railway
  return finalFallback;
};

// Helper function to filter out null values from objects
function filterNullValues<T extends Record<string, any>>(obj: T): Partial<T> {
  const filtered = { ...obj };
  Object.keys(filtered).forEach(key => {
    if (filtered[key] === null) {
      delete filtered[key];
    }
  });
  return filtered;
}
import {
  SchedulingPreferences,
  TaskSchedulingStatus,
  AutoSchedulingResult,
  TimeSlot,
} from '../types/autoScheduling';

interface GoalBreakdownRequest {
  title: string;
  description?: string;
}

interface Milestone {
  id: string;
  title: string;
  completed: boolean;
  order: number;
  steps: Array<{
    id: string;
    text: string;
    completed: boolean;
    order: number;
  }>;
}

interface GoalBreakdownResponse {
  milestones: Milestone[];
}

export interface Goal {
  id: string;
  title: string;
  description: string;
  target_completion_date?: string;
  category?: string;
  completed?: boolean;
  created_at?: string;
  milestones?: Milestone[];
}

// Brain Dump API
export const brainDumpAPI = {
  submit: async (text: string): Promise<{ threadId: string; items: Array<{ text: string; category?: string | null; stress_level: 'low'|'medium'|'high'; priority: 'low'|'medium'|'high' }>}> => {
    const response = await fetch(`${getSecureApiBaseUrl()}/ai/braindump`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${await getAuthToken()}`,
      },
      body: JSON.stringify({ text }),
    });
    if (!response.ok) {
      const body = await response.json().catch(()=>({}));
      throw new Error(body?.message || 'Failed to process brain dump');
    }
    return response.json();
  },
};

export const goalsAPI = {
  // Generate AI-powered goal breakdown using real backend
  generateBreakdown: async (data: GoalBreakdownRequest): Promise<GoalBreakdownResponse> => {
    try {
      const response = await fetch(`${getSecureApiBaseUrl()}/goals/generate-breakdown`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${await getAuthToken()}`,
        },
        body: JSON.stringify(data),
      });

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      return await response.json();
    } catch (_error) {
      console.error('Error generating goal breakdown:', _error);
      throw _error;
    }
  },

  // Create a milestone under a goal
  createMilestone: async (
    goalId: string,
    payload: { title: string; order: number }
  ): Promise<{ id: string; title: string; order: number; steps: Array<{ id: string; text: string; completed: boolean; order: number }> }> => {
    try {
      const token = await getAuthToken();
      const response = await fetch(`${getSecureApiBaseUrl()}/goals/${goalId}/milestones`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
        body: JSON.stringify(payload),
      });
      if (!response.ok) {
        const text = await response.text();
        throw new Error(`HTTP error! status: ${response.status}, body: ${text}`);
      }
      return await response.json();
    } catch (_error) {
      console.error('🔍 API: Error creating milestone:', _error);
      throw _error;
    }
  },

  // Delete a milestone
  deleteMilestone: async (milestoneId: string): Promise<void> => {
    try {
      const token = await getAuthToken();
      const response = await fetch(`${getSecureApiBaseUrl()}/goals/milestones/${milestoneId}`, {
        method: 'DELETE',
        headers: {
          'Authorization': `Bearer ${token}`,
        },
      });
      if (!response.ok) {
        const text = await response.text();
        throw new Error(`HTTP error! status: ${response.status}, body: ${text}`);
      }
    } catch (_error) {
      console.error('🔍 API: Error deleting milestone:', _error);
      throw _error;
    }
  },

  // Create a step under a milestone
  createStep: async (
    milestoneId: string,
    payload: { text: string; order: number }
  ): Promise<{ id: string; text: string; order: number }> => {
    try {
      const token = await getAuthToken();
      const response = await fetch(`${getSecureApiBaseUrl()}/goals/milestones/${milestoneId}/steps`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
        body: JSON.stringify(payload),
      });
      if (!response.ok) {
        const text = await response.text();
        throw new Error(`HTTP error! status: ${response.status}, body: ${text}`);
      }
      return await response.json();
    } catch (_error) {
      console.error('🔍 API: Error creating step:', _error);
      throw _error;
    }
  },

  // Delete a step
  deleteStep: async (stepId: string): Promise<void> => {
    try {
      const token = await getAuthToken();
      const response = await fetch(`${getSecureApiBaseUrl()}/goals/steps/${stepId}`, {
        method: 'DELETE',
        headers: {
          'Authorization': `Bearer ${token}`,
        },
      });
      if (!response.ok) {
        const text = await response.text();
        throw new Error(`HTTP error! status: ${response.status}, body: ${text}`);
      }
    } catch (_error) {
      console.error('🔍 API: Error deleting step:', _error);
      throw _error;
    }
  },

  // Create a new goal using real backend
  createGoal: async (goalData: Goal): Promise<Goal> => {
    try {
      const response = await fetch(`${getSecureApiBaseUrl()}/goals`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${await getAuthToken()}`,
        },
        body: JSON.stringify(goalData),
      });

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      return await response.json();
    } catch (_error) {
      console.error('Error creating goal:', _error);
      throw _error;
    }
  },

  // Get all goals for the user using real backend
  getGoals: async (signal?: AbortSignal, since?: string): Promise<Goal[]> => {
    try {
      const token = await getAuthToken();
      
      const url = since 
        ? `${getSecureApiBaseUrl()}/goals?since=${encodeURIComponent(since)}`
        : `${getSecureApiBaseUrl()}/goals`;
      
      const response = await fetch(url, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${token}`,
        },
        signal,
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.error('🔍 API: Error response body:', errorText);
        throw new Error(`HTTP error! status: ${response.status}, body: ${errorText}`);
      }

      const data = await response.json();
      
      // Cache the goals for offline use
      const { offlineService } = await import('./offline');
      await offlineService.cacheGoals(data);
      
      return data;
    } catch (_error) {
      if ((_error as any)?.name === 'AbortError') {
        // Silent for expected timeouts; caller handles gracefully
        throw _error;
      }
      console.error('🔍 API: Error fetching goals:', _error);
      
      // Try to get cached goals if offline
      const { offlineService } = await import('./offline');
      if (offlineService.shouldUseCache()) {
        const cachedGoals = await offlineService.getCachedGoals();
        if (cachedGoals) {
          console.warn('Using cached goals due to offline status');
          return cachedGoals;
        }
      }
      
      throw _error;
    }
  },

  // Get a single goal by ID with milestones and steps
  getGoalById: async (goalId: string): Promise<Goal> => {
    try {
      const token = await getAuthToken();
      const response = await fetch(`${getSecureApiBaseUrl()}/goals/${goalId}`, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${token}`,
        },
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.error('🔍 API: Error response body:', errorText);
        throw new Error(`HTTP error! status: ${response.status}, body: ${errorText}`);
      }

      const data = await response.json();
      return data;
    } catch (_error) {
      console.error('🔍 API: Error fetching goal by ID:', _error);
      throw _error;
    }
  },

  // Update milestone completion status
  updateMilestone: async (milestoneId: string, updates: { completed?: boolean; title?: string }): Promise<void> => {
    try {
      const token = await getAuthToken();
      const response = await fetch(`${getSecureApiBaseUrl()}/goals/milestones/${milestoneId}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
        body: JSON.stringify(updates),
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`HTTP error! status: ${response.status}, body: ${errorText}`);
      }
    } catch (_error) {
      console.error('🔍 API: Error updating milestone:', _error);
      throw _error;
    }
  },

  // Update step completion status
  updateStep: async (stepId: string, updates: { completed?: boolean; text?: string }): Promise<void> => {
    try {
      const token = await getAuthToken();
      const response = await fetch(`${getSecureApiBaseUrl()}/goals/steps/${stepId}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
        body: JSON.stringify(updates),
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`HTTP error! status: ${response.status}, body: ${errorText}`);
      }
    } catch (_error) {
      console.error('🔍 API: Error updating step:', _error);
      throw _error;
    }
  },

  // Update an existing goal with all its data
  updateGoal: async (goalId: string, goalData: Partial<Goal>): Promise<Goal> => {
    try {
      const token = await getAuthToken();
      const response = await fetch(`${getSecureApiBaseUrl()}/goals/${goalId}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
        body: JSON.stringify(goalData),
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`HTTP error! status: ${response.status}, body: ${errorText}`);
      }

      const data = await response.json();
      return data;
    } catch (_error) {
      console.error('🔍 API: Error updating goal:', _error);
      throw _error;
    }
  },

  // Delete a goal by ID
  deleteGoal: async (goalId: string): Promise<void> => {
    try {
      const token = await getAuthToken();
      const response = await fetch(`${getSecureApiBaseUrl()}/goals/${goalId}`, {
        method: 'DELETE',
        headers: {
          'Authorization': `Bearer ${token}`,
        },
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`HTTP error! status: ${response.status}, body: ${errorText}`);
      }
    } catch (_error) {
      console.error('🔍 API: Error deleting goal:', _error);
      throw _error;
    }
  },
};

interface Task {
  id: string;
  title: string;
  description?: string;
  priority: 'low' | 'medium' | 'high';
  status: 'not_started' | 'in_progress' | 'completed';
  due_date?: string;
  category?: string;
  goal_id?: string;
  estimated_duration_minutes?: number;
  created_at?: string;
  updated_at?: string;
  goal?: {
    id: string;
    title: string;
    description?: string;
  };
}

export const tasksAPI = {
  // Get all tasks for the user
  getTasks: async (signal?: AbortSignal, since?: string): Promise<Task[]> => {
    try {
      const token = await getAuthToken();
      
      const url = since 
        ? `${getSecureApiBaseUrl()}/tasks?since=${encodeURIComponent(since)}`
        : `${getSecureApiBaseUrl()}/tasks`;
      
      const response = await fetch(url, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${token}`,
        },
        signal,
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.error('🔍 API: Error response body:', errorText);
        throw new Error(`HTTP error! status: ${response.status}, body: ${errorText}`);
      }

      const data = await response.json();
      
      // Cache the tasks for offline use
      const { offlineService } = await import('./offline');
      await offlineService.cacheTasks(data);
      
      return data;
    } catch (_error) {
      if ((_error as any)?.name === 'AbortError') {
        // Silent for expected timeouts; caller handles gracefully
        throw _error;
      }
      console.error('🔍 API: Error fetching tasks:', _error);
      
      // Try to get cached tasks if offline
      const { offlineService } = await import('./offline');
      if (offlineService.shouldUseCache()) {
        const cachedTasks = await offlineService.getCachedTasks();
        if (cachedTasks) {
          console.warn('Using cached tasks due to offline status');
          return cachedTasks;
        }
      }
      
      throw _error;
    }
  },

  // Bulk create tasks (atomic insert)
  bulkCreateTasks: async (tasks: Partial<Task>[]): Promise<Task[]> => {
    try {
      // Debug logging
      // bulkCreateTasks called

      // Validate input before making API call
      if (!Array.isArray(tasks)) {
        throw new Error('Tasks must be an array');
      }
      if (tasks.length === 0) {
        console.warn('bulkCreateTasks called with empty array, returning empty result');
        return [];
      }
      if (tasks.length > 50) {
        throw new Error('Cannot create more than 50 tasks at once');
      }

      // Filter out null values from each task
      const filteredTasks = tasks.map(task => filterNullValues(task));

      // Making API call with tasks wrapped in tasks property
      const response = await fetch(`${getSecureApiBaseUrl()}/tasks/bulk`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${await getAuthToken()}`,
        },
        body: JSON.stringify({ tasks: filteredTasks }),
      });
      if (!response.ok) {
        const text = await response.text();
        throw new Error(`HTTP error! status: ${response.status}, body: ${text}`);
      }
      return await response.json();
    } catch (_error) {
      console.error('Error bulk creating tasks:', _error);
      throw _error;
    }
  },

  // Get a single task by ID
  getTaskById: async (taskId: string): Promise<Task> => {
    try {
      const token = await getAuthToken();
      const response = await fetch(`${getSecureApiBaseUrl()}/tasks/${taskId}`, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${token}`,
        },
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.error('🔍 API: Error response body:', errorText);
        throw new Error(`HTTP error! status: ${response.status}, body: ${errorText}`);
      }

      const data = await response.json();
      return data;
    } catch (_error) {
      console.error('🔍 API: Error fetching task by ID:', _error);
      throw _error;
    }
  },

  // Create a new task
  createTask: async (taskData: Partial<Task>): Promise<Task> => {
    try {
      // Filter out null values that cause validation errors
      const filteredTaskData = filterNullValues(taskData);

      const response = await fetch(`${getSecureApiBaseUrl()}/tasks`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${await getAuthToken()}`,
        },
        body: JSON.stringify(filteredTaskData),
      });

      if (!response.ok) {
        const errorText = await response.text();
        let errorData;
        try {
          errorData = JSON.parse(errorText);
        } catch {
          errorData = { error: errorText };
        }
        
        const error = new Error(errorData.error || `HTTP error! status: ${response.status}`);
        (error as any).code = errorData.code;
        throw error;
      }

      return await response.json();
    } catch (_error) {
      console.error('Error creating task:', _error);
      
      // Add to offline queue if network error
      const { offlineService } = await import('./offline');
      if (!offlineService.getNetworkStatus()) {
        const actionId = await offlineService.addToOfflineQueue({
          type: 'CREATE_TASK',
          data: taskData,
          id: `temp_${Date.now()}`,
        });
        console.warn('Added task creation to offline queue:', actionId);
        return { id: actionId, offline: true, ...taskData } as Task;
      }
      
      throw _error;
    }
  },

  // Update an existing task
  updateTask: async (taskId: string, taskData: Partial<Task>): Promise<Task> => {
    try {
      // Filter out null values that cause validation errors
      const filteredTaskData = filterNullValues(taskData);


      const token = await getAuthToken();
      const response = await fetch(`${getSecureApiBaseUrl()}/tasks/${taskId}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
        body: JSON.stringify(filteredTaskData),
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`HTTP error! status: ${response.status}, body: ${errorText}`);
      }

      const data = await response.json();
      return data;
    } catch (_error) {
      console.error('🔍 API: Error updating task:', _error);
      
      // Add to offline queue if network error
      const { offlineService } = await import('./offline');
      if (!offlineService.getNetworkStatus()) {
        const actionId = await offlineService.addToOfflineQueue({
          type: 'UPDATE_TASK',
          data: taskData,
          id: taskId,
        });
        console.warn('Added task update to offline queue:', actionId);
        return { id: taskId, offline: true, ...taskData } as Task;
      }
      
      throw _error;
    }
  },

  // Delete a task
  deleteTask: async (taskId: string): Promise<void> => {
    try {
      const token = await getAuthToken();
      const response = await fetch(`${getSecureApiBaseUrl()}/tasks/${taskId}`, {
        method: 'DELETE',
        headers: {
          'Authorization': `Bearer ${token}`,
        },
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`HTTP error! status: ${response.status}, body: ${errorText}`);
      }
    } catch (_error) {
      console.error('🔍 API: Error deleting task:', _error);
      
      // Add to offline queue if network error
      const { offlineService } = await import('./offline');
      if (!offlineService.getNetworkStatus()) {
        const actionId = await offlineService.addToOfflineQueue({
          type: 'DELETE_TASK',
          id: taskId,
        });
        console.warn('Added task deletion to offline queue:', actionId);
        return;
      }
      
      throw _error;
    }
  },
  
  // Momentum Mode: Get next focus task
  focusNext: async (payload: { current_task_id?: string|null; travel_preference?: 'allow_travel'|'home_only'; exclude_ids?: string[] }): Promise<Task> => {
    const token = await getAuthToken();
    const response = await fetch(`${getSecureApiBaseUrl()}/tasks/focus/next`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`,
      },
      body: JSON.stringify(payload || {}),
    });
    if (response.status === 404) {
      const text = await response.text().catch(()=> '');
      const err = new Error(text || 'No other tasks match your criteria.');
      (err as any).code = 404;
      throw err;
    }
    if (!response.ok) {
      const text = await response.text();
      throw new Error(`HTTP error! status: ${response.status}, body: ${text}`);
    }
    return response.json();
  },};

// Calendar API
export const calendarAPI = {
  // Get all events from backend database
  getEvents: async (maxResults: number = 100, since?: string): Promise<any> => {
    try {
      const token = await getAuthToken();
      let url = `${getSecureApiBaseUrl()}/calendar/events?maxResults=${maxResults}`;
      if (since) {
        url += `&since=${encodeURIComponent(since)}`;
      }
      const response = await fetch(url, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${token}`,
        },
      });

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const events = await response.json();
      
      // Cache the events for offline use
      const { offlineService } = await import('./offline');
      await offlineService.cacheEvents(events);
      
      return events;
    } catch (_error) {
      console.error('Error fetching calendar events:', _error);
      
      // Try to get cached events if offline
      const { offlineService } = await import('./offline');
      if (offlineService.shouldUseCache()) {
        const cachedEvents = await offlineService.getCachedEvents();
        if (cachedEvents) {
          console.warn('Using cached events due to offline status');
          return cachedEvents;
        }
      }
      
      throw _error;
    }
  },

  // Get events for a specific date from backend database
  getEventsForDate: async (date: string): Promise<any> => {
    try {
      const token = await getAuthToken();
      const response = await fetch(`${getSecureApiBaseUrl()}/calendar/events/date?date=${date}`, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${token}`,
        },
      });

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      return await response.json();
    } catch (_error) {
      console.error('Error fetching events for date:', _error);
      throw _error;
    }
  },

  // Create a new event (uses backend proxy)
  createEvent: async (eventData: {
    summary: string;
    description?: string;
    startTime: string;
    endTime: string;
    timeZone?: string;
    location?: string;
  }): Promise<any> => {
    try {
      const token = await getAuthToken();
      const response = await fetch(`${getSecureApiBaseUrl()}/calendar/events`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
        body: JSON.stringify({
          ...eventData,
          useSupabase: true, // Use direct Supabase storage
        }),
      });

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      return await response.json();
    } catch (_error) {
      console.error('Error creating calendar event:', _error);
      
      // Add to offline queue if network error
      const { offlineService } = await import('./offline');
      if (!offlineService.getNetworkStatus()) {
        const actionId = await offlineService.addToOfflineQueue({
          type: 'CREATE_EVENT',
          data: eventData,
          id: `temp_${Date.now()}`,
        });
        console.warn('Added event creation to offline queue:', actionId);
        return { id: actionId, offline: true };
      }
      
      throw _error;
    }
  },

  // Update an existing event (uses backend proxy)
  updateEvent: async (eventId: string, eventData: {
    summary: string;
    description?: string;
    startTime: string;
    endTime: string;
    timeZone?: string;
    location?: string;
  }): Promise<any> => {
    try {
      const token = await getAuthToken();
      const response = await fetch(`${getSecureApiBaseUrl()}/calendar/events/${eventId}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
        body: JSON.stringify({
          ...eventData,
          useSupabase: true, // Use direct Supabase storage
        }),
      });

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      return await response.json();
    } catch (_error) {
      console.error('Error updating calendar event:', _error);
      
      // Add to offline queue if network error
      const { offlineService } = await import('./offline');
      if (!offlineService.getNetworkStatus()) {
        const actionId = await offlineService.addToOfflineQueue({
          type: 'UPDATE_EVENT',
          data: eventData,
          id: eventId,
        });
        console.warn('Added event update to offline queue:', actionId);
        return { id: actionId, offline: true };
      }
      
      throw _error;
    }
  },

  // Delete an event (uses backend proxy)
  deleteEvent: async (eventId: string): Promise<void> => {
    try {
      const token = await getAuthToken();
      const response = await fetch(`${getSecureApiBaseUrl()}/calendar/events/${eventId}?useSupabase=true`, {
        method: 'DELETE',
        headers: {
          'Authorization': `Bearer ${token}`,
        },
      });

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
    } catch (_error) {
      console.error('Error deleting calendar event:', _error);
      
      // Add to offline queue if network error
      const { offlineService } = await import('./offline');
      if (!offlineService.getNetworkStatus()) {
        const actionId = await offlineService.addToOfflineQueue({
          type: 'DELETE_EVENT',
          id: eventId,
        });
        console.warn('Added event deletion to offline queue:', actionId);
        return;
      }
      
      throw _error;
    }
  },

  // Sync calendar (existing functionality)
  syncCalendar: async (): Promise<any> => {
    try {
      const token = await getAuthToken();
      const response = await fetch(`${getSecureApiBaseUrl()}/calendar/sync`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
        },
      });

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      return await response.json();
    } catch (_error) {
      console.error('Error syncing calendar:', _error);
      throw _error;
    }
  },
};

// Auto-scheduling API
export const autoSchedulingAPI = {
  // Bulk auto-schedule all eligible tasks
  autoScheduleTasks: async (): Promise<AutoSchedulingResult> => {
    try {
      const token = await getAuthToken();
      const response = await fetch(`${getSecureApiBaseUrl()}/ai/auto-schedule-tasks`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.error('🔍 API: Error response body:', errorText);
        throw new Error(`HTTP error! status: ${response.status}, body: ${errorText}`);
      }

      const data = await response.json();
      return data;
    } catch (_error) {
      console.error('🔍 API: Error auto-scheduling tasks:', _error);
      throw _error;
    }
  },

  // Get user scheduling preferences
  getPreferences: async (): Promise<SchedulingPreferences> => {
    try {
      const token = await getAuthToken();
      const response = await fetch(`${getSecureApiBaseUrl()}/ai/scheduling-preferences`, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${token}`,
        },
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.error('🔍 API: Error response body:', errorText);
        throw new Error(`HTTP error! status: ${response.status}, body: ${errorText}`);
      }

      const data = await response.json();
      return data;
    } catch (_error) {
      console.error('🔍 API: Error fetching scheduling preferences:', _error);
      throw _error;
    }
  },

  // Update user scheduling preferences
  updatePreferences: async (preferences: Partial<SchedulingPreferences>): Promise<SchedulingPreferences> => {
    try {
      const token = await getAuthToken();
      const response = await fetch(`${getSecureApiBaseUrl()}/ai/scheduling-preferences`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
        body: JSON.stringify(preferences),
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.error('🔍 API: Error response body:', errorText);
        throw new Error(`HTTP error! status: ${response.status}, body: ${errorText}`);
      }

      const data = await response.json();
      return data;
    } catch (_error) {
      console.error('🔍 API: Error updating scheduling preferences:', _error);
      throw _error;
    }
  },

  // Get auto-scheduling status for a specific task
  getTaskSchedulingStatus: async (taskId: string): Promise<TaskSchedulingStatus> => {
    try {
      const token = await getAuthToken();
      const response = await fetch(`${getSecureApiBaseUrl()}/tasks/${taskId}/scheduling-status`, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${token}`,
        },
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.error('🔍 API: Error response body:', errorText);
        throw new Error(`HTTP error! status: ${response.status}, body: ${errorText}`);
      }

      const data = await response.json();
      return data;
    } catch (_error) {
      console.error('🔍 API: Error fetching task scheduling status:', _error);
      throw _error;
    }
  },

  // Toggle auto-scheduling for a specific task
  toggleTaskAutoScheduling: async (taskId: string, enabled: boolean): Promise<void> => {
    try {
      const token = await getAuthToken();
      const response = await fetch(`${getSecureApiBaseUrl()}/tasks/${taskId}/auto-schedule`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
        body: JSON.stringify({ auto_schedule_enabled: enabled }),
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.error('🔍 API: Error response body:', errorText);
        throw new Error(`HTTP error! status: ${response.status}, body: ${errorText}`);
      }
    } catch (_error) {
      console.error('🔍 API: Error toggling task auto-scheduling:', _error);
      throw _error;
    }
  },

  // Get available time slots for a task
  getAvailableTimeSlots: async (taskId: string): Promise<TimeSlot[]> => {
    try {
      const token = await getAuthToken();
      const response = await fetch(`${getSecureApiBaseUrl()}/ai/available-time-slots?taskId=${taskId}`, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${token}`,
        },
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.error('🔍 API: Error response body:', errorText);
        throw new Error(`HTTP error! status: ${response.status}, body: ${errorText}`);
      }

      const data = await response.json();
      return data.map((slot: { start_time: string; end_time: string; [key: string]: unknown }) => ({
        ...slot,
        start_time: new Date(slot.start_time),
        end_time: new Date(slot.end_time),
      }));
    } catch (_error) {
      console.error('🔍 API: Error fetching available time slots:', _error);
      throw _error;
    }
  },
};

// Helper function to get auth token from auth service
async function getAuthToken(): Promise<string> {
  const token = await authService.getAuthToken();
  if (!token) {
    const err = new Error('No authentication token available - user not logged in');
    (err as any).code = 'AUTH_REQUIRED';
    throw err;
  }
  return token;
}

// Users API for profile endpoints
export const usersAPI = {
  getMe: async (): Promise<any> => {
    try {
      const token = await getAuthToken();
      const response = await fetch(`${getSecureApiBaseUrl()}/user/me`, {
        method: 'GET',
        headers: { 'Authorization': `Bearer ${token}` },
      });
      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`HTTP error! status: ${response.status}, body: ${errorText}`);
      }
      return response.json();
    } catch (error) {
      console.error('Error fetching user profile:', error);
      throw error;
    }
  },
  updateMe: async (payload: Partial<{ full_name: string; avatar_url: string; geographic_location: string; theme_preference: 'light'|'dark'; notification_preferences: any; timezone: string; }>): Promise<any> => {
    try {
      const token = await getAuthToken();
      const response = await fetch(`${getSecureApiBaseUrl()}/user/me`, {
        method: 'PUT',
        headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`HTTP error! status: ${response.status}, body: ${errorText}`);
      }
      return response.json();
    } catch (error) {
      console.error('Error updating user profile:', error);
      throw error;
    }
  },
  updateNotificationPreference: async (notificationType: string, channel: string, enabled: boolean): Promise<void> => {
    try {
      const token = await getAuthToken();
      const response = await fetch(`${getSecureApiBaseUrl()}/user/notification-preferences`, {
        method: 'PUT',
        headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ notification_type: notificationType, channel, enabled }),
      });
      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`HTTP error! status: ${response.status}, body: ${errorText}`);
      }
    } catch (error) {
      console.error('Error updating notification preference:', error);
      throw error;
    }
  },
  registerDeviceToken: async (token: string, deviceType: string): Promise<void> => {
    const authToken = await getAuthToken();
    const response = await fetch(`${getSecureApiBaseUrl()}/user/device-token`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${authToken}`,
      },
      body: JSON.stringify({ token, device_type: deviceType }),
    });
    if (!response.ok) {
      throw new Error('Failed to register device token');
    }
  },

  getNotifications: async (status: 'all' | 'read' | 'unread' = 'unread'): Promise<any[]> => {
    const token = await getAuthToken();
    const url = `${getSecureApiBaseUrl()}/tasks/notifications?status=${status}`;
    logger.debug('🔔 API: Making request to:', url);
    logger.debug('🔔 API: Using token:', token ? `${token.substring(0, 20)}...` : 'null');
    
    const response = await fetch(url, {
        method: 'GET',
        headers: { 'Authorization': `Bearer ${token}` },
    });
    
    logger.debug('🔔 API: Response status:', response.status);
    logger.debug('🔔 API: Response ok:', response.ok);
    
    if (!response.ok) {
        const errorText = await response.text();
        console.error('🔔 API: Error response body:', errorText);
        throw new Error(`Failed to get notifications: ${response.status} - ${errorText}`);
    }
    return response.json();
  },

  markAsRead: async (notificationId: string): Promise<void> => {
    const token = await getAuthToken();
    const response = await fetch(`${getSecureApiBaseUrl()}/tasks/notifications/${notificationId}/read`, {
        method: 'PUT',
        headers: { 'Authorization': `Bearer ${token}` },
    });
    if (!response.ok) {
        if (response.status === 401) {
          const err = new Error('Authentication failed - user not logged in');
          (err as any).code = 'AUTH_REQUIRED';
          throw err;
        }
        throw new Error('Failed to mark notification as read');
    }
  },

  markAllAsRead: async (): Promise<void> => {
    const token = await getAuthToken();
    const response = await fetch(`${getSecureApiBaseUrl()}/tasks/notifications/read-all`, {
        method: 'PUT',
        headers: { 'Authorization': `Bearer ${token}` },
    });
    if (!response.ok) {
        if (response.status === 401) {
          const err = new Error('Authentication failed - user not logged in');
          (err as any).code = 'AUTH_REQUIRED';
          throw err;
        }
        throw new Error('Failed to mark all notifications as read');
    }
  },

  getUnreadCount: async (): Promise<number> => {
    const token = await getAuthToken();
    const response = await fetch(`${getSecureApiBaseUrl()}/tasks/notifications/unread-count`, {
        method: 'GET',
        headers: { 'Authorization': `Bearer ${token}` },
    });
    if (!response.ok) {
        if (response.status === 401) {
          const err = new Error('Authentication failed - user not logged in');
          (err as any).code = 'AUTH_REQUIRED';
          throw err;
        }
        const errorText = await response.text();
        throw new Error(`Failed to get unread notification count: ${response.status} - ${errorText}`);
    }
    const data = await response.json();
    return data.count || 0;
  },

  deleteAccount: async (): Promise<{ status: number; payload: any }> => {
    try {
      const token = await getAuthToken();
      const apiUrl = getSecureApiBaseUrl();
      const response = await fetch(`${apiUrl}/user`, {
        method: 'DELETE',
        headers: { 
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ confirmDeletion: true }),
      });
      
      const payload = await response.json().catch(() => ({}));
      
      // Only treat 4xx and 5xx as errors, 2xx are success responses
      if (response.status >= 400) {
        if (response.status === 401) {
          const err = new Error('Authentication failed - user not logged in');
          (err as any).code = 'AUTH_REQUIRED';
          throw err;
        }
        const errorText = payload.error || 'Unknown error';
        throw new Error(`Failed to delete account: ${response.status} - ${errorText}`);
      }
      
      // Return both status and payload for the caller to inspect
      return { status: response.status, payload };
    } catch (error) {
      console.error('Error deleting account:', error);
      throw error;
    }
  },
};

class WebSocketService {
  private ws: WebSocket | null = null;
  private onMessageCallback: ((message: any) => void) | null = null;
  private reconnectAttempts = 0;
  private maxReconnectAttempts = 3;
  private reconnectDelay = 1000; // 1 second

  async connect() {
    try {
      // Check if user is authenticated before attempting connection
      const { authService } = await import('./auth');
      if (!authService.isAuthenticated()) {
        logger.debug('WebSocket: Skipping connection - user not authenticated');
        return;
      }

      // Validate token before attempting connection
      try {
        const token = await getAuthToken();
        if (!token) {
          logger.debug('WebSocket: Skipping connection - no valid token');
          return;
        }
        
        // Check if user is still authenticated (without attempting refresh)
        if (!authService.isAuthenticated()) {
          logger.debug('WebSocket: Skipping connection - user not authenticated');
          return;
        }
      } catch (error) {
        logger.debug('WebSocket: Skipping connection - token validation failed:', error);
        return;
      }

      // Prevent multiple connections
      if (this.ws && this.ws.readyState !== WebSocket.CLOSED) {
        logger.debug('WebSocket: Connection already exists, skipping');
        return;
      }

      const wsUrl = getSecureApiBaseUrl().replace(/^http/, 'ws') + '/ws/notifications';
      logger.debug('WebSocket: Attempting to connect to:', wsUrl);
      
      this.ws = new WebSocket(wsUrl);

      this.ws.onopen = async () => {
        logger.debug('WebSocket: Connected successfully');
        this.reconnectAttempts = 0; // Reset reconnect attempts on successful connection
        
        try {
          // Authenticate upon connection with fresh token
          const token = await getAuthToken();
          if (token && this.ws) {
            this.ws.send(JSON.stringify({ type: 'auth', token }));
            logger.debug('WebSocket: Authentication sent');
          }
        } catch (error) {
          logger.warn('WebSocket: Failed to authenticate');
          // If authentication fails, close the connection to prevent retry loop
          if (this.ws) {
            this.ws.close(1000, 'Authentication failed');
          }
        }
      };

      this.ws.onmessage = (event) => {
        try {
          const message = JSON.parse(event.data);
          
          // Handle authentication errors
          if (message.type === 'auth_error') {
            logger.warn('WebSocket: Authentication error:', message.message || message.error);
            // Close connection to prevent retry loop
            if (this.ws) {
              this.ws.close(1000, 'Authentication failed');
            }
            return;
          }
          
          if (this.onMessageCallback) {
            this.onMessageCallback(message);
          }
        } catch (error) {
          logger.debug('WebSocket: Error parsing message');
        }
      };

      this.ws.onerror = (_error) => {
        logger.debug('WebSocket: Connection error');
        // Intentionally avoiding verbose error object to reduce console noise
      };

      this.ws.onclose = (event) => {
        logger.debug('WebSocket: Connection closed', event.code, event.reason);
        
        // Don't retry if it was a manual disconnect or authentication failure
        if (event.code === 1000 || event.reason === 'Authentication failed') {
          logger.debug('WebSocket: Not retrying - manual disconnect or auth failure');
          return;
        }
        
        // Attempt to reconnect if it wasn't a manual disconnect
        if (this.reconnectAttempts < this.maxReconnectAttempts) {
          this.reconnectAttempts++;
          logger.debug(`WebSocket: Attempting to reconnect (${this.reconnectAttempts}/${this.maxReconnectAttempts})`);
          
          setTimeout(() => {
            this.connect();
          }, this.reconnectDelay * this.reconnectAttempts);
        } else if (this.reconnectAttempts >= this.maxReconnectAttempts) {
          logger.debug('WebSocket: Max reconnection attempts reached, giving up');
        }
      };

    } catch (error) {
      logger.warn('WebSocket: Failed to initialize connection');
    }
  }

  onMessage(callback: (message: any) => void) {
    this.onMessageCallback = callback;
  }

  disconnect() {
    if (this.ws) {
      logger.debug('WebSocket: Manually disconnecting');
      this.ws.close(1000, 'Manual disconnect');
      this.ws = null;
    }
  }

  // Public method to check connection status
  isConnected(): boolean {
    return this.ws?.readyState === WebSocket.OPEN;
  }
}

// App Preferences API
export const appPreferencesAPI = {
  get: async (): Promise<{ momentum_mode_enabled: boolean; momentum_travel_preference: 'allow_travel'|'home_only' }> => {
    try {
      const token = await getAuthToken();
      const response = await fetch(`${getSecureApiBaseUrl()}/user/app-preferences`, {
        method: 'GET',
        headers: { 'Authorization': `Bearer ${token}` },
      });
      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`HTTP error! status: ${response.status}, body: ${errorText}`);
      }
      return response.json();
    } catch (error) {
      console.error('Error fetching app preferences:', error);
      throw error;
    }
  },
  update: async (payload: Partial<{ momentum_mode_enabled: boolean; momentum_travel_preference: 'allow_travel'|'home_only' }>): Promise<any> => {
    try {
      const token = await getAuthToken();
      const response = await fetch(`${getSecureApiBaseUrl()}/user/app-preferences`, {
        method: 'PUT',
        headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(payload || {}),
      });
      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`HTTP error! status: ${response.status}, body: ${errorText}`);
      }
      return response.json();
    } catch (error) {
      console.error('Error updating app preferences:', error);
      throw error;
    }
  }
};

// Export a singleton instance for WebSocket notifications
export const webSocketService = new WebSocketService();

// Backward-compatible Notifications API export expected by consumers
export const notificationsAPI = {
  getNotifications: usersAPI.getNotifications,
  getUnreadCount: usersAPI.getUnreadCount,
  markAsRead: usersAPI.markAsRead,
  markAllAsRead: usersAPI.markAllAsRead,
  registerDeviceToken: usersAPI.registerDeviceToken,
};