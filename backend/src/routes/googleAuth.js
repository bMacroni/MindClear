import express from 'express';
import logger from '../utils/logger.js';
import { google } from 'googleapis';
import oauth2Client from '../utils/googleAuth.js';
import { createClient } from '@supabase/supabase-js';
import { storeGoogleTokens } from '../utils/googleTokenStorage.js';
import crypto from 'crypto';

const router = express.Router();
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_ANON_KEY);

// PKCE Helper Functions
function generateCodeVerifier() {
  // Generate a cryptographically secure random string (43-128 characters)
  // Using 64 characters for good security
  return crypto.randomBytes(32).toString('base64url');
}

function generateCodeChallenge(verifier) {
  // Create SHA256 hash of verifier and base64url encode it
  return crypto.createHash('sha256').update(verifier).digest('base64url');
}

// In-memory store for PKCE challenges (in production, use Redis or database)
const pkceStore = new Map();
const PKCE_EXPIRY = 10 * 60 * 1000; // 10 minutes

// Helper function to store PKCE challenge with expiration
function storePKCEChallenge(state, challenge) {
  pkceStore.set(state, {
    challenge,
    timestamp: Date.now()
  });
  
  // Clean up expired challenges periodically
  if (pkceStore.size > 100) {
    cleanupExpiredPKCE();
  }
}

// Helper function to validate and retrieve PKCE challenge
function validatePKCEChallenge(state) {
  const stored = pkceStore.get(state);
  if (!stored) return null;
  
  // Check if challenge has expired (handle both timestamp and expiresAt formats)
  const isExpired = stored.timestamp ? 
    (Date.now() - stored.timestamp > PKCE_EXPIRY) :
    (stored.expiresAt && stored.expiresAt < Date.now());
    
  if (isExpired) {
    pkceStore.delete(state);
    return null;
  }
  
  return stored;
}

// Clean up expired PKCE challenges
function cleanupExpiredPKCE() {
  const now = Date.now();
  for (const [state, data] of pkceStore.entries()) {
    if (now - data.timestamp > PKCE_EXPIRY) {
      pkceStore.delete(state);
    }
  }
}

// Helper function to generate secure mobile state with PKCE
function generateMobileState(userId) {
  const codeVerifier = generateCodeVerifier();
  const codeChallenge = generateCodeChallenge(codeVerifier);
  
  // Store the verifier temporarily (10 minutes TTL)
  const expiresAt = Date.now() + (10 * 60 * 1000);
  storePKCEChallenge(codeChallenge, { userId, codeVerifier, expiresAt });
  
  return { state: `mobile:${codeChallenge}`, codeVerifier, codeChallenge };
}

// Helper function to verify mobile state and retrieve PKCE data
function verifyMobileState(state) {
  if (!state?.startsWith('mobile:')) {
    return null;
  }
  
  try {
    const codeChallenge = state.slice('mobile:'.length);
    const pkceData = pkceStore.get(codeChallenge);
    
    if (!pkceData) {
      throw new Error('PKCE challenge not found or expired');
    }
    
    if (pkceData.expiresAt < Date.now()) {
      pkceStore.delete(codeChallenge);
      throw new Error('PKCE challenge expired');
    }
    
    return { userId: pkceData.userId, codeVerifier: pkceData.codeVerifier };
  } catch (error) {
    logger.error('Mobile state verification failed:', error.message);
    return null;
  }
}

// Helper function to consume PKCE challenge (one-time use)
function consumePkceChallenge(state) {
  if (!state?.startsWith('mobile:')) {
    return null;
  }
  
  const codeChallenge = state.slice('mobile:'.length);
  const pkceData = validatePKCEChallenge(codeChallenge);
  
  if (pkceData) {
    // Remove the challenge after use (one-time use)
    pkceStore.delete(codeChallenge);
    return pkceData;
  }
  
  return null;
}

// 1. Start OAuth flow for login
router.get('/login', (req, res) => {
  const scopes = [
    'https://www.googleapis.com/auth/calendar',
    'https://www.googleapis.com/auth/userinfo.email'
  ];
  
  // Generate secure state parameter to prevent CSRF attacks
  const state = Buffer.from(JSON.stringify({
    nonce: crypto.randomUUID(),
    ts: Date.now()
  })).toString('base64url');
  
  // Store state in secure HTTP-only cookie
  res.cookie('oauth_state', state, { 
    httpOnly: true, 
    sameSite: 'lax', 
    secure: true, 
    maxAge: 10 * 60 * 1000 // 10 minutes
  });
  
  const url = oauth2Client.generateAuthUrl({
    access_type: 'offline',
    scope: scopes,
    prompt: 'consent',
    state
  });
  res.redirect(url);
});

