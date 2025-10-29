import AsyncStorage from '@react-native-async-storage/async-storage';
import NetInfo from '@react-native-community/netinfo';

// Error types for better categorization
export enum ErrorType {
  NETWORK = 'NETWORK',
  AUTHENTICATION = 'AUTHENTICATION',
  AUTHORIZATION = 'AUTHORIZATION',
  VALIDATION = 'VALIDATION',
  SERVER = 'SERVER',
  TIMEOUT = 'TIMEOUT',
  OFFLINE = 'OFFLINE',
  UNKNOWN = 'UNKNOWN',
}

// Error categories for user-friendly messages
export enum ErrorCategory {
  CALENDAR = 'CALENDAR',
  TASKS = 'TASKS',
  GOALS = 'GOALS',
  AUTH = 'AUTH',
  SYNC = 'SYNC',
  GENERAL = 'GENERAL',
}

// Error severity levels
export enum ErrorSeverity {
  LOW = 'LOW',
  MEDIUM = 'MEDIUM',
  HIGH = 'HIGH',
  CRITICAL = 'CRITICAL',
}

// Error context for better debugging
export interface ErrorContext {
  operation: string;
  endpoint?: string;
  data?: any;
  userId?: string;
  timestamp: number;
  retryCount: number;
}

// User-friendly error message interface
export interface UserFriendlyError {
  readonly isUserFriendlyError: true;
  title: string;
  message: string;
  action?: string;
  retryable: boolean;
  severity: ErrorSeverity;
  category: ErrorCategory;
}

// Retry configuration
export interface RetryConfig {
  maxRetries: number;
  baseDelay: number;
  maxDelay: number;
  backoffMultiplier: number;
}

// Error tracking interface
export interface ErrorLog {
  id: string;
  type: ErrorType;
  category: ErrorCategory;
  severity: ErrorSeverity;
  message: string;
  context: ErrorContext;
  timestamp: number;
  resolved: boolean;
}

/**
 * ErrorHandlingService - Centralized error handling and classification
 * 
 * This service provides:
 * - Error classification and user-friendly messages
 * - Error logging and tracking
 * - Retry configuration and helper methods
 * 
 * IMPORTANT: This service does NOT automatically retry failed operations.
 * Callers are responsible for implementing retry logic using the provided
 * helper methods:
 * 
 * 1. Use `executeWithRetry()` for automatic retry with exponential backoff
 * 2. Use `shouldRetryOperation()` and `calculateRetryDelay()` for manual retry logic
 * 3. Check the `retryable` flag in UserFriendlyError to determine if retry is appropriate
 * 
 * Example usage:
 * ```typescript
 * // Automatic retry
 * const result = await errorHandlingService.executeWithRetry(
 *   () => apiCall(),
 *   ErrorCategory.TASKS,
 *   { operation: 'fetchTasks', timestamp: Date.now(), retryCount: 0 }
 * );
 * 
 * // Manual retry
 * let retryCount = 0;
 * while (retryCount < maxRetries) {
 *   try {
 *     return await apiCall();
 *   } catch (error) {
 *     const userError = await errorHandlingService.handleError(error, category, context);
 *     if (!userError.retryable || !errorHandlingService.shouldRetryOperation(errorType, retryCount, category)) {
 *       throw error;
 *     }
 *     await new Promise(resolve => setTimeout(resolve, errorHandlingService.calculateRetryDelay(retryCount, category)));
 *     retryCount++;
 *   }
 * }
 * ```
 */
class ErrorHandlingService {
  private errorLogs: ErrorLog[] = [];
  private retryConfigs: Map<ErrorCategory, RetryConfig> = new Map();
  private listeners: Set<(error: UserFriendlyError) => void> = new Set();
  private ready: Promise<void>;

  constructor() {
    this.initializeRetryConfigs();
    this.ready = this.loadErrorLogs();
  }

  // Initialize the service asynchronously
  async init(): Promise<void> {
    await this.ready;
  }

