import { jwtDecode } from 'jwt-decode';
import { secureStorage } from './secureStorage';
import { AndroidStorageMigrationService } from './storageMigration';
import { apiFetch } from './apiService';
import logger from '../utils/logger';
import getSupabaseClient from './supabaseClient';
import { configService } from './config';

// Helper function to decode JWT token
function decodeJWT(token: string): any {
  try {
    return jwtDecode(token);
  } catch (error) {
    logger.error('Error decoding JWT', error);
    return null;
  }
}

// Helper function to check if JWT token is expired
function isTokenExpired(token: string): boolean {
  const decoded = decodeJWT(token) as any;
  if (!decoded) {
    return true;
  }
  const exp = Number(decoded?.exp);
  if (!Number.isFinite(exp)) {
    return true; // no/invalid exp ⇒ treat as expired
  }
  const leeway = 30; // seconds - configurable via environment if needed
  const now = Math.floor(Date.now() / 1000);
  // Expire if exp is at or before now + leeway
  return exp <= (now + leeway);
}

export interface User {
  id: string;
  email: string;
  email_confirmed_at?: string;
  created_at?: string;
  updated_at?: string;
}

export interface AuthState {
  user: User | null;
  token: string | null;
  isLoading: boolean;
  isAuthenticated: boolean;
}

export interface LoginCredentials {
  email: string;
  password: string;
}

export interface SignupCredentials {
  email: string;
  password: string;
  fullName: string;
}

export interface RefreshTokenResult {
  success: boolean;
  error?: 'auth' | 'network' | 'unknown';
}

class AuthService {
  private static instance: AuthService;
  private authState: AuthState = {
    user: null,
    token: null,
    isLoading: true,
    isAuthenticated: false,
  };
  private listeners: ((_state: AuthState) => void)[] = [];
  private initialized = false;
  private refreshTimer: ReturnType<typeof setTimeout> | null = null;
  private refreshPromise: Promise<RefreshTokenResult> | null = null;

  private constructor() {
    this.initializeAuth();
  }

  public static getInstance(): AuthService {
    if (!AuthService.instance) {
      AuthService.instance = new AuthService();
    }
    return AuthService.instance;
  }

  // Initialize auth state from storage
  private async initializeAuth() {
    try {
      // Check if migration is needed and perform it
      const needsMigration = await AndroidStorageMigrationService.checkMigrationNeeded();
      if (needsMigration) {
        logger.info('Migrating auth data to secure storage...');
        const migrationResult = await AndroidStorageMigrationService.migrateAuthData();
        if (!migrationResult.success) {
          logger.warn('Some auth data migration failed', { errors: migrationResult.errors });
        }
      }

      // Get authentication data from secure storage
      let token = await secureStorage.get('auth_token');
      let userData = await secureStorage.get('auth_user');
      
      // Fallback: migrate legacy keys
      if (!token) {
        const legacyToken = await secureStorage.get('authToken');
        if (legacyToken) {
          token = legacyToken;
          await secureStorage.set('auth_token', legacyToken);
        }
      }
      if (!userData) {
        const legacyUser = await secureStorage.get('authUser');
        if (legacyUser) {
          userData = legacyUser;
          await secureStorage.set('auth_user', legacyUser);
        }
      }
      
      if (token) {
        // Check if token is expired
        if (isTokenExpired(token)) {
          // Handle expired token on initialization
          await this.handleExpiredTokenOnInit();
        } else {
          // Try to get user data from storage first
          let user: User | null = null;
          
          if (userData) {
            try {
              user = JSON.parse(userData);
            } catch (error) {
              logger.error('Error parsing user data', error);
            }
          }
          
          // If no user data in storage, try to extract from JWT token
          if (!user) {
            const decodedToken = decodeJWT(token);
            if (decodedToken) {
              // Require a stable ID before creating the user object
              const stableId = decodedToken.sub || decodedToken.user_id;
              const idString = stableId ? String(stableId).trim() : '';
              
              // Only proceed if we have a valid, non-empty ID
              if (idString && decodedToken.email && typeof decodedToken.email === 'string') {
                // Guard against non-numeric iat values
                const iatValue = decodedToken.iat;
                const isValidIat = typeof iatValue === 'number' && !isNaN(iatValue) && isFinite(iatValue);
                
                user = {
                  id: idString,
                  email: decodedToken.email,
                  email_confirmed_at: decodedToken.email_verified_at,
                  created_at: isValidIat ? new Date(iatValue * 1000).toISOString() : undefined,
                  updated_at: isValidIat ? new Date(iatValue * 1000).toISOString() : undefined,
                };
              } else {
                // Log invalid token case when ID is missing or email is invalid
                logger.warn('Invalid JWT token: missing stable ID or invalid email', {
                  hasId: !!idString,
                  hasEmail: !!decodedToken.email,
                  emailType: typeof decodedToken.email
                });
              }
            }
          }
          
          if (user) {
            this.authState = {
              user,
              token,
              isLoading: false,
              isAuthenticated: true,
            };
            // Start background token refresh timer
            this.startBackgroundRefresh();
          } else {
            // If user reconstruction failed but we have a valid token, 
            // attempt to fetch user profile from server
            logger.info('User reconstruction failed, attempting to fetch profile from server...');
            const profileResult = await this.getProfile();
            
            if (profileResult.success && profileResult.user) {
              // Profile fetch successful, use the user data
              this.authState = {
                user: profileResult.user,
                token,
                isLoading: false,
                isAuthenticated: true,
              };
              // Start background token refresh timer
              this.startBackgroundRefresh();
              // Save the user data to storage for future use
              await secureStorage.set('auth_user', JSON.stringify(profileResult.user));
            } else {
              // Profile fetch failed or token is invalid, clear auth data
              logger.warn('Profile fetch failed, clearing auth data:', profileResult.message);
              await this.clearAuthData();
              this.setUnauthenticatedState();
            }
          }
        }
      } else {
        this.setUnauthenticatedState();
      }
      
      this.initialized = true;
      this.notifyListeners();
    } catch (error) {
      logger.error('Error initializing auth', error);
      this.setUnauthenticatedState();
      this.initialized = true;
      this.notifyListeners();
    }
  }

