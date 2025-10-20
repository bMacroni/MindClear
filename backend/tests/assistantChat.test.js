import request from 'supertest';

// Mock the enhanced auth middleware before importing the app
jest.mock('../src/middleware/enhancedAuth.js', () => ({
  requireAuth: jest.fn((req, res, next) => {
    if (req.headers.authorization) {
      req.user = {
        id: 'test-user-id',
        email: 'test@example.com'
      };
      next();
    } else {
      res.status(401).json({ error: 'Unauthorized' });
    }
  })
}));
// Stub GeminiService to keep tests hermetic while exercising real route logic
jest.mock('../src/utils/geminiService.js', () => {
  return {
    __esModule: true,
    default: class GeminiService {
      async processMessage() {
        return { message: 'Test response', actions: [] };
      }
    }
  };
});

import app from './testServer.js';

describe('Assistant Chat API (/api/chat) – integration', () => {
  it('responds with JSON when stream=false and authenticated', async () => {
    const token = 'Bearer test-token';
    const res = await request(app)
      .post('/api/chat?stream=false')
      .set('Authorization', token)
      .send({ message: 'Hello', threadId: null });

    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toMatch(/application\/json/);
    expect(res.body.message).toBe('Test response');
    expect(Array.isArray(res.body.actions)).toBe(true);
    expect(res.body.actions).toEqual([]);
  });

  it('streams SSE when Accept is text/event-stream and stream not false', async () => {
    const token = 'Bearer test-token';
    const res = await request(app)
      .post('/api/chat')
      .set('Authorization', token)
      .set('Accept', 'text/event-stream')
      .buffer(true)
      .send({ message: 'Stream please', threadId: 'thread-1' });

    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toMatch(/text\/event-stream/);
    expect(res.text).toContain('assistant_status');
    expect(res.text).toContain('assistant_message');
    expect(res.text).toContain('action_list');
    expect(res.text).toContain('finish');
  });

  it('returns 401 when authentication fails', async () => {
    const res = await request(app)
      .post('/api/chat?stream=false')
      .send({ message: 'Hello', threadId: null });

    expect(res.status).toBe(401);
  });

  it('returns 400 when message is missing or empty', async () => {
    const token = 'Bearer test-token';
    const res = await request(app)
      .post('/api/chat?stream=false')
      .set('Authorization', token)
      .send({ message: '   ' });

    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/Message is required/);
  });

  it('returns 400 when threadId is provided but not a non-empty string', async () => {
    const token = 'Bearer test-token';
    const res = await request(app)
      .post('/api/chat?stream=false')
      .set('Authorization', token)
      .send({ message: 'Hello', threadId: 123 });

    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/threadId must be a non-empty string/);
  });
});


