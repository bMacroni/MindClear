import { createClient } from '@supabase/supabase-js';
import { createHash } from 'node:crypto';
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
  return createHash('sha256').update(token).digest('hex').substring(0, 8);
}

/**
 * Extract expiration time from JWT payload
 */
function getJwtExp(token) {
  try {
    const [, payload] = token.split('.');
    const claims = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'));
    return typeof claims.exp === 'number' ? claims.exp : null;
  } catch {
    return null;
  }
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
  
  const [scheme, rawToken] = authHeader.split(/\s+/);
  if (!/^Bearer$/i.test(scheme) || !rawToken) {
    logger.warn('Invalid authorization header format', {
      ip: req.ip,
      userAgent: req.get('User-Agent'),
      hasAuth: true,
      authLength: authHeader.length,
      authId: generateTokenId(authHeader)
    });
    return null;
  }
  
  const token = rawToken.trim();
  
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

    // Optional explicit expiration check from JWT payload
    const now = Math.floor(Date.now() / 1000);
    const exp = getJwtExp(token);
    if (exp && exp < now) {
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
    
    // Emit AUTH_SUCCESS to security monitor
    logSecurityEvent(
      SecurityEventTypes.AUTH_SUCCESS,
      1,
      { userId: data.user.id, endpoint: req.path, method: req.method },
      req
    );

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

    // Optional explicit expiration check from JWT
    const now = Math.floor(Date.now() / 1000);
    const exp = getJwtExp(token);
    if (exp && exp < now) {
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
 * Note: This should only be exposed behind authenticated admin/ops routes
 * and ideally disabled by default in production
 */
export function getBlacklistStats() {
  return {
    size: blacklistedTokens.size,
    // Only return counts by default - token details should be admin-only
    // tokens: Array.from(blacklistedTokens).map(token => ({
    //   hasToken: true,
    //   length: token.length,
    //   id: generateTokenId(token)
    // }))
  };
}

/**
 * Get detailed blacklist information (admin-only)
 * This should be feature-flagged and only accessible to authenticated admin users
 */
export function getDetailedBlacklistStats() {
  return {
    size: blacklistedTokens.size,
    tokens: Array.from(blacklistedTokens).map(token => ({
      hasToken: true,
      length: token.length,
      id: generateTokenId(token)
    }))
  };
}

/**
 * Middleware to ensure user has internal/admin privileges
 * Checks if the user has admin privileges for accessing internal endpoints
 */
export async function ensureInternalStaff(req, res, next) {
  try {
    // User should already be authenticated by requireAuth middleware
    if (!req.user || !req.user.id) {
      logger.warn('Authorization failed: User not authenticated', {
        ip: req.ip,
        userAgent: req.get('User-Agent'),
        endpoint: req.path,
        method: req.method
      });
      return res.status(401).json({ error: 'Authentication required' });
    }

    // Create Supabase client with the JWT to access user profile data
    const token = req.token || extractTokenFromRequest(req);
    if (!token) {
      logger.warn('Authorization failed: No token available for profile lookup', {
        ip: req.ip,
        userAgent: req.get('User-Agent'),
        endpoint: req.path,
        method: req.method,
        userId: req.user.id
      });
      return res.status(401).json({ error: 'Authentication token required' });
    }

    const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_ANON_KEY, {
      global: {
        headers: {
          Authorization: `Bearer ${token}`
        }
      }
    });

    // Get user profile data including admin flag
    const { data: userProfile, error } = await supabase
      .from('users')
      .select('is_admin')
      .eq('id', req.user.id)
      .maybeSingle();

    if (error) {
      logger.error('Error fetching user profile for admin check:', {
        error: error.message,
        userId: req.user.id,
        endpoint: req.path,
        method: req.method
      });
      return res.status(500).json({ error: 'Failed to verify user permissions' });
    }
    // Check if user is admin
    if (!userProfile?.is_admin) {
      logger.warn('Authorization failed: User lacks admin privileges', {
        ip: req.ip,
        userAgent: req.get('User-Agent'),
        endpoint: req.path,
        method: req.method,
        userId: req.user.id,
        isAdmin: userProfile?.is_admin || false
      });

      logSecurityEvent(SecurityEventTypes.AUTH_FAILURE, 3, {
        reason: 'Insufficient privileges',
        endpoint: req.path,
        method: req.method,
        userId: req.user.id
      }, req);

      return res.status(403).json({ error: 'Insufficient privileges. Admin access required.' });
    }

    // Add admin flag to user object for convenience
    req.user.is_admin = userProfile.is_admin;

    // Log successful authorization
    logger.info('Admin authorization successful', {
      userId: req.user.id,
      isAdmin: req.user.is_admin,
      endpoint: req.path,
      method: req.method
    });

    next();
  } catch (error) {
    logger.error('Admin authorization error:', {
      error: error.message,
      ip: req.ip,
      userAgent: req.get('User-Agent'),
      endpoint: req.path,
      method: req.method,
      userId: req.user?.id
    });
    return res.status(500).json({ error: 'Authorization service error' });
  }
}

export default {
  requireAuth,
  ensureInternalStaff,
  verifyJwt,
  blacklistToken,
  isTokenBlacklisted,
  extractTokenFromRequest,
  sanitizeForLogging,
  handleLogout,
  getBlacklistStats,
  getDetailedBlacklistStats
};