  // Handle expired token during initialization
  private async handleExpiredTokenOnInit(): Promise<void> {
    // Attempt to refresh the token before logging out
    const refreshResult = await this.refreshToken();
    if (!refreshResult.success) {
      // If refresh fails, then clear auth data
      const errorType = refreshResult.error || 'unknown';
      logger.warn(`Token refresh failed (${errorType}), clearing auth data.`);
      await this.clearAuthData();
      this.setUnauthenticatedState();
    } else {
      // Refresh succeeded - refreshToken() has already updated authState via setAuthData()
      // Verify that state contains token and user (should always be true if refresh succeeded)
      if (this.authState.token && this.authState.user) {
        // State is already updated by refreshToken() -> setAuthData()
        // Ensure isLoading is false and start background refresh
        this.authState.isLoading = false;
        this.startBackgroundRefresh();
      } else {
        // This should not happen if refreshToken() is working correctly
        // But handle it gracefully as a safety check
        logger.error('Refresh succeeded but authState missing token/user. This indicates a bug in refreshToken().');
        await this.clearAuthData();
        this.setUnauthenticatedState();
      }
    }
  }

  private setUnauthenticatedState() {
    this.authState = {
      user: null,
      token: null,
      isLoading: false,
      isAuthenticated: false,
    };
  }

  private async clearAuthData() {
    try {
      await secureStorage.multiRemove(['auth_token', 'auth_user', 'auth_refresh_token', 'authToken', 'authUser']);
    } catch (error) {
      logger.error('Error clearing auth data', error);
    }
  }

  // Handle logout when refresh token is missing
  private async handleMissingRefreshTokenLogout(): Promise<void> {
    logger.warn('Token expired and no refresh token available. Logging out.');
    await secureStorage.multiRemove(['auth_token', 'auth_user', 'auth_refresh_token', 'authToken', 'authUser']);
    this.stopBackgroundRefresh();
    this.setUnauthenticatedState();
    this.notifyListeners();
  }
  // Get current auth state
  public getAuthState(): AuthState {
    return { ...this.authState };
  }

  // Subscribe to auth state changes
  public subscribe(listener: (_state: AuthState) => void): () => void {
    this.listeners.push(listener);
    
    // Immediately notify with current state (may be loading)
    listener(this.getAuthState());
    
    // Return unsubscribe function
    return () => {
      const index = this.listeners.indexOf(listener);
      if (index > -1) {
        this.listeners.splice(index, 1);
      }
    };
  }

  // Notify all listeners of state changes
  private notifyListeners() {
    const currentState = this.getAuthState();
    this.listeners.forEach(listener => listener(currentState));
  }

