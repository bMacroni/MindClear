/**
 * Security utilities tests
 * 
 * Tests for Content Security Policy generation, XSS protection,
 * and other security utilities in different environments.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { 
  getCSPConfig, 
  generateCSP, 
  sanitizeHTML, 
  sanitizeInput, 
  validateEmail, 
  validatePassword,
  SecureTokenStorage,
  CSRFProtection,
  getSecurityHeaders,
  RateLimiter,
  logSecurityEvent,
  initializeSecurity
} from '../security';

// Mock DOM environment for tests
Object.defineProperty(window, 'localStorage', {
  value: {
    getItem: vi.fn(),
    setItem: vi.fn(),
    removeItem: vi.fn(),
  },
  writable: true,
});

Object.defineProperty(window, 'sessionStorage', {
  value: {
    getItem: vi.fn(),
    setItem: vi.fn(),
    removeItem: vi.fn(),
  },
  writable: true,
});

Object.defineProperty(window, 'crypto', {
  value: {
    getRandomValues: vi.fn((arr) => {
      for (let i = 0; i < arr.length; i++) {
        arr[i] = Math.floor(Math.random() * 256);
      }
      return arr;
    }),
  },
  writable: true,
});

// Mock document for CSP meta tag tests
const mockDocument = {
  createElement: vi.fn(() => ({
    setAttribute: vi.fn(),
    textContent: '',
    innerHTML: '',
  })),
  head: {
    appendChild: vi.fn(),
  },
};

Object.defineProperty(window, 'document', {
  value: mockDocument,
  writable: true,
});

describe('Content Security Policy', () => {
  const originalEnv = process.env.NODE_ENV;

  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    process.env.NODE_ENV = originalEnv;
  });

  describe('getCSPConfig', () => {
    it('should include unsafe-eval in development environment', () => {
      process.env.NODE_ENV = 'development';
      
      const config = getCSPConfig();
      
      expect(config['script-src']).toContain("'unsafe-eval'");
      expect(config['script-src']).toContain("'self'");
      expect(config['script-src']).toContain("'unsafe-inline'");
    });

    it('should exclude unsafe-eval in production environment', () => {
      process.env.NODE_ENV = 'production';
      
      const config = getCSPConfig();
      
      expect(config['script-src']).not.toContain("'unsafe-eval'");
      expect(config['script-src']).toContain("'self'");
      expect(config['script-src']).toContain("'unsafe-inline'");
    });

    it('should exclude unsafe-eval in test environment', () => {
      process.env.NODE_ENV = 'test';
      
      const config = getCSPConfig();
      
      expect(config['script-src']).not.toContain("'unsafe-eval'");
      expect(config['script-src']).toContain("'self'");
      expect(config['script-src']).toContain("'unsafe-inline'");
    });

    it('should maintain all other CSP directives regardless of environment', () => {
      const developmentConfig = getCSPConfig();
      process.env.NODE_ENV = 'production';
      const productionConfig = getCSPConfig();
      
      // Check that non-script-src directives are identical
      expect(developmentConfig['default-src']).toEqual(productionConfig['default-src']);
      expect(developmentConfig['style-src']).toEqual(productionConfig['style-src']);
      expect(developmentConfig['font-src']).toEqual(productionConfig['font-src']);
      expect(developmentConfig['img-src']).toEqual(productionConfig['img-src']);
      expect(developmentConfig['connect-src']).toEqual(productionConfig['connect-src']);
      expect(developmentConfig['frame-src']).toEqual(productionConfig['frame-src']);
      expect(developmentConfig['object-src']).toEqual(productionConfig['object-src']);
      expect(developmentConfig['base-uri']).toEqual(productionConfig['base-uri']);
      expect(developmentConfig['form-action']).toEqual(productionConfig['form-action']);
      expect(developmentConfig['frame-ancestors']).toEqual(productionConfig['frame-ancestors']);
      expect(developmentConfig['upgrade-insecure-requests']).toEqual(productionConfig['upgrade-insecure-requests']);
    });
  });

  describe('generateCSP', () => {
    it('should generate valid CSP string in development', () => {
      process.env.NODE_ENV = 'development';
      
      const csp = generateCSP();
      
      expect(csp).toContain("script-src 'self' 'unsafe-inline' 'unsafe-eval'");
      expect(csp).toContain("default-src 'self'");
      expect(csp).toContain("style-src 'self' 'unsafe-inline' https://fonts.googleapis.com");
      expect(csp).toContain("font-src 'self' https://fonts.gstatic.com");
      expect(csp).toContain("img-src 'self' data: https:");
      expect(csp).toContain("connect-src 'self' ws: wss: https:");
      expect(csp).toContain("frame-src 'none'");
      expect(csp).toContain("object-src 'none'");
      expect(csp).toContain("base-uri 'self'");
      expect(csp).toContain("form-action 'self'");
      expect(csp).toContain("frame-ancestors 'none'");
      expect(csp).toContain("upgrade-insecure-requests");
    });

    it('should generate valid CSP string in production without unsafe-eval', () => {
      process.env.NODE_ENV = 'production';
      
      const csp = generateCSP();
      
      expect(csp).toContain("script-src 'self' 'unsafe-inline'");
      expect(csp).not.toContain("'unsafe-eval'");
      expect(csp).toContain("default-src 'self'");
      expect(csp).toContain("upgrade-insecure-requests");
    });

    it('should format CSP string correctly with semicolons', () => {
      process.env.NODE_ENV = 'development';
      
      const csp = generateCSP();
      const directives = csp.split('; ');
      
      expect(directives.length).toBeGreaterThan(5);
      expect(directives.every(directive => directive.trim().length > 0)).toBe(true);
    });

    it('should handle empty source arrays correctly', () => {
      process.env.NODE_ENV = 'development';
      
      const csp = generateCSP();
      
      // upgrade-insecure-requests should appear without sources
      expect(csp).toContain('upgrade-insecure-requests');
      expect(csp).not.toContain('upgrade-insecure-requests ');
    });
  });
});

describe('XSS Protection', () => {
  describe('sanitizeHTML', () => {
    it('should remove dangerous HTML content using DOMPurify', () => {
      const maliciousHTML = '<script>alert("xss")</script>';
      const sanitized = sanitizeHTML(maliciousHTML);
      
      // DOMPurify removes script tags entirely for security
      expect(sanitized).toBe('');
    });

    it('should handle empty strings', () => {
      expect(sanitizeHTML('')).toBe('');
    });

    it('should handle normal text', () => {
      const normalText = 'This is normal text';
      expect(sanitizeHTML(normalText)).toBe('This is normal text');
    });
  });

  describe('sanitizeInput', () => {
    it('should escape dangerous characters', () => {
      const maliciousInput = '<script>alert("xss")</script>';
      const sanitized = sanitizeInput(maliciousInput);
      
      expect(sanitized).toBe('&lt;script&gt;alert(&quot;xss&quot;)&lt;/script&gt;');
    });

    it('should trim whitespace', () => {
      const input = '  test  ';
      expect(sanitizeInput(input)).toBe('test');
    });

    it('should handle empty strings', () => {
      expect(sanitizeInput('')).toBe('');
    });
  });
});

describe('Input Validation', () => {
  describe('validateEmail', () => {
    it('should validate correct email formats', () => {
      expect(validateEmail('test@example.com')).toBe(true);
      expect(validateEmail('user.name@domain.co.uk')).toBe(true);
      expect(validateEmail('user+tag@example.org')).toBe(true);
    });

    it('should reject invalid email formats', () => {
      expect(validateEmail('invalid-email')).toBe(false);
      expect(validateEmail('@example.com')).toBe(false);
      expect(validateEmail('test@')).toBe(false);
      expect(validateEmail('')).toBe(false);
    });
  });

  describe('validatePassword', () => {
    it('should validate strong passwords', () => {
      const result = validatePassword('StrongPass123!');
      expect(result.isValid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('should reject weak passwords', () => {
      const result = validatePassword('weak');
      expect(result.isValid).toBe(false);
      expect(result.errors.length).toBeGreaterThan(0);
    });

    it('should check for all required criteria', () => {
      const result = validatePassword('Password123!');
      expect(result.isValid).toBe(true);
    });
  });
});

describe('SecureTokenStorage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should store tokens directly without base64 encoding', () => {
    const token = 'test-token';
    SecureTokenStorage.setToken(token);
    
    expect(window.localStorage.setItem).toHaveBeenCalledWith('jwt_token', token);
  });

  it('should retrieve tokens directly', () => {
    const token = 'test-token';
    (window.localStorage.getItem as any).mockReturnValue(token);
    
    const retrievedToken = SecureTokenStorage.getToken();
    
    expect(retrievedToken).toBe(token);
    expect(window.localStorage.getItem).toHaveBeenCalledWith('jwt_token');
  });

  it('should remove tokens', () => {
    SecureTokenStorage.removeToken();
    
    expect(window.localStorage.removeItem).toHaveBeenCalledWith('jwt_token');
  });

  it('should check for token existence', () => {
    (window.localStorage.getItem as any).mockReturnValue('test-token');
    
    const hasToken = SecureTokenStorage.hasToken();
    
    expect(hasToken).toBe(true);
  });

  it('should return null when no token exists', () => {
    (window.localStorage.getItem as any).mockReturnValue(null);
    
    const token = SecureTokenStorage.getToken();
    
    expect(token).toBe(null);
  });

  it('should handle storage errors gracefully', () => {
    (window.localStorage.setItem as any).mockImplementation(() => {
      throw new Error('Storage error');
    });
    
    expect(() => SecureTokenStorage.setToken('test-token')).toThrow('Failed to store authentication token');
  });
});

describe('CSRFProtection', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should generate tokens', () => {
    const token = CSRFProtection.generateToken();
    
    expect(token).toBeDefined();
    expect(typeof token).toBe('string');
    // Base64 encoding of 32 bytes produces ~43 characters (URL-safe base64 without padding)
    expect(token.length).toBeGreaterThan(40);
    expect(token.length).toBeLessThan(50);
    // Should not contain + or / characters (URL-safe base64)
    expect(token).not.toMatch(/[+/]/);
    // Should not end with padding characters
    expect(token).not.toMatch(/=+$/);
  });

  it('should store and retrieve tokens', () => {
    const token = 'test-csrf-token';
    CSRFProtection.setToken(token);
    
    expect(window.sessionStorage.setItem).toHaveBeenCalled();
  });

  it('should validate tokens', () => {
    const token = 'test-token';
    (window.sessionStorage.getItem as any).mockReturnValue(token);
    
    expect(CSRFProtection.validateToken(token)).toBe(true);
    expect(CSRFProtection.validateToken('wrong-token')).toBe(false);
  });
});

describe('Security Headers', () => {
  it('should include basic security headers', () => {
    const headers = getSecurityHeaders();
    
    expect(headers['Content-Type']).toBe('application/json');
    expect(headers['X-Requested-With']).toBe('XMLHttpRequest');
  });

  it('should include CSRF token when available', () => {
    (window.sessionStorage.getItem as any).mockReturnValue('csrf-token');
    
    const headers = getSecurityHeaders();
    
    expect(headers['X-CSRF-Token']).toBe('csrf-token');
  });
});

describe('Rate Limiter', () => {
  beforeEach(() => {
    RateLimiter.clear('test-key');
  });

  it('should allow requests within limits', () => {
    const key = 'test-key';
    
    for (let i = 0; i < 5; i++) {
      expect(RateLimiter.isAllowed(key, 10, 60000)).toBe(true);
    }
  });

  it('should block requests exceeding limits', () => {
    const key = 'test-key';
    const maxRequests = 3;
    
    // Make requests up to limit
    for (let i = 0; i < maxRequests; i++) {
      expect(RateLimiter.isAllowed(key, maxRequests, 60000)).toBe(true);
    }
    
    // Next request should be blocked
    expect(RateLimiter.isAllowed(key, maxRequests, 60000)).toBe(false);
  });

  it('should clear rate limit data', () => {
    const key = 'test-key';
    
    RateLimiter.isAllowed(key, 1, 60000);
    expect(RateLimiter.isAllowed(key, 1, 60000)).toBe(false);
    
    RateLimiter.clear(key);
    expect(RateLimiter.isAllowed(key, 1, 60000)).toBe(true);
  });
});

describe('Security Event Logging', () => {
  const originalConsole = console.warn;
  
  beforeEach(() => {
    console.warn = vi.fn();
  });

  afterEach(() => {
    console.warn = originalConsole;
  });

  it('should log security events in development', () => {
    process.env.NODE_ENV = 'development';
    
    logSecurityEvent('test-event', { detail: 'test' });
    
    expect(console.warn).toHaveBeenCalledWith('Security event:', 'test-event', { detail: 'test' });
  });

  it('should log minimal events in production', () => {
    process.env.NODE_ENV = 'production';
    
    logSecurityEvent('test-event', { detail: 'test' });
    
    expect(console.warn).toHaveBeenCalledWith('Security event:', 'test-event', 'Details available');
  });
});

describe('Security Initialization', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should initialize security features', () => {
    const originalConsole = console.warn;
    console.warn = vi.fn();
    
    initializeSecurity();
    
    expect(window.document.createElement).toHaveBeenCalledWith('meta');
    expect(window.document.head.appendChild).toHaveBeenCalled();
    expect(window.sessionStorage.setItem).toHaveBeenCalled();
    
    console.warn = originalConsole;
  });
});
