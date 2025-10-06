import logger from './logger.js';

/**
 * Security Monitoring System
 * Tracks security events and potential threats
 */

class SecurityMonitor {
  constructor() {
    this.events = [];
    this.threatLevels = {
      LOW: 1,
      MEDIUM: 2,
      HIGH: 3,
      CRITICAL: 4
    };
    this.maxEvents = 1000; // Keep last 1000 events
  }

  /**
   * Log a security event
   */
  logEvent(type, level, details, req = null) {
    const event = {
      id: this.generateEventId(),
      type,
      level,
      details,
      timestamp: new Date().toISOString(),
      ip: req?.ip || 'unknown',
      userAgent: req?.get('User-Agent') || 'unknown',
      userId: req?.user?.id || 'anonymous',
      requestId: req?.requestId || 'unknown'
    };

    this.events.push(event);
    
    // Keep only the most recent events
    if (this.events.length > this.maxEvents) {
      this.events = this.events.slice(-this.maxEvents);
    }

    // Log based on threat level
    switch (level) {
      case this.threatLevels.CRITICAL:
        logger.error('🚨 CRITICAL Security Event:', event);
        break;
      case this.threatLevels.HIGH:
        logger.warn('⚠️ HIGH Security Event:', event);
        break;
      case this.threatLevels.MEDIUM:
        logger.warn('🔶 MEDIUM Security Event:', event);
        break;
      case this.threatLevels.LOW:
        logger.info('🔵 LOW Security Event:', event);
        break;
    }

    // Check for patterns that might indicate an attack
    this.analyzePatterns(event);
  }

  /**
   * Generate unique event ID
   */
  generateEventId() {
    return `sec_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * Analyze patterns for potential attacks
   */
  analyzePatterns(event) {
    const recentEvents = this.getRecentEvents(5 * 60 * 1000); // Last 5 minutes
    
    // Check for rapid failed authentication attempts
    const failedAuths = recentEvents.filter(e => 
      e.type === 'AUTH_FAILURE' && e.ip === event.ip
    );
    
    if (failedAuths.length >= 5) {
      this.logEvent('BRUTE_FORCE_DETECTED', this.threatLevels.HIGH, {
        ip: event.ip,
        failedAttempts: failedAuths.length,
        timeWindow: '5 minutes'
      });
    }

    // Check for suspicious request patterns
    const suspiciousRequests = recentEvents.filter(e => 
      e.type === 'SUSPICIOUS_REQUEST' && e.ip === event.ip
    );
    
    if (suspiciousRequests.length >= 3) {
      this.logEvent('SUSPICIOUS_ACTIVITY', this.threatLevels.MEDIUM, {
        ip: event.ip,
        suspiciousRequests: suspiciousRequests.length,
        timeWindow: '5 minutes'
      });
    }

    // Check for rate limit violations
    const rateLimitViolations = recentEvents.filter(e => 
      e.type === 'RATE_LIMIT_EXCEEDED' && e.ip === event.ip
    );
    
    if (rateLimitViolations.length >= 3) {
      this.logEvent('RATE_LIMIT_ABUSE', this.threatLevels.MEDIUM, {
        ip: event.ip,
        violations: rateLimitViolations.length,
        timeWindow: '5 minutes'
      });
    }
  }

  /**
   * Get recent events within time window
   */
  getRecentEvents(timeWindowMs) {
    const cutoff = new Date(Date.now() - timeWindowMs);
    return this.events.filter(event => new Date(event.timestamp) > cutoff);
  }

  /**
   * Get security summary
   */
  getSecuritySummary() {
    const recentEvents = this.getRecentEvents(60 * 60 * 1000); // Last hour
    
    const summary = {
      totalEvents: this.events.length,
      recentEvents: recentEvents.length,
      criticalEvents: recentEvents.filter(e => e.level === this.threatLevels.CRITICAL).length,
      highEvents: recentEvents.filter(e => e.level === this.threatLevels.HIGH).length,
      mediumEvents: recentEvents.filter(e => e.level === this.threatLevels.MEDIUM).length,
      lowEvents: recentEvents.filter(e => e.level === this.threatLevels.LOW).length,
      uniqueIPs: new Set(recentEvents.map(e => e.ip)).size,
      uniqueUsers: new Set(recentEvents.map(e => e.userId).filter(id => id !== 'anonymous')).size,
      timestamp: new Date().toISOString()
    };

    return summary;
  }

  /**
   * Get events by type
   */
  getEventsByType(type, limit = 50) {
    return this.events
      .filter(event => event.type === type)
      .slice(-limit)
      .reverse();
  }

  /**
   * Get events by IP
   */
  getEventsByIP(ip, limit = 50) {
    return this.events
      .filter(event => event.ip === ip)
      .slice(-limit)
      .reverse();
  }

  /**
   * Clear old events
   */
  clearOldEvents(olderThanMs = 24 * 60 * 60 * 1000) { // 24 hours
    const cutoff = new Date(Date.now() - olderThanMs);
    this.events = this.events.filter(event => new Date(event.timestamp) > cutoff);
  }
}

// Create singleton instance
const securityMonitor = new SecurityMonitor();

// Export convenience functions
export function logSecurityEvent(type, level, details, req = null) {
  securityMonitor.logEvent(type, level, details, req);
}

export function getSecuritySummary() {
  return securityMonitor.getSecuritySummary();
}

export function getEventsByType(type, limit = 50) {
  return securityMonitor.getEventsByType(type, limit);
}

export function getEventsByIP(ip, limit = 50) {
  return securityMonitor.getEventsByIP(ip, limit);
}

// Common security event types
export const SecurityEventTypes = {
  AUTH_SUCCESS: 'AUTH_SUCCESS',
  AUTH_FAILURE: 'AUTH_FAILURE',
  RATE_LIMIT_EXCEEDED: 'RATE_LIMIT_EXCEEDED',
  SUSPICIOUS_REQUEST: 'SUSPICIOUS_REQUEST',
  BRUTE_FORCE_DETECTED: 'BRUTE_FORCE_DETECTED',
  TOKEN_BLACKLISTED: 'TOKEN_BLACKLISTED',
  INVALID_TOKEN: 'INVALID_TOKEN',
  CORS_VIOLATION: 'CORS_VIOLATION',
  INPUT_VALIDATION_FAILED: 'INPUT_VALIDATION_FAILED',
  SQL_INJECTION_ATTEMPT: 'SQL_INJECTION_ATTEMPT',
  XSS_ATTEMPT: 'XSS_ATTEMPT',
  FILE_UPLOAD_VIOLATION: 'FILE_UPLOAD_VIOLATION',
  ADMIN_ACCESS: 'ADMIN_ACCESS',
  DATA_EXPORT: 'DATA_EXPORT',
  CONFIGURATION_CHANGE: 'CONFIGURATION_CHANGE',
  PASSWORD_RESET_REQUESTED: 'PASSWORD_RESET_REQUESTED'
};

export default securityMonitor;

