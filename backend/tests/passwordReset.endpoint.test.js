import request from 'supertest';
import { vi, describe, it, expect, beforeEach } from 'vitest';
import app from '../src/server.js';

// Ensure test environment
process.env.NODE_ENV = 'test';

// Mock Supabase client for getUser and admin.updateUserById
vi.mock('@supabase/supabase-js', () => {
  const getUser = vi.fn(async () => ({ data: { user: { id: 'user-123' } }, error: null }));
  const updateUserById = vi.fn(async () => ({ data: { user: { id: 'user-123' } }, error: null }));
  const admin = { updateUserById };
  const auth = { getUser, admin };
  return { createClient: vi.fn(() => ({ auth })) };
});

describe('POST /api/auth/reset-password', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('updates password successfully with valid access_token', async () => {
    const res = await request(app)
      .post('/api/auth/reset-password')
      .send({ access_token: 'valid-token-abc12345', password: 'NewP@ssw0rd!234' })
      .expect(200);

    expect(res.body).toMatchObject({ message: expect.stringMatching(/Password updated successfully/i) });

    const { createClient } = await import('@supabase/supabase-js');
    const client = createClient();
    expect(client.auth.getUser).toHaveBeenCalled();
    expect(client.auth.admin.updateUserById).toHaveBeenCalledWith('user-123', expect.objectContaining({ password: expect.any(String) }));
  });

  it('returns 400 when access_token is invalid or expired', async () => {
    const { createClient } = await import('@supabase/supabase-js');
    const client = createClient();
    client.auth.getUser.mockResolvedValueOnce({ data: null, error: new Error('JWT expired') });

    const res = await request(app)
      .post('/api/auth/reset-password')
      .send({ access_token: 'invalid-token', password: 'NewP@ssw0rd!234' })
      .expect(400);

    expect(res.body?.error).toBeDefined();
  });

  it('returns 400 when admin update fails', async () => {
    const { createClient } = await import('@supabase/supabase-js');
    const client = createClient();
    client.auth.getUser.mockResolvedValueOnce({ data: { user: { id: 'user-123' } }, error: null });
    client.auth.admin.updateUserById.mockResolvedValueOnce({ data: null, error: new Error('Policy blocked') });

    const res = await request(app)
      .post('/api/auth/reset-password')
      .send({ access_token: 'valid-token-abc12345', password: 'NewP@ssw0rd!234' })
      .expect(400);

    expect(res.body?.error).toBeDefined();
  });
});


