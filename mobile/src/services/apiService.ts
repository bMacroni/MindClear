import { configService } from './config';
import { authService } from './auth';
import { secureConfigService } from './secureConfig';
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
  
  try {
    // Get auth token if available
    const token = await authService.getAuthToken();
    
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
    
    // Add Authorization header if token is available
    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }
    
    // Add Content-Type only for non-GET requests or when body is present
    const method = init.method?.toUpperCase() || 'GET';
    const hasBody = init.body !== undefined && init.body !== null;
    if (method !== 'GET' || hasBody) {
      headers['Content-Type'] = 'application/json';
    }
    
    const res = await fetch(`${getSecureApiBaseUrl()}${path}`, {
      ...init,
      signal: controller.signal,
      headers,
    });
    
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
      console.error('API request timed out:', path);
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
    
    console.error('API request failed:', path, error);
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
    console.log('API GET request to:', url);
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