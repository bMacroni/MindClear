import express from 'express';
import logger from '../utils/logger.js';
import { createClient } from '@supabase/supabase-js';
import { body, validationResult } from 'express-validator';
import { validateInput, commonValidations } from '../middleware/security.js';
import { requireAuth, handleLogout } from '../middleware/enhancedAuth.js';
import { logSecurityEvent, SecurityEventTypes } from '../utils/securityMonitor.js';

const router = express.Router();
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_ANON_KEY);

// Signup endpoint with input validation
router.post('/signup', [
  commonValidations.email,
  commonValidations.password,
  commonValidations.string('full_name', 1, 100)
], validateInput, async (req, res) => {
  try {
    const { email, password, full_name } = req.body;
    logger.info('Signup attempt for email:', email);

    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password are required' });
    }

    const { data, error } = await supabase.auth.signUp({
      email,
      password,
    });

    if (error) {
      logger.error('Signup error:', error);
      return res.status(400).json({ error: error.message });
    }

    logger.info('Supabase signup response:', data);

    if (data.user) {
      logger.info('User created successfully:', data.user.email);
      
      // Try to get the session token
      try {
        const { data: sessionData, error: sessionError } = await supabase.auth.signInWithPassword({
          email,
          password,
        });

        if (sessionError) {
          logger.error('Auto-login error:', sessionError);
          
          // Check if it's an email confirmation error
          if (sessionError.message.includes('Email not confirmed') || sessionError.code === 'email_not_confirmed') {
            return res.status(200).json({ 
              message: 'User created successfully. Please check your email and confirm your account before logging in.',
              userCreated: true,
              error: 'Email confirmation required. Please check your email and click the confirmation link.'
            });
          }
          
          // Other auto-login errors
          return res.status(200).json({ 
            message: 'User created successfully. Please log in.',
            userCreated: true,
            error: 'Auto-login failed. Please log in manually.'
          });
        }

        // If we have a session, set initial profile fields (e.g., full_name) in public.users
        try {
          if (full_name) {
            const authedSupabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_ANON_KEY, {
              global: { headers: { Authorization: `Bearer ${sessionData.session.access_token}` } }
            });
            await authedSupabase
              .from('users')
              .update({ full_name })
              .eq('id', sessionData.user.id);
          }
        } catch (profileErr) {
          logger.warn('Failed to set initial full_name after signup:', profileErr?.message || profileErr);
        }

        res.json({
          message: 'User created and logged in successfully',
          token: sessionData.session.access_token,
          refresh_token: sessionData.session.refresh_token,
          user: sessionData.user
        });
      } catch (loginError) {
        logger.error('Login attempt error:', loginError);
        res.status(200).json({ 
          message: 'User created successfully. Please log in.',
          userCreated: true,
          error: 'Auto-login failed. Please log in manually.'
        });
      }
    } else {
      res.status(400).json({ error: 'Failed to create user' });
    }
  } catch (error) {
    logger.error('Signup error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Login endpoint with input validation
router.post('/login', [
  commonValidations.email,
  body('password')
    .isLength({ min: 1, max: 128 })
    .withMessage('Password is required')
], validateInput, async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password are required' });
    }

    const { data, error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    if (error) {
      logger.error('Login error:', error);
      return res.status(400).json({ error: error.message });
    }

    // Update last_login in users table for this user
    try {
      const authedSupabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_ANON_KEY, {
        global: { headers: { Authorization: `Bearer ${data.session.access_token}` } }
      });
      await authedSupabase
        .from('users')
        .update({ last_login: new Date().toISOString() })
        .eq('id', data.user.id);
    } catch (e) {
      logger.warn('Failed to update last_login:', e?.message || e);
    }

    res.json({
      message: 'Login successful',
      token: data.session.access_token,
      refresh_token: data.session.refresh_token,
      user: data.user
    });
  } catch (error) {
    logger.error('Login error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Request password reset (preserve provider-specific email formatting)
router.post('/request-password-reset', [
  body('email')
    .isEmail()
    .trim()
    .toLowerCase()
    .withMessage('Please provide a valid email address')
], validateInput, async (req, res) => {
  try {
    const { email } = req.body;

    // Log security event (LOW)
    logSecurityEvent(SecurityEventTypes.PASSWORD_RESET_REQUESTED, 1, {
      endpoint: '/api/auth/request-password-reset'
    }, req);

    // Use Supabase to send reset email with deep link to app
    const redirectTo = 'mindclear://reset-password';
    try {
      const { error } = await supabase.auth.resetPasswordForEmail(email, { redirectTo });
      if (error) {
        // Do not leak details; optionally log at warn
        logger.warn('Password reset Supabase error', { code: error.code, message: error.message });
      }
    } catch (err) {
      // Swallow errors to avoid enumeration; log minimal info
      logger.warn('Password reset request failed', { message: err?.message });
    }

    return res.status(200).json({
      message: 'If an account with this email exists, a password reset link has been sent.'
    });
  } catch (error) {
    // Still return generic success to prevent enumeration
    logger.error('Password reset request error', error);
    return res.status(200).json({
      message: 'If an account with this email exists, a password reset link has been sent.'
    });
  }
});

// Perform password reset using Supabase access_token
router.post('/reset-password', [
  body('access_token').isLength({ min: 10 }).withMessage('Valid access token is required'),
  commonValidations.password
], validateInput, async (req, res) => {
  try {
    const { access_token, password } = req.body;

    // Create a client scoped to the provided access_token
    const authedSupabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_ANON_KEY, {
      global: { headers: { Authorization: `Bearer ${access_token}` } }
    });

    // Resolve user from the access_token
    const { data: userData, error: getUserError } = await authedSupabase.auth.getUser();
    if (getUserError || !userData?.user?.id) {
      logger.warn('Supabase getUser failed during password reset', { message: getUserError?.message || 'Unknown error' });
      return res.status(400).json({ error: 'Invalid or expired reset token' });
    }

    // Use Admin API (service role) to update the user's password by ID
    const adminSupabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
    const { data: updateData, error: adminError } = await adminSupabase.auth.admin.updateUserById(userData.user.id, { password });
    if (adminError) {
      logger.warn('Supabase admin.updateUserById failed during password reset', { message: adminError.message });
      return res.status(400).json({ error: 'Failed to reset password' });
    }

    logger.info('Password reset completed');
    return res.json({ message: 'Password updated successfully' });
  } catch (error) {
    logger.error('Password reset error', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

// Profile endpoint - get user info from JWT token (using enhanced auth middleware)
router.get('/profile', requireAuth, async (req, res) => {
  try {
    res.json({
      id: req.user.id,
      email: req.user.email,
      email_confirmed_at: req.user.email_confirmed_at,
      created_at: req.user.created_at,
      updated_at: req.user.updated_at
    });
  } catch (error) {
    logger.error('Profile error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Token refresh endpoint
router.post('/refresh', async (req, res) => {
  try {
    // Validate input - require refresh_token in request body
    const { refresh_token } = req.body;
    if (!refresh_token) {
      logger.warn('Token refresh failed - no refresh_token provided');
      return res.status(400).json({ error: 'refresh_token is required' });
    }
    
    // Create Supabase client for refresh operations
    const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_ANON_KEY);
    
    // Attempt to refresh the session using the refresh token
    const { data: sessionData, error: refreshError } = await supabase.auth.refreshSession({
      refresh_token
    });
    
    if (refreshError || !sessionData?.session) {
      logger.warn('Token refresh failed:', refreshError?.message || 'No session returned');
      return res.status(401).json({ 
        error: 'Invalid or expired refresh token',
        details: refreshError?.message 
      });
    }
    
    const { session } = sessionData;
    
    // Return the new tokens and user info
    res.json({
      message: 'Token refreshed successfully',
      token: session.access_token,
      access_token: session.access_token,
      refresh_token: session.refresh_token,
      expires_at: session.expires_at,
      user: {
        id: session.user.id,
        email: session.user.email,
        email_confirmed_at: session.user.email_confirmed_at,
        created_at: session.user.created_at,
        updated_at: session.user.updated_at
      }
    });
    
    logger.info('Token refresh successful for user:', session.user.id);
  } catch (error) {
    logger.error('Token refresh error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Logout endpoint with token blacklisting
router.post('/logout', requireAuth, handleLogout);

export default router; 