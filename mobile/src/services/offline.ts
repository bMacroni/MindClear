import AsyncStorage from '@react-native-async-storage/async-storage';
import NetInfo from '@react-native-community/netinfo';
import { CalendarEvent, Task, Goal } from '../types/calendar';

// Storage keys
const STORAGE_KEYS = {
  EVENTS_CACHE: 'calendar_events_cache',
  TASKS_CACHE: 'calendar_tasks_cache',
  GOALS_CACHE: 'calendar_goals_cache',
  OFFLINE_QUEUE: 'calendar_offline_queue',
  LAST_SYNC: 'calendar_last_sync',
  CACHE_TIMESTAMP: 'calendar_cache_timestamp',
} as const;

// Cache expiration time (24 hours)
const CACHE_EXPIRATION = 24 * 60 * 60 * 1000;

// Offline queue item types
export type OfflineAction = 
  | { type: 'CREATE_EVENT'; data: any; id: string }
  | { type: 'UPDATE_EVENT'; data: any; id: string }
  | { type: 'DELETE_EVENT'; id: string }
  | { type: 'CREATE_TASK'; data: any; id: string }
  | { type: 'UPDATE_TASK'; data: any; id: string }
  | { type: 'DELETE_TASK'; id: string }
  | { type: 'COMPLETE_TASK'; id: string };

export interface OfflineQueueItem {
  id: string;
  action: OfflineAction;
  timestamp: number;
  retryCount: number;
}

export interface CacheData<T> {
  data: T;
  timestamp: number;
  version: string;
}

export interface OfflineState {
  isOnline: boolean;
  isSyncing: boolean;
  pendingActions: number;
  lastSyncTime: number | null;
}

class OfflineService {
  private isOnline: boolean = true;
  private isSyncing: boolean = false;
  private listeners: Set<(state: OfflineState) => void> = new Set();

  constructor() {
    this.initializeNetworkListener();
  }

  // Initialize network status listener
  private async initializeNetworkListener() {
    // Get initial network state
    const netInfo = await NetInfo.fetch();
    this.isOnline = netInfo.isConnected ?? true;

    // Listen for network changes
    NetInfo.addEventListener(state => {
      const wasOnline = this.isOnline;
      this.isOnline = state.isConnected ?? false;
      
      // If we just came back online, trigger sync
      if (!wasOnline && this.isOnline) {
        this.syncOfflineQueue();
      }
      
      this.notifyListeners();
    });
  }

