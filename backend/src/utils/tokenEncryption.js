import crypto from 'crypto';
import logger from './logger.js';

/**
 * Token Encryption Utility for Secure Database Storage
 * Encrypts sensitive tokens before storing in database
 */

const ENCRYPTION_KEY = process.env.ENCRYPTION_KEY;
const ALGORITHM = 'aes-256-gcm';

/**
 * Generate a secure encryption key from environment variable
 */
function getEncryptionKey() {
  if (!ENCRYPTION_KEY) {
    throw new Error('ENCRYPTION_KEY environment variable is required but not set');
  }
  return crypto.scryptSync(ENCRYPTION_KEY, 'salt', 32);
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
    const cipher = crypto.createCipherGCM(ALGORITHM, key, iv);
    
    let encrypted = cipher.update(token, 'utf8', 'hex');
    encrypted += cipher.final('hex');
    
    const authTag = cipher.getAuthTag();
    
    // Combine IV, auth tag, and encrypted data
    return iv.toString('hex') + ':' + authTag.toString('hex') + ':' + encrypted;
  } catch (error) {
    logger.error('Token encryption failed:', error);
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
      // If it has colons but wrong format, might be corrupted - return original
      logger.warn('Token has colons but invalid format, returning original value');
      return encryptedToken;
    }
    
    const iv = Buffer.from(parts[0], 'hex');
    const authTag = Buffer.from(parts[1], 'hex');
    const encrypted = parts[2];
    
    const decipher = crypto.createDecipherGCM(ALGORITHM, key, iv);
    decipher.setAuthTag(authTag);
    
    let decrypted = decipher.update(encrypted, 'hex', 'utf8');
    decrypted += decipher.final('utf8');
    
    return decrypted;
  } catch (error) {
    logger.error('Token decryption failed:', error);
    // If decryption fails, return the original token (might be unencrypted)
    logger.info('Decryption failed, returning original token value');
    return encryptedToken;
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
    logger.error('Google tokens encryption failed:', error);
    throw new Error('Google tokens encryption failed');
  }
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
    logger.error('Google tokens decryption failed:', error);
    throw new Error('Google tokens decryption failed');
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
  return parts.length === 3 && parts.every(part => /^[0-9a-f]+$/i.test(part));
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
    logger.warn('Failed to decrypt token, returning original:', error.message);
    return token; // Return original on decryption failure
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

