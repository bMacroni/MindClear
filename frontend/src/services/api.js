import axios from 'axios';
import { SecureTokenStorage, getSecurityHeaders, logSecurityEvent } from '../utils/security';

// Request deduplication cache
const requestCache = new Map();
const CACHE_DURATION = 1000; // 1 second

// Create axios instance with base configuration
const API_BASE_URL = import.meta.env.VITE_SECURE_API_BASE || import.meta.env.VITE_API_URL || 'http://localhost:5000/api';
const api = axios.create({
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
          cachedResponse: cached.response 
        });
      }
      
      // Store the request promise in cache
      const requestPromise = Promise.resolve(config);
      requestCache.set(cacheKey, {
        timestamp: now,
        response: requestPromise
      });
      
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
  (response) => response,
  (error) => {
    // Handle cached responses
    if (error.isCached) {
      return error.cachedResponse;
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
  create: async (goalId, milestoneData, token) => {
    const res = await fetch(`${API_BASE_URL}/goals/${goalId}/milestones`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify(milestoneData),
    });
    if (!res.ok) throw new Error(await res.text());
    return res.json();
  },
  update: async (milestoneId, milestoneData, token) => {
    const res = await fetch(`${API_BASE_URL}/goals/milestones/${milestoneId}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify(milestoneData),
    });
    if (!res.ok) throw new Error(await res.text());
    return res.json();
  },
  delete: async (milestoneId, token) => {
    const res = await fetch(`${API_BASE_URL}/goals/milestones/${milestoneId}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) throw new Error(await res.text());
    return res.json();
  },
  readAll: async (goalId, token) => {
    const res = await fetch(`${API_BASE_URL}/goals/${goalId}/milestones`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) throw new Error(await res.text());
    return res.json();
  },
  lookup: async ({ milestoneId, goalId, title, token }) => {
    let url;
    if (milestoneId) {
      url = `${API_BASE_URL}/goals/milestones/${milestoneId}`;
    } else if (goalId && title) {
      url = `${API_BASE_URL}/goals/${goalId}/milestones/lookup?title=${encodeURIComponent(title)}`;
    } else {
      throw new Error('Must provide milestoneId or goalId and title');
    }
    const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
    if (!res.ok) throw new Error(await res.text());
    return res.json();
  },
};

// Steps API
export const stepsAPI = {
  create: async (milestoneId, stepData, token) => {
    const res = await fetch(`${API_BASE_URL}/goals/milestones/${milestoneId}/steps`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify(stepData),
    });
    if (!res.ok) throw new Error(await res.text());
    return res.json();
  },
  update: async (stepId, stepData, token) => {
    const res = await fetch(`${API_BASE_URL}/goals/steps/${stepId}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify(stepData),
    });
    if (!res.ok) {
      const errorText = await res.text();
      throw new Error(errorText);
    }
    const result = await res.json();
    return result;
  },
  delete: async (stepId, token) => {
    const res = await fetch(`${API_BASE_URL}/goals/steps/${stepId}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) throw new Error(await res.text());
    return res.json();
  },
  readAll: async (milestoneId, token) => {
    const res = await fetch(`${API_BASE_URL}/goals/milestones/${milestoneId}/steps`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) throw new Error(await res.text());
    return res.json();
  },
  lookup: async ({ stepId, milestoneId, text, token }) => {
    let url;
    if (stepId) {
      url = `${API_BASE_URL}/goals/steps/${stepId}`;
    } else if (milestoneId && text) {
      url = `${API_BASE_URL}/goals/milestones/${milestoneId}/steps/lookup?text=${encodeURIComponent(text)}`;
    } else {
      throw new Error('Must provide stepId or milestoneId and text');
    }
    const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
    if (!res.ok) throw new Error(await res.text());
    return res.json();
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

    const wsUrl = (import.meta.env.VITE_SECURE_API_BASE || import.meta.env.VITE_API_URL || 'http://localhost:5000/api')
      .replace(/^http/, 'ws')
      .replace('/api', '/api/ws/notifications');

    this.ws = new WebSocket(wsUrl);

    this.ws.onopen = () => {
      const token = localStorage.getItem('jwt_token');
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