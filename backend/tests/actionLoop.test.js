import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import request from 'supertest';

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

// Create shared mock function for GeminiService
const mockProcessMessage = vi.fn();

// Mock GeminiService with centralized mock
vi.mock('../src/utils/geminiService.js', () => ({
  default: class MockGeminiService {
    async processMessage(...args) {
      return mockProcessMessage(...args);
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
    
    // Set default mock behavior for processMessage
    mockProcessMessage.mockResolvedValue({
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
    });
  });

  afterEach(() => {
    vi.clearAllTimers();
  });

  it('should validate entity_type and action_type before execution', async () => {
    const { default: router } = await import('../src/routes/assistantChat.js');
    const express = await import('express');
    const app = express.default();
    app.use(express.json());
    app.use('/api/chat', router);

    // Override mock for this specific test
    mockProcessMessage.mockResolvedValue({
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

    const res = await request(app)
      .post('/api/chat?stream=false')
      .set('Authorization', 'Bearer test-token')
      .send({
        message: 'Test message',
        threadId: null
      });

    expect(res.status).toBe(200);
    const data = res.body;
    expect(data.message).toBe('Test response');
    expect(data.actions).toBeDefined();
    
    // executeTool should not be called for invalid actions
    expect(mockExecuteTool).not.toHaveBeenCalled();
  });

  it('should execute valid actions and return results', async () => {
    const { default: router } = await import('../src/routes/assistantChat.js');
    const express = await import('express');
    const app = express.default();
    app.use(express.json());
    app.use('/api/chat', router);

    // Override mock for this specific test
    mockProcessMessage.mockResolvedValue({
      message: 'Test response',
      actions: [
        {
          entity_type: 'task',
          action_type: 'create',
          details: { title: 'Valid task' }
        },
        {
          entity_type: 'goal',
          action_type: 'update',
          details: { id: 1, title: 'Updated goal' }
        }
      ]
    });

    mockExecuteTool
      .mockResolvedValueOnce({ success: true, id: 1 })
      .mockResolvedValueOnce({ success: true, id: 2 });

    const res = await request(app)
      .post('/api/chat?stream=false')
      .set('Authorization', 'Bearer test-token')
      .send({
        message: 'Test message',
        threadId: null
      });

    expect(res.status).toBe(200);
    const data = res.body;
    expect(data.message).toBe('Test response');
    expect(data.actions).toBeDefined();
    
    // executeTool should be called for valid actions
    expect(mockExecuteTool).toHaveBeenCalledTimes(2);
  });

  it('should handle action execution errors gracefully', async () => {
    const { default: router } = await import('../src/routes/assistantChat.js');
    const express = await import('express');
    const app = express.default();
    app.use(express.json());
    app.use('/api/chat', router);

    // Override mock for this specific test
    mockProcessMessage.mockResolvedValue({
      message: 'Test response',
      actions: [
        {
          entity_type: 'task',
          action_type: 'create',
          details: { title: 'Task that will fail' }
        }
      ]
    });

    mockExecuteTool.mockRejectedValue(new Error('Action execution failed'));

    const res = await request(app)
      .post('/api/chat?stream=false')
      .set('Authorization', 'Bearer test-token')
      .send({
        message: 'Test message',
        threadId: null
      });

    expect(res.status).toBe(200);
    const data = res.body;
    expect(data.message).toBe('Test response');
    expect(data.actions).toBeDefined();
    
    // executeTool should be called but fail
    expect(mockExecuteTool).toHaveBeenCalledTimes(1);
  });

  it('should handle mixed valid and invalid actions', async () => {
    const { default: router } = await import('../src/routes/assistantChat.js');
    const express = await import('express');
    const app = express.default();
    app.use(express.json());
    app.use('/api/chat', router);

    // Override mock for this specific test
    mockProcessMessage.mockResolvedValue({
      message: 'Test response',
      actions: [
        {
          entity_type: 'task',
          action_type: 'create',
          details: { title: 'Valid task' }
        },
        {
          entity_type: 'invalid_entity',
          action_type: 'create',
          details: { title: 'Invalid task' }
        },
        {
          entity_type: 'goal',
          action_type: 'update',
          details: { id: 1, title: 'Valid goal update' }
        }
      ]
    });

    mockExecuteTool
      .mockResolvedValueOnce({ success: true, id: 1 })
      .mockResolvedValueOnce({ success: true, id: 2 });

    const res = await request(app)
      .post('/api/chat?stream=false')
      .set('Authorization', 'Bearer test-token')
      .send({
        message: 'Test message',
        threadId: null
      });

    expect(res.status).toBe(200);
    const data = res.body;
    expect(data.message).toBe('Test response');
    expect(data.actions).toBeDefined();
    
    // executeTool should only be called for valid actions (2 out of 3)
    expect(mockExecuteTool).toHaveBeenCalledTimes(2);
  });
});