  // Initialize retry configurations for different error categories
  private initializeRetryConfigs() {
    this.retryConfigs.set(ErrorCategory.CALENDAR, {
      maxRetries: 3,
      baseDelay: 1000,
      maxDelay: 10000,
      backoffMultiplier: 2,
    });

    this.retryConfigs.set(ErrorCategory.TASKS, {
      maxRetries: 3,
      baseDelay: 1000,
      maxDelay: 10000,
      backoffMultiplier: 2,
    });

    this.retryConfigs.set(ErrorCategory.GOALS, {
      maxRetries: 2,
      baseDelay: 2000,
      maxDelay: 8000,
      backoffMultiplier: 2,
    });

    this.retryConfigs.set(ErrorCategory.SYNC, {
      maxRetries: 5,
      baseDelay: 2000,
      maxDelay: 30000,
      backoffMultiplier: 1.5,
    });

    this.retryConfigs.set(ErrorCategory.AUTH, {
      maxRetries: 1,
      baseDelay: 1000,
      maxDelay: 2000,
      backoffMultiplier: 1,
    });
  }

  // Improved error classification with better network detection
  private async classifyError(status: number, message: string): Promise<ErrorType> {
    // First, check actual network connectivity
    const isNetworkConnected = await this.getNetworkStatus();
    
    // If we have network connectivity but still getting connection errors,
    // it's likely a server issue, not a network issue
    if (isNetworkConnected) {
      if (status === 0) {
        // Status 0 with network connectivity usually means server unreachable
        return ErrorType.SERVER;
      }
      if (message.includes('Network request failed')) {
        // Network request failed with connectivity usually means server issue
        return ErrorType.SERVER;
      }
      if (message.includes('timeout') || message.includes('ETIMEDOUT')) {
        return ErrorType.TIMEOUT;
      }
    } else {
      // No network connectivity - this is a genuine network error
      if (status === 0 || message.includes('Network request failed')) {
        return ErrorType.NETWORK;
      }
    }
    
    // Standard HTTP status code classification
    if (status === 401) {
      return ErrorType.AUTHENTICATION;
    }
    if (status === 403) {
      return ErrorType.AUTHORIZATION;
    }
    if (status === 400) {
      return ErrorType.VALIDATION;
    }
    if (status >= 500) {
      return ErrorType.SERVER;
    }
    if (status === 408 || message.includes('timeout')) {
      return ErrorType.TIMEOUT;
    }
    
    return ErrorType.UNKNOWN;
  }

  // Determine error severity based on type and context
  private determineSeverity(type: ErrorType, category: ErrorCategory): ErrorSeverity {
    if (type === ErrorType.AUTHENTICATION) {
      return ErrorSeverity.CRITICAL;
    }
    if (type === ErrorType.NETWORK && category === ErrorCategory.SYNC) {
      return ErrorSeverity.HIGH;
    }
    if (type === ErrorType.SERVER) {
      return ErrorSeverity.MEDIUM;
    }
    if (type === ErrorType.VALIDATION) {
      return ErrorSeverity.LOW;
    }
    return ErrorSeverity.MEDIUM;
  }

