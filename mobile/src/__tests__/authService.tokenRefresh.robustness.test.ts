/**
 * Comprehensive test cases for AuthService token refresh robustness improvements
 * Tests all phases of the token refresh fix:
 * - Initialization race condition
 * - Retry logic with exponential backoff
 * - Background refresh persistence
 * - Token expiry logic
 * - Refresh token validation
 * - Error handling
 */

import { authService } from '../services/auth';
import { secureStorage } from '../services/secureStorage';
import { apiFetch } from '../services/apiService';
import { jwtDecode } from 'jwt-decode';

// Unmock auth service to test the real implementation
jest.unmock('../services/auth');

// Mock react-native-encrypted-storage first
jest.mock('react-native-encrypted-storage', () => ({
  __esModule: true,
  default: {
    setItem: jest.fn(() => Promise.resolve()),
    getItem: jest.fn(() => Promise.resolve(null)),
    removeItem: jest.fn(() => Promise.resolve()),
    clear: jest.fn(() => Promise.resolve()),
  },
}));

// Mock dependencies
jest.mock('../services/secureStorage');
jest.mock('../services/apiService');
jest.mock('jwt-decode');
jest.mock('../services/storageMigration', () => ({
  AndroidStorageMigrationService: {
    checkMigrationNeeded: jest.fn(() => Promise.resolve(false)),
    migrateAuthData: jest.fn(() => Promise.resolve({ success: true, errors: [] })),
  },
}));
jest.mock('../services/supabaseClient', () => ({
  __esModule: true,
  default: jest.fn(() => ({
    auth: {
      signUp: jest.fn(),
    },
  })),
}));
jest.mock('../services/config', () => ({
  configService: {
    getMindClearConfirmUri: jest.fn(() => 'https://example.com/confirm'),
  },
}));
jest.mock('../utils/logger', () => ({
  __esModule: true,
  default: {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
  },
}));

const mockSecureStorage = secureStorage as jest.Mocked<typeof secureStorage>;
const mockApiFetch = apiFetch as jest.MockedFunction<typeof apiFetch>;
const mockJwtDecode = jwtDecode as jest.MockedFunction<typeof jwtDecode>;

// Helper to create a token with specific expiry
function createToken(expirySeconds: number): string {
  const exp = Math.floor(Date.now() / 1000) + expirySeconds;
  return `token.${exp}`;
}

// Track all mocked tokens
const mockedTokens: Map<string, any> = new Map();

// Helper to mock JWT decode for a token
function mockTokenDecode(token: string, expiryOffset: number = 0) {
  const exp = expiryOffset > 0 
    ? Math.floor(Date.now() / 1000) + expiryOffset 
    : Math.floor(Date.now() / 1000) - 100; // Default expired
  mockedTokens.set(token, { exp, sub: 'user123', email: 'test@example.com' });
  
  // Update mock implementation to check all mocked tokens
  mockJwtDecode.mockImplementation((t: string) => {
    const decoded = mockedTokens.get(t);
    if (decoded) {
      return decoded;
    }
    // Fallback: try to extract exp from token string if it's in format "token.{exp}"
    const match = t.match(/^token\.(\d+)$/);
    if (match) {
      const exp = parseInt(match[1], 10);
      return { exp, sub: 'user123', email: 'test@example.com' };
    }
    return null;
  });
}

