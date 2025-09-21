import { createClient } from '@supabase/supabase-js';
import crypto from 'crypto';
import logger from '../utils/logger.js';
import { logSecurityEvent, SecurityEventTypes } from '../utils/securityMonitor.js';
import { encryptToken, decryptToken } from '../utils/tokenEncryption.js';

/**
 * Enhanced Authentication Middleware with Security Improvements
 * Implements token blacklisting, standardized handling, and enhanced logging
 */

// In-memory token blacklist (in production, use Redis or database)
const blacklistedTokens = new Set();

// Token encryption/decryption utilities are now imported from utils/tokenEncryption.js

/**
 * Generate a secure short identifier for token logging
 * Uses SHA-256 to create a consistent, non-reversible hash
 */
function generateTokenId(token) {
  if (!token) return null;
  return crypto.createHash('sha256').update(token).digest('hex').substring(0, 8);
}

/**
 * Add a token to the blacklist
 */
export function blacklistToken(token) {
  if (token) {
    blacklistedTokens.add(token);
    logger.info('Token blacklisted', { 
      hasToken: true,
      tokenLength: token.length,
      tokenId: generateTokenId(token),
      blacklistSize: blacklistedTokens.size 
    });
  }
}

/**
 * Check if a token is blacklisted
 */
export function isTokenBlacklisted(token) {
  return blacklistedTokens.has(token);
}

/**
 * Extract token from request headers with validation
 */
export function extractTokenFromRequest(req) {
  const authHeader = req.headers.authorization;
  
  if (!authHeader) {
    return null;
  }
  
  if (!authHeader.startsWith('Bearer ')) {
    logger.warn('Invalid authorization header format', {
      ip: req.ip,
      userAgent: req.get('User-Agent'),
      hasAuth: true,
      authLength: authHeader.length,
      authId: generateTokenId(authHeader)
    });
    return null;
  }
  
  const token = authHeader.substring(7);
  
  // Basic token format validation
  if (!token || token.length < 10) {
    logger.warn('Invalid token format', {
      ip: req.ip,
      userAgent: req.get('User-Agent'),
      tokenLength: token?.length || 0
    });
    return null;
  }
  
  return token;
}

/**
 * Sanitize data for logging to prevent token leakage
 */
export function sanitizeForLogging(data) {
  if (!data || typeof data !== 'object') {
    return data;
  }
  
  const sanitized = { ...data };
  
  // Sanitize token fields with secure identifiers
  if (sanitized.token) {
    sanitized.token = {
      hasToken: true,
      length: sanitized.token.length,
      id: generateTokenId(sanitized.token)
    };
  }
  if (sanitized.access_token) {
    sanitized.access_token = {
      hasToken: true,
      length: sanitized.access_token.length,
      id: generateTokenId(sanitized.access_token)
    };
  }
  if (sanitized.refresh_token) {
    sanitized.refresh_token = {
      hasToken: true,
      length: sanitized.refresh_token.length,
      id: generateTokenId(sanitized.refresh_token)
    };
  }
  if (sanitized.authorization) {
    sanitized.authorization = {
      hasAuth: true,
      length: sanitized.authorization.length,
      id: generateTokenId(sanitized.authorization)
    };
  }
  
  return sanitized;
}

/**
 * Enhanced authentication middleware with security improvements
 */
