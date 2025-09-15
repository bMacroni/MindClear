/**
 * Sample React Native App
 * https://github.com/facebook/react-native
 *
 * @format
 */

import React, { useEffect } from 'react';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import AppNavigator from './src/navigation/AppNavigator';
import { configService } from './src/services/config';
import { GoogleSignin } from '@react-native-google-signin/google-signin';
import { Alert } from 'react-native';
import { notificationService } from './src/services/notificationService';
import { webSocketService } from './src/services/api';
import { HelpProvider } from './src/contexts/HelpContext';
import HelpOverlay from './src/components/help/HelpOverlay';
import { authService } from './src/services/auth';
import { getCurrentRouteName } from './src/navigation/navigationRef';

// Set Google client IDs immediately when the module loads
configService.setGoogleClientIds({
  web: '416233535798-dpehu9uiun1nlub5nu1rgi36qog1e57j.apps.googleusercontent.com', // Firebase-generated web client ID
  android: '416233535798-g0enucudvioslu32ditbja3q0pn4iom7.apps.googleusercontent.com', // Firebase-generated Android client ID
  ios: '416233535798-...', // Firebase-generated iOS client ID (if you have one)
});

function App() {
  useEffect(() => {
    // Set up auth state listener to initialize services after authentication
    const checkAuthAndInitialize = async () => {
      if (authService.isAuthenticated()) {
        // Initialize notification services when authenticated
        notificationService.initialize();
        
        // Connect WebSocket with error handling
        try {
          await webSocketService.connect();
          webSocketService.onMessage((message) => {
            if (message.type === 'new_notification') {
              const currentRoute = getCurrentRouteName();
              // Suppress in-app popup when user is on AIChat screen to avoid redundancy
              if (currentRoute === 'AIChat') { return; }
              Alert.alert(
                message.payload.title,
                message.payload.message
              );
            }
          });
        } catch (error) {
          console.error('Failed to initialize WebSocket connection:', error);
        }
      } else {
        // Skip initialization when not authenticated
        // Disconnect WebSocket if user is not authenticated
        webSocketService.disconnect();
      }
    };

    // Check immediately
    checkAuthAndInitialize();
    
    // Set up listener for auth state changes
    const unsubscribe = authService.subscribe(checkAuthAndInitialize);
    
    // Setting up Google Sign-In...
    try {
      const baseConfig: any = {
        webClientId: configService.getGoogleWebClientId(), // Firebase web client ID
        offlineAccess: true, // Required for getting the access token
        forceCodeForRefreshToken: true, // Required for getting the refresh token
        scopes: [
          'openid',
          'email',
          'profile',
          'https://www.googleapis.com/auth/calendar.events.readonly'
        ],
        // Use backend OAuth endpoint for sensitive scopes
        redirectUri: `${configService.getBaseUrl()}/auth/google/callback`,
      };
      GoogleSignin.configure(baseConfig);
      // Google Sign-In configured successfully
    } catch (e) {
      console.warn('Failed to configure Google Sign-In at app init:', e);
    }
    
    // Cleanup listener on unmount
    return () => {
      if (unsubscribe) {
        unsubscribe();
      }
    };
  }, []);
  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <HelpProvider>
          <AppNavigator />
          <HelpOverlay />
        </HelpProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}

export default App;