  // Subscribe to offline state changes
  subscribe(listener: (state: OfflineState) => void) {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  // Notify all listeners of state changes
  private notifyListeners() {
    const state: OfflineState = {
      isOnline: this.isOnline,
      isSyncing: this.isSyncing,
      pendingActions: 0, // Will be updated when we get queue
      lastSyncTime: null, // Will be updated when we get last sync
    };

    this.listeners.forEach(listener => listener(state));
  }

  // Cache management
  async cacheEvents(events: CalendarEvent[]) {
    const cacheData: CacheData<CalendarEvent[]> = {
      data: events,
      timestamp: Date.now(),
      version: '1.0',
    };
    await AsyncStorage.setItem(STORAGE_KEYS.EVENTS_CACHE, JSON.stringify(cacheData));
  }

  async getCachedEvents(): Promise<CalendarEvent[] | null> {
    try {
      const cached = await AsyncStorage.getItem(STORAGE_KEYS.EVENTS_CACHE);
      if (!cached) return null;

      const cacheData: CacheData<CalendarEvent[]> = JSON.parse(cached);
      const isExpired = Date.now() - cacheData.timestamp > CACHE_EXPIRATION;

      if (isExpired) {
        await AsyncStorage.removeItem(STORAGE_KEYS.EVENTS_CACHE);
        return null;
      }

      return cacheData.data;
    } catch (error) {
      console.error('Error reading cached events:', error);
      return null;
    }
  }

  async cacheTasks(tasks: Task[]) {
    const cacheData: CacheData<Task[]> = {
      data: tasks,
      timestamp: Date.now(),
      version: '1.0',
    };
    await AsyncStorage.setItem(STORAGE_KEYS.TASKS_CACHE, JSON.stringify(cacheData));
  }

  async getCachedTasks(): Promise<Task[] | null> {
    try {
      const cached = await AsyncStorage.getItem(STORAGE_KEYS.TASKS_CACHE);
      if (!cached) return null;

      const cacheData: CacheData<Task[]> = JSON.parse(cached);
      const isExpired = Date.now() - cacheData.timestamp > CACHE_EXPIRATION;

      if (isExpired) {
        await AsyncStorage.removeItem(STORAGE_KEYS.TASKS_CACHE);
        return null;
      }

      return cacheData.data;
    } catch (error) {
      console.error('Error reading cached tasks:', error);
      return null;
    }
  }

  async cacheGoals(goals: Goal[]) {
    const cacheData: CacheData<Goal[]> = {
      data: goals,
      timestamp: Date.now(),
      version: '1.0',
    };
    await AsyncStorage.setItem(STORAGE_KEYS.GOALS_CACHE, JSON.stringify(cacheData));
  }

  async getCachedGoals(): Promise<Goal[] | null> {
    try {
      const cached = await AsyncStorage.getItem(STORAGE_KEYS.GOALS_CACHE);
      if (!cached) return null;

      const cacheData: CacheData<Goal[]> = JSON.parse(cached);
      const isExpired = Date.now() - cacheData.timestamp > CACHE_EXPIRATION;

      if (isExpired) {
        await AsyncStorage.removeItem(STORAGE_KEYS.GOALS_CACHE);
        return null;
      }

      return cacheData.data;
    } catch (error) {
      console.error('Error reading cached goals:', error);
      return null;
    }
  }

  // Offline queue management
  async addToOfflineQueue(action: OfflineAction): Promise<string> {
    const queueItem: OfflineQueueItem = {
      id: `${action.type}_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      action,
      timestamp: Date.now(),
      retryCount: 0,
    };

    try {
      const existingQueue = await this.getOfflineQueue();
      existingQueue.push(queueItem);
      await AsyncStorage.setItem(STORAGE_KEYS.OFFLINE_QUEUE, JSON.stringify(existingQueue));
      
      this.notifyListeners();
      return queueItem.id;
    } catch (error) {
      console.error('Error adding to offline queue:', error);
      throw error;
    }
  }

  async getOfflineQueue(): Promise<OfflineQueueItem[]> {
    try {
      const queue = await AsyncStorage.getItem(STORAGE_KEYS.OFFLINE_QUEUE);
      return queue ? JSON.parse(queue) : [];
    } catch (error) {
      console.error('Error reading offline queue:', error);
      return [];
    }
  }

  async removeFromOfflineQueue(itemId: string): Promise<void> {
    try {
      const queue = await this.getOfflineQueue();
      const filteredQueue = queue.filter(item => item.id !== itemId);
      await AsyncStorage.setItem(STORAGE_KEYS.OFFLINE_QUEUE, JSON.stringify(filteredQueue));
      this.notifyListeners();
    } catch (error) {
      console.error('Error removing from offline queue:', error);
    }
  }

  async updateQueueItemRetryCount(itemId: string, retryCount: number): Promise<void> {
    try {
      const queue = await this.getOfflineQueue();
      const updatedQueue = queue.map(item => 
        item.id === itemId ? { ...item, retryCount } : item
      );
      await AsyncStorage.setItem(STORAGE_KEYS.OFFLINE_QUEUE, JSON.stringify(updatedQueue));
    } catch (error) {
      console.error('Error updating queue item retry count:', error);
    }
  }

  // Sync offline queue when back online
  async syncOfflineQueue(): Promise<void> {
    if (this.isSyncing || !this.isOnline) return;

    this.isSyncing = true;
    this.notifyListeners();

    try {
      const queue = await this.getOfflineQueue();
      if (queue.length === 0) {
        this.isSyncing = false;
        this.notifyListeners();
        return;
      }

      console.log(`Syncing ${queue.length} offline actions...`);

      for (const item of queue) {
        try {
          await this.processOfflineAction(item);
          await this.removeFromOfflineQueue(item.id);
        } catch (error) {
          console.error(`Error processing offline action ${item.id}:`, error);
          
          // Increment retry count
          const newRetryCount = item.retryCount + 1;
          await this.updateQueueItemRetryCount(item.id, newRetryCount);

          // Remove item if it has been retried too many times
          if (newRetryCount >= 3) {
            console.warn(`Removing offline action ${item.id} after ${newRetryCount} failed attempts`);
            await this.removeFromOfflineQueue(item.id);
          }
        }
      }

      // Update last sync time
      await AsyncStorage.setItem(STORAGE_KEYS.LAST_SYNC, Date.now().toString());
      
    } catch (error) {
      console.error('Error syncing offline queue:', error);
    } finally {
      this.isSyncing = false;
      this.notifyListeners();
    }
  }

  // Process individual offline action
  private async processOfflineAction(item: OfflineQueueItem): Promise<void> {
    const { calendarAPI, tasksAPI } = await import('./api');

    switch (item.action.type) {
      case 'CREATE_EVENT':
        await calendarAPI.createEvent(item.action.data);
        break;
      case 'UPDATE_EVENT':
        await calendarAPI.updateEvent(item.action.id, item.action.data);
        break;
      case 'DELETE_EVENT':
        await calendarAPI.deleteEvent(item.action.id);
        break;
      case 'CREATE_TASK':
        await tasksAPI.createTask(item.action.data);
        break;
      case 'UPDATE_TASK':
        await tasksAPI.updateTask(item.action.id, item.action.data);
        break;
      case 'DELETE_TASK':
        await tasksAPI.deleteTask(item.action.id);
        break;
      case 'COMPLETE_TASK':
        await tasksAPI.updateTask(item.action.id, { status: 'completed' });
        break;
      default:
        throw new Error(`Unknown offline action type: ${(item.action as any).type}`);
    }
  }

  // Get current offline state
  async getOfflineState(): Promise<OfflineState> {
    const queue = await this.getOfflineQueue();
    const lastSyncStr = await AsyncStorage.getItem(STORAGE_KEYS.LAST_SYNC);
    const lastSyncTime = lastSyncStr ? parseInt(lastSyncStr) : null;

    return {
      isOnline: this.isOnline,
      isSyncing: this.isSyncing,
      pendingActions: queue.length,
      lastSyncTime,
    };
  }

  // Clear all cached data
  async clearCache(): Promise<void> {
    try {
      await Promise.all([
        AsyncStorage.removeItem(STORAGE_KEYS.EVENTS_CACHE),
        AsyncStorage.removeItem(STORAGE_KEYS.TASKS_CACHE),
        AsyncStorage.removeItem(STORAGE_KEYS.GOALS_CACHE),
        AsyncStorage.removeItem(STORAGE_KEYS.OFFLINE_QUEUE),
        AsyncStorage.removeItem(STORAGE_KEYS.LAST_SYNC),
      ]);
    } catch (error) {
      console.error('Error clearing cache:', error);
    }
  }

  // Check if we should use cached data
  shouldUseCache(): boolean {
    return !this.isOnline;
  }

  // Get network status
  getNetworkStatus(): boolean {
    return this.isOnline;
  }
}

// Export singleton instance
export const offlineService = new OfflineService(); 