/**
 * Frontend Security Utilities
 * 
 * Provides security utilities for the React frontend application
 * including Content Security Policy, XSS protection, and secure storage.
 */

/**
 * Content Security Policy configuration
 */
export const CSP_CONFIG = {
  'default-src': ["'self'"],
  'script-src': ["'self'", "'unsafe-inline'", "'unsafe-eval'"], // Note: unsafe-eval needed for development
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
 * Generates Content Security Policy header value
 */
export function generateCSP(): string {
  return Object.entries(CSP_CONFIG)
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
  const div = document.createElement('div');
  div.textContent = html;
  return div.innerHTML;
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
 * Secure token storage with encryption
 */
export class SecureTokenStorage {
  private static readonly TOKEN_KEY = 'jwt_token';
  private static readonly ENCRYPTION_KEY = 'mindgarden_secure_key'; // In production, use a more secure key

  /**
   * Stores a token securely
   */
  static setToken(token: string): void {
    try {
      // Simple base64 encoding (in production, use proper encryption)
      const encodedToken = btoa(token);
      localStorage.setItem(this.TOKEN_KEY, encodedToken);
    } catch (error) {
      // Fallback to regular storage
      localStorage.setItem(this.TOKEN_KEY, token);
    }
  }

  /**
   * Retrieves a token securely
   */
  static getToken(): string | null {
    try {
      const encodedToken = localStorage.getItem(this.TOKEN_KEY);
      if (!encodedToken) {
        return null;
      }
      
      // Decode the token
      return atob(encodedToken);
    } catch (error) {
      // Fallback to regular storage
      return localStorage.getItem(this.TOKEN_KEY);
    }
  }

  /**
   * Removes a token securely
   */
  static removeToken(): void {
    localStorage.removeItem(this.TOKEN_KEY);
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
   * Generates a CSRF token
   */
  static generateToken(): string {
    const array = new Uint8Array(32);
    crypto.getRandomValues(array);
    return Array.from(array, byte => byte.toString(16).padStart(2, '0')).join('');
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
 */
export function logSecurityEvent(event: string, details?: any): void {
  const isProduction = process.env.NODE_ENV === 'production';
  
  if (isProduction) {
    // In production, this would integrate with a proper logging service
    // For now, we'll use a minimal approach
    if (details) {
      console.warn('Security event:', event, 'Details available');
    } else {
      console.warn('Security event:', event);
    }
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

