/**
 * Test cases for AuthService token refresh functionality
 * Tests the fixes for the 15-minute re-authentication issue
 */

import { authService } from '../services/auth';
import { secureStorage } from '../services/secureStorage';
import { apiFetch } from '../services/apiService';

// Mock dependencies
jest.mock('../services/secureStorage');
jest.mock('../services/apiService');
jest.mock('jwt-decode');

const mockSecureStorage = secureStorage as jest.Mocked<typeof secureStorage>;
const mockApiFetch = apiFetch as jest.MockedFunction<typeof apiFetch>;

describe('AuthService Token Refresh', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    // Reset auth service state
    (authService as any).authState = {
      user: null,
      token: null,
      isLoading: true,
      isAuthenticated: false,
    };
    (authService as any).refreshTimer = null;
    (authService as any).refreshPromise = null;
  });

  describe('getAuthToken() with automatic refresh', () => {
    it('should attempt token refresh when token is expired', async () => {
      // Mock expired token
      const expiredToken = 'expired.token.here';
      const newToken = 'new.valid.token';
      const refreshToken = 'valid.refresh.token';
      const user = { id: '1', email: 'test@example.com' };

      // Mock secure storage
      mockSecureStorage.get.mockImplementation((key) => {
        if (key === 'auth_token') return Promise.resolve(expiredToken);
        if (key === 'auth_refresh_token') return Promise.resolve(refreshToken);
        if (key === 'auth_user') return Promise.resolve(JSON.stringify(user));
        return Promise.resolve(null);
      });

      // Mock successful refresh response
      mockApiFetch.mockResolvedValue({
        ok: true,
        status: 200,
        data: {
          access_token: newToken,
          refresh_token: 'new.refresh.token',
          user: user
        }
      });

      // Mock jwt-decode to simulate expired token
      const mockJwtDecode = require('jwt-decode');
      mockJwtDecode.mockImplementation((token: string) => {
        if (token === expiredToken) {
          return { exp: Math.floor(Date.now() / 1000) - 100 }; // Expired 100 seconds ago
        }
        if (token === newToken) {
          return { exp: Math.floor(Date.now() / 1000) + 3600 }; // Valid for 1 hour
        }
        return null;
      });

      // Call getAuthToken
      const result = await authService.getAuthToken();

      // Verify refresh was attempted
      expect(mockApiFetch).toHaveBeenCalledWith('/auth/refresh', {
        method: 'POST',
        body: JSON.stringify({ refresh_token: refreshToken }),
      }, 15000);

      // Verify new token is returned
      expect(result).toBe(newToken);
    });

    it('should logout user when refresh fails', async () => {
      const expiredToken = 'expired.token.here';
      const refreshToken = 'invalid.refresh.token';

      // Mock secure storage
      mockSecureStorage.get.mockImplementation((key) => {
        if (key === 'auth_token') return Promise.resolve(expiredToken);
        if (key === 'auth_refresh_token') return Promise.resolve(refreshToken);
        return Promise.resolve(null);
      });

      // Mock failed refresh response
      mockApiFetch.mockResolvedValue({
        ok: false,
        status: 401,
        data: { error: 'Invalid refresh token' }
      });

      // Mock jwt-decode for expired token
      const mockJwtDecode = require('jwt-decode');
      mockJwtDecode.mockReturnValue({ exp: Math.floor(Date.now() / 1000) - 100 });

      // Call getAuthToken
      const result = await authService.getAuthToken();

      // Verify refresh was attempted
      expect(mockApiFetch).toHaveBeenCalledWith('/auth/refresh', {
        method: 'POST',
        body: JSON.stringify({ refresh_token: refreshToken }),
      }, 15000);

      // Verify user is logged out (token cleared)
      expect(result).toBeNull();
      expect(mockSecureStorage.multiRemove).toHaveBeenCalledWith([
        'auth_token', 'auth_user', 'authToken', 'authUser'
      ]);
    });
  });

  describe('apiFetch() with 401 handling', () => {
    it('should retry request after successful token refresh on 401', async () => {
      const expiredToken = 'expired.token.here';
      const newToken = 'new.valid.token';
      const refreshToken = 'valid.refresh.token';
      const user = { id: '1', email: 'test@example.com' };

      // Mock secure storage
      mockSecureStorage.get.mockImplementation((key) => {
        if (key === 'auth_token') return Promise.resolve(expiredToken);
        if (key === 'auth_refresh_token') return Promise.resolve(refreshToken);
        if (key === 'auth_user') return Promise.resolve(JSON.stringify(user));
        return Promise.resolve(null);
      });

      // Mock jwt-decode
      const mockJwtDecode = require('jwt-decode');
      mockJwtDecode.mockImplementation((token: string) => {
        if (token === expiredToken) {
          return { exp: Math.floor(Date.now() / 1000) - 100 };
        }
        if (token === newToken) {
          return { exp: Math.floor(Date.now() / 1000) + 3600 };
        }
        return null;
      });

      // Mock fetch to return 401 first, then success
      const mockFetch = jest.fn()
        .mockResolvedValueOnce({
          status: 401,
          text: () => Promise.resolve('{"error": "Unauthorized"}')
        })
        .mockResolvedValueOnce({
          status: 200,
          text: () => Promise.resolve('{"data": "success"}')
        });

      global.fetch = mockFetch;

      // Mock successful refresh
      mockApiFetch.mockResolvedValue({
        ok: true,
        status: 200,
        data: {
          access_token: newToken,
          refresh_token: 'new.refresh.token',
          user: user
        }
      });

      // Import apiFetch after mocking
      const { apiFetch: testApiFetch } = await import('../services/apiService');

      // Call apiFetch
      const result = await testApiFetch('/test-endpoint');

      // Verify refresh was attempted
      expect(mockApiFetch).toHaveBeenCalledWith('/auth/refresh', {
        method: 'POST',
        body: JSON.stringify({ refresh_token: refreshToken }),
      }, 15000);

      // Verify request was retried
      expect(mockFetch).toHaveBeenCalledTimes(2);

      // Verify success response
      expect(result.ok).toBe(true);
      expect(result.status).toBe(200);
    });
  });

  describe('Background token refresh', () => {
    beforeEach(() => {
      jest.useFakeTimers();
    });

    afterEach(() => {
      jest.useRealTimers();
    });

    it('should start background refresh timer on successful login', async () => {
      const token = 'valid.token';
      const refreshToken = 'valid.refresh.token';
      const user = { id: '1', email: 'test@example.com' };

      // Mock jwt-decode for valid token
      const mockJwtDecode = require('jwt-decode');
      mockJwtDecode.mockReturnValue({ exp: Math.floor(Date.now() / 1000) + 3600 });

      // Mock secure storage
      mockSecureStorage.set.mockResolvedValue(undefined);

      // Mock successful refresh for background timer
      mockApiFetch.mockResolvedValue({
        ok: true,
        status: 200,
        data: {
          access_token: 'new.token',
          refresh_token: 'new.refresh.token',
          user: user
        }
      });

      // Set session (simulates login)
      await authService.setSession(token, user, refreshToken);

      // Verify timer was started
      expect(setTimeout).toHaveBeenCalledWith(expect.any(Function), 55 * 60 * 1000);

      // Fast-forward time to trigger background refresh
      jest.advanceTimersByTime(55 * 60 * 1000);

      // Wait for async operations
      await Promise.resolve();

      // Verify refresh was called
      expect(mockApiFetch).toHaveBeenCalledWith('/auth/refresh', {
        method: 'POST',
        body: JSON.stringify({ refresh_token: refreshToken }),
      }, 15000);
    });

    it('should stop background refresh timer on logout', async () => {
      const token = 'valid.token';
      const user = { id: '1', email: 'test@example.com' };

      // Mock jwt-decode
      const mockJwtDecode = require('jwt-decode');
      mockJwtDecode.mockReturnValue({ exp: Math.floor(Date.now() / 1000) + 3600 });

      // Mock secure storage
      mockSecureStorage.set.mockResolvedValue(undefined);
      mockSecureStorage.multiRemove.mockResolvedValue(undefined);

      // Set session
      await authService.setSession(token, user);

      // Verify timer was started
      expect(setTimeout).toHaveBeenCalled();

      // Logout
      await authService.logout();

      // Verify timer was cleared
      expect(clearTimeout).toHaveBeenCalled();
    });
  });

  describe('Refresh token queue', () => {
    it('should prevent multiple simultaneous refresh attempts', async () => {
      const expiredToken = 'expired.token.here';
      const refreshToken = 'valid.refresh.token';
      const user = { id: '1', email: 'test@example.com' };

      // Mock secure storage
      mockSecureStorage.get.mockImplementation((key) => {
        if (key === 'auth_token') return Promise.resolve(expiredToken);
        if (key === 'auth_refresh_token') return Promise.resolve(refreshToken);
        if (key === 'auth_user') return Promise.resolve(JSON.stringify(user));
        return Promise.resolve(null);
      });

      // Mock jwt-decode for expired token
      const mockJwtDecode = require('jwt-decode');
      mockJwtDecode.mockReturnValue({ exp: Math.floor(Date.now() / 1000) - 100 });

      // Mock slow refresh response
      let resolveRefresh: (value: any) => void;
      const refreshPromise = new Promise((resolve) => {
        resolveRefresh = resolve;
      });

      mockApiFetch.mockReturnValue(refreshPromise as any);

      // Start multiple refresh attempts simultaneously
      const promise1 = authService.refreshToken();
      const promise2 = authService.refreshToken();
      const promise3 = authService.refreshToken();

      // Resolve the refresh
      resolveRefresh!({
        ok: true,
        status: 200,
        data: {
          access_token: 'new.token',
          refresh_token: 'new.refresh.token',
          user: user
        }
      });

      // Wait for all promises
      const [result1, result2, result3] = await Promise.all([promise1, promise2, promise3]);

      // Verify all returned the same result
      expect(result1).toBe(true);
      expect(result2).toBe(true);
      expect(result3).toBe(true);

      // Verify refresh was only called once
      expect(mockApiFetch).toHaveBeenCalledTimes(1);
    });
  });
});