  // Generate user-friendly error messages
  private generateUserFriendlyError(
    type: ErrorType,
    category: ErrorCategory,
    _context: ErrorContext
  ): UserFriendlyError {
    const baseMessages = {
      [ErrorCategory.CALENDAR]: {
        [ErrorType.NETWORK]: {
          title: 'Calendar Unavailable',
          message: 'Unable to load your calendar. Please check your internet connection and try again.',
          action: 'Retry',
          retryable: true,
        },
        [ErrorType.AUTHENTICATION]: {
          title: 'Authentication Required',
          message: 'Please sign in again to access your calendar.',
          action: 'Sign In',
          retryable: false,
        },
        [ErrorType.AUTHORIZATION]: {
          title: 'Access Denied',
          message: 'You do not have permission to access this calendar.',
          action: 'Contact Support',
          retryable: false,
        },
        [ErrorType.SERVER]: {
          title: 'Calendar Service Unavailable',
          message: 'Our calendar service is temporarily unavailable. Please try again in a few minutes.',
          action: 'Retry',
          retryable: true,
        },
        [ErrorType.VALIDATION]: {
          title: 'Invalid Calendar Data',
          message: 'The calendar information provided is invalid. Please check your input and try again.',
          action: 'Fix',
          retryable: false,
        },
        [ErrorType.TIMEOUT]: {
          title: 'Calendar Loading Timeout',
          message: 'Loading your calendar is taking longer than expected. Please try again.',
          action: 'Retry',
          retryable: true,
        },
        [ErrorType.OFFLINE]: {
          title: 'Calendar Offline',
          message: 'You are currently offline. Calendar data will sync when connection is restored.',
          action: 'Go Online',
          retryable: true,
        },
        [ErrorType.UNKNOWN]: {
          title: 'Calendar Error',
          message: 'An unexpected error occurred while loading your calendar.',
          action: 'Retry',
          retryable: true,
        },
      },
      [ErrorCategory.TASKS]: {
        [ErrorType.NETWORK]: {
          title: 'Tasks Unavailable',
          message: 'Unable to load your tasks. Please check your internet connection and try again.',
          action: 'Retry',
          retryable: true,
        },
        [ErrorType.AUTHENTICATION]: {
          title: 'Authentication Required',
          message: 'Please sign in again to access your tasks.',
          action: 'Sign In',
          retryable: false,
        },
        [ErrorType.AUTHORIZATION]: {
          title: 'Access Denied',
          message: 'You do not have permission to access these tasks.',
          action: 'Contact Support',
          retryable: false,
        },
        [ErrorType.SERVER]: {
          title: 'Task Service Unavailable',
          message: 'Our task service is temporarily unavailable. Please try again in a few minutes.',
          action: 'Retry',
          retryable: true,
        },
        [ErrorType.VALIDATION]: {
          title: 'Invalid Task Data',
          message: 'The task information provided is invalid. Please check your input and try again.',
          action: 'Fix',
          retryable: false,
        },
        [ErrorType.TIMEOUT]: {
          title: 'Task Loading Timeout',
          message: 'Loading your tasks is taking longer than expected. Please try again.',
          action: 'Retry',
          retryable: true,
        },
        [ErrorType.OFFLINE]: {
          title: 'Tasks Offline',
          message: 'You are currently offline. Task data will sync when connection is restored.',
          action: 'Go Online',
          retryable: true,
        },
        [ErrorType.UNKNOWN]: {
          title: 'Task Error',
          message: 'An unexpected error occurred while loading your tasks.',
          action: 'Retry',
          retryable: true,
        },
      },
      [ErrorCategory.GOALS]: {
        [ErrorType.NETWORK]: {
          title: 'Goals Unavailable',
          message: 'Unable to load your goals. Please check your internet connection and try again.',
          action: 'Retry',
          retryable: true,
        },
        [ErrorType.AUTHENTICATION]: {
          title: 'Authentication Required',
          message: 'Please sign in again to access your goals.',
          action: 'Sign In',
          retryable: false,
        },
        [ErrorType.AUTHORIZATION]: {
          title: 'Access Denied',
          message: 'You do not have permission to access these goals.',
          action: 'Contact Support',
          retryable: false,
        },
        [ErrorType.SERVER]: {
          title: 'Goal Service Unavailable',
          message: 'Our goal service is temporarily unavailable. Please try again in a few minutes.',
          action: 'Retry',
          retryable: true,
        },
        [ErrorType.VALIDATION]: {
          title: 'Invalid Goal Data',
          message: 'The goal information provided is invalid. Please check your input and try again.',
          action: 'Fix',
          retryable: false,
        },
        [ErrorType.TIMEOUT]: {
          title: 'Goal Loading Timeout',
          message: 'Loading your goals is taking longer than expected. Please try again.',
          action: 'Retry',
          retryable: true,
        },
        [ErrorType.OFFLINE]: {
          title: 'Goals Offline',
          message: 'You are currently offline. Goal data will sync when connection is restored.',
          action: 'Go Online',
          retryable: true,
        },
        [ErrorType.UNKNOWN]: {
          title: 'Goal Error',
          message: 'An unexpected error occurred while loading your goals.',
          action: 'Retry',
          retryable: true,
        },
      },
      [ErrorCategory.AUTH]: {
        [ErrorType.NETWORK]: {
          title: 'Authentication Failed',
          message: 'Unable to connect to authentication service. Please check your internet connection.',
          action: 'Retry',
          retryable: true,
        },
        [ErrorType.AUTHENTICATION]: {
          title: 'Authentication Required',
          message: 'Please sign in again to continue.',
          action: 'Sign In',
          retryable: false,
        },
        [ErrorType.AUTHORIZATION]: {
          title: 'Access Denied',
          message: 'You do not have permission to access this resource.',
          action: 'Contact Support',
          retryable: false,
        },
        [ErrorType.SERVER]: {
          title: 'Authentication Service Unavailable',
          message: 'Our authentication service is temporarily unavailable. Please try again later.',
          action: 'Retry',
          retryable: true,
        },
        [ErrorType.VALIDATION]: {
          title: 'Invalid Credentials',
          message: 'The provided credentials are invalid. Please check and try again.',
          action: 'Fix',
          retryable: false,
        },
        [ErrorType.TIMEOUT]: {
          title: 'Authentication Timeout',
          message: 'Authentication is taking longer than expected. Please try again.',
          action: 'Retry',
          retryable: true,
        },
        [ErrorType.OFFLINE]: {
          title: 'Authentication Offline',
          message: 'You are currently offline. Please connect to the internet to sign in.',
          action: 'Go Online',
          retryable: true,
        },
        [ErrorType.UNKNOWN]: {
          title: 'Authentication Error',
          message: 'An unexpected error occurred during authentication.',
          action: 'Retry',
          retryable: true,
        },
      },
      [ErrorCategory.SYNC]: {
        [ErrorType.NETWORK]: {
          title: 'Sync Failed',
          message: 'Unable to sync your data. Changes will be saved locally and synced when connection is restored.',
          action: 'Retry Later',
          retryable: true,
        },
        [ErrorType.AUTHENTICATION]: {
          title: 'Authentication Required',
          message: 'Please sign in again to sync your data.',
          action: 'Sign In',
          retryable: false,
        },
        [ErrorType.AUTHORIZATION]: {
          title: 'Sync Access Denied',
          message: 'You do not have permission to sync this data.',
          action: 'Contact Support',
          retryable: false,
        },
        [ErrorType.SERVER]: {
          title: 'Sync Service Unavailable',
          message: 'Our sync service is temporarily unavailable. Your changes are saved locally.',
          action: 'Retry Later',
          retryable: true,
        },
        [ErrorType.VALIDATION]: {
          title: 'Invalid Sync Data',
          message: 'The data to be synced is invalid. Please check and try again.',
          action: 'Fix',
          retryable: false,
        },
        [ErrorType.TIMEOUT]: {
          title: 'Sync Timeout',
          message: 'Syncing is taking longer than expected. Please try again.',
          action: 'Retry',
          retryable: true,
        },
        [ErrorType.OFFLINE]: {
          title: 'Sync Offline',
          message: 'You are currently offline. Data will sync when connection is restored.',
          action: 'Go Online',
          retryable: true,
        },
        [ErrorType.UNKNOWN]: {
          title: 'Sync Error',
          message: 'An unexpected error occurred during sync.',
          action: 'Retry',
          retryable: true,
        },
      },
      [ErrorCategory.GENERAL]: {
        [ErrorType.NETWORK]: {
          title: 'Connection Error',
          message: 'Unable to connect to the server. Please check your internet connection and try again.',
          action: 'Retry',
          retryable: true,
        },
        [ErrorType.AUTHENTICATION]: {
          title: 'Authentication Required',
          message: 'Please sign in again to continue.',
          action: 'Sign In',
          retryable: false,
        },
        [ErrorType.AUTHORIZATION]: {
          title: 'Access Denied',
          message: 'You do not have permission to access this resource.',
          action: 'Contact Support',
          retryable: false,
        },
        [ErrorType.SERVER]: {
          title: 'Service Unavailable',
          message: 'Our service is temporarily unavailable. Please try again in a few minutes.',
          action: 'Retry',
          retryable: true,
        },
        [ErrorType.VALIDATION]: {
          title: 'Invalid Data',
          message: 'The information provided is invalid. Please check your input and try again.',
          action: 'Fix',
          retryable: false,
        },
        [ErrorType.TIMEOUT]: {
          title: 'Request Timeout',
          message: 'The request is taking longer than expected. Please try again.',
          action: 'Retry',
          retryable: true,
        },
        [ErrorType.OFFLINE]: {
          title: 'Offline Mode',
          message: 'You are currently offline. Please connect to the internet to continue.',
          action: 'Go Online',
          retryable: true,
        },
        [ErrorType.UNKNOWN]: {
          title: 'Something went wrong',
          message: 'An unexpected error occurred. Please try again.',
          action: 'Retry',
          retryable: true,
        },
      },
    };

    const errorInfo = baseMessages[category]?.[type] || {
      title: 'Something went wrong',
      message: 'An unexpected error occurred. Please try again.',
      action: 'Retry',
      retryable: true,
    };

    return {
      isUserFriendlyError: true,
      ...errorInfo,
      severity: this.determineSeverity(type, category),
      category,
    };
  }

