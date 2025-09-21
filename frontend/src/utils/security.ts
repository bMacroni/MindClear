/**
 * Frontend Security Utilities
 * 
 * Provides security utilities for the React frontend application
 * including Content Security Policy, XSS protection, and secure storage.
 */

import DOMPurify from 'dompurify';

/**
 * Base Content Security Policy configuration
 */
const BASE_CSP_CONFIG = {
  'default-src': ["'self'"],
  'script-src': ["'self'", "'unsafe-inline'"], // unsafe-eval added conditionally in development
  'style-src': ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com"],
  'font-src': ["'self'", "https://fonts.gstatic.com"],
  'img-src': ["'self'", "data:", "https:"],
  'connect-src': ["'self'", "ws:", "wss:", "https:"],
  'frame-src': ["'none'"],
  'object-src': ["'none'"],
  'base-uri': ["'self'"],
  'form-action': ["'self'"],
  'frame-ancestors': ["'none'"],
  'upgrade-insecure-requests': []
};

/**
 * Gets the Content Security Policy configuration based on environment
 */
export function getCSPConfig(): typeof BASE_CSP_CONFIG {
  const isDevelopment = process.env.NODE_ENV === 'development';
  
  return {
    ...BASE_CSP_CONFIG,
    'script-src': isDevelopment 
      ? [...BASE_CSP_CONFIG['script-src'], "'unsafe-eval'"] // Only in development
      : BASE_CSP_CONFIG['script-src'] // Production: no unsafe-eval
  };
}

/**
 * Generates Content Security Policy header value
 */
export function generateCSP(): string {
  const cspConfig = getCSPConfig();
  return Object.entries(cspConfig)
    .map(([directive, sources]) => {
      if (sources.length === 0) {
        return directive;
      }
      return `${directive} ${sources.join(' ')}`;
    })
    .join('; ');
}

/**
 * Sanitizes HTML content to prevent XSS attacks
 */
export function sanitizeHTML(html: string): string {
  return DOMPurify.sanitize(html);
}

/**
 * Sanitizes user input to prevent XSS
 */
export function sanitizeInput(input: string): string {
  return input
    .replace(/[<>\"'&]/g, (match) => {
      const escapeMap: Record<string, string> = {
        '<': '&lt;',
        '>': '&gt;',
        '"': '&quot;',
        "'": '&#x27;',
        '&': '&amp;'
      };
      return escapeMap[match];
    })
    .trim();
}

/**
 * Validates email format
 */
export function validateEmail(email: string): boolean {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email);
}

/**
 * Validates password strength
 */
