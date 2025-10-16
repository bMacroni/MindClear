import request from 'supertest';

// Mock the enhanced auth middleware before importing the app
jest.mock('../src/middleware/enhancedAuth.js', () => ({
  requireAuth: jest.fn((req, res, next) => {
    // Mock user object
    req.user = {
      id: 'test-user-id',
      email: 'test@example.com'
    };
    next();
  })
}));

// Mock the assistantChat route before importing the app
jest.mock('../src/routes/assistantChat.js', () => {
  const express = require('express');
  const router = express.Router();
  
  router.post('/', (req, res) => {
    res.status(200).json({
      message: 'Test response',
      actions: []
    });
  });
  
  return router;
});

import app from '../src/server.js';

describe('Streaming Chat API (/api/chat)', () => {
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

  it('returns 401 when authentication fails', async () => {
    const res = await request(app)
      .post('/api/chat?stream=false')
      .send({ message: 'Hello', threadId: null });

    expect(res.status).toBe(401);
  });
});


