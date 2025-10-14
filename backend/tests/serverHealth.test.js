import request from 'supertest';
import app from '../src/server.js';

// Ensure test environment
process.env.NODE_ENV = 'test';

describe('Server health endpoint', () => {
  it('GET /api/health returns OK with environment', async () => {
    const res = await request(app).get('/api/health');
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ status: 'OK' });
    expect(res.body.environment).toBeDefined();
  });
  
  it('OPTIONS preflight allows custom headers (X-CSRF-Token, X-Requested-With)', async () => {
    const res = await request(app)
      .options('/api/health')
      .set('Origin', 'http://localhost:3000')
      .set('Access-Control-Request-Method', 'POST')
      .set('Access-Control-Request-Headers', 'Content-Type, Authorization, X-CSRF-Token, X-Requested-With');

    expect([200, 204]).toContain(res.status);
    const allowHeaders = res.headers['access-control-allow-headers'] || '';
    expect(allowHeaders.toLowerCase()).toContain('x-csrf-token');
    expect(allowHeaders.toLowerCase()).toContain('x-requested-with');
  });
});