export function validatePassword(password: string): {
  isValid: boolean;
  errors: string[];
} {
  const errors: string[] = [];

  if (password.length < 8) {
    errors.push('Password must be at least 8 characters long');
  }

  if (!/[A-Z]/.test(password)) {
    errors.push('Password must contain at least one uppercase letter');
  }

  if (!/[a-z]/.test(password)) {
    errors.push('Password must contain at least one lowercase letter');
  }

  if (!/\d/.test(password)) {
    errors.push('Password must contain at least one number');
  }

  if (!/[!@#$%^&*(),.?":{}|<>]/.test(password)) {
    errors.push('Password must contain at least one special character');
  }

  return {
    isValid: errors.length === 0,
    errors
  };
}

/**
 * Secure token storage - relies on HTTPS for transport security
 * Base64 encoding provides no security and is removed per security audit
 */
export class SecureTokenStorage {
  private static readonly TOKEN_KEY = 'jwt_token';

  /**
   * Stores a token securely
   * Note: Relies on HTTPS for transport security, not client-side obfuscation
   */
  static setToken(token: string): void {
    try {
      // Store token directly - rely on HTTPS for transport security
      // Consider using sessionStorage for more sensitive scenarios
      localStorage.setItem(this.TOKEN_KEY, token);
      
      // Log token storage for security monitoring
      logSecurityEvent('Token stored', { timestamp: Date.now() });
    } catch (error) {
      logSecurityEvent('Token storage failed', { error: error.message });
      throw new Error('Failed to store authentication token');
    }
  }

  /**
   * Retrieves a token securely
   */
  static getToken(): string | null {
    try {
      const token = localStorage.getItem(this.TOKEN_KEY);
      if (token) {
        logSecurityEvent('Token retrieved', { timestamp: Date.now() });
      }
      return token;
    } catch (error) {
      logSecurityEvent('Token retrieval failed', { error: error.message });
      return null;
    }
  }

  /**
   * Removes a token securely
   */
  static removeToken(): void {
    try {
      localStorage.removeItem(this.TOKEN_KEY);
      logSecurityEvent('Token removed', { timestamp: Date.now() });
    } catch (error) {
      logSecurityEvent('Token removal failed', { error: error.message });
    }
  }

  /**
   * Checks if a token exists
   */
  static hasToken(): boolean {
    return !!this.getToken();
  }
}

/**
 * CSRF token management
 */
export class CSRFProtection {
  private static readonly CSRF_TOKEN_KEY = 'csrf_token';

  /**
   * Generates a CSRF token using base64 encoding with URL-safe characters
   * Provides better entropy and compatibility than hex encoding
   */
  static generateToken(): string {
    const array = new Uint8Array(32);
    crypto.getRandomValues(array);
    return btoa(String.fromCharCode(...array)).replace(/[+/]/g, (c) => c === '+' ? '-' : '_').replace(/=+$/, '');
  }

  /**
   * Stores a CSRF token
   */
  static setToken(token: string): void {
    sessionStorage.setItem(this.CSRF_TOKEN_KEY, token);
  }

  /**
   * Retrieves a CSRF token
   */
  static getToken(): string | null {
    return sessionStorage.getItem(this.CSRF_TOKEN_KEY);
  }

  /**
   * Validates a CSRF token
   */
  static validateToken(token: string): boolean {
    const storedToken = this.getToken();
    return storedToken === token;
  }

  /**
   * Removes a CSRF token
   */
  static removeToken(): void {
    sessionStorage.removeItem(this.CSRF_TOKEN_KEY);
  }
}

/**
 * Security headers for API requests
 */
export function getSecurityHeaders(): Record<string, string> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    'X-Requested-With': 'XMLHttpRequest'
  };

  // Add CSRF token if available
  const csrfToken = CSRFProtection.getToken();
  if (csrfToken) {
    headers['X-CSRF-Token'] = csrfToken;
  }

  return headers;
}

/**
 * Rate limiting utility
 */
export class RateLimiter {
  private static requests: Map<string, number[]> = new Map();

  /**
   * Checks if a request is within rate limits
   * Note: Client-side rate limiting only. Not suitable for security-critical operations.
   * Use server-side rate limiting for actual protection.
   * 
   * Limitations:
   * - Data persists only in memory and resets on page refresh
   * - No coordination across browser tabs/windows
   * - Could be bypassed by clearing browser data
   */
  static isAllowed(key: string, maxRequests: number = 10, windowMs: number = 60000): boolean {
    const now = Date.now();
    const requests = this.requests.get(key) || [];
    
    // Remove old requests outside the window
    const validRequests = requests.filter(time => now - time < windowMs);
    
    if (validRequests.length >= maxRequests) {
      return false;
    }

    // Add current request
    validRequests.push(now);
    this.requests.set(key, validRequests);
    
    return true;
  }

  /**
   * Clears rate limit data for a key
   */
  static clear(key: string): void {
    this.requests.delete(key);
  }
}

/**
 * Security event logging
 * 
 * Note: Console-based logging is insufficient for production security monitoring.
 * Consider integrating with a proper logging service or security monitoring platform.
 */
export function logSecurityEvent(event: string, details?: any): void {
  const isProduction = process.env.NODE_ENV === 'production';
  
  if (isProduction) {
    // TODO: Integrate with proper security monitoring service
    // Examples: Datadog, New Relic, custom security service
    // securityMonitor.logEvent(event, details);
    console.warn('Security event:', event, 'Details available');
  } else {
    // In development, log full details
    console.warn('Security event:', event, details);
  }
}

/**
 * Initializes security features
 */
export function initializeSecurity(): void {
  // Set CSP meta tag
  const cspMeta = document.createElement('meta');
  cspMeta.setAttribute('http-equiv', 'Content-Security-Policy');
  cspMeta.setAttribute('content', generateCSP());
  document.head.appendChild(cspMeta);

  // Initialize CSRF protection
  const csrfToken = CSRFProtection.generateToken();
  CSRFProtection.setToken(csrfToken);

  // Log security initialization
  logSecurityEvent('Security initialized', {
    csp: generateCSP(),
    csrfToken: csrfToken.substring(0, 8) + '...'
  });
}