  // Sign up new user
  public async signup(credentials: SignupCredentials): Promise<{ success: boolean; message: string; user?: User; requiresConfirmation?: boolean }> {
    try {
      this.authState.isLoading = true;
      this.notifyListeners();

      const supabase = getSupabaseClient();
      const { data, error } = await supabase.auth.signUp({
        email: credentials.email,
        password: credentials.password,
        options: {
          emailRedirectTo: configService.getMindClearConfirmUri(),
          data: {
            full_name: credentials.fullName,
          },
        },
      });

      if (error) {
        return { success: false, message: error.message || 'Signup failed' };
      }

      if (data.user && !data.session) {
        // User created but needs email confirmation
        return { 
          success: true, 
          message: 'Account created successfully! Please check your email to confirm your account.',
          requiresConfirmation: true
        };
      } else if (data.user && data.session) {
        // Successfully created user and got session
        const userEmail = data.user.email;
        
        if (!userEmail) {
          logger.error('Signup successful but email is missing from user data', { userId: data.user.id });
          return { success: false, message: 'Signup failed: Invalid user data received.' };
        }

        const user: User = {
          id: data.user.id,
          email: userEmail,
          email_confirmed_at: data.user.email_confirmed_at,
          created_at: data.user.created_at,
          updated_at: data.user.updated_at,
        };

        await this.setAuthData(data.session.access_token, user, data.session.refresh_token);
        return { success: true, message: 'Signup successful', user };
      } else {
        // Should not happen typically if error is null
        return { success: false, message: 'Signup failed. Please try again.' };
      }
    } catch (_error) {
      logger.error('Signup error', _error);
      return { success: false, message: 'Network error. Please try again.' };
    } finally {
      this.authState.isLoading = false;
      this.notifyListeners();
    }
  }

  // Login user
  public async login(credentials: LoginCredentials): Promise<{ success: boolean; message: string; user?: User; errorCode?: string; requiresConfirmation?: boolean }> {
    try {
      this.authState.isLoading = true;
      this.notifyListeners();

      const { ok, data } = await apiFetch('/auth/login', {
        method: 'POST',
        body: JSON.stringify(credentials),
      });

      if (ok && data.token) {
        await this.setAuthData(data.token, data.user, data.refresh_token);
        return { success: true, message: data.message, user: data.user };
      } else {
        // Check if it's an email confirmation error
        if (data.errorCode === 'EMAIL_NOT_CONFIRMED') {
          return { 
            success: false, 
            message: data.message || 'Please confirm your email address',
            errorCode: 'EMAIL_NOT_CONFIRMED',
            requiresConfirmation: true
          };
        }
        return { success: false, message: data.error || 'Login failed' };
      }
    } catch (_error) {
      logger.error('Login error', _error);
      return { success: false, message: 'Network error. Please try again.' };
    } finally {
      this.authState.isLoading = false;
      this.notifyListeners();
    }
  }

  // Resend confirmation email
  public async resendConfirmation(email: string): Promise<{ success: boolean; message: string }> {
    try {
      const { ok, data } = await apiFetch('/auth/resend-confirmation', {
        method: 'POST',
        body: JSON.stringify({ email }),
      });

      if (ok) {
        return { 
          success: true, 
          message: data.message || 'Confirmation email sent. Please check your inbox.' 
        };
      } else {
        return { 
          success: false, 
          message: data.error || 'Failed to resend confirmation email' 
        };
      }
    } catch (_error) {
      logger.error('Resend confirmation error', _error);
      return { 
        success: false, 
        message: 'Network error. Please try again.' 
      };
    }
  }

  // Logout user
  public async logout(): Promise<void> {
    try {
      // Stop background refresh timer
      this.stopBackgroundRefresh();
      
      await this.clearAuthData();
      
      this.authState = {
        user: null,
        token: null,
        isLoading: false,
        isAuthenticated: false,
      };
      
      this.notifyListeners();
    } catch (_error) {
      logger.error('Logout error', _error);
    }
  }

  // Get current user profile
  public async getProfile(): Promise<{ success: boolean; user?: User; message?: string }> {
    try {
      const token = await this.getAuthToken();
      if (!token) {
        return { success: false, message: 'No authentication token' };
      }

      const { ok, data } = await apiFetch('/auth/profile', {
        method: 'GET',
      }, 15000);

      if (ok) {
        return { success: true, user: data };
      } else {
        return { success: false, message: data.error || 'Failed to get profile' };
      }
    } catch (_error) {
      logger.error('Get profile error', _error);
      return { success: false, message: 'Network error' };
    }
  }

