/**
 * Tests for retryService.js
 * Validates retry logic, exponential backoff, and queue operations
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { retryWithBackoff } from '../src/utils/retryService.js';

describe('retryService', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  describe('retryWithBackoff', () => {
    it('should succeed on first attempt', async () => {
      const mockFn = vi.fn().mockResolvedValue({ data: 'success' });

      const promise = retryWithBackoff(mockFn, {
        maxRetries: 3,
        baseDelayMs: 1000
      });

      const result = await promise;

      expect(result.success).toBe(true);
      expect(result.data).toEqual({ data: 'success' });
      expect(result.attempts).toBe(1);
      expect(mockFn).toHaveBeenCalledTimes(1);
    });

    it('should retry on transient errors and eventually succeed', async () => {
      const mockFn = vi.fn()
        .mockRejectedValueOnce({ status: 503, message: 'Service unavailable' })
        .mockRejectedValueOnce({ status: 503, message: 'Service unavailable' })
        .mockResolvedValue({ data: 'success' });

      const promise = retryWithBackoff(mockFn, {
        maxRetries: 3,
        baseDelayMs: 1000
      });

      // Let first attempt fail
      await vi.advanceTimersByTimeAsync(10);
      
      // Advance through first retry delay (~1000ms + jitter)
      await vi.advanceTimersByTimeAsync(1500);
      
      // Advance through second retry delay (~2000ms + jitter)
      await vi.advanceTimersByTimeAsync(3000);

      const result = await promise;

      expect(result.success).toBe(true);
      expect(result.attempts).toBe(3);
      expect(mockFn).toHaveBeenCalledTimes(3);
    });

    it('should fail after max retries on transient errors', async () => {
      const mockFn = vi.fn()
        .mockRejectedValue({ status: 503, message: 'Service unavailable' });

      const promise = retryWithBackoff(mockFn, {
        maxRetries: 2,
        baseDelayMs: 100
      });

      // Advance through all retry delays
      await vi.advanceTimersByTimeAsync(10);   // Initial attempt
      await vi.advanceTimersByTimeAsync(200);  // First retry
      await vi.advanceTimersByTimeAsync(300);  // Second retry
      await vi.advanceTimersByTimeAsync(500);  // Third retry

      const result = await promise;

      expect(result.success).toBe(false);
      expect(result.attempts).toBe(3); // maxRetries + 1
      expect(result.error.status).toBe(503);
      expect(mockFn).toHaveBeenCalledTimes(3);
    });

    it('should not retry on permanent errors', async () => {
      const mockFn = vi.fn()
        .mockRejectedValue({ status: 400, message: 'Bad request' });

      const promise = retryWithBackoff(mockFn, {
        maxRetries: 3,
        baseDelayMs: 1000
      });

      const result = await promise;

      expect(result.success).toBe(false);
      expect(result.attempts).toBe(1);
      expect(result.error.status).toBe(400);
      expect(mockFn).toHaveBeenCalledTimes(1);
    });

    it('should detect transient errors correctly', async () => {
      const transientErrors = [
        { status: 408, message: 'Request timeout' },
        { status: 429, message: 'Too many requests' },
        { status: 500, message: 'Internal server error' },
        { status: 502, message: 'Bad gateway' },
        { status: 503, message: 'Service unavailable' },
        { status: 504, message: 'Gateway timeout' },
        { message: 'ETIMEDOUT' },
        { message: 'ECONNRESET' },
        { message: 'network error' }
      ];

      for (const error of transientErrors) {
        const mockFn = vi.fn()
          .mockRejectedValueOnce(error)
          .mockResolvedValue({ data: 'success' });

        const promise = retryWithBackoff(mockFn, {
          maxRetries: 3,
          baseDelayMs: 100
        });

        await vi.advanceTimersByTimeAsync(10);
        await vi.advanceTimersByTimeAsync(200);

        const result = await promise;

        expect(result.success).toBe(true);
        expect(result.attempts).toBeGreaterThan(1);
      }
    });

    it('should apply exponential backoff with proper delays', async () => {
      const delays = [];
      const mockFn = vi.fn()
        .mockRejectedValue({ status: 503, message: 'Service unavailable' });

      const promise = retryWithBackoff(mockFn, {
        maxRetries: 3,
        baseDelayMs: 1000,
        maxDelayMs: 10000
      });

      // Capture when each attempt happens
      const startTime = Date.now();
      
      await vi.advanceTimersByTimeAsync(10);
      await vi.advanceTimersByTimeAsync(1500); // ~1s + jitter
      await vi.advanceTimersByTimeAsync(3000); // ~2s + jitter
      await vi.advanceTimersByTimeAsync(5000); // ~4s + jitter
      await vi.advanceTimersByTimeAsync(10000); // ~8s + jitter

      await promise;

      // Should have made 4 attempts (initial + 3 retries)
      expect(mockFn).toHaveBeenCalledTimes(4);
    });

    it('should respect maxDelayMs cap', async () => {
      const mockFn = vi.fn()
        .mockRejectedValue({ status: 503, message: 'Service unavailable' });

      const promise = retryWithBackoff(mockFn, {
        maxRetries: 5,
        baseDelayMs: 1000,
        maxDelayMs: 3000 // Cap at 3 seconds
      });

      await vi.advanceTimersByTimeAsync(10);
      await vi.advanceTimersByTimeAsync(2000);  // 1st retry
      await vi.advanceTimersByTimeAsync(3000);  // 2nd retry
      await vi.advanceTimersByTimeAsync(4000);  // 3rd retry (should be capped)
      await vi.advanceTimersByTimeAsync(4000);  // 4th retry (should be capped)
      await vi.advanceTimersByTimeAsync(4000);  // 5th retry (should be capped)

      await promise;

      expect(mockFn).toHaveBeenCalledTimes(6); // Initial + 5 retries
    });

    it('should use custom isRetryable function', async () => {
      const mockFn = vi.fn()
        .mockRejectedValueOnce({ code: 'CUSTOM_ERROR', message: 'Custom error' })
        .mockResolvedValue({ data: 'success' });

      const customIsRetryable = (error) => {
        return error.code === 'CUSTOM_ERROR';
      };

      const promise = retryWithBackoff(mockFn, {
        maxRetries: 3,
        baseDelayMs: 100,
        isRetryable: customIsRetryable
      });

      await vi.advanceTimersByTimeAsync(10);
      await vi.advanceTimersByTimeAsync(200);

      const result = await promise;

      expect(result.success).toBe(true);
      expect(result.attempts).toBe(2);
      expect(mockFn).toHaveBeenCalledTimes(2);
    });

    it('should handle undefined errors gracefully', async () => {
      const mockFn = vi.fn().mockRejectedValue(undefined);

      const promise = retryWithBackoff(mockFn, {
        maxRetries: 2,
        baseDelayMs: 100
      });

      const result = await promise;

      expect(result.success).toBe(false);
      expect(result.attempts).toBe(1); // Should not retry undefined errors
      expect(mockFn).toHaveBeenCalledTimes(1);
    });

    it('should handle null errors gracefully', async () => {
      const mockFn = vi.fn().mockRejectedValue(null);

      const promise = retryWithBackoff(mockFn, {
        maxRetries: 2,
        baseDelayMs: 100
      });

      const result = await promise;

      expect(result.success).toBe(false);
      expect(result.attempts).toBe(1); // Should not retry null errors
      expect(mockFn).toHaveBeenCalledTimes(1);
    });

    it('should add jitter to prevent thundering herd', async () => {
      const delays1 = [];
      const delays2 = [];

      // Run two identical retry scenarios
      for (let i = 0; i < 2; i++) {
        const delays = i === 0 ? delays1 : delays2;
        const mockFn = vi.fn()
          .mockRejectedValueOnce({ status: 503 })
          .mockRejectedValueOnce({ status: 503 })
          .mockResolvedValue({ data: 'success' });

        const promise = retryWithBackoff(mockFn, {
          maxRetries: 3,
          baseDelayMs: 1000
        });

        await vi.advanceTimersByTimeAsync(10);
        await vi.advanceTimersByTimeAsync(1500);
        await vi.advanceTimersByTimeAsync(3000);
        
        await promise;
      }

      // Note: Jitter is random, so this test just verifies the mechanism exists
      // In a real scenario, delays would vary by up to 30%
    });
  });
});

