import { jwtDecode } from 'jwt-decode';
import { secureStorage } from './secureStorage';
import { AndroidStorageMigrationService } from './storageMigration';
import { apiFetch } from './apiService';
import logger from '../utils/logger';

// Helper function to decode JWT token
function decodeJWT(token: string): any {
  try {
    return jwtDecode(token);
  } catch (error) {
    console.error('🔐 AuthService: Error decoding JWT:', error);
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
  private refreshTimer: NodeJS.Timeout | null = null;
  private refreshPromise: Promise<boolean> | null = null;

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
        logger.info('🔐 Migrating auth data to secure storage...');
        const migrationResult = await AndroidStorageMigrationService.migrateAuthData();
        if (!migrationResult.success) {
          console.warn('⚠️ Some auth data migration failed:', migrationResult.errors);
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
          await this.clearAuthData();
          this.setUnauthenticatedState();
        } else {
          // Try to get user data from storage first
          let user: User | null = null;
          
          if (userData) {
            try {
              user = JSON.parse(userData);
            } catch (error) {
              console.error('Error parsing user data:', error);
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
                console.warn('Invalid JWT token: missing stable ID or invalid email', {
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
      console.error('Error initializing auth:', error);
      this.setUnauthenticatedState();
      this.initialized = true;
      this.notifyListeners();
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
      console.error('Error clearing auth data:', error);
    }
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
  public async signup(credentials: SignupCredentials): Promise<{ success: boolean; message: string; user?: User }> {
    try {
      this.authState.isLoading = true;
      this.notifyListeners();

      const { ok, data } = await apiFetch('/auth/signup', {
        method: 'POST',
        body: JSON.stringify({
          email: credentials.email,
          password: credentials.password,
          full_name: credentials.fullName
        }),
      });

      if (ok && data.token) {
        // Successfully created user and got token
        await this.setAuthData(data.token, data.user, data.refresh_token);
        return { success: true, message: data.message, user: data.user };
      } else if (ok && data.userCreated) {
        // User created but needs email confirmation
        return { success: true, message: data.message };
      } else {
        // Error occurred
        return { success: false, message: data.error || 'Signup failed' };
      }
    } catch (_error) {
      console.error('Signup error:', _error);
      return { success: false, message: 'Network error. Please try again.' };
    } finally {
      this.authState.isLoading = false;
      this.notifyListeners();
    }
  }

  // Login user
  public async login(credentials: LoginCredentials): Promise<{ success: boolean; message: string; user?: User }> {
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
        return { success: false, message: data.error || 'Login failed' };
      }
    } catch (_error) {
      console.error('Login error:', _error);
      return { success: false, message: 'Network error. Please try again.' };
    } finally {
      this.authState.isLoading = false;
      this.notifyListeners();
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
      console.error('Logout error:', _error);
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
      console.error('Get profile error:', _error);
      return { success: false, message: 'Network error' };
    }
  }

  // Get authentication token
  public async getAuthToken(): Promise<string | null> {
    if (this.authState.token) {
      // Check if the current token is expired
      if (isTokenExpired(this.authState.token)) {
        // Token is expired, attempt to refresh before giving up
        const refreshSuccess = await this.refreshToken();
        if (refreshSuccess) {
          return this.authState.token; // Return the new token
        }
        // Only logout if refresh fails
        await secureStorage.multiRemove(['auth_token', 'auth_user', 'authToken', 'authUser']);
        this.setUnauthenticatedState();
        this.notifyListeners();
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
          const refreshSuccess = await this.refreshToken();
          if (refreshSuccess) {
            return this.authState.token; // Return the new token
          }
          // Only logout if refresh fails
          await secureStorage.multiRemove(['auth_token', 'auth_user', 'authToken', 'authUser']);
          this.setUnauthenticatedState();
          this.notifyListeners();
          return null;
        }
        this.authState.token = token;
      }
      return token;
    } catch (_error) {
      console.error('Error getting auth token:', _error);
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
    
    // Store refresh token if provided
    if (refreshToken) {
      await secureStorage.set('auth_refresh_token', refreshToken);
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
  public async refreshToken(): Promise<boolean> {
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
  private async performRefresh(): Promise<boolean> {
    try {
      const refreshTokenValue = await secureStorage.get('auth_refresh_token');
      if (!refreshTokenValue) {
        await this.logout();
        return false;
      }

      const { ok, data } = await apiFetch('/auth/refresh', {
        method: 'POST',
        body: JSON.stringify({ refresh_token: refreshTokenValue }),
      }, 15000);

      if (ok && data.access_token) {
        // Use setAuthData for atomic updates of all auth state
        await this.setAuthData(
          data.access_token, 
          data.user, 
          data.refresh_token
        );
        return true;
      } else {
        // Token is invalid, logout user
        await this.logout();
        return false;
      }
    } catch (_error) {
      console.error('Token refresh error:', _error);
      await this.logout();
      return false;
    }
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
      console.warn('Cannot start background refresh: invalid token expiry');
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