export async function requireAuth(req, res, next) {
  try {
    // Extract and validate token
    const token = extractTokenFromRequest(req);
    if (!token) {
      logger.warn('Authentication failed: No valid token provided', {
        ip: req.ip,
        userAgent: req.get('User-Agent'),
        endpoint: req.path,
        method: req.method
      });
      logSecurityEvent(SecurityEventTypes.AUTH_FAILURE, 2, {
        reason: 'No token provided',
        endpoint: req.path,
        method: req.method
      }, req);
      return res.status(401).json({ error: 'No token provided' });
    }

    // Check if token is blacklisted
    if (isTokenBlacklisted(token)) {
      logger.warn('Authentication failed: Token is blacklisted', {
        ip: req.ip,
        userAgent: req.get('User-Agent'),
        endpoint: req.path,
        method: req.method,
        hasToken: true,
        tokenLength: token.length,
        tokenId: generateTokenId(token)
      });
      logSecurityEvent(SecurityEventTypes.INVALID_TOKEN, 3, {
        reason: 'Token blacklisted',
        endpoint: req.path,
        method: req.method
      }, req);
      return res.status(401).json({ error: 'Token has been revoked' });
    }

    // Create Supabase client and verify token
    const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_ANON_KEY);
    const { data, error } = await supabase.auth.getUser(token);

    if (error || !data?.user) {
      logger.warn('Authentication failed: Invalid or expired token', {
        ip: req.ip,
        userAgent: req.get('User-Agent'),
        endpoint: req.path,
        method: req.method,
        error: error?.message || 'No user data',
        hasToken: true,
        tokenLength: token.length,
        tokenId: generateTokenId(token)
      });
      return res.status(401).json({ error: 'Invalid or expired token' });
    }

    // Check token expiration explicitly
    const now = Math.floor(Date.now() / 1000);
    if (data.user.exp && data.user.exp < now) {
      logger.warn('Authentication failed: Token expired', {
        ip: req.ip,
        userAgent: req.get('User-Agent'),
        endpoint: req.path,
        method: req.method,
        userId: data.user.id,
        hasToken: true,
        tokenLength: token.length,
        tokenId: generateTokenId(token)
      });
      return res.status(401).json({ error: 'Token has expired' });
    }

    // Add user and token info to request
    req.user = data.user;
    req.token = token;

    // Log successful authentication
    logger.info('Authentication successful', {
      userId: data.user.id,
      email: data.user.email,
      ip: req.ip,
      endpoint: req.path,
      method: req.method,
      hasToken: true,
      tokenLength: token.length,
      tokenId: generateTokenId(token)
    });

    next();
  } catch (error) {
    logger.error('Authentication error:', {
      error: error.message,
      ip: req.ip,
      userAgent: req.get('User-Agent'),
      endpoint: req.path,
      method: req.method
    });
    return res.status(500).json({ error: 'Authentication service error' });
  }
}

/**
 * Enhanced JWT verification utility
 */
export async function verifyJwt(token) {
  try {
    // Check if token is blacklisted
    if (isTokenBlacklisted(token)) {
      throw new Error('Token has been revoked');
    }

    const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_ANON_KEY);
    const { data, error } = await supabase.auth.getUser(token);
    
    if (error || !data?.user) {
      throw new Error('Invalid or expired token');
    }

    // Check token expiration
    const now = Math.floor(Date.now() / 1000);
    if (data.user.exp && data.user.exp < now) {
      throw new Error('Token has expired');
    }

    return data.user;
  } catch (error) {
    logger.error('JWT verification failed:', {
      error: error.message,
      hasToken: !!token,
      tokenLength: token?.length || 0,
      tokenId: generateTokenId(token)
    });
    throw new Error('JWT verification failed');
  }
}

/**
 * Logout handler that blacklists the token
 */
export function handleLogout(req, res) {
  try {
    const token = extractTokenFromRequest(req);
    if (token) {
      blacklistToken(token);
    }
    
    logger.info('User logged out', {
      userId: req.user?.id,
      ip: req.ip,
      hasToken: !!token,
      tokenLength: token?.length || 0,
      tokenId: generateTokenId(token)
    });
    
    res.json({ message: 'Logged out successfully' });
  } catch (error) {
    logger.error('Logout error:', error);
    res.status(500).json({ error: 'Logout failed' });
  }
}

/**
 * Get blacklist statistics (for monitoring)
 */
export function getBlacklistStats() {
  return {
    size: blacklistedTokens.size,
    tokens: Array.from(blacklistedTokens).map(token => ({
      hasToken: true,
      length: token.length,
      id: generateTokenId(token)
    }))
  };
}

export default {
  requireAuth,
  verifyJwt,
  blacklistToken,
  isTokenBlacklisted,
  extractTokenFromRequest,
  sanitizeForLogging,
  handleLogout,
  getBlacklistStats
};

