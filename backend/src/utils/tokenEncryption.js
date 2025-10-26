import crypto from 'crypto';
import logger from './logger.js';

/**
 * Token Encryption Utility for Secure Database Storage
 * Encrypts sensitive tokens before storing in database
 */

const ALGORITHM = 'aes-256-gcm';

/**
 * Custom error class for invalid token format
 */
export class InvalidTokenFormatError extends Error {
  constructor(message, tokenLength, partsCount) {
    super(message);
    this.name = 'InvalidTokenFormatError';
    this.tokenLength = tokenLength;
    this.partsCount = partsCount;
  }
}

/**
 * Generate a secure encryption key from environment variable
 * Expects ENCRYPTION_KEY to be a 64-character hex string (32 bytes)
 */
function getEncryptionKey() {
  const rawKey = process.env.ENCRYPTION_KEY;
  if (!rawKey) {
    throw new Error('ENCRYPTION_KEY environment variable is required but not set');
  }
  
  // Validate hex string format and length
  if (!/^[0-9a-fA-F]{64}$/.test(rawKey)) {
    throw new Error('ENCRYPTION_KEY must be a 64-character hex string (32 bytes)');
  }
  
  // Convert hex string to Buffer (32 bytes)
  return Buffer.from(rawKey, 'hex');
}

/**
 * Encrypt a token for secure database storage
 * @param {string} token - The token to encrypt
 * @returns {string} - Encrypted token with IV and auth tag
 */
export function encryptToken(token) {
  try {
    if (!token) {
      return null;
    }

    const key = getEncryptionKey();
    const iv = crypto.randomBytes(16);
    const cipher = crypto.createCipheriv(ALGORITHM, key, iv);
    
    let encrypted = cipher.update(token, 'utf8', 'hex');
    encrypted += cipher.final('hex');
    
    const authTag = cipher.getAuthTag();
    
    // Combine IV, auth tag, and encrypted data
    const encryptedToken = `${iv.toString('hex')}:${authTag.toString('hex')}:${encrypted}`;
    
    return encryptedToken;
  } catch (error) {
    logger.error('Token encryption failed:', {
      code: error.code,
      message: error.message
    });
    throw new Error('Token encryption failed');
  }
}

/**
 * Decrypt a token from secure database storage
 * @param {string} encryptedToken - The encrypted token
 * @returns {string} - Decrypted token
 */
export function decryptToken(encryptedToken) {
  try {
    if (!encryptedToken) {
      return null;
    }

    // Check if token is in new encrypted format (contains colons)
    if (!encryptedToken.includes(':')) {
      // Token is in old unencrypted format - return as is
      logger.info('Token is in legacy unencrypted format, returning as-is');
      return encryptedToken;
    }

    const key = getEncryptionKey();
    const parts = encryptedToken.split(':');
    
    if (parts.length !== 3) {
      // Fail securely - do not return potentially corrupted token
      logger.error('Invalid token format detected', {
        tokenLength: encryptedToken.length,
        partsCount: parts.length,
        hasColons: encryptedToken.includes(':')
      });
      throw new InvalidTokenFormatError(
        `Token has invalid format: expected 3 parts separated by colons, got ${parts.length}`,
        encryptedToken.length,
        parts.length
      );
    }
    
    const iv = Buffer.from(parts[0], 'hex');
    const authTag = Buffer.from(parts[1], 'hex');
    const encrypted = parts[2];
    
    const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
    decipher.setAuthTag(authTag);
    
    let decrypted = decipher.update(encrypted, 'hex', 'utf8');
    decrypted += decipher.final('utf8');
    
    return decrypted;
  } catch (error) {
    logger.error('Token decryption failed', {
      name: error.name,
      code: error.code,
      message: error.message,
      tokenLength: encryptedToken?.length || 0
    });
    
    // Re-throw InvalidTokenFormatError to preserve specific error type
    if (error instanceof InvalidTokenFormatError) {
      throw error;
    }
    
    // For other decryption failures, throw a generic error instead of returning original token
    throw new Error(`Token decryption failed: ${error.message}`);
  }
}

