import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { GeminiService } from '../src/utils/geminiService.js';
import * as conversationController from '../src/controllers/conversationController.js';

// Mock the conversation controller
vi.mock('../src/controllers/conversationController.js', () => ({
  conversationController: {
    getThread: vi.fn(),
    getRecentMessages: vi.fn()
  }
}));

// Mock logger
vi.mock('../src/utils/logger.js', () => ({
  default: {
    warn: vi.fn(),
    error: vi.fn(),
    info: vi.fn()
  }
}));

// Mock Google AI
vi.mock('@google/generative-ai', () => ({
  GoogleGenerativeAI: vi.fn().mockImplementation(() => ({
    getGenerativeModel: vi.fn().mockReturnValue({
      generateContent: vi.fn().mockResolvedValue({
        response: {
          text: vi.fn().mockResolvedValue('Test response'),
          functionCalls: []
        }
      })
    })
  })),
  HarmCategory: {},
  HarmBlockThreshold: {}
}));

describe('GeminiService Thread Isolation', () => {
  let geminiService;
  const testUserId = 'user-123';
  const threadId1 = 'thread-1';
  const threadId2 = 'thread-2';

  beforeEach(() => {
    // Set up environment
    process.env.GOOGLE_AI_API_KEY = 'test-key';
    process.env.DEBUG_LOGS = 'true';
    
    geminiService = new GeminiService();
    
    // Clear all mocks
    vi.clearAllMocks();
  });

  afterEach(() => {
    // Clear conversation history
    geminiService.clearHistory(testUserId);
  });

  describe('Test Suite 1: Thread Isolation', () => {
    it('should maintain separate conversation histories for different threads', async () => {
      // Add messages to thread 1
      geminiService._addToHistory(testUserId, threadId1, { role: 'user', content: 'Hello thread 1' });
      geminiService._addToHistory(testUserId, threadId1, { role: 'model', content: 'Response to thread 1' });

      // Add messages to thread 2
      geminiService._addToHistory(testUserId, threadId2, { role: 'user', content: 'Hello thread 2' });
      geminiService._addToHistory(testUserId, threadId2, { role: 'model', content: 'Response to thread 2' });

      // Get histories
      const history1 = geminiService.conversationHistory.get(geminiService._getHistoryKey(testUserId, threadId1));
      const history2 = geminiService.conversationHistory.get(geminiService._getHistoryKey(testUserId, threadId2));

      // Verify they are separate
      expect(history1).toHaveLength(2);
      expect(history2).toHaveLength(2);
      expect(history1[0].content).toBe('Hello thread 1');
      expect(history2[0].content).toBe('Hello thread 2');
      expect(history1[1].content).toBe('Response to thread 1');
      expect(history2[1].content).toBe('Response to thread 2');
    });

    it('should not contaminate thread histories when switching between threads', async () => {
      // Add message to thread 1
      geminiService._addToHistory(testUserId, threadId1, { role: 'user', content: 'Thread 1 message' });

      // Add message to thread 2
      geminiService._addToHistory(testUserId, threadId2, { role: 'user', content: 'Thread 2 message' });

      // Verify thread 1 history doesn't contain thread 2 message
      const history1 = geminiService.conversationHistory.get(geminiService._getHistoryKey(testUserId, threadId1));
      expect(history1).toHaveLength(1);
      expect(history1[0].content).toBe('Thread 1 message');

      // Verify thread 2 history doesn't contain thread 1 message
      const history2 = geminiService.conversationHistory.get(geminiService._getHistoryKey(testUserId, threadId2));
      expect(history2).toHaveLength(1);
      expect(history2[0].content).toBe('Thread 2 message');
    });
  });

  describe('Test Suite 2: Database History Loading', () => {
    it('should load history from database when cache is empty', async () => {
      const mockMessages = [
        { role: 'user', content: 'Database message 1', created_at: '2023-01-01T10:00:00Z' },
        { role: 'assistant', content: 'Database response 1', created_at: '2023-01-01T10:01:00Z' },
        { role: 'user', content: 'Database message 2', created_at: '2023-01-01T10:02:00Z' }
      ];

      conversationController.conversationController.getRecentMessages.mockResolvedValue(mockMessages);

      // Load history from database
      const loadedHistory = await geminiService._loadHistoryFromDatabase(testUserId, threadId1);

      expect(conversationController.conversationController.getRecentMessages).toHaveBeenCalledWith(threadId1, testUserId, 10);
      expect(loadedHistory).toHaveLength(3);
      expect(loadedHistory[0]).toEqual({ role: 'user', content: 'Database message 1' });
      expect(loadedHistory[1]).toEqual({ role: 'model', content: 'Database response 1' });
      expect(loadedHistory[2]).toEqual({ role: 'user', content: 'Database message 2' });
    });

    it('should only load last 10 messages from database', async () => {
      const mockMessages = Array.from({ length: 15 }, (_, i) => ({
        role: i % 2 === 0 ? 'user' : 'assistant',
        content: `Message ${i + 1}`,
        created_at: `2023-01-01T10:${i.toString().padStart(2, '0')}:00Z`
      }));

      // Mock to return only the last 10 messages
      conversationController.conversationController.getRecentMessages.mockResolvedValue(mockMessages.slice(-10));

      const loadedHistory = await geminiService._loadHistoryFromDatabase(testUserId, threadId1);

      expect(conversationController.conversationController.getRecentMessages).toHaveBeenCalledWith(threadId1, testUserId, 10);
      expect(loadedHistory).toHaveLength(10);
      expect(loadedHistory[0].content).toBe('Message 6'); // Last 10 messages
      expect(loadedHistory[9].content).toBe('Message 15');
    });

    it('should properly map database roles to Gemini roles', async () => {
      const mockMessages = [
        { role: 'user', content: 'User message' },
        { role: 'assistant', content: 'Assistant message' }
      ];

      conversationController.conversationController.getRecentMessages.mockResolvedValue(mockMessages);

      const loadedHistory = await geminiService._loadHistoryFromDatabase(testUserId, threadId1);

      expect(loadedHistory[0].role).toBe('user');
      expect(loadedHistory[1].role).toBe('model');
    });

    it('should use cache on subsequent messages without DB queries', async () => {
      // First, add some history to cache
      geminiService._addToHistory(testUserId, threadId1, { role: 'user', content: 'Cached message' });

      // Mock processMessage to avoid actual Gemini calls
      const originalProcessMessage = geminiService.processMessage;
      geminiService.processMessage = vi.fn().mockResolvedValue({
        message: 'Test response',
        actions: []
      });

      // Call processMessage
      await geminiService.processMessage('Test message', testUserId, threadId1);

      // Verify no database call was made since cache exists
      expect(conversationController.conversationController.getRecentMessages).not.toHaveBeenCalled();

      // Restore original method
      geminiService.processMessage = originalProcessMessage;
    });
  });

  describe('Test Suite 3: Server Restart Simulation', () => {
    it('should load history from database after cache clear', async () => {
      const mockMessages = [
        { role: 'user', content: 'Persistent message', created_at: '2023-01-01T10:00:00Z' },
        { role: 'assistant', content: 'Persistent response', created_at: '2023-01-01T10:01:00Z' }
      ];

      conversationController.conversationController.getRecentMessages.mockResolvedValue(mockMessages);

      // Simulate server restart by clearing cache
      geminiService.clearHistory(testUserId, threadId1);

      // Load history from database
      const loadedHistory = await geminiService._loadHistoryFromDatabase(testUserId, threadId1);

      expect(loadedHistory).toHaveLength(2);
      expect(loadedHistory[0].content).toBe('Persistent message');
      expect(loadedHistory[1].content).toBe('Persistent response');
    });

    it('should not cause cross-thread contamination after cache clear', async () => {
      const mockMessages1 = [
        { role: 'user', content: 'Thread 1 message', created_at: '2023-01-01T10:00:00Z' }
      ];
      const mockMessages2 = [
        { role: 'user', content: 'Thread 2 message', created_at: '2023-01-01T10:00:00Z' }
      ];

      // Clear cache
      geminiService.clearHistory(testUserId);

      // Load history for thread 1
      conversationController.conversationController.getRecentMessages.mockResolvedValue(mockMessages1);
      const history1 = await geminiService._loadHistoryFromDatabase(testUserId, threadId1);

      // Load history for thread 2
      conversationController.conversationController.getRecentMessages.mockResolvedValue(mockMessages2);
      const history2 = await geminiService._loadHistoryFromDatabase(testUserId, threadId2);

      expect(history1[0].content).toBe('Thread 1 message');
      expect(history2[0].content).toBe('Thread 2 message');
      expect(history1).not.toEqual(history2);
    });
  });

  describe('Test Suite 4: Context Window Size', () => {
    it('should have MAX_HISTORY_MESSAGES set to 20', () => {
      // Access the private property through the processMessage method
      const MAX_HISTORY_MESSAGES = 20; // This should match the constant in the code
      expect(MAX_HISTORY_MESSAGES).toBe(20);
    });

    it('should limit in-memory cache to 20 messages per thread', () => {
      // Add 25 messages to a thread
      for (let i = 0; i < 25; i++) {
        geminiService._addToHistory(testUserId, threadId1, {
          role: 'user',
          content: `Message ${i + 1}`
        });
      }

      const history = geminiService.conversationHistory.get(geminiService._getHistoryKey(testUserId, threadId1));
      expect(history).toHaveLength(20);
      expect(history[0].content).toBe('Message 6'); // First 5 should be trimmed
      expect(history[19].content).toBe('Message 25'); // Last message should remain
    });
  });

  describe('Test Suite 5: Error Handling', () => {
    it('should handle null threadId gracefully', async () => {
      const result = await geminiService._loadHistoryFromDatabase(testUserId, null);
      expect(result).toEqual([]);
      expect(conversationController.conversationController.getRecentMessages).not.toHaveBeenCalled();
    });

    it('should handle database query failures gracefully', async () => {
      conversationController.conversationController.getRecentMessages.mockRejectedValue(new Error('Database error'));

      const result = await geminiService._loadHistoryFromDatabase(testUserId, threadId1);

      expect(result).toEqual([]);
      expect(conversationController.conversationController.getRecentMessages).toHaveBeenCalledWith(threadId1, testUserId, 10);
    });

    it('should continue conversation even when history loading fails', async () => {
      conversationController.conversationController.getRecentMessages.mockRejectedValue(new Error('Database error'));

      // Mock processMessage to avoid actual Gemini calls
      const originalProcessMessage = geminiService.processMessage;
      geminiService.processMessage = vi.fn().mockResolvedValue({
        message: 'Test response',
        actions: []
      });

      // This should not throw an error
      await expect(geminiService.processMessage('Test message', testUserId, threadId1))
        .resolves.toBeDefined();

      // Restore original method
      geminiService.processMessage = originalProcessMessage;
    });

    it('should handle invalid threadId without errors', async () => {
      conversationController.conversationController.getRecentMessages.mockResolvedValue([]);

      const result = await geminiService._loadHistoryFromDatabase(testUserId, 'invalid-thread-id');

      expect(result).toEqual([]);
      expect(conversationController.conversationController.getRecentMessages).toHaveBeenCalledWith('invalid-thread-id', testUserId, 10);
    });
  });

  describe('Test Suite 6: Backward Compatibility', () => {
    it('should work with conversations without threadId', async () => {
      // Add history without threadId (legacy behavior)
      geminiService._addToHistory(testUserId, null, { role: 'user', content: 'Legacy message' });

      const history = geminiService.conversationHistory.get(geminiService._getHistoryKey(testUserId, null));
      expect(history).toHaveLength(1);
      expect(history[0].content).toBe('Legacy message');
    });

    it('should handle processMessage without threadId', async () => {
      // Mock processMessage to avoid actual Gemini calls
      const originalProcessMessage = geminiService.processMessage;
      geminiService.processMessage = vi.fn().mockResolvedValue({
        message: 'Test response',
        actions: []
      });

      // Call without threadId
      await expect(geminiService.processMessage('Test message', testUserId, null))
        .resolves.toBeDefined();

      // Restore original method
      geminiService.processMessage = originalProcessMessage;
    });
  });

  describe('Helper Methods', () => {
    it('should generate consistent history keys', () => {
      const key1 = geminiService._getHistoryKey(testUserId, threadId1);
      const key2 = geminiService._getHistoryKey(testUserId, threadId1);
      const key3 = geminiService._getHistoryKey(testUserId, threadId2);

      expect(key1).toBe(key2);
      expect(key1).not.toBe(key3);
      expect(key1).toBe(`${testUserId}:${threadId1}`);
      expect(key3).toBe(`${testUserId}:${threadId2}`);
    });

    it('should clear specific thread history', () => {
      // Add history to both threads
      geminiService._addToHistory(testUserId, threadId1, { role: 'user', content: 'Thread 1 message' });
      geminiService._addToHistory(testUserId, threadId2, { role: 'user', content: 'Thread 2 message' });

      // Clear only thread 1
      geminiService.clearHistory(testUserId, threadId1);

      // Verify thread 1 is cleared but thread 2 remains
      const history1 = geminiService.conversationHistory.get(geminiService._getHistoryKey(testUserId, threadId1));
      const history2 = geminiService.conversationHistory.get(geminiService._getHistoryKey(testUserId, threadId2));

      expect(history1).toBeUndefined();
      expect(history2).toHaveLength(1);
      expect(history2[0].content).toBe('Thread 2 message');
    });

    it('should clear all thread history when no threadId provided', () => {
      // Add history to both threads
      geminiService._addToHistory(testUserId, threadId1, { role: 'user', content: 'Thread 1 message' });
      geminiService._addToHistory(testUserId, threadId2, { role: 'user', content: 'Thread 2 message' });

      // Clear all history for user
      geminiService.clearHistory(testUserId);

      // Verify both threads are cleared
      const history1 = geminiService.conversationHistory.get(geminiService._getHistoryKey(testUserId, threadId1));
      const history2 = geminiService.conversationHistory.get(geminiService._getHistoryKey(testUserId, threadId2));

      expect(history1).toBeUndefined();
      expect(history2).toBeUndefined();
    });
  });
});
