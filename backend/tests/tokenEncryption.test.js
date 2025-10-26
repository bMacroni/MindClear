import { describe, it, expect, beforeEach, vi } from 'vitest';
import { 
  encryptToken, 
  decryptToken, 
  encryptGoogleTokens, 
  decryptGoogleTokens, 
  safeDecryptToken,
  isEncrypted,
  InvalidTokenFormatError 
} from '../src/utils/tokenEncryption.js';

// Mock the logger to avoid console output during tests
vi.mock('../src/utils/logger.js', () => ({
  default: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn()
  }
}));

// Mock environment variable
const originalEnv = process.env.ENCRYPTION_KEY;

describe('Token Encryption Security Tests', () => {
  beforeEach(() => {
    // Set up test environment
    process.env.ENCRYPTION_KEY = 'test-encryption-key-for-testing-only';
  });

  afterEach(() => {
    // Restore original environment
    process.env.ENCRYPTION_KEY = originalEnv;
  });

  describe('decryptToken - Security Fix Tests', () => {
    it('should throw InvalidTokenFormatError for tokens with wrong number of parts', () => {
      const invalidTokens = [
        'part1', // 1 part
        'part1:part2', // 2 parts
        'part1:part2:part3:part4', // 4 parts
        'part1:part2:part3:part4:part5' // 5 parts
      ];

      invalidTokens.forEach((token, index) => {
        expect(() => decryptToken(token)).toThrow(InvalidTokenFormatError);
        expect(() => decryptToken(token)).toThrow(`expected 3 parts separated by colons, got ${token.split(':').length}`);
      });
    });

    it('should throw InvalidTokenFormatError for tokens with colons but invalid format', () => {
      const invalidFormattedTokens = [
        'invalid:format:token', // Not hex format
        '123:456:789', // Not proper hex
        'abc:def:ghi', // Not proper hex
        '::', // Empty parts
        'part1::part3', // Empty middle part
        ':part2:part3', // Empty first part
        'part1:part2:' // Empty last part
      ];

      invalidFormattedTokens.forEach((token) => {
        expect(() => decryptToken(token)).toThrow();
      });
    });

    it('should return original token for legacy unencrypted tokens (no colons)', () => {
      const legacyTokens = [
        'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIiwibmFtZSI6IkpvaG4gRG9lIiwiaWF0IjoxNTE2MjM5MDIyfQ.SflKxwRJSMeKKF2QT4fwpMeJf36POk6yJV_adQssw5c',
        'simple-token-without-colons',
        'another.legacy.token'
      ];

      legacyTokens.forEach((token) => {
        expect(decryptToken(token)).toBe(token);
      });
    });

    it('should successfully decrypt properly formatted encrypted tokens', () => {
      const originalToken = 'test-token-to-encrypt';
      const encryptedToken = encryptToken(originalToken);
      
      expect(encryptedToken).toMatch(/^[0-9a-f]+:[0-9a-f]+:[0-9a-f]+$/i);
      expect(decryptToken(encryptedToken)).toBe(originalToken);
    });

    it('should throw error for null or undefined input', () => {
      expect(() => decryptToken(null)).toThrow();
      expect(() => decryptToken(undefined)).toThrow();
    });

    it('should throw error for empty string input', () => {
      expect(() => decryptToken('')).toThrow();
    });
  });

  describe('decryptGoogleTokens - Security Fix Tests', () => {
    it('should throw error when access_token has invalid format', () => {
      const invalidTokens = {
        access_token: 'invalid:format',
        refresh_token: 'valid:refresh:token'
      };

      expect(() => decryptGoogleTokens(invalidTokens)).toThrow();
    });

    it('should throw error when refresh_token has invalid format', () => {
      const invalidTokens = {
        access_token: 'valid:access:token',
        refresh_token: 'invalid:format'
      };

      expect(() => decryptGoogleTokens(invalidTokens)).toThrow();
    });

    it('should successfully decrypt valid Google tokens', () => {
      const originalTokens = {
        access_token: 'test-access-token',
        refresh_token: 'test-refresh-token',
        token_type: 'Bearer',
        scope: 'calendar.readonly'
      };

      const encryptedTokens = encryptGoogleTokens(originalTokens);
      const decryptedTokens = decryptGoogleTokens(encryptedTokens);

      expect(decryptedTokens.access_token).toBe(originalTokens.access_token);
      expect(decryptedTokens.refresh_token).toBe(originalTokens.refresh_token);
      expect(decryptedTokens.token_type).toBe(originalTokens.token_type);
      expect(decryptedTokens.scope).toBe(originalTokens.scope);
    });

    it('should return null for null input', () => {
      expect(decryptGoogleTokens(null)).toBeNull();
    });
  });

  describe('safeDecryptToken - Security Fix Tests', () => {
    it('should throw InvalidTokenFormatError for malformed encrypted tokens', () => {
      const malformedTokens = [
        'invalid:format',
        'part1:part2',
        'part1:part2:part3:part4'
      ];

      malformedTokens.forEach((token) => {
        expect(() => safeDecryptToken(token)).toThrow(InvalidTokenFormatError);
      });
    });

    it('should return original token for legacy unencrypted tokens', () => {
      const legacyTokens = [
        'legacy-token-without-colons',
        'another.legacy.token'
      ];

      legacyTokens.forEach((token) => {
        expect(safeDecryptToken(token)).toBe(token);
      });
    });

    it('should successfully decrypt properly formatted encrypted tokens', () => {
      const originalToken = 'test-token-for-safe-decrypt';
      const encryptedToken = encryptToken(originalToken);
      
      expect(safeDecryptToken(encryptedToken)).toBe(originalToken);
    });

    it('should return null for null input', () => {
      expect(safeDecryptToken(null)).toBeNull();
    });
  });

  describe('InvalidTokenFormatError Class', () => {
    it('should create error with proper properties', () => {
      const error = new InvalidTokenFormatError('Test message', 100, 2);
      
      expect(error.name).toBe('InvalidTokenFormatError');
      expect(error.message).toBe('Test message');
      expect(error.tokenLength).toBe(100);
      expect(error.partsCount).toBe(2);
      expect(error instanceof Error).toBe(true);
    });
  });

  describe('isEncrypted Function', () => {
    it('should correctly identify encrypted tokens', () => {
      const originalToken = 'test-token';
      const encryptedToken = encryptToken(originalToken);
      
      expect(isEncrypted(encryptedToken)).toBe(true);
    });

    it('should correctly identify unencrypted tokens', () => {
      const unencryptedTokens = [
        'simple-token',
        'token.with.dots',
        'token-with-dashes',
        'token_with_underscores'
      ];

      unencryptedTokens.forEach((token) => {
        expect(isEncrypted(token)).toBe(false);
      });
    });

    it('should return false for invalid inputs', () => {
      expect(isEncrypted(null)).toBe(false);
      expect(isEncrypted(undefined)).toBe(false);
      expect(isEncrypted('')).toBe(false);
      expect(isEncrypted(123)).toBe(false);
    });
  });

  describe('Integration Tests', () => {
    it('should handle complete encrypt-decrypt cycle securely', () => {
      const sensitiveTokens = [
        'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIiwibmFtZSI6IkpvaG4gRG9lIiwiaWF0IjoxNTE2MjM5MDIyfQ.SflKxwRJSMeKKF2QT4fwpMeJf36POk6yJV_adQssw5c',
        'ya29.a0AfH6SMC...',
        '1//0Gv...',
        'simple-access-token'
      ];

      sensitiveTokens.forEach((token) => {
        const encrypted = encryptToken(token);
        const decrypted = decryptToken(encrypted);
        expect(decrypted).toBe(token);
      });
    });

    it('should fail securely when token is corrupted during transmission', () => {
      const originalToken = 'test-token';
      const encryptedToken = encryptToken(originalToken);
      
      // Simulate corruption by modifying the encrypted token
      const corruptedTokens = [
        encryptedToken.substring(0, encryptedToken.length - 1), // Remove last character
        encryptedToken + 'x', // Add extra character
        encryptedToken.replace(':', 'x'), // Replace colon with x
        encryptedToken.replace(/[0-9a-f]/i, 'z') // Replace hex character
      ];

      corruptedTokens.forEach((corruptedToken) => {
        expect(() => decryptToken(corruptedToken)).toThrow();
      });
    });
  });
});