  // Get authentication token
  public async getAuthToken(): Promise<string | null> {
    // If initialization is in progress and we're refreshing, wait for it to complete
    if (!this.initialized && this.refreshPromise) {
      const refreshResult = await this.refreshPromise;
      if (refreshResult.success && this.authState.token) {
        return this.authState.token;
      }
      return null;
    }

    if (this.authState.token) {
      // Check if the current token is expired
      if (isTokenExpired(this.authState.token)) {
        // Token is expired, attempt to refresh before giving up
        // But don't refresh if initialization is still in progress (to avoid race conditions)
        if (!this.initialized) {
          return null;
        }
        const refreshResult = await this.refreshToken();
        if (refreshResult.success) {
          return this.authState.token; // Return the new token
        }
        // Refresh failed - check error type and handle accordingly
        if (refreshResult.error === 'auth') {
          // Auth failure - clear auth and logout
          logger.warn('Token refresh failed due to authentication error. Logging out.');
          await this.handleMissingRefreshTokenLogout();
        } else {
          // Network or unknown error - check if we have a refresh token
          // If no refresh token, clear auth and logout
          const refreshTokenValue = await secureStorage.get('auth_refresh_token');
          if (!refreshTokenValue) {
            await this.handleMissingRefreshTokenLogout();
          }
        }
        return null;
      }
      return this.authState.token;
    }
    
    try {
      const token = await secureStorage.get('auth_token');
      if (token) {
        // Check if token is expired
        if (isTokenExpired(token)) {
          // Token is expired, attempt to refresh before giving up
          // But don't refresh if initialization is still in progress (to avoid race conditions)
          if (!this.initialized) {
            return null;
          }
          const refreshResult = await this.refreshToken();
          if (refreshResult.success) {
            return this.authState.token; // Return the new token
          }
          // Refresh failed - check error type and handle accordingly
          if (refreshResult.error === 'auth') {
            // Auth failure - clear auth and logout
            logger.warn('Token refresh failed due to authentication error. Logging out.');
            await this.handleMissingRefreshTokenLogout();
          } else {
            // Network or unknown error - check if we have a refresh token
            // If no refresh token, clear auth and logout
            const refreshTokenValue = await secureStorage.get('auth_refresh_token');
            if (!refreshTokenValue) {
              await this.handleMissingRefreshTokenLogout();
            }
          }
          return null;
        }
        this.authState.token = token;
      }
      return token;
    } catch (_error) {
      logger.error('Error getting auth token', _error);
      return null;
    }
  }

  // Set authentication data
  private async setAuthData(token: string, user: User, refreshToken?: string): Promise<void> {
    // Validate token before storing
    if (!token || token === 'undefined' || token === 'null') {
      throw new Error('Invalid authentication token');
    }

    // Check if token is expired before storing
    if (isTokenExpired(token)) {
      throw new Error('Authentication token is expired');
    }

    await secureStorage.set('auth_token', token);
    await secureStorage.set('auth_user', JSON.stringify(user));
    
    // Store refresh token if provided and verify it was stored
    if (refreshToken) {
      await secureStorage.set('auth_refresh_token', refreshToken);
      // Verify refresh token was stored successfully
      const storedRefreshToken = await secureStorage.get('auth_refresh_token');
      if (!storedRefreshToken || storedRefreshToken !== refreshToken) {
        logger.error('Failed to store refresh token securely. Authentication may not persist.');
        // Don't throw - allow login to proceed, but log the issue
      } else {
        if (__DEV__) {
          logger.info('Refresh token stored successfully');
        }
      }
    } else {
      logger.warn('No refresh token provided during authentication. Session may not persist across app restarts.');
    }
    
    this.authState = {
      user,
      token,
      isLoading: false,
      isAuthenticated: true,
    };
    
    // Start background token refresh timer
    this.startBackgroundRefresh();
    
    this.notifyListeners();
  }

  // Set session (public method for external use)
  public async setSession(token: string, user: User, refreshToken?: string): Promise<void> {
    await this.setAuthData(token, user, refreshToken);
  }

  // Check if user is authenticated
  public isAuthenticated(): boolean {
    return this.authState.isAuthenticated && !!this.authState.token;
  }

  // Check if auth service is initialized
  public isInitialized(): boolean {
    return this.initialized;
  }

  // Get current user
  public getCurrentUser(): User | null {
    return this.authState.user;
  }

  // Debug method to re-initialize auth
  public async debugReinitialize(): Promise<void> {
   this.initialized = false;
    await this.initializeAuth();
  }


  // Refresh token (if needed) - with queue to prevent multiple simultaneous attempts
  public async refreshToken(): Promise<RefreshTokenResult> {
    // If there's already a refresh in progress, return that promise
    if (this.refreshPromise) {
      return this.refreshPromise;
    }
    
    this.refreshPromise = this.performRefresh();
    const result = await this.refreshPromise;
    this.refreshPromise = null;
    return result;
  }

