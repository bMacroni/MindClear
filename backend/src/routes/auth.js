import express from 'express';
import logger from '../utils/logger.js';
import { createClient } from '@supabase/supabase-js';
import { body, validationResult } from 'express-validator';
import { validateInput, commonValidations } from '../middleware/security.js';
import { requireAuth, handleLogout } from '../middleware/enhancedAuth.js';

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
      user: data.user
    });
  } catch (error) {
    logger.error('Login error:', error);
    res.status(500).json({ error: 'Internal server error' });
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

// Logout endpoint with token blacklisting
router.post('/logout', requireAuth, handleLogout);

export default router; 