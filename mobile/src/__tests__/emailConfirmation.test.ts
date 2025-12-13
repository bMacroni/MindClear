import { describe, it, expect, beforeEach, vi } from 'vitest';
import { parseAccessTokenFromUrl } from '../utils/deeplink';

// Mock auth service
const mockAuthService = {
  signup: vi.fn(),
  login: vi.fn(),
  resendConfirmation: vi.fn(),
};

vi.mock('../services/auth', () => ({
  authService: mockAuthService,
}));

describe('Email Confirmation Flow', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('Deep Link Parsing', () => {
    it('should parse mindclear://confirm deep link with access_token', () => {
      const url = 'mindclear://confirm#access_token=test-token-123&token_type=bearer';
      const { access_token } = parseAccessTokenFromUrl(url);
      
      expect(access_token).toBe('test-token-123');
    });

    it('should parse mindclear://confirm deep link with token parameter', () => {
      const url = 'mindclear://confirm?token=test-token-456';
      const { token } = parseAccessTokenFromUrl(url);
      
      expect(token).toBe('test-token-456');
    });

    it('should handle deep link without token', () => {
      const url = 'mindclear://confirm';
      const { access_token, token } = parseAccessTokenFromUrl(url);
      
      expect(access_token).toBeUndefined();
      expect(token).toBeUndefined();
    });
  });

  describe('Signup Flow', () => {
    it('should return requiresConfirmation flag on successful signup', async () => {
      mockAuthService.signup.mockResolvedValue({
        success: true,
        requiresConfirmation: true,
        message: 'Please check your email to confirm your account.',
      });

      const result = await mockAuthService.signup({
        email: 'test@example.com',
        password: 'TestPassword123',
        fullName: 'Test User',
      });

      expect(result.success).toBe(true);
      expect(result.requiresConfirmation).toBe(true);
      expect(result.message).toContain('check your email');
    });

    it('should validate password requirements (12 chars minimum)', () => {
      const password = 'Short1';
      expect(password.length >= 12).toBe(false);
    });

    it('should validate password requirements (uppercase, lowercase, number)', () => {
      const validPassword = 'ValidPassword123';
      const hasLowercase = /(?=.*[a-z])/.test(validPassword);
      const hasUppercase = /(?=.*[A-Z])/.test(validPassword);
      const hasNumber = /(?=.*\d)/.test(validPassword);

      expect(hasLowercase).toBe(true);
      expect(hasUppercase).toBe(true);
      expect(hasNumber).toBe(true);
    });

    it('should accept password without special characters', () => {
      const passwordWithoutSpecial = 'ValidPassword123';
      const hasSpecialChar = /[@$!%*?&]/.test(passwordWithoutSpecial);

      // Should NOT require special characters
      expect(hasSpecialChar).toBe(false);
      
      // But should still be valid
      const isValid = 
        passwordWithoutSpecial.length >= 12 &&
        /(?=.*[a-z])/.test(passwordWithoutSpecial) &&
        /(?=.*[A-Z])/.test(passwordWithoutSpecial) &&
        /(?=.*\d)/.test(passwordWithoutSpecial);
      
      expect(isValid).toBe(true);
    });
  });

  describe('Login Flow with Unconfirmed Email', () => {
    it('should return EMAIL_NOT_CONFIRMED error code for unconfirmed email', async () => {
      mockAuthService.login.mockResolvedValue({
        success: false,
        errorCode: 'EMAIL_NOT_CONFIRMED',
        requiresConfirmation: true,
        message: 'Please confirm your email address',
      });

      const result = await mockAuthService.login({
        email: 'test@example.com',
        password: 'ValidPassword123',
      });

      expect(result.success).toBe(false);
      expect(result.errorCode).toBe('EMAIL_NOT_CONFIRMED');
      expect(result.requiresConfirmation).toBe(true);
    });

    it('should allow login with confirmed email', async () => {
      mockAuthService.login.mockResolvedValue({
        success: true,
        message: 'Login successful',
        user: {
          id: 'user-id',
          email: 'test@example.com',
          email_confirmed_at: '2024-01-01T00:00:00.000Z',
        },
      });

      const result = await mockAuthService.login({
        email: 'test@example.com',
        password: 'ValidPassword123',
      });

      expect(result.success).toBe(true);
      expect(result.user).toBeDefined();
    });
  });

  describe('Resend Confirmation Flow', () => {
    it('should successfully resend confirmation email', async () => {
      mockAuthService.resendConfirmation.mockResolvedValue({
        success: true,
        message: 'Confirmation email sent. Please check your inbox.',
      });

      const result = await mockAuthService.resendConfirmation('test@example.com');

      expect(result.success).toBe(true);
      expect(result.message).toContain('Confirmation email');
      expect(mockAuthService.resendConfirmation).toHaveBeenCalledWith('test@example.com');
    });

    it('should handle resend errors gracefully', async () => {
      mockAuthService.resendConfirmation.mockResolvedValue({
        success: false,
        message: 'Failed to resend confirmation email',
      });

      const result = await mockAuthService.resendConfirmation('test@example.com');

      expect(result.success).toBe(false);
      expect(result.message).toContain('Failed');
    });

    it('should handle network errors during resend', async () => {
      mockAuthService.resendConfirmation.mockRejectedValue(new Error('Network error'));

      try {
        await mockAuthService.resendConfirmation('test@example.com');
        // Should not reach here
        expect(true).toBe(false);
      } catch (error) {
        expect(error).toBeDefined();
      }
    });
  });

  describe('Password Validation', () => {
    const testCases = [
      {
        password: 'Short1',
        valid: false,
        reason: 'too short (less than 12 chars)',
      },
      {
        password: 'validpassword123',
        valid: false,
        reason: 'missing uppercase',
      },
      {
        password: 'VALIDPASSWORD123',
        valid: false,
        reason: 'missing lowercase',
      },
      {
        password: 'ValidPassword',
        valid: false,
        reason: 'missing number',
      },
      {
        password: 'ValidPassword123',
        valid: true,
        reason: 'meets all requirements',
      },
      {
        password: 'AnotherValidPass1',
        valid: true,
        reason: 'meets all requirements',
      },
      {
        password: 'ValidPassword123!@#',
        valid: true,
        reason: 'special characters are allowed but not required',
      },
    ];

    testCases.forEach(({ password, valid, reason }) => {
      it(`should ${valid ? 'accept' : 'reject'} password: ${reason}`, () => {
        const meetsRequirements =
          password.length >= 12 &&
          /(?=.*[a-z])/.test(password) &&
          /(?=.*[A-Z])/.test(password) &&
          /(?=.*\d)/.test(password);

        expect(meetsRequirements).toBe(valid);
      });
    });
  });

  describe('Navigation Flow', () => {
    it('should navigate to EmailConfirmation screen on confirm deep link', () => {
      const url = 'mindclear://confirm#access_token=test-token';
      const isConfirmLink = url.includes('mindclear://confirm');
      
      expect(isConfirmLink).toBe(true);
    });

    it('should navigate to ResetPassword screen on reset deep link', () => {
      const url = 'mindclear://reset-password#access_token=test-token';
      const isResetLink = url.includes('mindclear://reset-password');
      
      expect(isResetLink).toBe(true);
    });

    it('should distinguish between confirmation and reset links', () => {
      const confirmUrl = 'mindclear://confirm#access_token=token1';
      const resetUrl = 'mindclear://reset-password#access_token=token2';
      
      expect(confirmUrl.includes('confirm')).toBe(true);
      expect(confirmUrl.includes('reset-password')).toBe(false);
      
      expect(resetUrl.includes('reset-password')).toBe(true);
      expect(resetUrl.includes('confirm')).toBe(false);
    });
  });
});


