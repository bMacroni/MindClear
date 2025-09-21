import { v4 as uuidv4 } from 'uuid';
import logger from '../utils/logger.js';

/**
 * Request Tracking Middleware
 * Adds unique request IDs for better security monitoring and debugging
 */

/**
 * Generate and track request IDs
 */
export function requestTracking(req, res, next) {
  // Generate unique request ID
  req.requestId = uuidv4();
  
  // Add request ID to response headers
  res.setHeader('X-Request-ID', req.requestId);
  
  // Add request ID to logger context (using simple logger with request ID)
  req.logger = {
    info: (message, meta = {}) => logger.info(message, { ...meta, requestId: req.requestId }),
    warn: (message, meta = {}) => logger.warn(message, { ...meta, requestId: req.requestId }),
    error: (message, meta = {}) => logger.error(message, { ...meta, requestId: req.requestId })
  };
  
  // Log request start
  req.logger.info('Request started', {
    method: req.method,
    path: req.path,
    ip: req.ip,
    userAgent: req.get('User-Agent'),
    userId: req.user?.id,
    timestamp: new Date().toISOString()
  });
  
  // Override res.end to log request completion
  const originalEnd = res.end;
  res.end = function(chunk, encoding) {
    const duration = Date.now() - req.startTime;
    
    req.logger.info('Request completed', {
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
      req.logger.warn('Request error', {
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
  
  // Set start time for duration calculation
  req.startTime = Date.now();
  
  next();
}

/**
 * Error tracking middleware
 */
export function errorTracking(err, req, res, next) {
  const requestId = req.requestId || 'unknown';
  
  logger.error('Request error', {
    requestId,
    error: err.message,
    stack: err.stack,
    method: req.method,
    path: req.path,
    ip: req.ip,
    userAgent: req.get('User-Agent'),
    userId: req.user?.id,
    timestamp: new Date().toISOString()
  });
  
  // Send error response with request ID
  res.status(err.status || 500).json({
    error: process.env.NODE_ENV === 'production' ? 'Internal server error' : err.message,
    requestId
  });
}

export default {
  requestTracking,
  errorTracking
};
