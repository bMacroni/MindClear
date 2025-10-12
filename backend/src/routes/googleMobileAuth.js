import express from 'express';
import logger from '../utils/logger.js';
import { createClient } from '@supabase/supabase-js';
import oauth2Client from '../utils/googleAuth.js';
import { storeGoogleTokens } from '../utils/googleTokenStorage.js';
import { google } from 'googleapis';

const router = express.Router();

// Initialize Supabase client with service role key for admin operations (public schema)
const supabaseAdmin = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

// Helper: admin find user by email using listUsers with pagination
async function findUserByEmail(email) {
  try {
    let page = 1;
    const perPage = 1000; // Get more users per page to reduce iterations
    
    while (true) {
      const { data, error } = await supabaseAdmin.auth.admin.listUsers({
        page,
        perPage
      });
      
      if (error) {
        return { error };
      }
      
      if (!data || !data.users) {
        return { user: null };
      }
      
      // Find user with matching email (case-insensitive)
      const foundUser = data.users.find(user => 
        user.email && user.email.toLowerCase() === email.toLowerCase()
      );
      
      if (foundUser) {
        return { user: foundUser };
      }
      
      // If we got fewer users than requested, we've reached the end
      if (data.users.length < perPage) {
        return { user: null };
      }
      
      page++;
    }
  } catch (error) {
    return { error };
  }
}

// Initialize regular Supabase client for user operations
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_ANON_KEY
);

/**
 * Verify Google ID token directly using Google Auth library
 */
async function verifyGoogleIdToken(idToken) {
  try {
    const { OAuth2Client } = await import('google-auth-library');
    const client = new OAuth2Client(process.env.GOOGLE_CLIENT_ID);
    
    const ticket = await client.verifyIdToken({
      idToken,
      audience: process.env.GOOGLE_CLIENT_ID
    });
    
    const payload = ticket.getPayload();
    
    if (!payload.email) {
      throw new Error('Email not found in Google ID token');
    }
    
    if (!payload.email_verified) {
      throw new Error('Email must be verified');
    }
    
    return {
      email: payload.email,
      name: payload.name,
      picture: payload.picture
    };
  } catch (error) {
    logger.error('Error verifying Google ID token:', error);
    throw error;
  }
}

/**
 * POST /api/auth/google/mobile-signin
 * Handles Google Sign-In for mobile clients
 * Creates new users or signs in existing Google users
 * Returns linking_required status for existing password-based accounts
 */