/**
 * Encrypt Google tokens object
 * @param {Object} tokens - Google tokens object
 * @returns {Object} - Encrypted tokens object
 */
export function encryptGoogleTokens(tokens) {
  try {
    if (!tokens) {
      return null;
    }

    const encryptedTokens = { ...tokens };
    
    // Encrypt sensitive fields
    if (tokens.access_token) {
      encryptedTokens.access_token = encryptToken(tokens.access_token);
    }
    if (tokens.refresh_token) {
      encryptedTokens.refresh_token = encryptToken(tokens.refresh_token);
    }
    
    return encryptedTokens;
  } catch (error) {
    logger.error('Google tokens encryption failed:', {
      code: error.code,
      message: error.message
    });
    throw new Error('Google tokens encryption failed');
  }
}

/**
 * Check if a token is encrypted (has the expected format)
 * @param {string} token - Token to check
 * @returns {boolean} - True if token appears to be encrypted
 */
export function isEncrypted(token) {
  if (!token || typeof token !== 'string') {
    return false;
  }
  
  // Encrypted tokens have format: iv:authTag:encryptedData
  const parts = token.split(':');
  if (parts.length !== 3) {
    return false;
  }
  
  const [iv, authTag, encrypted] = parts;
  // IV should be 32 hex chars (16 bytes), authTag should be 32 hex chars (16 bytes)
  return iv.length === 32 && /^[0-9a-f]{32}$/i.test(iv) &&
         authTag.length === 32 && /^[0-9a-f]{32}$/i.test(authTag) &&
         encrypted.length > 0 && /^[0-9a-f]+$/i.test(encrypted);
}

/**
 * Decrypt Google tokens object
 * @param {Object} encryptedTokens - Encrypted Google tokens object
 * @returns {Object} - Decrypted tokens object
 */
export function decryptGoogleTokens(encryptedTokens) {
  try {
    if (!encryptedTokens) {
      return null;
    }

    const tokens = { ...encryptedTokens };
    
    // Decrypt sensitive fields
    if (encryptedTokens.access_token) {
      tokens.access_token = decryptToken(encryptedTokens.access_token);
    }
    if (encryptedTokens.refresh_token) {
      tokens.refresh_token = decryptToken(encryptedTokens.refresh_token);
    }
    
    return tokens;
  } catch (error) {
    logger.error('Google tokens decryption failed:', {
      name: error.name,
      code: error.code,
      message: error.message
    });
    throw new Error('Google tokens decryption failed');
  }
}

/**
 * Safely decrypt a token, returning original if not encrypted
 * @param {string} token - Token to decrypt
 * @returns {string} - Decrypted token or original if not encrypted
 */
export function safeDecryptToken(token) {
  try {
    if (!token) {
      return null;
    }
    
    if (isEncrypted(token)) {
      return decryptToken(token);
    }
    
    return token; // Return original if not encrypted
  } catch (error) {
    logger.error('Failed to decrypt token:', {
      error: error.message,
      tokenLength: token?.length || 0,
      isEncrypted: isEncrypted(token)
    });
    
    // For InvalidTokenFormatError, we should fail rather than return potentially corrupted data
    if (error instanceof InvalidTokenFormatError) {
      throw error;
    }
    
    // For other errors, log and return original token (legacy behavior for backward compatibility)
    logger.warn('Decryption failed, returning original token (legacy fallback)');
    return token;
  }
}

/**
 * Safely encrypt a token, returning original if already encrypted
 * @param {string} token - Token to encrypt
 * @returns {string} - Encrypted token or original if already encrypted
 */
export function safeEncryptToken(token) {
  try {
    if (!token) {
      return null;
    }
    
    if (isEncrypted(token)) {
      return token; // Return original if already encrypted
    }
    
    return encryptToken(token);
  } catch (error) {
    logger.warn('Failed to encrypt token, returning original:', error.message);
    return token; // Return original on encryption failure
  }
}

export default {
  encryptToken,
  decryptToken,
  encryptGoogleTokens,
  decryptGoogleTokens,
  isEncrypted,
  safeDecryptToken,
  safeEncryptToken
};

