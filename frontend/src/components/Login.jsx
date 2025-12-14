import React, { useState, useEffect } from 'react';
import {useNavigate} from 'react-router-dom'
import { authAPI } from '../services/api';
import PasswordInput from './PasswordInput';

const Login = ({ onLogin, onSwitchToSignup }) => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [successMessage, setSuccessMessage] = useState('');
  const [showEmailForm, setShowEmailForm] = useState(false);
  const [googleOAuthInfo, setGoogleOAuthInfo] = useState(null);
  const [showResendButton, setShowResendButton] = useState(false);
  const [resendLoading, setResendLoading] = useState(false);
  const navigate = useNavigate();

  useEffect(() => {
    // Check if we have Google OAuth info
    const googleEmail = sessionStorage.getItem('google_oauth_email');
    const googleName = sessionStorage.getItem('google_oauth_name');
    
    if (googleEmail) {
      setGoogleOAuthInfo({ email: googleEmail, name: googleName });
      setEmail(googleEmail); // Pre-fill the email field
    }
  }, []);

  const handleCredentialsSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setSuccessMessage('');
    setShowResendButton(false);
    setLoading(true);

    const result = await onLogin(email, password);
    if (!result.success) {
      setError(result.error || 'Login failed');
      // Check if it's an email confirmation error
      if (result.errorCode === 'EMAIL_NOT_CONFIRMED') {
        setShowResendButton(true);
      }
    } else {
      // Clear Google OAuth info on successful login
      sessionStorage.removeItem('google_oauth_email');
      sessionStorage.removeItem('google_oauth_name');
      navigate('/');
    }
    setLoading(false);
  };

  const handleResendConfirmation = async () => {
    setResendLoading(true);
    setError('');
    setSuccessMessage('');
    try {
      await authAPI.resendConfirmation(email);
      setSuccessMessage('Confirmation email sent! Please check your inbox.');
    } catch (error) {
      setError('Failed to resend confirmation email. Please try again.');
    } finally {
      setResendLoading(false);
    }
  };

  const handleGoogleLogin = () => {
    const apiBaseUrl = import.meta.env.VITE_SECURE_API_BASE || import.meta.env.VITE_API_URL || 'http://localhost:5000/api';
    const backendUrl = apiBaseUrl.replace('/api', ''); // Remove /api to get the base backend URL
    const url = `${backendUrl}/api/auth/google/login`;
    window.location.href = url;
  };

  return (
    <div className="min-h-screen bg-white flex items-center justify-center p-6">
      <div className="bg-white/90 backdrop-blur-sm rounded-3xl shadow-2xl border border-black/10 p-8 max-w-md w-full animate-scaleIn">
        <div className="text-center mb-8">
          <div className="w-16 h-16 bg-black rounded-2xl flex items-center justify-center mx-auto mb-4 shadow-lg">
            <svg className="w-8 h-8 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.746 0 3.332.477 4.5 1.253v13C19.832 18.477 18.246 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
            </svg>
          </div>
          <h2 className="text-3xl font-bold text-black">
            Welcome Back
          </h2>
          <p className="text-gray-600 mt-2">Sign in to your Mind Clear account</p>
        </div>

        {/* Google OAuth Info Message */}
        {googleOAuthInfo && (
          <div className="mb-6 bg-blue-50/80 backdrop-blur-sm border border-blue-200 text-blue-700 px-4 py-3 rounded-2xl text-sm">
            <div className="flex items-center space-x-2">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              <span>
                Welcome, {googleOAuthInfo.name || googleOAuthInfo.email}! 
                Please sign in with your email and password to continue.
              </span>
            </div>
          </div>
        )}

        {/* Google OAuth Login Button */}
        <div className="space-y-4">
          <button
            onClick={handleGoogleLogin}
            className="w-full px-6 py-4 bg-white text-black rounded-2xl border-2 border-gray-200 hover:border-gray-300 focus:outline-none focus:ring-4 focus:ring-blue-500/20 shadow-lg transition-all duration-200 transform hover:scale-105 font-medium"
          >
            <span className="flex items-center justify-center space-x-3">
              <svg className="w-5 h-5" viewBox="0 0 24 24">
                <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
                <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
                <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
                <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
              </svg>
              <span>Sign-in with Google</span>
            </span>
          </button>

          {/* Divider */}
          <div className="relative">
            <div className="absolute inset-0 flex items-center">
              <div className="w-full border-t border-gray-300"></div>
            </div>
            <div className="relative flex justify-center text-sm">
              <span className="px-2 bg-white text-gray-500">or</span>
            </div>
          </div>

          {/* Email/Password Option */}
          {!showEmailForm ? (
            <button
              onClick={() => setShowEmailForm(true)}
              className="w-full px-6 py-4 bg-black text-white rounded-2xl hover:bg-gray-900 focus:outline-none focus:ring-4 focus:ring-black/10 shadow-lg transition-all duration-200 transform hover:scale-105 font-medium"
            >
              <span className="flex items-center justify-center space-x-2">
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 12a4 4 0 10-8 0 4 4 0 008 0zm0 0v1.5a2.5 2.5 0 005 0V12a9 9 0 10-9 9m4.5-1.206a8.959 8.959 0 01-4.5 1.207" />
                </svg>
                <span>Sign in with Email</span>
              </span>
            </button>
          ) : (
            <form onSubmit={handleCredentialsSubmit} className="space-y-6">
              <div>
                <label htmlFor="email" className="block text-sm font-semibold text-gray-700 mb-2">
                  Email
                </label>
                <input
                  type="email"
                  id="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  className="w-full px-4 py-3 border-2 border-gray-200 rounded-2xl focus:outline-none focus:ring-4 focus:ring-blue-500/20 focus:border-blue-500 bg-white/80 backdrop-blur-sm shadow-sm transition-all duration-200"
                  placeholder="Enter your email"
                />
              </div>
              <div>
                <label htmlFor="password" className="block text-sm font-semibold text-gray-700 mb-2">
                  Password
                </label>
                <PasswordInput
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  placeholder="Enter your password"
                />
              </div>
              {successMessage && (
                <div className="bg-green-50/80 backdrop-blur-sm border border-green-200 text-green-700 px-4 py-3 rounded-2xl text-sm">
                  <div className="flex items-center space-x-2">
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                    <span>{successMessage}</span>
                  </div>
                </div>
              )}
              {error && (
                <div className="bg-red-50/80 backdrop-blur-sm border border-red-200 text-red-700 px-4 py-3 rounded-2xl text-sm">
                  <div className="flex items-center space-x-2">
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                    <span>{error}</span>
                  </div>
                </div>
              )}
              {showResendButton && (
                <div className="text-center">
                  <button
                    type="button"
                    onClick={handleResendConfirmation}
                    disabled={resendLoading}
                    className="text-sm text-blue-600 hover:text-blue-800 font-medium hover:underline transition-all duration-200 disabled:opacity-50"
                  >
                    {resendLoading ? 'Sending...' : 'Resend Confirmation Email'}
                  </button>
                </div>
              )}
              <div className="flex space-x-3">
                <button
                  type="submit"
                  disabled={loading}
                  className="flex-1 px-6 py-4 bg-black text-white rounded-2xl hover:bg-gray-900 focus:outline-none focus:ring-4 focus:ring-black/10 disabled:opacity-50 shadow-lg transition-all duration-200 transform hover:scale-105 font-medium"
                >
                  {loading ? (
                    <span className="flex items-center justify-center space-x-2">
                      <svg className="animate-spin -ml-1 mr-2 h-4 w-4 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                      </svg>
                      <span>Signing in...</span>
                    </span>
                  ) : (
                    <span className="flex items-center justify-center space-x-2">
                      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 16l-4-4m0 0l4-4m-4 4h14m-5 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h7a3 3 0 013 3v1" />
                      </svg>
                      <span>Sign In</span>
                    </span>
                  )}
                </button>
                <button
                  type="button"
                  onClick={() => setShowEmailForm(false)}
                  className="px-6 py-4 bg-gray-100 text-gray-700 rounded-2xl hover:bg-gray-200 focus:outline-none focus:ring-4 focus:ring-gray-500/20 shadow-lg transition-all duration-200 font-medium"
                >
                  Back
                </button>
              </div>
            </form>
          )}
        </div>

        {/* Signup Link */}
        <div className="mt-8 text-center">
          <button
            onClick={onSwitchToSignup}
            className="text-sm text-blue-600 hover:text-blue-800 font-medium hover:underline transition-all duration-200"
          >
            Don&apos;t have an account? Sign up
          </button>
        </div>
      </div>
    </div>
  );
};

export default Login;