router.get('/mobile-login', async (req, res) => {
  // Require authenticated user; derive userId from Supabase JWT
  const jwt = req.headers.authorization?.replace('Bearer ', '');
  if (!jwt) {
    return res.status(401).json({ error: 'Missing Authorization bearer token' });
  }
  const authed = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_ANON_KEY, {
    global: { headers: { Authorization: `Bearer ${jwt}` } }
  });
  const { data: userData, error: authError } = await authed.auth.getUser();
  const user = userData?.user;
  if (authError || !user?.id) {
    return res.status(401).json({ error: 'Invalid session' });
  }

  try {
    // Generate secure mobile state with PKCE
    const { state, codeVerifier, codeChallenge } = generateMobileState(user.id);

    const scopes = [
      'https://www.googleapis.com/auth/calendar',
      'https://www.googleapis.com/auth/calendar.events',
      'https://www.googleapis.com/auth/userinfo.email',
      'https://www.googleapis.com/auth/userinfo.profile'
    ];

    const url = oauth2Client.generateAuthUrl({
      access_type: 'offline',
      scope: scopes,
      state,
      code_challenge: codeChallenge,
      code_challenge_method: 'S256',
      prompt: 'consent'
    });

    // Return both the auth URL and the code verifier for the client to store
    res.json({
      authUrl: url,
      codeVerifier: codeVerifier  // Client must store this securely
    });
  } catch (error) {
    logger.error('Error generating mobile OAuth URL:', error);
    res.status(500).json({ error: 'Failed to generate OAuth URL' });
  }
});
// 2. Handle OAuth callback for login (web flow only - mobile uses separate endpoint)
router.get('/callback', async (req, res) => {
  const code = req.query.code;
  const state = req.query.state;
  const cookieState = req.cookies?.oauth_state;

  if (!code) return res.status(400).send('No code provided');
  
  // CSRF Protection: Verify state parameter
  if (!state && !cookieState) {
    return res.status(400).send('Missing state parameter');
  }
  
  // Reject mobile flows - they should use the mobile-token endpoint
  if (state?.startsWith('mobile:')) {
    return res.status(400).send('Mobile OAuth flows must use /mobile-token endpoint');
  }
  
  // For web flow, verify state matches cookie
  if (state !== cookieState) {
    return res.status(400).send('Invalid state parameter - possible CSRF attack');
  }
  // Clear the state cookie after successful verification
  res.clearCookie('oauth_state');

  try {
    // 1. Exchange code for tokens
    const { tokens } = await oauth2Client.getToken(code);
    logger.info('Google tokens received successfully');
    
    // Token exchange result

    // 2. Get user info from Google
    oauth2Client.setCredentials(tokens);
    const oauth2 = google.oauth2({ version: 'v2', auth: oauth2Client });
    const userInfo = await oauth2.userinfo.get();
    
    const googleEmail = userInfo.data.email;
    const googleName = userInfo.data.name;

    // Web flow - redirect to frontend
    const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:5173';
    res.redirect(`${frontendUrl}?google=info&email=${encodeURIComponent(googleEmail)}&name=${encodeURIComponent(googleName)}`);
    
  } catch (err) {
    logger.error('Error in Google OAuth callback:', err);
    const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:5173';
    res.redirect(`${frontendUrl}?google=error&message=${encodeURIComponent('OAuth callback failed')}`);
  }
});

// 2.5. Mobile token exchange endpoint (PKCE flow)
router.post('/mobile-token', async (req, res) => {
  const { code, state, codeVerifier } = req.body;
  
  if (!code || !state || !codeVerifier) {
    return res.status(400).json({ error: 'Missing required parameters: code, state, codeVerifier' });
  }
  
  try {
    // Verify PKCE challenge and consume it (one-time use)
    const pkceData = consumePkceChallenge(state);
    if (!pkceData) {
      return res.status(400).json({ error: 'Invalid or expired PKCE challenge' });
    }
    
    // Verify the code verifier matches what we stored
    if (pkceData.codeVerifier !== codeVerifier) {
      return res.status(400).json({ error: 'Invalid code verifier' });
    }
    
    // Exchange authorization code for tokens using PKCE
    const { tokens } = await oauth2Client.getToken({
      code: code,
      code_verifier: codeVerifier
    });
    
    logger.info('Google tokens received successfully via PKCE');
    
    // Get user info from Google
    oauth2Client.setCredentials(tokens);
    const oauth2 = google.oauth2({ version: 'v2', auth: oauth2Client });
    const userInfo = await oauth2.userinfo.get();
    
    const googleEmail = userInfo.data.email;
    const googleName = userInfo.data.name;
    
    // Store tokens for the verified user
    await storeGoogleTokens(pkceData.userId, {
      access_token: tokens.access_token,
      refresh_token: tokens.refresh_token,
      token_type: tokens.token_type || 'Bearer',
      scope: tokens.scope || 'https://www.googleapis.com/auth/calendar.events.readonly',
      expiry_date: tokens.expiry_date || (Date.now() + 3600 * 1000),
    });
    
    logger.info(`Stored Google tokens for mobile user: ${pkceData.userId}`);
    
    res.json({
      success: true,
      email: googleEmail,
      name: googleName,
      message: 'Google tokens stored successfully'
    });
    
  } catch (error) {
    logger.error('Error in mobile token exchange:', error);
    res.status(500).json({ error: 'Token exchange failed' });
  }
});

export default router;
