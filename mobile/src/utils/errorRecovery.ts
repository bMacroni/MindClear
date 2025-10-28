import { errorHandlingService, ErrorCategory, ErrorType, UserFriendlyError } from '../services/errorHandling';

// Circuit breaker states
export enum CircuitBreakerState {
  CLOSED = 'CLOSED',    // Normal operation
  OPEN = 'OPEN',        // Failing, reject requests
  HALF_OPEN = 'HALF_OPEN', // Testing if service is back
}

// Circuit breaker configuration
export interface CircuitBreakerConfig {
  failureThreshold: number;    // Number of failures before opening
  recoveryTimeout: number;     // Time to wait before trying again (ms)
  expectedErrors: ErrorType[]; // Error types that count as failures
}

// Retry strategy configuration
export interface RetryStrategy {
  maxRetries: number;
  baseDelay: number;
  maxDelay: number;
  backoffMultiplier: number;
  jitter: boolean; // Add random jitter to prevent thundering herd
}

// Error recovery context
export interface ErrorRecoveryContext {
  operation: string;
  endpoint: string;
  timestamp: number;
  retryCount: number;
  lastError?: any;
  circuitBreakerState: CircuitBreakerState;
  failureCount: number;
}

class ErrorRecoveryService {
  private circuitBreakers: Map<string, CircuitBreakerState> = new Map();
  private failureCounts: Map<string, number> = new Map();
  private lastFailureTimes: Map<string, number> = new Map();
  
  // Default configurations
  private defaultCircuitBreakerConfig: CircuitBreakerConfig = {
    failureThreshold: 5,
    recoveryTimeout: 30000, // 30 seconds
    expectedErrors: [ErrorType.NETWORK, ErrorType.SERVER, ErrorType.TIMEOUT],
  };

  private defaultRetryStrategy: RetryStrategy = {
    maxRetries: 3,
    baseDelay: 1000,
    maxDelay: 10000,
    backoffMultiplier: 2,
    jitter: true,
  };

  // Get circuit breaker key for an endpoint
  private getCircuitBreakerKey(endpoint: string): string {
    return `circuit_breaker_${endpoint}`;
  }

  // Get current circuit breaker state
  private getCircuitBreakerState(endpoint: string): CircuitBreakerState {
    return this.circuitBreakers.get(endpoint) || CircuitBreakerState.CLOSED;
  }

  // Update circuit breaker state
  private updateCircuitBreakerState(endpoint: string, state: CircuitBreakerState): void {
    this.circuitBreakers.set(endpoint, state);
  }

  // Record a failure
  private recordFailure(endpoint: string): void {
    const currentCount = this.failureCounts.get(endpoint) || 0;
    const newCount = currentCount + 1;
    this.failureCounts.set(endpoint, newCount);
    this.lastFailureTimes.set(endpoint, Date.now());

    const config = this.defaultCircuitBreakerConfig;
    if (newCount >= config.failureThreshold) {
      this.updateCircuitBreakerState(endpoint, CircuitBreakerState.OPEN);
      console.warn(`Circuit breaker opened for ${endpoint} after ${newCount} failures`);
    }
  }

  // Record a success
  private recordSuccess(endpoint: string): void {
    this.failureCounts.set(endpoint, 0);
    this.updateCircuitBreakerState(endpoint, CircuitBreakerState.CLOSED);
  }

  // Check if circuit breaker should transition to half-open
  private shouldTransitionToHalfOpen(endpoint: string): boolean {
    const state = this.getCircuitBreakerState(endpoint);
    if (state !== CircuitBreakerState.OPEN) {return false;}

    const lastFailureTime = this.lastFailureTimes.get(endpoint) || 0;
    const timeSinceLastFailure = Date.now() - lastFailureTime;
    
    return timeSinceLastFailure >= this.defaultCircuitBreakerConfig.recoveryTimeout;
  }

  // Calculate retry delay with exponential backoff and optional jitter
  private calculateRetryDelay(retryCount: number, strategy: RetryStrategy): number {
    let delay = strategy.baseDelay * Math.pow(strategy.backoffMultiplier, retryCount);
    delay = Math.min(delay, strategy.maxDelay);

    if (strategy.jitter) {
      // Add random jitter (±25% of the delay)
      const jitter = delay * 0.25 * (Math.random() - 0.5);
      delay += jitter;
    }

    return Math.max(delay, 100); // Minimum 100ms delay
  }

