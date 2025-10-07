import request from 'supertest';
import { vi, describe, it, expect, beforeEach } from 'vitest';
import app from '../src/server.js';

// Ensure test environment
process.env.NODE_ENV = 'test';

// Mock Supabase client for resetPasswordForEmail
vi.mock('@supabase/supabase-js', () => {
  const resetPasswordForEmail = vi.fn(async () => ({ data: { user: null }, error: null }));
  const auth = { resetPasswordForEmail };
  return { createClient: vi.fn(() => ({ auth })) };
});

// Silence security logs during tests
vi.mock('../src/utils/securityMonitor.js', async (orig) => {
  const actual = await orig();
  return {
    ...actual,
    logSecurityEvent: vi.fn(),
  };
});

describe('POST /api/auth/request-password-reset', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns 200 with generic message for valid email', async () => {
    const res = await request(app)
      .post('/api/auth/request-password-reset')
      .send({ email: 'user@example.com' })
      .expect(200);

    expect(res.body).toMatchObject({
      message: expect.stringMatching(/If an account with this email exists/i),
    });
  });

  it('returns 400 for invalid email format', async () => {
    const res = await request(app)
      .post('/api/auth/request-password-reset')
      .send({ email: 'not-an-email' })
      .expect(400);

    expect(res.body?.error).toBeDefined();
  });

  it('still returns 200 generic message when Supabase errors', async () => {
    // Override mock to return an error
    const { createClient } = await import('@supabase/supabase-js');
    const client = createClient();
    client.auth.resetPasswordForEmail.mockResolvedValueOnce({ data: null, error: new Error('Rate limited') });

    const res = await request(app)
      .post('/api/auth/request-password-reset')
      .send({ email: 'user@example.com' })
      .expect(200);

    expect(res.body).toMatchObject({
      message: expect.stringMatching(/If an account with this email exists/i),
    });
  });
});


