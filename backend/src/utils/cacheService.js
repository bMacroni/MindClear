/**
 * In-Memory Cache Service for MindGarden Backend
 * 
 * Provides caching for frequently accessed data to reduce database load
 * and improve API response times.
 */

class CacheService {
  constructor() {
    this.cache = new Map();
    this.ttl = new Map(); // Time-to-live tracking
    this.defaultTTL = 5 * 60 * 1000; // 5 minutes default
    this.maxSize = 1000; // Maximum cache entries
    this.cleanupInterval = 60 * 1000; // 1 minute cleanup interval
    
    // Start cleanup interval
    this.startCleanup();
  }

  /**
   * Set a value in the cache with optional TTL
   * @param {string} key - Cache key
   * @param {any} value - Value to cache
   * @param {number} ttl - Time to live in milliseconds (optional)
   */
  set(key, value, ttl = this.defaultTTL) {
    // Remove oldest entries if cache is full
    if (this.cache.size >= this.maxSize) {
      this.evictOldest();
    }

    this.cache.set(key, value);
    this.ttl.set(key, Date.now() + ttl);
  }

  /**
   * Get a value from the cache
   * @param {string} key - Cache key
   * @returns {any|null} - Cached value or null if not found/expired
   */
  get(key) {
    const expiry = this.ttl.get(key);
    
    if (!expiry || Date.now() > expiry) {
      this.delete(key);
      return null;
    }

    return this.cache.get(key);
  }

  /**
   * Delete a value from the cache
   * @param {string} key - Cache key
   */
  delete(key) {
    this.cache.delete(key);
    this.ttl.delete(key);
  }

  /**
   * Check if a key exists and is not expired
   * @param {string} key - Cache key
   * @returns {boolean}
   */
  has(key) {
    const expiry = this.ttl.get(key);
    return expiry && Date.now() <= expiry;
  }

  /**
   * Clear all cache entries
   */
  clear() {
    this.cache.clear();
    this.ttl.clear();
  }

  /**
   * Get cache statistics
   * @returns {object} - Cache stats
   */
  getStats() {
    return {
      size: this.cache.size,
      maxSize: this.maxSize,
      hitRate: this.hits / (this.hits + this.misses) || 0,
      hits: this.hits,
      misses: this.misses
    };
  }

  /**
   * Evict the oldest cache entry
   */
  evictOldest() {
    let oldestKey = null;
    let oldestTime = Infinity;

    for (const [key, expiry] of this.ttl.entries()) {
      if (expiry < oldestTime) {
        oldestTime = expiry;
        oldestKey = key;
      }
    }

    if (oldestKey) {
      this.delete(oldestKey);
    }
  }

  /**
   * Start periodic cleanup of expired entries
   */
  startCleanup() {
    setInterval(() => {
      const now = Date.now();
      for (const [key, expiry] of this.ttl.entries()) {
        if (now > expiry) {
          this.delete(key);
        }
      }
    }, this.cleanupInterval);
  }

  /**
   * Generate cache key for user-specific data
   * @param {string} userId - User ID
   * @param {string} dataType - Type of data (tasks, goals, etc.)
   * @param {object} params - Additional parameters
   * @returns {string} - Cache key
   */
  generateUserKey(userId, dataType, params = {}) {
    const paramString = Object.keys(params)
      .sort()
      .map(key => `${key}:${params[key]}`)
      .join('|');
    
    return `user:${userId}:${dataType}${paramString ? `:${paramString}` : ''}`;
  }

  /**
   * Cache user tasks with smart invalidation
   * @param {string} userId - User ID
   * @param {array} tasks - Tasks to cache
   * @param {object} filters - Applied filters
   */
  cacheUserTasks(userId, tasks, filters = {}) {
    const key = this.generateUserKey(userId, 'tasks', filters);
    this.set(key, tasks, 2 * 60 * 1000); // 2 minutes TTL for tasks
    
    // Also cache individual task lookups
    tasks.forEach(task => {
      const taskKey = this.generateUserKey(userId, 'task', { id: task.id });
      this.set(taskKey, task, 5 * 60 * 1000); // 5 minutes TTL for individual tasks
    });
  }

  /**
   * Cache user goals with smart invalidation
   * @param {string} userId - User ID
   * @param {array} goals - Goals to cache
   * @param {object} filters - Applied filters
   */
  cacheUserGoals(userId, goals, filters = {}) {
    const key = this.generateUserKey(userId, 'goals', filters);
    this.set(key, goals, 5 * 60 * 1000); // 5 minutes TTL for goals
    
    // Also cache individual goal lookups
    goals.forEach(goal => {
      const goalKey = this.generateUserKey(userId, 'goal', { id: goal.id });
      this.set(goalKey, goal, 10 * 60 * 1000); // 10 minutes TTL for individual goals
    });
  }

  /**
   * Invalidate user-specific cache entries
   * @param {string} userId - User ID
   * @param {string} dataType - Type of data to invalidate (optional)
   */
  invalidateUserCache(userId, dataType = null) {
    const prefix = `user:${userId}:${dataType || ''}`;
    
    for (const key of this.cache.keys()) {
      if (key.startsWith(prefix)) {
        this.delete(key);
      }
    }
  }

  /**
   * Cache API response with error handling
   * @param {string} key - Cache key
   * @param {function} fetchFn - Function to fetch data if not cached
   * @param {number} ttl - Time to live in milliseconds
   * @returns {Promise<any>} - Cached or fresh data
   */
  async getOrSet(key, fetchFn, ttl = this.defaultTTL) {
    const cached = this.get(key);
    if (cached !== null) {
      this.hits = (this.hits || 0) + 1;
      return cached;
    }

    this.misses = (this.misses || 0) + 1;
    
    try {
      const data = await fetchFn();
      this.set(key, data, ttl);
      return data;
    } catch (error) {
      // Don't cache errors
      throw error;
    }
  }
}

// Create singleton instance
const cacheService = new CacheService();

export default cacheService;
