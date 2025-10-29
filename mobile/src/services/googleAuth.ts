import { GoogleSignin } from '@react-native-google-signin/google-signin';
import { Platform } from 'react-native';
import { configService } from './config';
import { authService } from './auth';
import secureConfigService from './secureConfig';
import logger from '../utils/logger';

// Helper function to get secure API base URL
const getSecureApiBaseUrl = (): string => {
  try {
    return secureConfigService.getApiBaseUrl();
  } catch (error) {
    logger.warn('Failed to get secure API base URL, falling back to config service:', error);
    return configService.getBaseUrl();
  }
};

export interface GoogleAuthResult {
  success: boolean;
  token?: string;
  idToken?: string;
  accessToken?: string;
  user?: any;
  error?: string;
}

class GoogleAuthService {
  private static instance: GoogleAuthService;
  private isConfigured = false;

  private constructor() {
    this.configureGoogleSignIn();
  }

  public static getInstance(): GoogleAuthService {
    if (!GoogleAuthService.instance) {
      GoogleAuthService.instance = new GoogleAuthService();
    }
    return GoogleAuthService.instance;
  }

  /**
   * Public method to force reconfiguration, useful when config becomes available later
   */
  public reconfigure(): void {
    this.isConfigured = false;
    this.configureGoogleSignIn();
  }

  private configureGoogleSignIn() {
    if (this.isConfigured) {
      return;
    }

    try {
      // Priority: 1) secureConfigService (from remote config) 2) configService (from env)
      let webClientId = secureConfigService.getGoogleWebClientId();
      let iosClientId = secureConfigService.getGoogleIosClientId();
      let androidClientId = secureConfigService.getGoogleAndroidClientId();

      // Fallback to configService if secureConfigService doesn't have them
      if (!webClientId) {
        webClientId = configService.getGoogleWebClientId();
      }
      if (!iosClientId) {
        iosClientId = configService.getGoogleIosClientId();
      }
      if (!androidClientId) {
        androidClientId = configService.getGoogleAndroidClientId();
      }

      // Check if we have the required web client ID
      if (!webClientId) {
        logger.warn('[GoogleAuth] Web client ID not available, skipping configuration');
        return;
      }

      const baseConfig: any = {
        // These will be set from environment variables or config
        webClientId: webClientId, // Required for getting the ID token
        offlineAccess: true, // Required for getting the access token
        forceCodeForRefreshToken: true, // Required for getting the refresh token
        scopes: [
          'openid', 
          'email', 
          'profile',
          'https://www.googleapis.com/auth/calendar.events.readonly'
        ],
      };

      // Add platform-specific client IDs if available
      if (Platform.OS === 'android' && androidClientId) {
        baseConfig.androidClientId = androidClientId;
      }

      if (Platform.OS === 'ios' && iosClientId) {
        baseConfig.iosClientId = iosClientId;
      }

      GoogleSignin.configure(baseConfig);
      this.isConfigured = true;
      logger.info('[GoogleAuth] Google Sign-In configured successfully');
    } catch (error) {
      logger.error('[GoogleAuth] Failed to configure Google Sign-In:', error);
    }
  }

  /**
   * Initiates Google Sign-In flow
   * Returns authentication result or linking required status
   */
  async signInWithGoogle(): Promise<GoogleAuthResult> {
    try {
      // Always try to configure if not configured or if client IDs weren't available before
      if (!this.isConfigured) {
        this.configureGoogleSignIn();
      }
      
      // If still not configured, the client IDs weren't available
      if (!this.isConfigured) {
        throw new Error('Google Sign-In not configured. Client IDs not available.');
      }

      // Check if Google Play Services are available (Android only)
      await GoogleSignin.hasPlayServices({ showPlayServicesUpdateDialog: true });

      // Sign in with Google
      const userInfo = await GoogleSignin.signIn();
      
      if (!userInfo.idToken) {
        throw new Error('No ID token received from Google');
      }

      // Send Google ID token and serverAuthCode directly to backend
      const result = await this.authenticateWithBackend(
        userInfo.idToken,
        userInfo.serverAuthCode || ''
      );

      return result;
    } catch (error: any) {
      console.error('Google Sign-In error:', error);
      
      // Handle specific Google Sign-In errors
      if (error.code === 'SIGN_IN_CANCELLED') {
        return {
          success: false,
          error: 'Sign-in was cancelled'
        };
      }
      
      if (error.code === 'PLAY_SERVICES_NOT_AVAILABLE') {
        return {
          success: false,
          error: 'Google Play Services not available'
        };
      }

      return {
        success: false,
        error: error.message || 'Google Sign-In failed'
      };
    }
  }

