import React, { createContext, useContext, useState, useEffect } from 'react';
import { goalsAPI, tasksAPI } from '../services/api';
import api from '../services/api';
import { SecureTokenStorage, sanitizeInput, validateEmail } from '../utils/security';

// API Base URL configuration
const API_BASE_URL = import.meta.env.VITE_SECURE_API_BASE || import.meta.env.VITE_API_URL || 'http://localhost:5000/api';

const AuthContext = createContext();

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  // Check for Google OAuth callback
  const checkGoogleOAuthCallback = async () => {
    const urlParams = new URLSearchParams(window.location.search);
    const googleParam = urlParams.get('google');
    const email = urlParams.get('email');
    const name = urlParams.get('name');
    const message = urlParams.get('message');
    
    if (googleParam === 'info' && email) {
      // Google OAuth provided user info
      console.log(`Google OAuth user info: ${email} (${name})`);
      // Store the email in sessionStorage for potential use
      sessionStorage.setItem('google_oauth_email', email);
      sessionStorage.setItem('google_oauth_name', name || '');
      // Clean up the URL
      window.history.replaceState({}, document.title, window.location.pathname);
      return false; // User still needs to log in
    } else if (googleParam === 'error' && message) {
      // Google OAuth failed
      console.error('Google OAuth error:', message);
      // Clean up the URL
      window.history.replaceState({}, document.title, window.location.pathname);
      return false;
    }
    return false;
  };

  useEffect(() => {
    const initializeAuth = async () => {
      // First check for Google OAuth callback
      await checkGoogleOAuthCallback();
      
      // Check if user is logged in on app start
      const token = SecureTokenStorage.getToken();
      if (token) {
        try {
          // Verify the token and get user info
          const response = await api.get('/auth/profile');
          if (response.data) {
            setUser({ 
              token, 
              ...response.data 
            });
          } else {
            // Token is invalid, remove it
            SecureTokenStorage.removeToken();
          }
        } catch (error) {
          console.error('Error verifying token:', error);
          SecureTokenStorage.removeToken();
        }
      }
      
      setLoading(false);
    };

    initializeAuth();
  }, []);

  const login = (token) => {
    SecureTokenStorage.setToken(token);
    setUser({ token });
  };

  const loginWithCredentials = async (email, password) => {
    try {
      // Validate and sanitize input
      const sanitizedEmail = sanitizeInput(email);
      const sanitizedPassword = sanitizeInput(password);
      
      if (!validateEmail(sanitizedEmail)) {
        return { success: false, error: 'Invalid email format' };
      }
      
      const response = await api.post('/auth/login', { 
        email: sanitizedEmail, 
        password: sanitizedPassword 
      });
      
      if (response.data.token) {
        SecureTokenStorage.setToken(response.data.token);
        setUser({ 
          token: response.data.token,
          ...response.data.user 
        });
        return { success: true };
      } else {
        throw new Error('No token received');
      }
    } catch (error) {
      console.error('Login error:', error);
      return { 
        success: false, 
        error: error.response?.data?.error || error.message || 'Login failed' 
      };
    }
  };

  const signup = async (email, password) => {
    try {
      // Validate and sanitize input
      const sanitizedEmail = sanitizeInput(email);
      const sanitizedPassword = sanitizeInput(password);
      
      if (!validateEmail(sanitizedEmail)) {
        return { success: false, error: 'Invalid email format' };
      }
      
      const response = await api.post('/auth/signup', { 
        email: sanitizedEmail, 
        password: sanitizedPassword 
      });
      const data = response.data;
      
      if (data.token) {
        // Auto-login succeeded
        SecureTokenStorage.setToken(data.token);
        setUser({ 
          token: data.token,
          ...data.user 
        });
        return { success: true };
      } else if (data.userCreated) {
        // User was created but auto-login failed
        return { success: true, message: 'Account created! Please log in.', userCreated: true };
      } else {
        return { success: false, error: data.error || 'Signup failed' };
      }
    } catch (error) {
      console.error('Signup error:', error);
      return { 
        success: false, 
        error: error.response?.data?.error || error.message || 'Signup failed' 
      };
    }
  };

  const logout = () => {
    SecureTokenStorage.removeToken();
    sessionStorage.removeItem('google_oauth_email');
    sessionStorage.removeItem('google_oauth_name');
    setUser(null);
  };

  const isAuthenticated = () => {
    return !!user?.token;
  };

  const value = {
    user,
    login,
    loginWithCredentials,
    signup,
    logout,
    isAuthenticated,
    loading,
  };

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
}; 