import AsyncStorage from '@react-native-async-storage/async-storage';
import { jwtDecode } from 'jwt-decode';
import { configService } from './config';
import { secureStorage } from './secureStorage';
import { AndroidStorageMigrationService } from './storageMigration';

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
  try {
    const decoded = jwtDecode(token) as any;
    const exp = Number(decoded?.exp);
    if (!Number.isFinite(exp)) return true; // no/invalid exp ⇒ treat as expired
    const leeway = 30; // seconds
    const now = Math.floor(Date.now() / 1000);
    return exp < (now - leeway);
  } catch (error) {
    console.error('🔐 AuthService: Error checking token expiration:', error);
    return true;
  }
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
        console.log('🔐 Migrating auth data to secure storage...');
        const migrationResult = await AndroidStorageMigrationService.migrateAuthData();
        if (!migrationResult.success) {
          console.warn('⚠️ Some auth data migration failed:', migrationResult.errors);
        }
      }

      // Try both key formats with secure storage
      let token = await secureStorage.get('auth_token');
      let userData = await secureStorage.get('auth_user');
      
      // If not found, try alternative keys
      if (!token) {
        token = await secureStorage.get('authToken');
      }
      if (!userData) {
        userData = await secureStorage.get('authUser');
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
            if (decodedToken && decodedToken.email) {
              user = {
                id: decodedToken.sub || decodedToken.user_id,
                email: decodedToken.email,
                email_confirmed_at: decodedToken.email_verified_at,
                created_at: decodedToken.iat ? new Date(decodedToken.iat * 1000).toISOString() : undefined,
                updated_at: decodedToken.iat ? new Date(decodedToken.iat * 1000).toISOString() : undefined,
              };
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
            await this.clearAuthData();
            this.setUnauthenticatedState();
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
      await secureStorage.multiRemove(['auth_token', 'authToken', 'auth_user', 'authUser']);
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
    
    // Immediately notify the new listener with current state
    if (this.initialized) {
      listener(this.getAuthState());
    }
    
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

      const response = await fetch(`${configService.getBaseUrl()}/auth/signup`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(credentials),
      });

      const data = await response.json();

      if (response.ok && data.token) {
        // Successfully created user and got token
        await this.setAuthData(data.token, data.user);
        return { success: true, message: data.message, user: data.user };
      } else if (response.ok && data.userCreated) {
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

      const response = await fetch(`${configService.getBaseUrl()}/auth/login`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(credentials),
      });

      const data = await response.json();

      if (response.ok && data.token) {
        await this.setAuthData(data.token, data.user);
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

      const response = await fetch(`${configService.getBaseUrl()}/auth/profile`, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${token}`,
        },
      });

      const data = await response.json();

      if (response.ok) {
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
      return this.authState.token;
    }
    
    try {
      let token = await secureStorage.get('auth_token');
      if (!token) {
        token = await secureStorage.get('authToken');
      }
      if (token) {
        // Check if token is expired
        if (isTokenExpired(token)) {
          await this.clearAuthData();
          this.setUnauthenticatedState();
          this.notifyListeners();
          return null;
        }
        this.authState.token = token;
        this.notifyListeners();
      }
      return token;
    } catch (_error) {
      console.error('Error getting auth token:', _error);
      return null;
    }
  }

  // Set authentication data
  private async setAuthData(token: string, user: User): Promise<void> {
    try {
      // Validate token before storing
      if (!token || token === 'undefined' || token === 'null') {
        console.error('Invalid token provided to setAuthData:', token);
        throw new Error('Invalid authentication token');
      }

      // Check if token is expired before storing
      if (isTokenExpired(token)) {
        console.error('Token is expired, cannot store auth data');
        throw new Error('Authentication token is expired');
      }

      await secureStorage.set('auth_token', token);
      await secureStorage.set('auth_user', JSON.stringify(user));
      
      this.authState = {
        user,
        token,
        isLoading: false,
        isAuthenticated: true,
      };
      
      this.notifyListeners();
    } catch (_error) {
      console.error('Error setting auth data:', _error);
    }
  }

  // Set session (public method for external use)
  public async setSession(token: string, user: User): Promise<void> {
    await this.setAuthData(token, user);
  }

  // Check if user is authenticated
  public isAuthenticated(): boolean {
    return this.authState.isAuthenticated && !!this.authState.token;
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

  // Refresh token (if needed)
  public async refreshToken(): Promise<boolean> {
    try {
      const token = await this.getAuthToken();
      if (!token) {
        return false;
      }

      const response = await fetch(`${configService.getBaseUrl()}/auth/profile`, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${token}`,
        },
      });

      if (response.ok) {
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
}

// Export singleton instance
export const authService = AuthService.getInstance();
