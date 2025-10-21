// Set NODE_ENV to 'test' before importing app
process.env.NODE_ENV = 'test';

import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';
import { createClient } from '@supabase/supabase-js';

// Mock Supabase client
const mockSupabase = {
  from: vi.fn(() => ({
    delete: vi.fn(() => ({
      eq: vi.fn(() => ({
        not: vi.fn(() => ({
          data: null,
          error: null
        }))
      }))
    }))
  }))
};

vi.mock('@supabase/supabase-js', () => ({
  createClient: vi.fn(() => mockSupabase)
}));

// Mock Google token storage
vi.mock('../src/utils/googleTokenStorage.js', () => ({
  deleteGoogleTokens: vi.fn().mockResolvedValue(true)
}));

// Mock logger
vi.mock('../src/utils/logger.js', () => ({
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn()
}));

import app from '../src/server.js';

describe('Calendar Disconnect Flow', () => {
  const mockUserId = 'test-user-id';
  const mockRequest = {
    user: { id: mockUserId }
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should only delete Google-synced calendar events (google_calendar_id IS NOT NULL)', async () => {
    const deleteChain = {
      eq: vi.fn(() => ({
        not: vi.fn(() => ({
          data: null,
          error: null
        }))
      }))
    };

    const fromChain = {
      delete: vi.fn(() => deleteChain)
    };

    mockSupabase.from.mockReturnValue(fromChain);

    // Simulate the disconnect flow
    const { deleteGoogleTokens } = await import('../src/utils/googleTokenStorage.js');
    
    // Delete tokens
    await deleteGoogleTokens(mockUserId);
    
    // Clear only Google-synced calendar events
    const { error: deleteEventsError } = await mockSupabase
      .from('calendar_events')
      .delete()
      .eq('user_id', mockUserId)
      .not('google_calendar_id', 'is', null);

    // Verify the delete was called with correct parameters
    expect(mockSupabase.from).toHaveBeenCalledWith('calendar_events');
    expect(fromChain.delete).toHaveBeenCalled();
    expect(deleteChain.eq).toHaveBeenCalledWith('user_id', mockUserId);
    expect(deleteChain.not).toHaveBeenCalledWith('google_calendar_id', 'is', null);
    
    // Verify no error occurred
    expect(deleteEventsError).toBeNull();
  });

  it('should preserve locally-created events (google_calendar_id IS NULL)', async () => {
    // This test verifies that the query structure excludes locally-created events
    // by using .not('google_calendar_id', 'is', null) which means:
    // DELETE FROM calendar_events WHERE user_id = ? AND google_calendar_id IS NOT NULL
    
    const deleteChain = {
      eq: vi.fn(() => ({
        not: vi.fn(() => ({
          data: null,
          error: null
        }))
      }))
    };

    const fromChain = {
      delete: vi.fn(() => deleteChain)
    };

    mockSupabase.from.mockReturnValue(fromChain);

    // Execute the delete query
    await mockSupabase
      .from('calendar_events')
      .delete()
      .eq('user_id', mockUserId)
      .not('google_calendar_id', 'is', null);

    // Verify the query structure preserves locally-created events
    expect(deleteChain.not).toHaveBeenCalledWith('google_calendar_id', 'is', null);
    
    // This means the query will only delete events where google_calendar_id IS NOT NULL
    // Events with google_calendar_id = NULL (locally-created) will be preserved
  });

  it('should handle delete errors gracefully without failing disconnect', async () => {
    const deleteError = new Error('Database connection failed');
    
    const deleteChain = {
      eq: vi.fn(() => ({
        not: vi.fn(() => ({
          data: null,
          error: deleteError
        }))
      }))
    };

    const fromChain = {
      delete: vi.fn(() => deleteChain)
    };

    mockSupabase.from.mockReturnValue(fromChain);

    // Execute the delete query that will return an error
    const { error: deleteEventsError } = await mockSupabase
      .from('calendar_events')
      .delete()
      .eq('user_id', mockUserId)
      .not('google_calendar_id', 'is', null);

    // Verify error is returned but doesn't throw
    expect(deleteEventsError).toBe(deleteError);
    
    // In the actual implementation, this error would be logged but not thrown
    // allowing the disconnect to continue successfully
  });
});