  // Execute operation with circuit breaker and retry logic
  async executeWithRecovery<T>(
    operation: () => Promise<T>,
    endpoint: string,
    category: ErrorCategory,
    context: Partial<ErrorRecoveryContext> = {}
  ): Promise<T> {
    const circuitBreakerKey = this.getCircuitBreakerKey(endpoint);
    const circuitState = this.getCircuitBreakerState(circuitBreakerKey);

    // Check circuit breaker state
    if (circuitState === CircuitBreakerState.OPEN) {
      if (this.shouldTransitionToHalfOpen(circuitBreakerKey)) {
        this.updateCircuitBreakerState(circuitBreakerKey, CircuitBreakerState.HALF_OPEN);
        console.warn(`Circuit breaker transitioning to half-open for ${endpoint}`);
      } else {
        throw new Error(`Circuit breaker is open for ${endpoint}. Service is temporarily unavailable.`);
      }
    }

    const retryStrategy = this.getRetryStrategyForCategory(category);
    let lastError: any;

    for (let attempt = 0; attempt <= retryStrategy.maxRetries; attempt++) {
      try {
        const result = await operation();
        
        // Success - reset circuit breaker
        if (circuitState === CircuitBreakerState.HALF_OPEN) {
          this.updateCircuitBreakerState(circuitBreakerKey, CircuitBreakerState.CLOSED);
        }
        this.recordSuccess(circuitBreakerKey);
        
        return result;
      } catch (error) {
        lastError = error;
        
        // Check if this is the last attempt
        if (attempt === retryStrategy.maxRetries) {
          this.recordFailure(circuitBreakerKey);
          break;
        }

        // Check if error is retryable
        if (!this.isRetryableError(error, category)) {
          break;
        }

        // Wait before retry
        const delay = this.calculateRetryDelay(attempt, retryStrategy);
        console.warn(`Retrying operation in ${delay}ms (attempt ${attempt + 1}/${retryStrategy.maxRetries + 1})`);
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }

    // All retries failed - handle the error
    return this.handleFinalError(lastError, category, {
      operation: context.operation || 'unknown',
      endpoint,
      timestamp: Date.now(),
      retryCount: retryStrategy.maxRetries,
      lastError,
      circuitBreakerState: this.getCircuitBreakerState(circuitBreakerKey),
      failureCount: this.failureCounts.get(circuitBreakerKey) || 0,
    });
  }

  // Check if error is retryable
  private isRetryableError(error: any, _category: ErrorCategory): boolean {
    // Don't retry authentication errors
    if (error && typeof error === 'object' && 'isUserFriendlyError' in error) {
      const userError = error as UserFriendlyError;
      return userError.retryable;
    }

    // Check error type
    const errorType = this.classifyError(error);
    const nonRetryableTypes = [ErrorType.AUTHENTICATION, ErrorType.AUTHORIZATION, ErrorType.VALIDATION];
    
    return !nonRetryableTypes.includes(errorType);
  }

  // Classify error type
  private classifyError(error: any): ErrorType {
    if (!error) {return ErrorType.UNKNOWN;}

    const message = error.message || error.toString();
    const status = error.status || error.response?.status || 0;

    if (status === 0 || message.includes('Network request failed')) {
      return ErrorType.NETWORK;
    }
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

  // Get retry strategy for category
  private getRetryStrategyForCategory(category: ErrorCategory): RetryStrategy {
    const strategies: Record<ErrorCategory, RetryStrategy> = {
      [ErrorCategory.CALENDAR]: {
        maxRetries: 3,
        baseDelay: 1000,
        maxDelay: 10000,
        backoffMultiplier: 2,
        jitter: true,
      },
      [ErrorCategory.TASKS]: {
        maxRetries: 3,
        baseDelay: 1000,
        maxDelay: 10000,
        backoffMultiplier: 2,
        jitter: true,
      },
      [ErrorCategory.GOALS]: {
        maxRetries: 2,
        baseDelay: 2000,
        maxDelay: 8000,
        backoffMultiplier: 2,
        jitter: true,
      },
      [ErrorCategory.SYNC]: {
        maxRetries: 5,
        baseDelay: 2000,
        maxDelay: 30000,
        backoffMultiplier: 1.5,
        jitter: true,
      },
      [ErrorCategory.AUTH]: {
        maxRetries: 1,
        baseDelay: 1000,
        maxDelay: 2000,
        backoffMultiplier: 1,
        jitter: false,
      },
      [ErrorCategory.GENERAL]: this.defaultRetryStrategy,
    };

    return strategies[category] || this.defaultRetryStrategy;
  }

  // Handle final error after all retries
  private async handleFinalError(
    error: any,
    category: ErrorCategory,
    context: ErrorRecoveryContext
  ): Promise<never> {
    // Use the error handling service to generate user-friendly error
    const userError = await errorHandlingService.handleError(error, category, {
      operation: context.operation,
      endpoint: context.endpoint,
      timestamp: context.timestamp,
      retryCount: context.retryCount,
    });

    throw userError;
  }

  // Get circuit breaker status for monitoring
  getCircuitBreakerStatus(endpoint: string): {
    state: CircuitBreakerState;
    failureCount: number;
    lastFailureTime: number | null;
  } {
    const key = this.getCircuitBreakerKey(endpoint);
    return {
      state: this.getCircuitBreakerState(key),
      failureCount: this.failureCounts.get(key) || 0,
      lastFailureTime: this.lastFailureTimes.get(key) || null,
    };
  }

  // Reset circuit breaker for an endpoint
  resetCircuitBreaker(endpoint: string): void {
    const key = this.getCircuitBreakerKey(endpoint);
    this.updateCircuitBreakerState(key, CircuitBreakerState.CLOSED);
    this.failureCounts.set(key, 0);
    this.lastFailureTimes.delete(key);
  }

  // Get all circuit breaker statuses
  getAllCircuitBreakerStatuses(): Record<string, {
    state: CircuitBreakerState;
    failureCount: number;
    lastFailureTime: number | null;
  }> {
    const statuses: Record<string, any> = {};
    const endpoints = new Set<string>();

    // Collect all endpoints
    this.circuitBreakers.forEach((_, key) => {
      const endpoint = key.replace('circuit_breaker_', '');
      endpoints.add(endpoint);
    });

    endpoints.forEach(endpoint => {
      statuses[endpoint] = this.getCircuitBreakerStatus(endpoint);
    });

    return statuses;
  }

  // Clear all circuit breakers (useful for testing)
  clearAllCircuitBreakers(): void {
    this.circuitBreakers.clear();
    this.failureCounts.clear();
    this.lastFailureTimes.clear();
  }
}

// Export singleton instance
export const errorRecoveryService = new ErrorRecoveryService();

// Export types for use in other files
// Types are already exported via interfaces above