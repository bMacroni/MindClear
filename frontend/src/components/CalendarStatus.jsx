import React, { useState, useEffect, useRef } from 'react';
import { calendarAPI } from '../services/api';

const CalendarStatus = () => {
  const [status, setStatus] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(null);
  const [modalOpen, setModalOpen] = useState(false);
  
  // Add caching state
  const [lastStatusCheck, setLastStatusCheck] = useState(null);
  const STATUS_CACHE_DURATION = 2 * 60 * 1000; // 2 minutes in milliseconds
  
  // Ref to store timeout ID for cleanup
  const successTimeoutRef = useRef(null);

  useEffect(() => {
    checkCalendarStatus();
    
    // Cleanup function to clear any pending timeouts
    return () => {
      if (successTimeoutRef.current) {
        clearTimeout(successTimeoutRef.current);
      }
    };
  }, []);

  const checkCalendarStatus = async (forceRefresh = false) => {
    try {
      // Check if we have cached status and it's still valid
      const now = Date.now();
      if (!forceRefresh && lastStatusCheck && (now - lastStatusCheck) < STATUS_CACHE_DURATION && status) {
        setLoading(false);
        return;
      }
      
      setLoading(true);
      const response = await calendarAPI.getStatus();
      setStatus(response.data);
      setLastStatusCheck(now);
      setError(null);
      setSuccess(null); // Clear any success messages when refreshing
    } catch (err) {
      setError('Failed to check calendar status');
      setStatus({ connected: false });
    } finally {
      setLoading(false);
    }
  };

  const connectGoogleCalendar = () => {
    const token = localStorage.getItem('jwt_token');
    if (token) {
      // Use the same base URL as the API service
      const apiBaseUrl = import.meta.env.VITE_SECURE_API_BASE || import.meta.env.VITE_API_URL || 'http://localhost:5000/api';
      const backendUrl = apiBaseUrl.replace('/api', ''); // Remove /api to get the base backend URL
      const url = `${backendUrl}/api/auth/google/login?state=${token}`;
      window.location.href = url;
    } else {
      setError('Please log in first');
    }
  };

  const disconnectGoogleCalendar = async () => {
    try {
      setLoading(true);
      setError(null);
      setSuccess(null);
      
      // Call the backend API to disconnect
      const response = await calendarAPI.disconnect();
      
      if (response.data.success) {
        // Update local state to mark as disconnected
        setStatus({ connected: false, error: 'google_calendar_disconnected' });
        
        // Clear any cached status
        setLastStatusCheck(null);
        
        // Clear specific calendar-related storage entries
        // Note: The main JWT token should remain for app authentication
        const calendarRelatedKeys = [
          'google_oauth_email',
          'google_oauth_name',
          'csrf_token'
        ];
        
        // Clear localStorage entries (currently no calendar-specific localStorage keys)
        // This loop is kept for future calendar-related localStorage keys
        const keysToRemove = [];
        for (let i = 0; i < localStorage.length; i++) {
          const key = localStorage.key(i);
          if (key && calendarRelatedKeys.includes(key)) {
            keysToRemove.push(key);
          }
        }
        keysToRemove.forEach(key => localStorage.removeItem(key));
        
        // Clear sessionStorage entries
        const sessionKeysToRemove = [];
        for (let i = 0; i < sessionStorage.length; i++) {
          const key = sessionStorage.key(i);
          if (key && calendarRelatedKeys.includes(key)) {
            sessionKeysToRemove.push(key);
          }
        }
        sessionKeysToRemove.forEach(key => sessionStorage.removeItem(key));
        
        // Show success feedback
        setSuccess('Google Calendar disconnected successfully');
        console.log('Google Calendar disconnected successfully');
        
        // Clear success message after 3 seconds
        // Clear any existing timeout first
        if (successTimeoutRef.current) {
          clearTimeout(successTimeoutRef.current);
        }
        successTimeoutRef.current = setTimeout(() => setSuccess(null), 3000);
        
        // Force refresh the status to reflect the disconnect
        await checkCalendarStatus(true);
      } else {
        throw new Error(response.data.error || 'Failed to disconnect Google Calendar');
      }
    } catch (err) {
      console.error('Error disconnecting Google Calendar:', err);
      setError(err.response?.data?.error || err.message || 'Failed to disconnect Google Calendar');
      
      // Log the error for debugging
      console.error('Disconnect error details:', {
        message: err.message,
        response: err.response?.data,
        status: err.response?.status
      });
    } finally {
      setLoading(false);
    }
  };

  // Determine connection status
  const isDisconnected = status && (status.connected === false || status.error === 'google_calendar_disconnected');

  // Small icon button (always visible)
  return (
    <>
      <button
        className="fixed top-6 right-8 z-30 bg-white border border-black/10 rounded-full p-2 shadow hover:bg-gray-100 transition-colors"
        title="Google Calendar Status"
        onClick={() => setModalOpen(true)}
        style={{ width: 44, height: 44, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
      >
        <svg className="w-6 h-6 text-black" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
        </svg>
        <span className={`absolute top-1 right-1 w-2 h-2 rounded-full ${isDisconnected ? 'bg-red-500' : (status?.connected ? 'bg-green-500' : 'bg-red-500')}`}></span>
      </button>
      {modalOpen && (
        <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/40">
          <div className="bg-white rounded-3xl shadow-xl border border-black/10 p-8 max-w-sm w-full relative">
            <button
              className="absolute top-3 right-3 p-1 rounded hover:bg-gray-200"
              onClick={() => {
                setModalOpen(false);
                setSuccess(null); // Clear success message when closing modal
              }}
              aria-label="Close"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
            <div className="flex items-center space-x-3 mb-6">
              <div className="w-10 h-10 bg-black rounded-2xl flex items-center justify-center">
                <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                </svg>
              </div>
              <h3 className="text-xl font-bold text-black">Google Calendar</h3>
            </div>
            {loading ? (
              <div className="animate-pulse">
                <div className="h-6 bg-gray-200 rounded-2xl w-1/3 mb-6"></div>
                <div className="h-12 bg-gray-200 rounded-2xl w-2/3"></div>
              </div>
            ) : error ? (
              <div className="mb-6 bg-red-50/80 border border-red-200 text-red-700 px-6 py-4 rounded-2xl shadow-sm">
                <span className="font-medium">{error}</span>
              </div>
            ) : success ? (
              <div className="mb-6 bg-green-50/80 border border-green-200 text-green-700 px-6 py-4 rounded-2xl shadow-sm">
                <span className="font-medium">{success}</span>
              </div>
            ) : isDisconnected ? (
              <div className="space-y-4">
                <div className="flex items-center space-x-2">
                  <span className="w-3 h-3 bg-red-500 rounded-full"></span>
                  <span className="text-red-500 font-bold text-lg">Disconnected</span>
                </div>
                <div className="bg-gray-50 rounded-2xl p-4">
                  <p className="text-black font-medium">Your Google Calendar connection has expired or been revoked. Please reconnect to restore calendar features.</p>
                </div>
                <button
                  onClick={connectGoogleCalendar}
                  className="px-6 py-3 bg-black text-white rounded-xl hover:bg-gray-900 font-medium"
                >Reconnect Google Calendar</button>
              </div>
            ) : (
              <div className="space-y-4">
                <div className="flex items-center space-x-2">
                  <span className="w-3 h-3 bg-green-500 rounded-full"></span>
                  <span className="text-gray-600 font-bold text-lg">Connected</span>
                </div>
                <div className="bg-gray-50 rounded-2xl p-4">
                  <div className="text-black font-medium">Email: {status.email}</div>
                  {status.lastUpdated && (
                    <div className="text-gray-500 text-xs mt-1">Last Updated: {new Date(status.lastUpdated).toLocaleString()}</div>
                  )}
                </div>
                <div className="flex space-x-2">
                  <button
                    onClick={() => checkCalendarStatus(true)}
                    disabled={loading}
                    className="px-4 py-2 bg-black text-white rounded-xl hover:bg-gray-900 font-medium disabled:opacity-50 disabled:cursor-not-allowed"
                  >Refresh</button>
                  <button
                    onClick={disconnectGoogleCalendar}
                    disabled={loading}
                    className="px-4 py-2 bg-gray-200 text-black rounded-xl hover:bg-gray-300 font-medium disabled:opacity-50 disabled:cursor-not-allowed flex items-center space-x-2"
                  >
                    {loading && (
                      <svg className="animate-spin h-4 w-4" fill="none" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                      </svg>
                    )}
                    <span>{loading ? 'Disconnecting...' : 'Disconnect'}</span>
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </>
  );
};

export default CalendarStatus; 