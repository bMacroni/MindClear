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

export interface ApiError {
  error: string;
  code?: string;
  details?: any;
}

export interface ApiResponse<T = any> {
  ok: boolean;
  status: number;
  data: T | ApiError | null;
}

export async function apiFetch<T = any>(
  path: string, 
  init: RequestInit = {}, 
  timeoutMs = 15000
): Promise<ApiResponse<T>> {
  const controller = new AbortController();
  const id = setTimeout(() => controller.abort(), timeoutMs);
  const startTime = Date.now();
  
  try {
    // Build headers: start with init.headers, then add our headers
    const headers: Record<string, string> = {
      'Accept': 'application/json',
    };
    
    // Merge existing headers from init.headers
    if (init.headers) {
      if (init.headers instanceof Headers) {
        // Convert Headers object to plain object
        init.headers.forEach((value, key) => {
          headers[key] = value;
        });
      } else {
        // Merge plain object headers
        Object.assign(headers, init.headers);
      }
    }
    
    // Check if Authorization is explicitly set to empty string (for public endpoints)
    const shouldSkipAuth = headers['Authorization'] === '';
    
    // Get auth token if available and not explicitly skipped
    let token: string | null = null;
    if (!shouldSkipAuth) {
      token = await authService.getAuthToken();
    }
    
    // Add Authorization header if token is available and not explicitly skipped
    if (token && !shouldSkipAuth) {
      headers['Authorization'] = `Bearer ${token}`;
    } else if (shouldSkipAuth) {
      // Remove the empty Authorization header for public endpoints
      delete headers['Authorization'];
    }
    
    // Add Content-Type only for non-GET requests or when body is present
    const method = init.method?.toUpperCase() || 'GET';
    const hasBody = init.body !== undefined && init.body !== null;
    if (method !== 'GET' || hasBody) {
      headers['Content-Type'] = 'application/json';
    }
    
    let res = await fetch(`${getSecureApiBaseUrl()}${path}`, {
      ...init,
      signal: controller.signal,
      headers,
    });
    
    // Handle 401 Unauthorized - attempt token refresh and retry (only once per request)
    // Skip retry for public endpoints (where auth was explicitly skipped)
    if (res.status === 401 && token && !shouldSkipAuth && !(init as any).retryAttempted) {
      logger.info('Received 401, attempting token refresh...');
      try {
        // Use single-flight refresh to avoid concurrent refresh races
        const refreshResult = await authService.refreshToken();
        if (refreshResult.success) {
          logger.info('Token refresh successful, retrying request...');
          // Get the new token and retry the request
          const newToken = await authService.getAuthToken();
          if (newToken) {
            headers['Authorization'] = `Bearer ${newToken}`;
            
            // Create a new abort controller for retry with remaining time
            const retryController = new AbortController();
            const remainingTime = Math.max(1000, timeoutMs - (Date.now() - startTime));
            const retryId = setTimeout(() => retryController.abort(), remainingTime);

            // Mark this request as having attempted a retry to prevent infinite loops
            const retryInit = { ...init, retryAttempted: true };

            // Retry the original request with new token
            try {
              res = await fetch(`${getSecureApiBaseUrl()}${path}`, {
                ...retryInit,
                signal: retryController.signal,
                headers,
              });
            } finally {
              clearTimeout(retryId);
            }
          } else {
            logger.warn('Token refresh succeeded but new token not available. User may need to sign in again.');
          }
        } else {
          const errorType = refreshResult.error || 'unknown';
          if (errorType === 'auth') {
            logger.warn('Token refresh failed due to authentication error. User may need to sign in again.');
          } else {
            logger.warn(`Token refresh failed (${errorType}). User may need to sign in again if this persists.`);
          }
        }
      } catch (error) {
        logger.error('Token refresh error during API call:', error);
        // Treat refresh as failed - do not retry, let the 401 response flow through
        // This ensures proper API error response path instead of throwing
      }
    }
    
    const text = await res.text();
    let data: any = null;
    
    // Parse JSON only if there's content and it's not a 204 No Content response
    if (text && res.status !== 204) {
      try {
        data = JSON.parse(text);
      } catch (parseError) {
        // If JSON parsing fails, treat as error
        return { 
          ok: false, 
          status: res.status, 
          data: { 
            error: 'Invalid JSON response', 
            code: 'PARSE_ERROR',
            details: parseError 
          } 
        };
      }
    }
    
    if (!res.ok) {
      // Ensure error responses use the standardized ApiError format
      const errorData: ApiError = data && typeof data === 'object' && 'error' in data 
        ? data 
        : { 
            error: data?.message || data?.error || 'Request failed', 
            code: data?.code,
            details: data 
          };
      return { ok: false, status: res.status, data: errorData };
    }
    
    return { ok: true, status: res.status, data };
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') {
      logger.error('API request timed out:', path);
      return { 
        ok: false, 
        status: 408, 
        data: { 
          error: 'Request timeout', 
          code: 'TIMEOUT',
          details: { path, timeoutMs }
        } 
      };
    }
    
    logger.error('API request failed:', path, error);
    return { 
      ok: false, 
      status: 0, 
      data: { 
        error: 'Network error', 
        code: 'NETWORK_ERROR',
        details: error instanceof Error ? error.message : error
      } 
    };
  } finally {
    clearTimeout(id);
  }
}

// Convenience methods for common HTTP operations
export const apiService = {
  async get<T = any>(path: string, options: { params?: Record<string, any> } = {}): Promise<ApiResponse<T>> {
    const query = options.params ? new URLSearchParams(options.params).toString() : '';
    const url = query ? `${path}${path.includes('?') ? '&' : '?'}${query}` : path;
    return apiFetch<T>(url, { method: 'GET' });
  },

  async post<T = any>(path: string, data?: any, options: { timeoutMs?: number } = {}): Promise<ApiResponse<T>> {
    return apiFetch<T>(path, {
      method: 'POST',
      body: data ? JSON.stringify(data) : undefined,
    }, options.timeoutMs);
  },

  async put<T = any>(path: string, data?: any, options: { timeoutMs?: number } = {}): Promise<ApiResponse<T>> {
    return apiFetch<T>(path, {
      method: 'PUT',
      body: data ? JSON.stringify(data) : undefined,
    }, options.timeoutMs);
  },

  async delete<T = any>(path: string, options: { timeoutMs?: number } = {}): Promise<ApiResponse<T>> {
    return apiFetch<T>(path, { method: 'DELETE' }, options.timeoutMs);
  },
};