describe('AuthService Token Refresh Robustness', () => {
  const mockUser = { id: '1', email: 'test@example.com' };

  beforeEach(() => {
    jest.clearAllMocks();
    jest.useFakeTimers();
    
    // Clear mocked tokens
    mockedTokens.clear();
    
    // Spy on setTimeout for timer-related tests
    jest.spyOn(global, 'setTimeout');
    jest.spyOn(global, 'clearTimeout');
    
    // Reset auth service state
    const service = authService as any;
    service.authState = {
      user: null,
      token: null,
      isLoading: true,
      isAuthenticated: false,
    };
    service.initialized = false;
    service.initPromise = null;
    service.refreshTimer = null;
    service.refreshPromise = null;
    
    // Default secure storage mocks
    mockSecureStorage.get.mockResolvedValue(null);
    mockSecureStorage.set.mockResolvedValue(undefined);
    mockSecureStorage.multiRemove.mockResolvedValue(undefined);
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  describe('Phase 1: Initialization Race Condition', () => {
    it('should wait for initialization before returning null in getAuthToken()', async () => {
      const validToken = createToken(3600); // Valid for 1 hour
      mockTokenDecode(validToken, 3600);
      
      mockSecureStorage.get.mockImplementation((key) => {
        if (key === 'auth_token') return Promise.resolve(validToken);
        if (key === 'auth_user') return Promise.resolve(JSON.stringify(mockUser));
        return Promise.resolve(null);
      });

      // Start initialization (async)
      const service = authService as any;
      service.initializeAuth();

      // Immediately call getAuthToken() before initialization completes
      const tokenPromise = authService.getAuthToken();

      // Fast-forward time to allow initialization to complete
      await jest.runAllTimersAsync();

      // Should wait for initialization and return token
      const token = await tokenPromise;
      expect(token).toBe(validToken);
      expect(service.initialized).toBe(true);
    });

    it('should attempt refresh during initialization if token is expired', async () => {
      const expiredToken = createToken(-100);
      const newToken = createToken(3600);
      const refreshToken = 'refresh.token';
      
      mockTokenDecode(expiredToken, -100);
      mockTokenDecode(newToken, 3600);

      mockSecureStorage.get.mockImplementation((key) => {
        if (key === 'auth_token') return Promise.resolve(expiredToken);
        if (key === 'auth_refresh_token') return Promise.resolve(refreshToken);
        if (key === 'auth_user') return Promise.resolve(JSON.stringify(mockUser));
        return Promise.resolve(null);
      });

      mockApiFetch.mockResolvedValue({
        ok: true,
        status: 200,
        data: {
          access_token: newToken,
          refresh_token: 'new.refresh.token',
          user: mockUser,
        },
      });

      // Start initialization
      const service = authService as any;
      await service.initializeAuth();

      // Verify refresh was attempted
      expect(mockApiFetch).toHaveBeenCalledWith(
        '/auth/refresh',
        expect.objectContaining({
          method: 'POST',
          body: expect.stringContaining(refreshToken),
        }),
        15000
      );

      // Verify new token is stored
      expect(service.authState.token).toBe(newToken);
    });

    it('should handle getAuthToken() called during initialization with expired token', async () => {
      const expiredToken = createToken(-100);
      const newToken = createToken(3600);
      const refreshToken = 'refresh.token';
      
      mockTokenDecode(expiredToken, -100);
      mockTokenDecode(newToken, 3600);

      mockSecureStorage.get.mockImplementation((key) => {
        if (key === 'auth_token') return Promise.resolve(expiredToken);
        if (key === 'auth_refresh_token') return Promise.resolve(refreshToken);
        if (key === 'auth_user') return Promise.resolve(JSON.stringify(mockUser));
        return Promise.resolve(null);
      });

      // Resolve refresh immediately (no delay)
      mockApiFetch.mockResolvedValue({
        ok: true,
        status: 200,
        data: {
          access_token: newToken,
          refresh_token: 'new.refresh.token',
          user: mockUser,
        },
      });

      // Start initialization
      const service = authService as any;
      // Mock startBackgroundRefresh to avoid long timers
      const originalStartBackgroundRefresh = service.startBackgroundRefresh.bind(service);
      service.startBackgroundRefresh = jest.fn(() => {
        // Do nothing - prevent timer from being set
      });
      
      const initPromise = service.initializeAuth();

      // Call getAuthToken() during initialization
      const tokenPromise = authService.getAuthToken();
      
      // Advance timers in small increments to allow timeouts to work
      // but not so much that we trigger long background refresh timers
      let advanced = 0;
      while (advanced < 6000 && !service.initialized) {
        await jest.advanceTimersByTimeAsync(100);
        advanced += 100;
      }
      
      // Wait for both to complete
      await Promise.all([initPromise, tokenPromise]);

      // Should have waited and returned new token
      const token = await tokenPromise;
      expect(token).toBe(newToken);
      
      // Restore original method
      service.startBackgroundRefresh = originalStartBackgroundRefresh;
    }, 15000);
  });

  describe('Phase 2: Retry Logic', () => {
    it('should retry on network errors with exponential backoff', async () => {
      const expiredToken = createToken(-100);
      const newToken = createToken(3600);
      const refreshToken = 'refresh.token';
      
      mockTokenDecode(expiredToken, -100);
      mockTokenDecode(newToken, 3600);

      const service = authService as any;
      service.authState = {
        user: mockUser,
        token: expiredToken,
        isLoading: false,
        isAuthenticated: true,
      };
      service.initialized = true;

      mockSecureStorage.get.mockImplementation((key) => {
        if (key === 'auth_refresh_token') return Promise.resolve(refreshToken);
        return Promise.resolve(null);
      });

      // First two attempts fail with network error, third succeeds
      mockApiFetch
        .mockResolvedValueOnce({
          ok: false,
          status: 0, // Network error
          data: { error: 'Network error' },
        })
        .mockResolvedValueOnce({
          ok: false,
          status: 0,
          data: { error: 'Network error' },
        })
        .mockResolvedValueOnce({
          ok: true,
          status: 200,
          data: {
            access_token: newToken,
            refresh_token: 'new.refresh.token',
            user: mockUser,
          },
        });

      const refreshPromise = authService.refreshToken();

      // Fast-forward through retries (1s, 2s delays)
      await jest.advanceTimersByTimeAsync(1000);
      await jest.advanceTimersByTimeAsync(2000);

      const result = await refreshPromise;

      expect(result.success).toBe(true);
      expect(mockApiFetch).toHaveBeenCalledTimes(3);
    });

    it('should not retry on auth errors', async () => {
      const expiredToken = createToken(-100);
      const refreshToken = 'invalid.refresh.token';
      
      mockTokenDecode(expiredToken, -100);

      const service = authService as any;
      service.authState = {
        user: mockUser,
        token: expiredToken,
        isLoading: false,
        isAuthenticated: true,
      };
      service.initialized = true;

      mockSecureStorage.get.mockImplementation((key) => {
        if (key === 'auth_refresh_token') return Promise.resolve(refreshToken);
        return Promise.resolve(null);
      });

      // Auth error - should not retry
      mockApiFetch.mockResolvedValue({
        ok: false,
        status: 401,
        data: { error: 'Invalid refresh token' },
      });

      const result = await authService.refreshToken();

      expect(result.success).toBe(false);
      expect(result.error).toBe('auth');
      // Should only be called once (no retries)
      expect(mockApiFetch).toHaveBeenCalledTimes(1);
    });

    it('should not logout on network errors if refresh token exists', async () => {
      const expiredToken = createToken(-100);
      const refreshToken = 'refresh.token';
      
      mockTokenDecode(expiredToken, -100);

      const service = authService as any;
      service.authState = {
        user: mockUser,
        token: expiredToken,
        isLoading: false,
        isAuthenticated: true,
      };
      service.initialized = true;

      mockSecureStorage.get.mockImplementation((key) => {
        if (key === 'auth_refresh_token') return Promise.resolve(refreshToken);
        if (key === 'auth_token') return Promise.resolve(expiredToken);
        return Promise.resolve(null);
      });

      // Network error - should not logout (all retries fail)
      mockApiFetch.mockResolvedValue({
        ok: false,
        status: 0,
        data: { error: 'Network error' },
      });

      const tokenPromise = authService.getAuthToken();
      
      // Advance timers through all retry delays (1s, 2s)
      await jest.advanceTimersByTimeAsync(1000);
      await jest.advanceTimersByTimeAsync(2000);
      
      const token = await tokenPromise;

      // Should return null but not logout
      expect(token).toBeNull();
      // Should not clear auth data
      expect(mockSecureStorage.multiRemove).not.toHaveBeenCalled();
      // Auth state should still be intact
      expect(service.authState.isAuthenticated).toBe(true);
    }, 15000);

    it('should logout only on definitive auth failures', async () => {
      const expiredToken = createToken(-100);
      const refreshToken = 'invalid.refresh.token';
      
      mockTokenDecode(expiredToken, -100);

      const service = authService as any;
      service.authState = {
        user: mockUser,
        token: expiredToken,
        isLoading: false,
        isAuthenticated: true,
      };
      service.initialized = true;

      mockSecureStorage.get.mockImplementation((key) => {
        if (key === 'auth_refresh_token') return Promise.resolve(refreshToken);
        return Promise.resolve(null);
      });

      // Auth error - should logout
      mockApiFetch.mockResolvedValue({
        ok: false,
        status: 401,
        data: { error: 'Invalid refresh token' },
      });

      const token = await authService.getAuthToken();

      expect(token).toBeNull();
      // Should clear auth data on auth failure
      expect(mockSecureStorage.multiRemove).toHaveBeenCalled();
      expect(service.authState.isAuthenticated).toBe(false);
    });
  });

  describe('Phase 3: Background Refresh Persistence', () => {
    it('should refresh proactively if token expiring within 15 minutes on initialization', async () => {
      const expiringToken = createToken(10 * 60); // Expires in 10 minutes
      const newToken = createToken(3600);
      const refreshToken = 'refresh.token';
      
      mockTokenDecode(expiringToken, 10 * 60);
      mockTokenDecode(newToken, 3600);

      mockSecureStorage.get.mockImplementation((key) => {
        if (key === 'auth_token') return Promise.resolve(expiringToken);
        if (key === 'auth_refresh_token') return Promise.resolve(refreshToken);
        if (key === 'auth_user') return Promise.resolve(JSON.stringify(mockUser));
        return Promise.resolve(null);
      });

      mockApiFetch.mockResolvedValue({
        ok: true,
        status: 200,
        data: {
          access_token: newToken,
          refresh_token: 'new.refresh.token',
          user: mockUser,
        },
      });

      const service = authService as any;
      await service.initializeAuth();

      // Should have refreshed proactively
      expect(mockApiFetch).toHaveBeenCalledWith(
        '/auth/refresh',
        expect.objectContaining({
          method: 'POST',
        }),
        15000
      );
    });

    it('should store token expiry timestamp for recovery', async () => {
      const validToken = createToken(3600);
      mockTokenDecode(validToken, 3600);

      mockSecureStorage.get.mockImplementation((key) => {
        if (key === 'auth_token') return Promise.resolve(validToken);
        if (key === 'auth_user') return Promise.resolve(JSON.stringify(mockUser));
        return Promise.resolve(null);
      });

      const service = authService as any;
      await service.initializeAuth();

      // Should store expiry timestamp
      expect(mockSecureStorage.set).toHaveBeenCalledWith(
        'auth_token_expiry',
        expect.any(String)
      );
    });

    it('should recover background refresh timer from stored expiry after app kill', async () => {
      const futureExpiry = Date.now() + (20 * 60 * 1000); // 20 minutes from now
      const storedExpiry = futureExpiry.toString();

      mockSecureStorage.get.mockImplementation((key) => {
        if (key === 'auth_token_expiry') return Promise.resolve(storedExpiry);
        if (key === 'auth_refresh_token') return Promise.resolve('refresh.token');
        return Promise.resolve(null);
      });

      const service = authService as any;
      service.authState = {
        user: mockUser,
        token: null, // Token not in memory (app was killed)
        isLoading: false,
        isAuthenticated: true,
      };
      service.initialized = true;

      mockApiFetch.mockResolvedValue({
        ok: true,
        status: 200,
        data: {
          access_token: createToken(3600),
          refresh_token: 'new.refresh.token',
          user: mockUser,
        },
      });

      // Try to recover background refresh
      await service.recoverBackgroundRefreshFromStorage();

      // Should schedule refresh based on stored expiry (20 min - 15 min buffer = 5 min)
      expect(setTimeout).toHaveBeenCalled();
      const timeoutCall = (setTimeout as unknown as jest.Mock).mock.calls.find(
        (call: any[]) => call[1] > 0
      );
      expect(timeoutCall).toBeDefined();
      // Should be approximately 5 minutes (20 - 15 buffer)
      expect(timeoutCall[1]).toBeGreaterThan(4 * 60 * 1000);
      expect(timeoutCall[1]).toBeLessThan(6 * 60 * 1000);
    });

    it('should use 15-minute buffer for background refresh', async () => {
      const validToken = createToken(3600); // 1 hour
      mockTokenDecode(validToken, 3600);

      const service = authService as any;
      service.authState = {
        user: mockUser,
        token: validToken,
        isLoading: false,
        isAuthenticated: true,
      };
      service.initialized = true;

      mockSecureStorage.get.mockResolvedValue(null);

      // Clear any previous setTimeout calls
      (setTimeout as unknown as jest.Mock).mockClear();
      
      service.startBackgroundRefresh();

      // Should schedule refresh 15 minutes before expiry (60 min - 15 min = 45 min)
      expect(setTimeout).toHaveBeenCalled();
      const timeoutCalls = (setTimeout as unknown as jest.Mock).mock.calls;
      // Find the call with the refresh interval (should be the largest timeout)
      const refreshCall = timeoutCalls.find((call: any[]) => call[1] > 40 * 60 * 1000);
      expect(refreshCall).toBeDefined();
      // Should be approximately 45 minutes
      expect(refreshCall![1]).toBeGreaterThan(44 * 60 * 1000);
      expect(refreshCall![1]).toBeLessThan(46 * 60 * 1000);
    });
  });

  describe('Phase 4: Token Expiry Logic', () => {
    it('should use helper functions for consistent expiry calculation', async () => {
      const validToken = createToken(3600);
      mockTokenDecode(validToken, 3600);

      const service = authService as any;
      service.authState = {
        user: mockUser,
        token: validToken,
        isLoading: false,
        isAuthenticated: true,
      };
      service.initialized = true;

      const token = await authService.getAuthToken();
      expect(token).toBe(validToken);
      
      // Verify JWT decode was called correctly
      expect(mockJwtDecode).toHaveBeenCalledWith(validToken);
    });

    it('should check if token is expiring soon using threshold', async () => {
      // Create token that expires in 10 minutes (600 seconds)
      const expiringToken = createToken(10 * 60); // 10 minutes
      const newToken = createToken(3600);
      const refreshToken = 'refresh.token';
      
      // Mock decode to return exp 10 minutes from now
      mockTokenDecode(expiringToken, 10 * 60);
      mockTokenDecode(newToken, 3600);

      const service = authService as any;
      service.authState = {
        user: mockUser,
        token: expiringToken,
        isLoading: false,
        isAuthenticated: true,
      };
      service.initialized = true;

      mockSecureStorage.get.mockImplementation((key) => {
        if (key === 'auth_refresh_token') return Promise.resolve(refreshToken);
        return Promise.resolve(null);
      });

      mockApiFetch.mockResolvedValue({
        ok: true,
        status: 200,
        data: {
          access_token: newToken,
          refresh_token: 'new.refresh.token',
          user: mockUser,
        },
      });

      // checkAndRefreshTokenIfNeeded should refresh if expiring within 15 minutes
      // Token expires in 10 minutes, which is within the 15-minute threshold
      const result = await authService.checkAndRefreshTokenIfNeeded();
      
      // Should return true if refresh succeeded
      expect(result).toBe(true);
      expect(mockApiFetch).toHaveBeenCalled();
    });
  });

  describe('Phase 5: Refresh Token Validation', () => {
    it('should validate refresh token before attempting refresh', async () => {
      const expiredToken = createToken(-100);
      mockTokenDecode(expiredToken, -100);

      const service = authService as any;
      service.authState = {
        user: mockUser,
        token: expiredToken,
        isLoading: false,
        isAuthenticated: true,
      };
      service.initialized = true;

      // No refresh token
      mockSecureStorage.get.mockResolvedValue(null);

      const result = await authService.refreshToken();

      expect(result.success).toBe(false);
      expect(result.error).toBe('auth');
      // Should not call API if no refresh token
      expect(mockApiFetch).not.toHaveBeenCalled();
    });

    it('should handle missing refresh token gracefully', async () => {
      const expiredToken = createToken(-100);
      mockTokenDecode(expiredToken, -100);

      const service = authService as any;
      service.authState = {
        user: mockUser,
        token: expiredToken,
        isLoading: false,
        isAuthenticated: true,
      };
      service.initialized = true;

      mockSecureStorage.get.mockResolvedValue(null);

      const token = await authService.getAuthToken();

      expect(token).toBeNull();
      // Should logout when no refresh token available
      expect(mockSecureStorage.multiRemove).toHaveBeenCalled();
    });
  });

  describe('Phase 6: Comprehensive Error Handling', () => {
    it('should handle consecutive network failures gracefully', async () => {
      const expiredToken = createToken(-100);
      const refreshToken = 'refresh.token';
      
      mockTokenDecode(expiredToken, -100);

      const service = authService as any;
      service.authState = {
        user: mockUser,
        token: expiredToken,
        isLoading: false,
        isAuthenticated: true,
      };
      service.initialized = true;

      mockSecureStorage.get.mockImplementation((key) => {
        if (key === 'auth_refresh_token') return Promise.resolve(refreshToken);
        return Promise.resolve(null);
      });

      // All retries fail with network error
      mockApiFetch.mockResolvedValue({
        ok: false,
        status: 0,
        data: { error: 'Network error' },
      });

      const refreshPromise = authService.refreshToken();
      
      // Advance timers through retry delays (1s, 2s)
      await jest.advanceTimersByTimeAsync(1000);
      await jest.advanceTimersByTimeAsync(2000);
      
      const result = await refreshPromise;

      expect(result.success).toBe(false);
      expect(result.error).toBe('network');
      // Should have retried 3 times
      expect(mockApiFetch).toHaveBeenCalledTimes(3);
      // Should not logout on network errors
      expect(mockSecureStorage.multiRemove).not.toHaveBeenCalled();
    }, 10000);

    it('should handle mixed error types correctly', async () => {
      const expiredToken = createToken(-100);
      const refreshToken = 'refresh.token';
      
      mockTokenDecode(expiredToken, -100);

      const service = authService as any;
      service.authState = {
        user: mockUser,
        token: expiredToken,
        isLoading: false,
        isAuthenticated: true,
      };
      service.initialized = true;

      mockSecureStorage.get.mockImplementation((key) => {
        if (key === 'auth_refresh_token') return Promise.resolve(refreshToken);
        return Promise.resolve(null);
      });

      // First attempt: network error (should retry)
      // Second attempt: auth error (should not retry)
      mockApiFetch
        .mockResolvedValueOnce({
          ok: false,
          status: 0,
          data: { error: 'Network error' },
        })
        .mockResolvedValueOnce({
          ok: false,
          status: 401,
          data: { error: 'Invalid refresh token' },
        });

      const refreshPromise = authService.refreshToken();
      
      // Advance timer through first retry delay (1s)
      await jest.advanceTimersByTimeAsync(1000);
      
      const result = await refreshPromise;

      expect(result.success).toBe(false);
      expect(result.error).toBe('auth');
      // Should stop retrying after auth error
      expect(mockApiFetch).toHaveBeenCalledTimes(2);
    }, 10000);
  });

  describe('Integration: Real-world Scenarios', () => {
    it('should handle app kill and restart scenario', async () => {
      // Simulate app was killed but token still exists in storage (expiring soon)
      const expiringToken = createToken(10 * 60); // 10 minutes
      const storedExpiry = (Date.now() + 10 * 60 * 1000).toString(); // 10 minutes
      const newToken = createToken(3600);
      const refreshToken = 'refresh.token';
      
      mockTokenDecode(expiringToken, 10 * 60);
      mockTokenDecode(newToken, 3600);

      mockSecureStorage.get.mockImplementation((key) => {
        if (key === 'auth_token_expiry') return Promise.resolve(storedExpiry);
        if (key === 'auth_refresh_token') return Promise.resolve(refreshToken);
        if (key === 'auth_token') return Promise.resolve(expiringToken); // Token exists but expiring soon
        if (key === 'auth_user') return Promise.resolve(JSON.stringify(mockUser));
        return Promise.resolve(null);
      });

      mockApiFetch.mockResolvedValue({
        ok: true,
        status: 200,
        data: {
          access_token: newToken,
          refresh_token: 'new.refresh.token',
          user: mockUser,
        },
      });

      // Initialize (simulating app restart)
      const service = authService as any;
      await service.initializeAuth();

      // Should have refreshed proactively since token is expiring within 15 minutes
      expect(mockApiFetch).toHaveBeenCalled();
      // Should have stored the new token expiry
      expect(mockSecureStorage.set).toHaveBeenCalledWith(
        'auth_token_expiry',
        expect.any(String)
      );
    });

    it('should handle network failure during refresh, then recovery', async () => {
      const expiredToken = createToken(-100);
      const newToken = createToken(3600);
      const refreshToken = 'refresh.token';
      
      mockTokenDecode(expiredToken, -100);
      mockTokenDecode(newToken, 3600);

      const service = authService as any;
      service.authState = {
        user: mockUser,
        token: expiredToken,
        isLoading: false,
        isAuthenticated: true,
      };
      service.initialized = true;

      mockSecureStorage.get.mockImplementation((key) => {
        if (key === 'auth_refresh_token') return Promise.resolve(refreshToken);
        return Promise.resolve(null);
      });

      // First attempt fails (network), second succeeds
      mockApiFetch
        .mockResolvedValueOnce({
          ok: false,
          status: 0,
          data: { error: 'Network error' },
        })
        .mockResolvedValueOnce({
          ok: true,
          status: 200,
          data: {
            access_token: newToken,
            refresh_token: 'new.refresh.token',
            user: mockUser,
          },
        });

      const refreshPromise = authService.refreshToken();
      
      // Fast-forward through first retry delay (1s)
      await jest.advanceTimersByTimeAsync(1000);

      const result = await refreshPromise;

      expect(result.success).toBe(true);
      expect(mockApiFetch).toHaveBeenCalledTimes(2);
      expect(service.authState.token).toBe(newToken);
    }, 10000);
  });
});