  // Internal method to perform the actual refresh
  private async performRefresh(): Promise<RefreshTokenResult> {
    try {
      const refreshTokenValue = await secureStorage.get('auth_refresh_token');
      if (!refreshTokenValue) {
        logger.warn('No refresh token found. Cannot refresh session. User will need to sign in again.');
        // Don't immediately logout - let the user continue until next API call fails
        // This provides better UX by not interrupting the user's current session
        return { success: false, error: 'auth' };
      }

      const { ok, status, data } = await apiFetch('/auth/refresh', {
        method: 'POST',
        headers: {
          'Authorization': '', // Explicitly bypass token attachment
        },
        body: JSON.stringify({ refresh_token: refreshTokenValue }),
      }, 15000);

      if (ok && data.access_token) {
        // Use setAuthData for atomic updates of all auth state
        await this.setAuthData(
          data.access_token, 
          data.user, 
          data.refresh_token
        );
        if (__DEV__) {
          logger.info('Token refreshed successfully');
        }
        return { success: true };
      } else {
        // Classify error based on HTTP status and response payload
        const errorMessage = data?.error || 'Token refresh failed';
        const errorCode = data?.code || '';
        const errorString = typeof errorMessage === 'string' ? errorMessage.toLowerCase() : '';
        const codeString = typeof errorCode === 'string' ? errorCode.toLowerCase() : '';
        
        // Check for authentication failures: 401/403 status or explicit auth error codes
        const isAuthError = 
          status === 401 || 
          status === 403 || 
          errorString.includes('invalid_refresh') ||
          errorString.includes('revoked') ||
          codeString.includes('invalid_refresh') ||
          codeString.includes('revoked') ||
          codeString === 'unauthorized' ||
          codeString === 'forbidden';
        
        if (isAuthError) {
          logger.warn(`Token refresh failed (auth): ${errorMessage}. User will need to sign in again.`);
          return { success: false, error: 'auth' };
        } else {
          // Network or other errors
          logger.warn(`Token refresh failed (network/unknown): ${errorMessage}`);
          return { success: false, error: status === 0 || status >= 500 ? 'network' : 'unknown' };
        }
      }
    } catch (_error) {
      // Thrown exceptions are treated as network errors
      logger.error('Token refresh error (network)', _error);
      return { success: false, error: 'network' };
    }
  }

  // Check and refresh token if needed (for app state recovery)
  public async checkAndRefreshTokenIfNeeded(): Promise<boolean> {
    if (!this.initialized) {
      return false;
    }

    if (!this.authState.isAuthenticated || !this.authState.token) {
      return false;
    }

    // Check if token is expired or will expire soon (within 10 minutes)
    const token = this.authState.token;
    if (!token) {
      return false;
    }

    const decoded = decodeJWT(token);
    const exp = Number(decoded?.exp);
    if (!decoded || !Number.isFinite(exp)) {
      return false;
    }

    const expMs = exp * 1000;
    const now = Date.now();
    const timeUntilExpiry = expMs - now;
    const refreshThreshold = 10 * 60 * 1000; // 10 minutes

    // Refresh if expired or will expire within 10 minutes
    if (timeUntilExpiry <= refreshThreshold) {
      if (__DEV__) {
        logger.info('Token expired or expiring soon, refreshing proactively...');
      }
      const refreshResult = await this.refreshToken();
      return refreshResult.success;
    }

    return true;
  }

  // Start background token refresh timer
  private startBackgroundRefresh(): void {
    // Clear any existing timer
    this.stopBackgroundRefresh();
    
    if (!this.authState.isAuthenticated) {
      return;
    }

    // Calculate refresh time from token expiry
    const token = this.authState.token;
    if (!token) {
      return;
    }
    
    const decoded = decodeJWT(token);
    const exp = Number(decoded?.exp);
    if (!decoded || !Number.isFinite(exp)) {
      logger.warn('Cannot start background refresh: invalid token expiry');
      return;
    }
    
    const expMs = exp * 1000; // Convert to milliseconds
    const now = Date.now();
    const timeUntilExpiry = expMs - now;
    
    // Refresh 5 minutes before expiry, or immediately if less than 5 min left
    const refreshBuffer = 5 * 60 * 1000; // 5 minutes
    const refreshInterval = Math.max(timeUntilExpiry - refreshBuffer, 0);
    
    this.refreshTimer = setTimeout(async () => {
      if (this.authState.isAuthenticated) {
        await this.refreshToken();
      }
    }, refreshInterval);
  }

  // Stop background token refresh timer
  private stopBackgroundRefresh(): void {
    if (this.refreshTimer) {
      clearTimeout(this.refreshTimer);
      this.refreshTimer = null;
    }
  }
}

// Export singleton instance
export const authService = AuthService.getInstance();
