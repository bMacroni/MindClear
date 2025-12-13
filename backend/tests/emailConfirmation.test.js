import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import request from 'supertest';
import express from 'express';
import authRoutes from '../src/routes/auth.js';

// Mock Supabase
vi.mock('@supabase/supabase-js', () => {
  const mockSupabase = {
    auth: {
      signUp: vi.fn(),
      signInWithPassword: vi.fn(),
      resend: vi.fn(),
    },
    from: vi.fn(() => ({
      update: vi.fn(() => ({
        eq: vi.fn(() => Promise.resolve({ data: null, error: null }))
      }))
    }))
  };
  
  return {
    createClient: vi.fn(() => mockSupabase)
  };
});

// Mock logger
vi.mock('../src/utils/logger.js', () => ({
  default: {
    info: vi.fn(),
    error: vi.fn(),
    warn: vi.fn()
  }
}));

// Mock security monitor
vi.mock('../src/utils/securityMonitor.js', () => ({
  logSecurityEvent: vi.fn(),
  SecurityEventTypes: {
    USER_CREATED: 'USER_CREATED',
    RESEND_CONFIRMATION_REQUESTED: 'RESEND_CONFIRMATION_REQUESTED'
  }
}));

describe('Email Confirmation Flow', () => {
  let app;
  let mockSupabase;

  beforeAll(async () => {
    // Setup express app with auth routes
    app = express();
    app.use(express.json());
    app.use('/api/auth', authRoutes);
    
    // Get mocked Supabase instance
    const { createClient } = await import('@supabase/supabase-js');
    mockSupabase = createClient();
  });

  afterAll(() => {
    vi.clearAllMocks();
  });

  describe('POST /api/auth/signup', () => {
    it('should create user and require email confirmation', async () => {
      // Mock Supabase signup success
      mockSupabase.auth.signUp.mockResolvedValueOnce({
        data: {
          user: {
            id: 'test-user-id',
            email: 'test@example.com',
            email_confirmed_at: null
          },
          session: null
        },
        error: null
      });

      const response = await request(app)
        .post('/api/auth/signup')
        .send({
          email: 'test@example.com',
          password: 'TestPassword123',
          full_name: 'Test User'
        });

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('userCreated', true);
      expect(response.body).toHaveProperty('requiresConfirmation', true);
      expect(response.body.message).toContain('check your email');
    });

    it('should reject password shorter than 12 characters', async () => {
      const response = await request(app)
        .post('/api/auth/signup')
        .send({
          email: 'test@example.com',
          password: 'Short1',
          full_name: 'Test User'
        });

      expect(response.status).toBe(400);
      expect(response.body.error).toBe('Invalid input data');
      expect(response.body.details).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            field: 'password',
            message: expect.stringContaining('12')
          })
        ])
      );
    });

    it('should accept password without special characters', async () => {
      mockSupabase.auth.signUp.mockResolvedValueOnce({
        data: {
          user: {
            id: 'test-user-id',
            email: 'test@example.com',
            email_confirmed_at: null
          },
          session: null
        },
        error: null
      });

      const response = await request(app)
        .post('/api/auth/signup')
        .send({
          email: 'test@example.com',
          password: 'ValidPassword123',
          full_name: 'Test User'
        });

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('userCreated', true);
    });

    it('should reject password without uppercase letter', async () => {
      const response = await request(app)
        .post('/api/auth/signup')
        .send({
          email: 'test@example.com',
          password: 'validpassword123',
          full_name: 'Test User'
        });

      expect(response.status).toBe(400);
      expect(response.body.error).toBe('Invalid input data');
    });

    it('should reject password without number', async () => {
      const response = await request(app)
        .post('/api/auth/signup')
        .send({
          email: 'test@example.com',
          password: 'ValidPassword',
          full_name: 'Test User'
        });

      expect(response.status).toBe(400);
      expect(response.body.error).toBe('Invalid input data');
    });
  });

  describe('POST /api/auth/login', () => {
    it('should reject login with unconfirmed email', async () => {
      // Mock Supabase login error for unconfirmed email
      mockSupabase.auth.signInWithPassword.mockResolvedValueOnce({
        data: { user: null, session: null },
        error: {
          message: 'Email not confirmed',
          code: 'email_not_confirmed'
        }
      });

      const response = await request(app)
        .post('/api/auth/login')
        .send({
          email: 'test@example.com',
          password: 'ValidPassword123'
        });

      expect(response.status).toBe(403);
      expect(response.body).toHaveProperty('errorCode', 'EMAIL_NOT_CONFIRMED');
      expect(response.body).toHaveProperty('requiresConfirmation', true);
      expect(response.body.message).toContain('confirm your email');
    });

    it('should allow login with confirmed email', async () => {
      // Mock Supabase login success
      mockSupabase.auth.signInWithPassword.mockResolvedValueOnce({
        data: {
          user: {
            id: 'test-user-id',
            email: 'test@example.com',
            email_confirmed_at: '2024-01-01T00:00:00.000Z'
          },
          session: {
            access_token: 'mock-access-token',
            refresh_token: 'mock-refresh-token'
          }
        },
        error: null
      });

      const response = await request(app)
        .post('/api/auth/login')
        .send({
          email: 'test@example.com',
          password: 'ValidPassword123'
        });

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('token');
      expect(response.body).toHaveProperty('refresh_token');
      expect(response.body.message).toBe('Login successful');
    });

    it('should reject login if user object shows unconfirmed email', async () => {
      // Mock Supabase login returns user but without confirmation
      mockSupabase.auth.signInWithPassword.mockResolvedValueOnce({
        data: {
          user: {
            id: 'test-user-id',
            email: 'test@example.com',
            email_confirmed_at: null
          },
          session: {
            access_token: 'mock-access-token',
            refresh_token: 'mock-refresh-token'
          }
        },
        error: null
      });

      const response = await request(app)
        .post('/api/auth/login')
        .send({
          email: 'test@example.com',
          password: 'ValidPassword123'
        });

      expect(response.status).toBe(403);
      expect(response.body).toHaveProperty('errorCode', 'EMAIL_NOT_CONFIRMED');
    });
  });

  describe('POST /api/auth/resend-confirmation', () => {
    it('should accept resend confirmation request', async () => {
      // Mock Supabase resend
      mockSupabase.auth.resend.mockResolvedValueOnce({
        data: {},
        error: null
      });

      const response = await request(app)
        .post('/api/auth/resend-confirmation')
        .send({
          email: 'test@example.com'
        });

      expect(response.status).toBe(200);
      expect(response.body.message).toContain('confirmation email has been sent');
    });

    it('should not leak if email does not exist', async () => {
      // Mock Supabase resend error (email not found)
      mockSupabase.auth.resend.mockResolvedValueOnce({
        data: null,
        error: { message: 'User not found' }
      });

      const response = await request(app)
        .post('/api/auth/resend-confirmation')
        .send({
          email: 'nonexistent@example.com'
        });

      // Should still return success to prevent email enumeration
      expect(response.status).toBe(200);
      expect(response.body.message).toContain('confirmation email has been sent');
    });

    it('should validate email format', async () => {
      const response = await request(app)
        .post('/api/auth/resend-confirmation')
        .send({
          email: 'invalid-email'
        });

      expect(response.status).toBe(400);
      expect(response.body.error).toBe('Invalid input data');
    });

    it('should rate limit resend requests', async () => {
      // Mock successful resends
      mockSupabase.auth.resend.mockResolvedValue({
        data: {},
        error: null
      });

      const email = 'ratelimit@example.com';

      // Make 3 requests (should succeed)
      for (let i = 0; i < 3; i++) {
        const response = await request(app)
          .post('/api/auth/resend-confirmation')
          .send({ email });
        expect(response.status).toBe(200);
      }

      // 4th request should be rate limited
      const response = await request(app)
        .post('/api/auth/resend-confirmation')
        .send({ email });

      expect(response.status).toBe(429);
      expect(response.body.error).toContain('Too many');
    });
  });
});


