import helmet from 'helmet';
import rateLimit, { ipKeyGenerator } from 'express-rate-limit';
import slowDown from 'express-slow-down';
import compression from 'compression';
import { body, validationResult } from 'express-validator';
import logger from '../utils/logger.js';

/**
 * Security middleware configuration for MindGarden API
 * Implements comprehensive security headers, rate limiting, and input validation
 */

// Helmet configuration for security headers
export const helmetConfig = helmet({
  // Content Security Policy
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'"],
      scriptSrc: ["'self'"],
      imgSrc: ["'self'", "data:", "https:"],
      connectSrc: ["'self'"],
      fontSrc: ["'self'"],
      objectSrc: ["'none'"],
      mediaSrc: ["'self'"],
      frameSrc: ["'none'"],
    },
  },
  // Cross-Origin Embedder Policy
  crossOriginEmbedderPolicy: false,
  // DNS Prefetch Control
  dnsPrefetchControl: true,
  // Expect-CT header
  expectCt: {
    maxAge: 86400,
    enforce: true,
  },
  // Feature Policy
  featurePolicy: {
    features: {
      camera: ["'none'"],
      microphone: ["'none'"],
      geolocation: ["'none'"],
    },
  },
  // Hide X-Powered-By header
  hidePoweredBy: true,
  // HSTS (HTTP Strict Transport Security)
  hsts: {
    maxAge: 31536000,
    includeSubDomains: true,
    preload: true,
  },
  // IE No Open
  ieNoOpen: true,
  // No Sniff
  noSniff: true,
  // Origin Agent Cluster
  originAgentCluster: true,
  // Permissions Policy
  permissionsPolicy: {
    features: {
      camera: [],
      microphone: [],
      geolocation: [],
    },
  },
  // Referrer Policy
  referrerPolicy: { policy: "same-origin" },
  // XSS Filter
  xssFilter: true,
});

// Global rate limiting configuration
export const globalRateLimit = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 1000, // Limit each IP to 1000 requests per windowMs
  message: {
    error: 'Too many requests from this IP, please try again later.',
    retryAfter: '15 minutes'
  },
  standardHeaders: true, // Return rate limit info in the `RateLimit-*` headers
  legacyHeaders: false, // Disable the `X-RateLimit-*` headers
  // Skip successful requests
  skipSuccessfulRequests: false,
  // Skip failed requests
  skipFailedRequests: false,
  // Key generator for rate limiting
  keyGenerator: (req) => {
    // Use user ID if authenticated, otherwise use IP with IPv6 support
    return req.user?.id || ipKeyGenerator(req);
  },
  // Handler for when limit is exceeded
  handler: (req, res) => {
    logger.warn(`Rate limit exceeded for ${req.user?.id || req.ip}`, {
      ip: req.ip,
      userAgent: req.get('User-Agent'),
      userId: req.user?.id,
      endpoint: req.path,
      method: req.method
    });
    
    res.status(429).json({
      error: 'Too many requests from this IP, please try again later.',
      retryAfter: '15 minutes'
    });
  }
});

// Strict rate limiting for authentication endpoints
export const authRateLimit = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 5, // Limit each IP to 5 auth requests per windowMs
  message: {
    error: 'Too many authentication attempts, please try again later.',
    retryAfter: '15 minutes'
  },
  standardHeaders: true,
  legacyHeaders: false,
  skipSuccessfulRequests: true, // Don't count successful requests
  handler: (req, res) => {
    logger.warn(`Auth rate limit exceeded for ${req.ip}`, {
      ip: req.ip,
      userAgent: req.get('User-Agent'),
      endpoint: req.path,
      method: req.method
    });
    
    res.status(429).json({
      error: 'Too many authentication attempts, please try again later.',
      retryAfter: '15 minutes'
    });
  }
});

// Slow down middleware for suspicious activity
export const slowDownConfig = slowDown({
  windowMs: 15 * 60 * 1000, // 15 minutes
  delayAfter: 50, // Allow 50 requests per 15 minutes, then...
  delayMs: (used, req) => {
    const delayAfter = req.slowDown.limit;
    return (used - delayAfter) * 500;
  }, // Begin adding 500ms of delay per request above 50
  maxDelayMs: 20000, // Maximum delay of 20 seconds
  // Skip successful requests
  skipSuccessfulRequests: false,
  // Skip failed requests
  skipFailedRequests: false,
});

// Compression middleware
export const compressionConfig = compression({
  // Only compress responses that are larger than 1kb
  threshold: 1024,
  // Compression level (1-9, where 9 is maximum compression)
  level: 6,
  // Filter function to determine if response should be compressed
  filter: (req, res) => {
    // Don't compress if the request includes a 'no-transform' cache-control directive
    if (req.headers['cache-control'] && req.headers['cache-control'].includes('no-transform')) {
      return false;
    }
    // Use the default compression filter
    return compression.filter(req, res);
  }
});

