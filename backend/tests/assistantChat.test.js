import request from 'supertest';
import app from '../src/server.js';

describe('Streaming Chat API (/api/chat)', () => {
  it('responds with JSON when stream=false (fallback)', async () => {
    const token = 'Bearer test-token';
    const res = await request(app)
      .post('/api/chat?stream=false')
      .set('Authorization', token)
      .send({ message: 'Hello', threadId: null });

describe('Streaming Chat API (/api/chat)', () => {
  it('responds with JSON when stream=false and authenticated', async () => {
    const token = 'Bearer test-token';
    const res = await request(app)
      .post('/api/chat?stream=false')
      .set('Authorization', token)
      .send({ message: 'Hello', threadId: null });

    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toMatch(/application\/json/);
    expect(typeof res.body.message).toBe('string');
    expect(Array.isArray(res.body.actions)).toBe(true);
  });

  it('returns 401 when authentication fails', async () => {
    const res = await request(app)
      .post('/api/chat?stream=false')
      .set('Authorization', 'Bearer invalid-token')
      .send({ message: 'Hello', threadId: null });

    expect(res.status).toBe(401);
  });
});
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toMatch(/application\/json/);
    expect(typeof res.body.message).toBe('string');
    expect(Array.isArray(res.body.actions)).toBe(true);
  });
});



