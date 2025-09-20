/**
 * Error Sanitization Utility
 * 
 * Provides secure error handling to prevent information disclosure
 * in production environments while maintaining useful debugging
 * information in development.
 */

interface SanitizedError {
  message: string;
  code?: string;
  timestamp: string;
  requestId?: string;
}

/**
 * Sanitizes error messages to prevent information disclosure
 * @param error - The original error object
 * @param requestId - Optional request ID for tracking
 * @returns Sanitized error object
 */
export function sanitizeError(error: any, requestId?: string): SanitizedError {
  const isProduction = process.env.NODE_ENV === 'production';
  const timestamp = new Date().toISOString();

  // In production, return generic error messages
  if (isProduction) {
    return {
      message: 'An error occurred. Please try again.',
      timestamp,
      requestId
    };
  }

  // In development, provide more detailed information
  const sanitized: SanitizedError = {
    message: error?.message || 'Unknown error occurred',
    timestamp,
    requestId
  };

  // Add error code if available and safe
  if (error?.code && typeof error.code === 'string') {
    sanitized.code = error.code;
  }

  return sanitized;
}

/**
 * Sanitizes API error responses
 * @param response - The API response object
 * @param requestId - Optional request ID for tracking
 * @returns Sanitized error response
 */
export function sanitizeApiError(response: any, requestId?: string): SanitizedError {
  const isProduction = process.env.NODE_ENV === 'production';
  const timestamp = new Date().toISOString();

  if (isProduction) {
    // In production, only expose safe error information
    const statusCode = response?.status || response?.statusCode;
    
    if (statusCode >= 400 && statusCode < 500) {
      return {
        message: 'Invalid request. Please check your input and try again.',
        code: 'CLIENT_ERROR',
        timestamp,
        requestId
      };
    } else if (statusCode >= 500) {
      return {
        message: 'Server error. Please try again later.',
        code: 'SERVER_ERROR',
        timestamp,
        requestId
      };
    } else {
      return {
        message: 'An error occurred. Please try again.',
        timestamp,
        requestId
      };
    }
  }

  // In development, provide more detailed information
  return {
    message: response?.data?.error || response?.message || 'API request failed',
    code: response?.data?.code || response?.status?.toString(),
    timestamp,
    requestId
  };
}

/**
 * Logs errors securely without exposing sensitive information
 * @param error - The error to log
 * @param context - Additional context information
 * @param requestId - Optional request ID for tracking
 */
export function logErrorSecurely(error: any, context?: string, requestId?: string): void {
  const sanitized = sanitizeError(error, requestId);
  
  // Use proper logging service instead of console.error
  if (process.env.NODE_ENV === 'development') {
    console.error('Error occurred:', {
      ...sanitized,
      context: context || 'Unknown',
      stack: error?.stack
    });
  }
  // In production, this would integrate with a proper logging service
}

/**
 * Creates a safe error message for user display
 * @param error - The original error
 * @returns Safe error message for users
 */
export function getUserFriendlyErrorMessage(error: any): string {
  const isProduction = process.env.NODE_ENV === 'production';
  
  if (isProduction) {
    // In production, return generic user-friendly messages
    if (error?.code === 'NETWORK_ERROR' || error?.message?.includes('network')) {
      return 'Network error. Please check your connection and try again.';
    }
    
    if (error?.code === 'AUTH_REQUIRED' || error?.message?.includes('auth')) {
      return 'Please log in to continue.';
    }
    
    if (error?.code === 'VALIDATION_ERROR' || error?.message?.includes('validation')) {
      return 'Please check your input and try again.';
    }
    
    return 'Something went wrong. Please try again.';
  }
  
  // In development, provide more specific messages
  return error?.message || 'An error occurred';
}

/**
 * Validates and sanitizes user input
 * @param input - The input to validate
 * @param type - The expected type of input
 * @returns Sanitized input or throws error
 */
export function sanitizeUserInput(input: any, type: 'string' | 'email' | 'number' | 'boolean'): any {
  if (input === null || input === undefined) {
    throw new Error('Input is required');
  }

  switch (type) {
    case 'string':
      if (typeof input !== 'string') {
        throw new Error('Input must be a string');
      }
      // Remove potentially dangerous characters
      return input.trim().replace(/[<>\"'&]/g, '');
      
    case 'email':
      if (typeof input !== 'string') {
        throw new Error('Email must be a string');
      }
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!emailRegex.test(input)) {
        throw new Error('Invalid email format');
      }
      return input.toLowerCase().trim();
      
    case 'number':
      const num = Number(input);
      if (isNaN(num)) {
        throw new Error('Input must be a valid number');
      }
      return num;
      
    case 'boolean':
      if (typeof input !== 'boolean') {
        throw new Error('Input must be a boolean');
      }
      return input;
      
    default:
      throw new Error('Invalid input type');
  }
}