  /**
   * Authenticates with the backend using Google tokens
   */
  private async authenticateWithBackend(idToken: string, serverAuthCode: string): Promise<GoogleAuthResult> {
    try {
      const baseUrl = getSecureApiBaseUrl();
      // Priority: 1) secureConfigService 2) configService
      let webClientId = secureConfigService.getGoogleWebClientId();
      if (!webClientId) {
        webClientId = configService.getGoogleWebClientId();
      }
      
      console.log('[GoogleAuth] Authenticating with backend...');
      console.log(`[GoogleAuth] Backend URL: ${baseUrl}/auth/google/mobile-signin`);
      console.log(`[GoogleAuth] Web Client ID: ${webClientId ? `${webClientId.slice(0, 17)}...${webClientId.slice(-6)}` : 'NOT SET'}`);
      console.log(`[GoogleAuth] ID Token length: ${idToken ? idToken.length : 0}`);
      console.log(`[GoogleAuth] Server Auth Code: ${serverAuthCode ? `${serverAuthCode.slice(0, 6)}...(${serverAuthCode.length})` : 'NOT PROVIDED'}`);
      
      const response = await fetch(`${baseUrl}/auth/google/mobile-signin`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Web-Client-Id': webClientId,
        },
        body: JSON.stringify({
          idToken,
          serverAuthCode,
          webClientId,
        }),
      });

      const data = await response.json();
      
      console.log(`[GoogleAuth] Backend response status: ${response.status}`);
      console.log(`[GoogleAuth] Backend response data:`, {
        success: response.ok,
        hasToken: !!data.token,
        hasUser: !!data.user,
        error: data.error || 'none'
      });

      if (response.ok) {
        // Successful authentication
        console.log('[GoogleAuth] Authentication successful, setting session...');
        await authService.setSession(data.token, data.user, data.refresh_token);
        console.log('[GoogleAuth] Session set successfully');
        
        // If we have a user ID, trigger the OAuth flow for calendar permissions
        if (data.user?.id) {
          await this.triggerCalendarOAuth(data.user.id);
        }
        
        return {
          success: true,
          token: data.token,
          idToken,
          accessToken: undefined,
          user: data.user,
        };
      } else {
        // Authentication failed
        console.log(`[GoogleAuth] Authentication failed: ${data.error || 'Unknown error'}`);
        return {
          success: false,
          error: data.error || 'Authentication failed',
        };
      }
    } catch (error: any) {
      console.error('Backend authentication error:', error);
      return {
        success: false,
        error: error.message || 'Network error',
      };
    }
  }



  /**
   * Signs out from Google
   */
  async signOut(): Promise<void> {
    try {
      await GoogleSignin.signOut();
    } catch (error) {
      console.error('Google Sign-Out error:', error);
    }
  }

  /**
   * Gets current Google user (if signed in)
   */
  async getCurrentUser() {
    try {
      const currentUser = await GoogleSignin.getCurrentUser();
      return currentUser;
    } catch (error) {
      console.error('Error getting current Google user:', error);
      return null;
    }
  }

  /**
   * Checks if user is signed in to Google
   */
  async isSignedIn(): Promise<boolean> {
    try {
      const isSignedIn = await GoogleSignin.isSignedIn();
      return isSignedIn;
    } catch (error) {
      console.error('Error checking Google sign-in status:', error);
      return false;
    }
  }

  /**
   * Triggers OAuth flow for calendar permissions
   */
  private async triggerCalendarOAuth(userId: string): Promise<void> {
    try {
      const baseUrl = getSecureApiBaseUrl();
      const oauthUrl = `${baseUrl}/auth/google/login?state=mobile:${userId}`;
      
      console.log('[GoogleAuth] Triggering calendar OAuth flow...');
      console.log(`[GoogleAuth] OAuth URL: ${oauthUrl}`);
      
      // For mobile, we need to open this URL in a web browser
      // The user will be redirected back to the mobile app after OAuth completion
      // This is a simplified approach - in production you'd use a proper OAuth flow
      
      // For now, just log the URL - the user can manually complete the flow
      console.log('[GoogleAuth] Please complete OAuth flow manually by visiting:', oauthUrl);
      
    } catch (error) {
      console.error('[GoogleAuth] Error triggering calendar OAuth:', error);
    }
  }
}

export const googleAuthService = GoogleAuthService.getInstance();