// Input validation middleware
export const validateInput = (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    logger.warn('Input validation failed', {
      errors: errors.array(),
      ip: req.ip,
      userId: req.user?.id,
      endpoint: req.path,
      method: req.method
    });
    
    return res.status(400).json({
      error: 'Invalid input data',
      details: errors.array().map(err => ({
        field: err.path,
        message: err.msg,
        value: err.value
      }))
    });
  }
  next();
};

// Common validation rules
export const commonValidations = {
  // Email validation
  email: body('email')
    .isEmail()
    .normalizeEmail()
    .withMessage('Please provide a valid email address'),
  
  // Password validation
  password: body('password')
    .isLength({ min: 8, max: 128 })
    .withMessage('Password must be between 8 and 128 characters')
    .matches(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&]/)
    .withMessage('Password must contain at least one lowercase letter, one uppercase letter, one number, and one special character'),
  
  // UUID validation
  uuid: (field) => body(field)
    .isUUID()
    .withMessage(`${field} must be a valid UUID`),
  
  // String validation with length limits
  string: (field, minLength = 1, maxLength = 255) => body(field)
    .isLength({ min: minLength, max: maxLength })
    .trim()
    .escape()
    .withMessage(`${field} must be between ${minLength} and ${maxLength} characters`),
  
  // Integer validation
  integer: (field, min = 0, max = 2147483647) => body(field)
    .optional()
    .isInt({ min, max })
    .withMessage(`${field} must be an integer between ${min} and ${max}`),
  
  // Date validation
  date: (field) => body(field)
    .optional()
    .isISO8601()
    .withMessage(`${field} must be a valid ISO 8601 date`),
  
  // Boolean validation
  boolean: (field) => body(field)
    .optional()
    .isBoolean()
    .withMessage(`${field} must be a boolean value`),
  
  // JSON validation
  json: (field) => body(field)
    .optional()
    .isJSON()
    .withMessage(`${field} must be valid JSON`),
  
  // URL validation
  url: (field) => body(field)
    .optional()
    .isURL()
    .withMessage(`${field} must be a valid URL`),
  
  // Enum validation
  enum: (field, values) => body(field)
    .optional()
    .isIn(values)
    .withMessage(`${field} must be one of: ${values.join(', ')}`),
};

// Request size limit middleware
export const requestSizeLimit = (limit = '10mb') => {
  return (req, res, next) => {
    const contentLength = parseInt(req.get('content-length') || '0', 10);
    const maxSize = parseSize(limit);
    
    if (contentLength > maxSize) {
      logger.warn('Request size limit exceeded', {
        contentLength,
        maxSize,
        ip: req.ip,
        userId: req.user?.id,
        endpoint: req.path,
        method: req.method
      });
      
      return res.status(413).json({
        error: 'Request entity too large',
        maxSize: limit
      });
    }
    
    next();
  };
};

// Helper function to parse size strings (e.g., '10mb' -> 10485760)
function parseSize(size) {
  const units = {
    'b': 1,
    'kb': 1024,
    'mb': 1024 * 1024,
    'gb': 1024 * 1024 * 1024
  };
  
  const match = size.toLowerCase().match(/^(\d+(?:\.\d+)?)\s*(b|kb|mb|gb)?$/);
  if (!match) return 10 * 1024 * 1024; // Default 10MB
  
  const value = parseFloat(match[1]);
  const unit = match[2] || 'b';
  
  return Math.floor(value * units[unit]);
}

// Security headers middleware
export const securityHeaders = (req, res, next) => {
  // Remove server information
  res.removeHeader('X-Powered-By');
  
  // Add custom security headers
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('X-XSS-Protection', '1; mode=block');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
  
  next();
};

// Request logging middleware for security monitoring
export const securityLogging = (req, res, next) => {
  const startTime = Date.now();
  
  // Log request
  logger.info('API Request', {
    method: req.method,
    path: req.path,
    ip: req.ip,
    userAgent: req.get('User-Agent'),
    userId: req.user?.id,
    timestamp: new Date().toISOString()
  });
  
  // Override res.end to log response
  const originalEnd = res.end;
  res.end = function(chunk, encoding) {
    const duration = Date.now() - startTime;
    
    logger.info('API Response', {
      method: req.method,
      path: req.path,
      statusCode: res.statusCode,
      duration: `${duration}ms`,
      ip: req.ip,
      userId: req.user?.id,
      timestamp: new Date().toISOString()
    });
    
    // Log security-relevant responses
    if (res.statusCode >= 400) {
      logger.warn('API Error Response', {
        method: req.method,
        path: req.path,
        statusCode: res.statusCode,
        ip: req.ip,
        userAgent: req.get('User-Agent'),
        userId: req.user?.id,
        timestamp: new Date().toISOString()
      });
    }
    
    originalEnd.call(this, chunk, encoding);
  };
  
  next();
};

export default {
  helmetConfig,
  globalRateLimit,
  authRateLimit,
  slowDownConfig,
  compressionConfig,
  validateInput,
  commonValidations,
  requestSizeLimit,
  securityHeaders,
  securityLogging
};