  // Calculate retry delay with exponential backoff
  private calculateRetryDelay(retryCount: number, category: ErrorCategory): number {
    const config = this.retryConfigs.get(category) || this.retryConfigs.get(ErrorCategory.GENERAL)!;
    const delay = config.baseDelay * Math.pow(config.backoffMultiplier, retryCount);
    return Math.min(delay, config.maxDelay);
  }

  // Check if operation should be retried (helper for callers)
  shouldRetryOperation(type: ErrorType, retryCount: number, category: ErrorCategory): boolean {
    if (type === ErrorType.AUTHENTICATION || type === ErrorType.AUTHORIZATION) {
      return false; // Don't retry auth errors
    }
    if (type === ErrorType.VALIDATION) {
      return false; // Don't retry validation errors
    }
    
    const config = this.retryConfigs.get(category) || this.retryConfigs.get(ErrorCategory.GENERAL)!;
    return retryCount < config.maxRetries;
  }

  async handleError(
    error: any,
    category: ErrorCategory,
    context: ErrorContext
  ): Promise<UserFriendlyError> {
    try {
      // Log detailed error information for debugging
      await this.logErrorDetails(error, category, context);
      
      // Extract error information
      const status = error.status || error.response?.status || 0;
      const message = error.message || error.toString();
      const type = await this.classifyError(status, message);

      // Create error log
      const errorLog: ErrorLog = {
        id: `error_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
        type,
        category,
        severity: this.determineSeverity(type, category),
        message,
        context,
        timestamp: Date.now(),
        resolved: false,
      };

      // Add to error logs
      this.errorLogs.push(errorLog);
      await this.saveErrorLogs();

      // Generate user-friendly error
      const userError = this.generateUserFriendlyError(type, category, context);

      // Notify listeners immediately
      this.notifyListeners(userError);

      return userError;
    } catch (handlerError) {
      console.error('Error in error handler:', handlerError);
      // Return a basic error to prevent cascading failures
      return {
        isUserFriendlyError: true,
        title: 'Something went wrong',
        message: 'An unexpected error occurred. Please try again.',
        action: 'Retry',
        retryable: true,
        severity: ErrorSeverity.MEDIUM,
        category: ErrorCategory.GENERAL,
      };
    }
  }

  // Subscribe to error events
  subscribe(listener: (error: UserFriendlyError) => void) {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  // Notify all listeners
  private notifyListeners(error: UserFriendlyError) {
    this.listeners.forEach(listener => listener(error));
  }

  // Get error logs
  async getErrorLogs(): Promise<ErrorLog[]> {
    await this.ready;
    return this.errorLogs.filter(log => !log.resolved);
  }

  // Mark error as resolved
  async resolveError(errorId: string): Promise<void> {
    await this.ready;
    const error = this.errorLogs.find(log => log.id === errorId);
    if (error) {
      error.resolved = true;
      await this.saveErrorLogs();
    }
  }

  // Clear resolved errors
  async clearResolvedErrors(): Promise<void> {
    await this.ready;
    this.errorLogs = this.errorLogs.filter(log => !log.resolved);
    await this.saveErrorLogs();
  }

  // Save error logs to storage
  private async saveErrorLogs(): Promise<void> {
    try {
      await AsyncStorage.setItem('error_logs', JSON.stringify(this.errorLogs));
    } catch (error) {
      console.error('Failed to save error logs:', error);
    }
  }

  // Load error logs from storage
  private async loadErrorLogs(): Promise<void> {
    try {
      const logs = await AsyncStorage.getItem('error_logs');
      if (logs) {
        this.errorLogs = JSON.parse(logs);
      }
    } catch (error) {
      console.error('Failed to load error logs:', error);
    }
  }

  // Get network status
  async getNetworkStatus(): Promise<boolean> {
    const netInfo = await NetInfo.fetch();
    return netInfo.isConnected ?? false;
  }

  // Check if error is network-related with improved accuracy
  async isNetworkError(error: any): Promise<boolean> {
    const status = error.status || error.response?.status || 0;
    const message = error.message || error.toString();
    
    // Check actual network connectivity
    const isNetworkConnected = await this.getNetworkStatus();
    
    // If we have network connectivity but still getting connection errors,
    // it's likely a server issue, not a network issue
    if (isNetworkConnected) {
      return false; // Not a network error if we have connectivity
    }
    
    // No network connectivity - this is a genuine network error
    return status === 0 || message.includes('Network request failed');
  }

  // Debug method to log detailed error information (only in development)
  private async logErrorDetails(error: any, category: ErrorCategory, context: ErrorContext): Promise<void> {
    if (__DEV__) {
      const status = error.status || error.response?.status || 0;
      const message = error.message || error.toString();
      const isNetworkConnected = await this.getNetworkStatus();
      
      console.warn('=== Error Debug Information ===');
      console.warn('Error Status:', status);
      console.warn('Error Message:', message);
      console.warn('Network Connected:', isNetworkConnected);
      console.warn('Error Category:', category);
      console.warn('Operation:', context.operation);
      console.warn('Endpoint:', context.endpoint);
      console.warn('Retry Count:', context.retryCount);
      console.warn('Timestamp:', new Date(context.timestamp).toISOString());
      console.warn('Full Error Object:', JSON.stringify(error, null, 2));
      console.warn('================================');
    }
  }

  // Get retry configuration for category
  getRetryConfig(category: ErrorCategory): RetryConfig {
    return this.retryConfigs.get(category) || this.retryConfigs.get(ErrorCategory.GENERAL)!;
  }

  // Helper method for callers to implement retry logic with exponential backoff
  async executeWithRetry<T>(
    operation: () => Promise<T>,
    category: ErrorCategory,
    context: ErrorContext
  ): Promise<T> {
    let lastError: any;
    
    for (let attempt = 0; attempt < this.getRetryConfig(category).maxRetries; attempt++) {
      try {
        return await operation();
      } catch (error) {
        lastError = error;
        
        // Handle the error to get classification and user-friendly message
        const userError = await this.handleError(error, category, {
          ...context,
          retryCount: attempt,
        });
        
        // Classify the error to get the type for retry decision
        const status = (error as any).status || (error as any).response?.status || 0;
        const message = (error as any).message || String(error);
        const errorType = await this.classifyError(status, message);
        
        // Check if we should retry
        if (!userError.retryable || !this.shouldRetryOperation(errorType, attempt, category)) {
          throw error; // Don't retry, throw the original error
        }
        
        // Calculate delay and wait before retrying
        const delay = this.calculateRetryDelay(attempt, category);
        await new Promise<void>(resolve => setTimeout(() => resolve(), delay));
      }
    }
    
    throw lastError; // This should never be reached, but TypeScript requires it
  }
}

// Export singleton instance
export const errorHandlingService = new ErrorHandlingService();

// Export initialization function for callers to await
export const initializeErrorHandling = async (): Promise<void> => {
  await errorHandlingService.init();
}; 