import axios from 'axios';
import { SecureTokenStorage, getSecurityHeaders, logSecurityEvent } from '../utils/security';

// Request deduplication cache
const requestCache = new Map();
const CACHE_DURATION = 1000; // 1 second

// Create axios instance with base configuration
const API_BASE_URL = import.meta.env.VITE_SECURE_API_BASE || import.meta.env.VITE_API_URL;
if (!API_BASE_URL) {
  throw new Error('API base URL not configured. Please set VITE_SECURE_API_BASE or VITE_API_URL environment variable.');
}const api = axios.create({
  baseURL: API_BASE_URL,
  headers: {
    'Content-Type': 'application/json',
  },
});

// Request interceptor to add auth token and security headers
api.interceptors.request.use(
  (config) => {
    const token = SecureTokenStorage.getToken();
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    
    // Add security headers
    const securityHeaders = getSecurityHeaders();
    Object.assign(config.headers, securityHeaders);
    try {
      const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
      if (tz) config.headers['X-User-Timezone'] = tz;
    } catch (_) {
      // Ignore timezone detection errors
    }
    
    // Add request deduplication for GET requests
    if (config.method === 'get') {
      const cacheKey = `${config.method}:${config.url}:${JSON.stringify(config.params || {})}`;
      const now = Date.now();
      const cached = requestCache.get(cacheKey);
      
      if (cached && (now - cached.timestamp) < CACHE_DURATION) {
        // Return cached promise
        return Promise.reject({ 
          isCached: true, 
          cachedResponse: cached.promise 
        });
      }
      
      // Create a deferred promise for the in-flight request
      let resolve, reject;
      const promise = new Promise((res, rej) => {
        resolve = res;
        reject = rej;
      });

      // Store the request promise in cache
      requestCache.set(cacheKey, {
        timestamp: now,
        promise,
        resolve,
        reject
      });
      
      // Attach cacheKey to config for response interceptors
      config._cacheKey = cacheKey;
      
      // Clean up old cache entries
      for (const [key, value] of requestCache.entries()) {
        if ((now - value.timestamp) > CACHE_DURATION) {
          requestCache.delete(key);
        }
      }
    }
    
    return config;
  },
  (error) => {
    logSecurityEvent('Request interceptor error', error);
    return Promise.reject(error);
  }
);

// Response interceptor for error handling
api.interceptors.response.use(
  (response) => {
    // Resolve in-flight request if exists
    if (response.config?._cacheKey) {
      const cached = requestCache.get(response.config._cacheKey);
      if (cached) {
        cached.resolve(response);
      }
    }
    return response;
  },
  (error) => {
    // Handle cached responses
    if (error.isCached) {
      return error.cachedResponse;
    }

    // Reject in-flight request if exists
    if (error.config?._cacheKey) {
      const cached = requestCache.get(error.config._cacheKey);
      if (cached) {
        cached.reject(error);
        requestCache.delete(error.config._cacheKey);
      }
    }
    
    if (error.response?.status === 401) {
      // Token expired or invalid
      logSecurityEvent('Authentication failed', { status: 401 });
      SecureTokenStorage.removeToken();
      window.location.href = '/login';
    } else if (error.response?.status >= 400) {
      // Log other client/server errors
      logSecurityEvent('API error', { 
        status: error.response.status, 
        url: error.config?.url 
      });
    }
    return Promise.reject(error);
  }
);

// Auth API
export const authAPI = {
  login: (credentials) => api.post('/auth/login', credentials),
  signup: (userData) => api.post('/auth/signup', userData),
  getProfile: () => api.get('/auth/profile'),
  resendConfirmation: (email) => api.post('/auth/resend-confirmation', { email }),
};

// Goals API
export const goalsAPI = {
  getAll: () => api.get('/goals'),
  getById: (id) => api.get(`/goals/${id}`),
  create: (goalData) => api.post('/goals', goalData),
  update: (id, goalData) => api.put(`/goals/${id}`, goalData),
  delete: (id) => api.delete(`/goals/${id}`),
};

// Tasks API
export const tasksAPI = {
  getAll: () => api.get('/tasks'),
  getById: (id) => api.get(`/tasks/${id}`),
  create: (taskData) => api.post('/tasks', taskData),
  update: (id, taskData) => api.put(`/tasks/${id}`, taskData),
  delete: (id) => api.delete(`/tasks/${id}`),
  bulkCreate: (tasks) => api.post('/tasks/bulk', tasks),
  // Auto-scheduling endpoints
  toggleAutoSchedule: (id, enabled) => api.put(`/tasks/${id}/toggle-auto-schedule`, { auto_schedule_enabled: enabled }),
  getAutoSchedulingDashboard: () => api.get('/tasks/auto-scheduling/dashboard'),
  getUserSchedulingPreferences: () => api.get('/tasks/auto-scheduling/preferences'),
  updateUserSchedulingPreferences: (preferences) => api.put('/tasks/auto-scheduling/preferences', preferences),
  getTaskSchedulingHistory: (taskId) => api.get(`/tasks/auto-scheduling/history${taskId ? `/${taskId}` : ''}`),
  triggerAutoScheduling: () => api.post('/tasks/auto-scheduling/trigger'),
  // Notification endpoints
  getNotifications: (limit) => api.get(`/tasks/notifications${limit ? `?limit=${limit}` : ''}`),
  markNotificationAsRead: (id) => api.put(`/tasks/notifications/${id}/read`),
  markAllNotificationsAsRead: () => api.put('/tasks/notifications/read-all'),
  archiveAllNotifications: () => api.put('/tasks/notifications/archive-all'),
};

