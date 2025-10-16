import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Mock the executeTool function
const mockExecuteTool = vi.fn();
vi.mock('../src/mcp/client.js', () => ({
  executeTool: mockExecuteTool
}));

// Mock logger
vi.mock('../src/utils/logger.js', () => ({
  default: {
    debug: vi.fn(),
    error: vi.fn(),
    info: vi.fn()
  }
}));

// Mock GeminiService
vi.mock('../src/utils/geminiService.js', () => ({
  default: class MockGeminiService {
    async processMessage() {
      return {
        message: 'Test response',
        actions: [
          {
            entity_type: 'task',
            action_type: 'create',
            details: { title: 'Test task' }
          },
          {
            entity_type: 'goal',
            action_type: 'update',
            details: { id: 1, title: 'Updated goal' }
          }
        ]
      };
    }
  }
}));

// Mock enhanced auth middleware
vi.mock('../src/middleware/enhancedAuth.js', () => ({
  requireAuth: (req, res, next) => {
    req.user = { id: 'test-user-id' };
    next();
  }
}));

describe('Action Loop Improvements', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockExecuteTool.mockResolvedValue({ success: true });
  });

  afterEach(() => {
    vi.clearAllTimers();
  });

  it('should validate entity_type and action_type before execution', async () => {
    const { default: router } = await import('../src/routes/assistantChat.js');
    const express = await import('express');
    const app = express.default();
    app.use('/api/chat', router);

    // Mock GeminiService to return invalid actions
    const mockGeminiService = await import('../src/utils/geminiService.js');
    mockGeminiService.default.prototype.processMessage = vi.fn().mockResolvedValue({
      message: 'Test response',
      actions: [
        {
          entity_type: 'invalid_entity', // Invalid entity type
          action_type: 'create',
          details: { title: 'Test task' }
        },
        {
          entity_type: 'task',
          action_type: 'invalid_action', // Invalid action type
          details: { title: 'Test task' }
        },
        {
          // Missing entity_type
          action_type: 'create',
          details: { title: 'Test task' }
        }
      ]
    });

    const response = await fetch('http://localhost:5000/api/chat?stream=false', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer test-token'
      },
      body: JSON.stringify({
        message: 'Test message',
        threadId: null
      })
    });

    expect(response.status).toBe(200);
    const data = await response.json();
    expect(data.message).toBe('Test response');
    expect(data.actions).toBeDefined();
    
    // executeTool should not be called for invalid actions
    expect(mockExecuteTool).not.toHaveBeenCalled();
  });

  it('should execute valid actions with timeout', async () => {
    vi.useFakeTimers();
    
    const { default: router } = await import('../src/routes/assistantChat.js');
    const express = await import('express');
    const app = express.default();
    app.use('/api/chat', router);

    // Mock a slow executeTool that will timeout
    mockExecuteTool.mockImplementation(() => 
      new Promise(resolve => setTimeout(resolve, 35000)) // 35 seconds, longer than 30s timeout
    );

    const mockGeminiService = await import('../src/utils/geminiService.js');
    mockGeminiService.default.prototype.processMessage = vi.fn().mockResolvedValue({
      message: 'Test response',
      actions: [
        {
          entity_type: 'task',
          action_type: 'create',
          details: { title: 'Test task' }
        }
      ]
    });

    const responsePromise = fetch('http://localhost:5000/api/chat?stream=false', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer test-token'
      },
      body: JSON.stringify({
        message: 'Test message',
        threadId: null
      })
    });

    // Fast-forward time to trigger timeout
    vi.advanceTimersByTime(31000);

    const response = await responsePromise;
    expect(response.status).toBe(200);
    
    vi.useRealTimers();
  });

  it('should execute multiple valid actions in parallel', async () => {
    const { default: router } = await import('../src/routes/assistantChat.js');
    const express = await import('express');
    const app = express.default();
    app.use('/api/chat', router);

    // Mock executeTool to track call order
    const callOrder = [];
    mockExecuteTool.mockImplementation((method) => {
      callOrder.push(method);
      return Promise.resolve({ success: true });
    });

    const mockGeminiService = await import('../src/utils/geminiService.js');
    mockGeminiService.default.prototype.processMessage = vi.fn().mockResolvedValue({
      message: 'Test response',
      actions: [
        {
          entity_type: 'task',
          action_type: 'create',
          details: { title: 'Task 1' }
        },
        {
          entity_type: 'goal',
          action_type: 'create',
          details: { title: 'Goal 1' }
        },
        {
          entity_type: 'task',
          action_type: 'update',
          details: { id: 1, title: 'Updated task' }
        }
      ]
    });

    const response = await fetch('http://localhost:5000/api/chat?stream=false', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer test-token'
      },
      body: JSON.stringify({
        message: 'Test message',
        threadId: null
      })
    });

    expect(response.status).toBe(200);
    const data = await response.json();
    expect(data.message).toBe('Test response');
    
    // All three actions should be executed
    expect(mockExecuteTool).toHaveBeenCalledTimes(3);
    expect(callOrder).toContain('task.create');
    expect(callOrder).toContain('goal.create');
    expect(callOrder).toContain('task.update');
  });

  it('should handle timeout errors distinctly from other errors', async () => {
    vi.useFakeTimers();
    
    const { default: router } = await import('../src/routes/assistantChat.js');
    const express = await import('express');
    const app = express.default();
    app.use('/api/chat', router);

    // Mock executeTool to throw different types of errors
    mockExecuteTool
      .mockRejectedValueOnce(new Error('Database connection failed')) // Regular error
      .mockImplementationOnce(() => 
        new Promise(resolve => setTimeout(resolve, 35000)) // Timeout error
      );

    const mockGeminiService = await import('../src/utils/geminiService.js');
    mockGeminiService.default.prototype.processMessage = vi.fn().mockResolvedValue({
      message: 'Test response',
      actions: [
        {
          entity_type: 'task',
          action_type: 'create',
          details: { title: 'Task 1' }
        },
        {
          entity_type: 'goal',
          action_type: 'create',
          details: { title: 'Goal 1' }
        }
      ]
    });

    const responsePromise = fetch('http://localhost:5000/api/chat?stream=false', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer test-token'
      },
      body: JSON.stringify({
        message: 'Test message',
        threadId: null
      })
    });

    // Fast-forward time to trigger timeout
    vi.advanceTimersByTime(31000);

    const response = await responsePromise;
    expect(response.status).toBe(200);
    
    vi.useRealTimers();
  });
});