router.post('/mobile-signin', async (req, res) => {
  try {
    const { idToken, accessToken, serverAuthCode, webClientId: mobileWebClientId } = req.body;
    const headerWebClientId = req.headers['x-web-client-id'];
    try {
      const bodyKeys = Object.keys(req.body || {});
      logger.info(`[GoogleAuth] Incoming body keys: ${bodyKeys.join(', ')}; header X-Web-Client-Id present: ${Boolean(headerWebClientId)}`);
    } catch {}

    // Validate required fields
    if (!idToken || (!accessToken && !serverAuthCode)) {
      return res.status(400).json({
        error: 'idToken and serverAuthCode (or accessToken) are required'
      });
    }

    logger.info('Processing mobile Google sign-in request');

    // Verify Google ID token
    let decodedToken;
    try {
      decodedToken = await verifyGoogleIdToken(idToken);
    } catch (error) {
      logger.error('Google ID token verification failed:', error);
      
      // Handle specific error types
      if (error.message === 'Email must be verified') {
        return res.status(400).json({
          error: 'Email must be verified'
        });
      }
      
      return res.status(401).json({
        error: 'Invalid Google token'
      });
    }

    const { email, name, picture } = decodedToken;
    logger.info(`Google sign-in attempt for email: ${email}`);

    // Check if user exists in Supabase (use auth.users via service role)
    const { user: existingUserRow, error: userFetchError } = await findUserByEmail(email);
    if (userFetchError) {
      logger.error('Error checking existing user:', userFetchError);
      return res.status(500).json({ error: 'Failed to check existing user' });
    }

    let userId;
    let userSession;

    if (existingUserRow?.id) {
      // User exists - trust Google authentication and sign them in
      userId = existingUserRow.id;
      logger.info(`Existing user found: ${userId}`);

      try {
        // Securely sign in the user using their Google ID token (server-side)
        const { data: signInData, error: signInError } = await supabase.auth.signInWithIdToken({
          provider: 'google',
          token: idToken,
        });

        if (signInError) {
          logger.error('Error signing in existing user with ID token:', signInError);
          return res.status(500).json({
            error: 'Failed to create user session'
          });
        }

        userSession = signInData;
        logger.info(`Existing user signed in via Google ID token: ${userId}`);
      } catch (sessionError) {
        logger.error('Error creating session for existing user:', sessionError);
        return res.status(500).json({
          error: 'Failed to create user session'
        });
      }
    } else {
      // User doesn't exist - create new user
      logger.info(`Creating new user for email: ${email}`);

      const { data: newUser, error: createError } = await supabaseAdmin.auth.admin.createUser({
        email,
        email_confirm: true,
        user_metadata: {
          full_name: name,
          avatar_url: picture,
          provider: 'google'
        }
      });

      if (createError) {
        logger.error('Error creating new user:', createError);
        return res.status(500).json({
          error: createError.message
        });
      }

      userId = newUser.user.id;
      logger.info(`New user created: ${userId}`);

      // For new users, we need to create a proper Supabase session
      // Securely sign in with the Google ID token to get a proper session
      try {
        const { data: signInData, error: signInError } = await supabase.auth.signInWithIdToken({
          provider: 'google',
          token: idToken,
        });

        if (signInError) {
          logger.error('Error signing in new user with ID token:', signInError);
          return res.status(500).json({
            error: 'Failed to create user session'
          });
        }

        userSession = signInData;
        logger.info('Proper Supabase session created for new Google user via ID token');
      } catch (sessionError) {
        logger.error('Error creating session for new user:', sessionError);
        return res.status(500).json({
          error: 'Failed to create user session'
        });
      }
    }

    // Store Google tokens for calendar integration
    try {
      // Prefer exchanging a serverAuthCode to obtain refresh_token
      if (serverAuthCode) {
        // Use a dedicated OAuth2 client for mobile code exchange with redirect_uri 'postmessage'
        const { google } = await import('googleapis');
        const mobileOauthClient = new google.auth.OAuth2(
          process.env.GOOGLE_CLIENT_ID,
          process.env.GOOGLE_CLIENT_SECRET,
          process.env.GOOGLE_REDIRECT_URI || 'postmessage'
        );
        try {
          const backendId = process.env.GOOGLE_CLIENT_ID || '';
          const backendFirst6 = backendId.slice(0, 6);
          const backendLast6 = backendId.slice(-6);
          const mobileId = mobileWebClientId || headerWebClientId || '';
          const mobileFirst6 = mobileId ? mobileId.slice(0, 6) : 'n/a';
          const mobileLast6 = mobileId ? mobileId.slice(-6) : 'n/a';
          const codePreview = typeof serverAuthCode === 'string' ? `${serverAuthCode.slice(0, 6)}...(${serverAuthCode.length})` : 'n/a';
          logger.info(`[GoogleAuth] Exchanging serverAuthCode using redirect_uri=postmessage, backend_client_id=${backendFirst6}...${backendLast6}, mobile_webClientId=${mobileFirst6}...${mobileLast6}, code=${codePreview}`);
        } catch (_) {}
        const { tokens } = await mobileOauthClient.getToken(serverAuthCode);
        
        // Token exchange result
        
        if (!tokens.refresh_token) {
          console.warn(`[GoogleAuth] WARNING: No refresh token received from Google!`);
          console.warn(`[GoogleAuth] This might be because:`);
          console.warn(`[GoogleAuth] 1. User has already authorized this app before`);
          console.warn(`[GoogleAuth] 2. Mobile app is not requesting offline access properly`);
          console.warn(`[GoogleAuth] 3. Google OAuth configuration issue`);
        }
        
        await storeGoogleTokens(userId, {
          access_token: tokens.access_token,
          refresh_token: tokens.refresh_token,
          token_type: tokens.token_type || 'Bearer',
          scope: tokens.scope || 'https://www.googleapis.com/auth/calendar.events.readonly',
          expiry_date: tokens.expiry_date || (Date.now() + 3600 * 1000),
        });
        logger.info(`Exchanged serverAuthCode and stored Google tokens for user: ${userId}`);
              } else {
          logger.info(`No serverAuthCode provided - calendar integration will be requested separately`);
        }
    } catch (tokenError) {
      const details = tokenError?.response?.data || tokenError?.message || tokenError;
      logger.warn('Error storing Google tokens:', details);
      // Don't fail the sign-in for token storage issues
    }

    // Validate that we have a valid token before returning
    if (!userSession.session.access_token) {
      logger.error('No access token in session data');
      return res.status(500).json({
        error: 'Failed to generate valid session token'
      });
    }

    // Return successful response
    res.json({
      token: userSession.session.access_token,
      refresh_token: userSession.session.refresh_token,
      user: {
        id: userSession.user.id,
        email: userSession.user.email,
        full_name: userSession.user.user_metadata?.full_name,
        avatar_url: userSession.user.user_metadata?.avatar_url
      }
    });

  } catch (error) {
    logger.error('Mobile Google sign-in error:', error);
    res.status(500).json({
      error: 'Internal server error'
    });
  }
});



/**
 * DELETE /api/auth/google/delete-user (ADMIN ONLY - for testing)
 * Deletes a user by email - use only for development/testing
 */
router.delete('/delete-user', async (req, res) => {
  try {
    const { email } = req.body;

    if (!email) {
      return res.status(400).json({
        error: 'Email is required'
      });
    }

    logger.info(`Admin delete user request for email: ${email}`);

    // Find the user
    const { user: existingUser, error: getUserError } = await findUserByEmail(email);

    if (getUserError || !existingUser?.id) {
      return res.status(404).json({
        error: 'User not found'
      });
    }

    // Delete the user
    const { error: deleteError } = await supabaseAdmin.auth.admin.deleteUser(existingUser.id);

    if (deleteError) {
      logger.error('Error deleting user:', deleteError);
      return res.status(500).json({
        error: 'Failed to delete user'
      });
    }

    // Also delete from google_tokens table if exists
    try {
      await supabaseAdmin
        .from('google_tokens')
        .delete()
        .eq('user_id', existingUser.id);
    } catch (tokenError) {
      logger.warn('Error deleting Google tokens:', tokenError);
      // Don't fail the deletion for token cleanup issues
    }

    logger.info(`User deleted successfully: ${existingUser.id}`);
    res.json({
      message: 'User deleted successfully',
      userId: existingUser.id
    });

  } catch (error) {
    logger.error('Delete user error:', error);
    res.status(500).json({
      error: 'Internal server error'
    });
  }
});

export default router;