// Calendar API
export const calendarAPI = {
  getStatus: () => api.get('/calendar/status'),
  getEvents: (maxResults = 10) => api.get(`/calendar/events?maxResults=${maxResults}`),
  createEvent: (eventData) => api.post('/calendar/events', eventData),
  updateEvent: (eventId, eventData) => api.put(`/calendar/events/${eventId}`, eventData),
  deleteEvent: (eventId) => api.delete(`/calendar/events/${eventId}`),
  getCalendarList: () => api.get('/calendar/list'),
  syncEvents: () => api.post('/calendar/sync'),
  scheduleTask: (taskId) => api.post('/calendar/schedule-task', { taskId }),
  disconnect: () => api.post('/calendar/disconnect'),
};

// AI API
export const aiAPI = {
  setMood: (mood) => {
    if (mood) {
      api.defaults.headers.common['X-User-Mood'] = mood;
    } else {
      delete api.defaults.headers.common['X-User-Mood'];
    }
  },
  // Route legacy AI chat through new Assistant UI endpoint in JSON fallback mode
  sendMessage: (message, threadId) => api.post('/chat?stream=false', { message, threadId }),
  getGoalSuggestions: (goalTitle) => api.post('/ai/goal-suggestions', { goalTitle }),
  getGoalBreakdown: (goalTitle, goalDescription) => api.post('/ai/goal-breakdown', { goalTitle, goalDescription }),
  createThread: ({ title, summary, messages }) => api.post('/ai/threads', { title, summary, messages }),
  recommendTask: (userRequest) => api.post('/ai/recommend-task', { userRequest }),
};

// Conversations API
export const conversationsAPI = {
  getThreads: () => api.get('/conversations/threads'),
  getThread: (threadId) => api.get(`/conversations/threads/${threadId}`),
  createThread: ({ title, summary, messages }) => api.post('/conversations/threads', { title, summary, messages }),
  addMessage: (threadId, content, role, metadata) => api.post(`/conversations/threads/${threadId}/messages`, { content, role, metadata }),
  updateThread: (threadId, updates) => api.put(`/conversations/threads/${threadId}`, updates),
  deleteThread: (threadId) => api.delete(`/conversations/threads/${threadId}`),
  getStats: () => api.get('/conversations/stats'),
};

// Milestones API
export const milestonesAPI = {
  create: (goalId, milestoneData) => api.post(`/goals/${goalId}/milestones`, milestoneData).then(res => res.data),
  update: (milestoneId, milestoneData) => api.put(`/goals/milestones/${milestoneId}`, milestoneData).then(res => res.data),
  delete: (milestoneId) => api.delete(`/goals/milestones/${milestoneId}`).then(res => res.data),
  readAll: (goalId) => api.get(`/goals/${goalId}/milestones`).then(res => res.data),
  lookup: async ({ milestoneId, goalId, title }) => {
    if (milestoneId) {
      const res = await api.get(`/goals/milestones/${milestoneId}`);
      return res.data;
    } else if (goalId && title) {
      const res = await api.get(`/goals/${goalId}/milestones/lookup?title=${encodeURIComponent(title)}`);
      return res.data;
    } else {
      throw new Error('Must provide milestoneId or goalId and title');
    }
  },
};

// Steps API
export const stepsAPI = {
  create: async (milestoneId, stepData) => {
    const response = await api.post(`/goals/milestones/${milestoneId}/steps`, stepData);
    return response.data;
  },
  update: async (stepId, stepData) => {
    const response = await api.put(`/goals/steps/${stepId}`, stepData);
    return response.data;
  },
  delete: async (stepId) => {
    const response = await api.delete(`/goals/steps/${stepId}`);
    return response.data;
  },
  readAll: async (milestoneId) => {
    const response = await api.get(`/goals/milestones/${milestoneId}/steps`);
    return response.data;
  },
  lookup: async ({ stepId, milestoneId, text }) => {
    let url;
    if (stepId) {
      url = `/goals/steps/${stepId}`;
    } else if (milestoneId && text) {
      url = `/goals/milestones/${milestoneId}/steps/lookup?text=${encodeURIComponent(text)}`;
    } else {
      throw new Error('Must provide stepId or milestoneId and text');
    }
    const response = await api.get(url);
    return response.data;
  },
};

// Health check
export const healthCheck = () => api.get('/health');

class WebSocketService {
  constructor() {
    this.ws = null;
    this.onMessageCallback = null;
  }

  connect() {
    if (this.ws && this.ws.readyState !== WebSocket.CLOSED) {
      return;
    }

    const baseUrl = import.meta.env.VITE_SECURE_API_BASE || import.meta.env.VITE_API_URL;
    if (!baseUrl) {
      throw new Error('API base URL not configured for WebSocket connection');
    }
    const wsUrl = baseUrl
      .replace(/^http/, 'ws')
      .replace('/api', '/api/ws/notifications');

    this.ws = new WebSocket(wsUrl);

    this.ws.onopen = () => {
      const token = SecureTokenStorage.getToken();
      if (token) {
        this.ws.send(JSON.stringify({ type: 'auth', token }));
      }
    };

    this.ws.onmessage = (event) => {
      const message = JSON.parse(event.data);
      if (this.onMessageCallback) {
        this.onMessageCallback(message);
      }
    };

    this.ws.onerror = (error) => {
      console.error('WebSocket error:', error);
    };

    this.ws.onclose = () => {
    };
  }

  onMessage(callback) {
    this.onMessageCallback = callback;
  }

  disconnect() {
    if (this.ws) {
      this.ws.close();
    }
  }
}

export const webSocketService = new WebSocketService();


export default api; 