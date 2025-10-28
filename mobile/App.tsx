/**
 * Sample React Native App
 * https://github.com/facebook/react-native
 *
 * @format
 */

import React, { useEffect, useState, useRef } from 'react';
import { Platform, View, ActivityIndicator, Text, AppState, TouchableOpacity } from 'react-native';
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
import messaging from '@react-native-firebase/messaging';
import { Database } from '@nozbe/watermelondb';
import { initializeDatabase } from './src/db';
import { DatabaseProvider } from './src/contexts/DatabaseContext';
import { syncService } from './src/services/SyncService';
import secureConfigService from './src/services/secureConfig';
import getSupabaseClient from './src/services/supabaseClient';
// import { initializeScreenPreloading } from './src/utils/screenPreloader';

// Set Google client IDs immediately when the module loads
// This is now delayed until after secure config is loaded
// configService.setGoogleClientIds({
//   web: '416233535798-dpehu9uiun1nlub5nu1rgi36qog1e57j.apps.googleusercontent.com', // Web client ID - used for ID token requests
//   android: '416233535798-g0enucudvioslu32ditbja3q0pn4iom7.apps.googleusercontent.com', // Android client ID - used for app configuration
//   ios: '', // iOS client ID not needed for Android development
// });

function App() {
  const [database, setDatabase] = useState<Database | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const retryButtonRef = useRef<any>(null);

  const retryInitialization = async () => {
    setIsLoading(true);
    setDatabase(null);
    
    try {
      // First, initialize secure config with timeout protection
      console.log('Retrying secure config initialization...');
      await Promise.race([
        secureConfigService.initialize(),
        new Promise((_, reject) => 
          setTimeout(() => reject(new Error('Secure config initialization timeout')), 15000)
        )
      ]);

      // Now, set up other services that depend on this config
      configService.setGoogleClientIds({
        web: '416233535798-dpehu9uiun1nlub5nu1rgi36qog1e57j.apps.googleusercontent.com', // Web client ID - used for ID token requests
        android: '416233535798-g0enucudvioslu32ditbja3q0pn4iom7.apps.googleusercontent.com', // Android client ID - used for app configuration
        ios: '', // iOS client ID not needed for Android development
      });

      // Then, set up the database
      console.log('Retrying database initialization...');
      const db = await initializeDatabase();
      setDatabase(db);
      console.log('App retry initialization complete');

    } catch (error) {
      console.error('Failed to retry app initialization:', error);
      // Don't show alert for timeout errors - just log and continue
      if (error instanceof Error && error.message.includes('timeout')) {
        console.warn('App retry initialization timed out, but continuing with fallback configuration');
      } else {
        Alert.alert('Retry Error', 'Could not restart the application. Please try again or restart the app.');
      }
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    const initializeApp = async () => {
      try {
        // First, initialize secure config with timeout protection
        console.log('Initializing secure config...');
        await Promise.race([
          secureConfigService.initialize(),
          new Promise((_, reject) => 
            setTimeout(() => reject(new Error('Secure config initialization timeout')), 15000)
          )
        ]);

        // Now, set up other services that depend on this config
        configService.setGoogleClientIds({
          web: '416233535798-dpehu9uiun1nlub5nu1rgi36qog1e57j.apps.googleusercontent.com', // Web client ID - used for ID token requests
          android: '416233535798-g0enucudvioslu32ditbja3q0pn4iom7.apps.googleusercontent.com', // Android client ID - used for app configuration
          ios: '', // iOS client ID not needed for Android development
        });

        // Then, set up the database
        console.log('Initializing database...');
        const db = await initializeDatabase();
        setDatabase(db);
        console.log('App initialization complete');

      } catch (error) {
        console.error('Failed to initialize app:', error);
        // Don't show alert for timeout errors - just log and continue
        if (error instanceof Error && error.message.includes('timeout')) {
          console.warn('App initialization timed out, but continuing with fallback configuration');
        } else {
          Alert.alert('Initialization Error', 'Could not start the application correctly. Please restart.');
        }
      } finally {
        setIsLoading(false);
      }
    };

    // Declare subscription handles in outer scope
    let appStateSubscription: any = null;
    let channel: any = null;
    let tokenRefreshUnsubscribe: (() => void) | null = null;
    let authUnsubscribe: (() => void) | null = null;
    let mounted = true;

    // Perform async initialization inside the effect
    const performInitialization = async () => {
      try {
        await initializeApp();
        
        if (!mounted) return; // Check if component is still mounted

        // Try to load remote config now that app is initialized
        secureConfigService.loadRemoteConfigIfNeeded().catch(error => {
          console.warn('Failed to load remote config after initialization:', error);
        });

        if (!mounted) return; // Check again after async operation

        // Set up sync triggers only after successful initialization
        appStateSubscription = AppState.addEventListener(
          'change',
          nextAppState => {
            if (nextAppState === 'active') {
              console.log('App has come to the foreground, triggering sync.');
              syncService.sync();
            }
          },
        );

        // After all initialization is complete, set up auth-dependent services
        const checkAuthAndInitialize = async () => {
          if (!mounted) return; // Check if component is still mounted
          
          if (authService.isAuthenticated()) {
            // Set up Supabase Realtime subscription for authenticated users
            const currentUser = authService.getCurrentUser();
            if (currentUser && !channel) {
              const supabase = getSupabaseClient();
              channel = supabase.channel(`user-${currentUser.id}-changes`)
                .on('broadcast', { event: 'update' }, (payload) => {
                  console.log('Realtime update received!', payload);
                  syncService.sync();
                })
                .subscribe();
              console.log(`Subscribed to Supabase channel: user-${currentUser.id}-changes`);
            }

            notificationService.initialize();
            if (tokenRefreshUnsubscribe) {
              tokenRefreshUnsubscribe();
            }
            tokenRefreshUnsubscribe = messaging().onTokenRefresh(async (token: string) => {
              console.log('FCM token refreshed:', token.substring(0, 20) + '...');
              try {
                await notificationService.registerTokenWithBackend(token);
              } catch (error) {
                console.error('Failed to register FCM token with backend:', error);
              }
            });
            try {
              await webSocketService.connect();
              webSocketService.onMessage((message) => {
                if (message.type === 'new_notification') {
                  const currentRoute = getCurrentRouteName();
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
            // Clean up Supabase channel on logout
            if (channel) {
              const supabase = getSupabaseClient();
              supabase.removeChannel(channel);
              console.log('Unsubscribed from Supabase channel on logout.');
              channel = null;
            }
            webSocketService.disconnect();
            if (tokenRefreshUnsubscribe) {
              tokenRefreshUnsubscribe();
              tokenRefreshUnsubscribe = null;
            }
          }
        };

        checkAuthAndInitialize();
        authUnsubscribe = authService.subscribe(checkAuthAndInitialize);

        // Also configure Google Sign-In now that config is loaded
        try {
          const webClientId = configService.getGoogleWebClientId();
          const androidClientId = configService.getGoogleAndroidClientId();
          const iosClientId = configService.getGoogleIosClientId();
          
          const baseConfig: any = {
            webClientId: webClientId,
            offlineAccess: true,
            forceCodeForRefreshToken: true,
            scopes: [
              'openid',
              'email',
              'profile',
              'https://www.googleapis.com/auth/calendar.events.readonly'
            ],
            redirectUri: `${configService.getBaseUrl()}/auth/google/callback`,
          };

          if (Platform.OS === 'android') {
            baseConfig.androidClientId = androidClientId;
          }

          if (Platform.OS === 'ios') {
            baseConfig.iosClientId = iosClientId;
          }

          GoogleSignin.configure(baseConfig);
        } catch (e) {
          console.warn('Failed to configure Google Sign-In at app init:', e);
        }
      } catch (error) {
        console.error('Failed to initialize app:', error);
      }
    };

    performInitialization();

    // Return synchronous cleanup function from useEffect
    return () => {
      mounted = false; // Set mounted flag to false
      
      if (authUnsubscribe) {
        authUnsubscribe();
      }
      if (tokenRefreshUnsubscribe) {
        tokenRefreshUnsubscribe();
      }
      if (appStateSubscription) {
        appStateSubscription.remove();
      }
      if (channel) {
        const supabase = getSupabaseClient();
        supabase.removeChannel(channel);
        console.log('Unsubscribed from Supabase channel.');
      }
      webSocketService.disconnect();
    };
  }, []);

  // Focus retry button when error UI is shown
  useEffect(() => {
    if (!database && !isLoading && retryButtonRef.current) {
      // Small delay to ensure the component is rendered
      const timer = setTimeout(() => {
        retryButtonRef.current?.focus();
      }, 100);
      return () => clearTimeout(timer);
    }
  }, [database, isLoading]);

  if (isLoading) {
    return (
      <View 
        style={{flex: 1, justifyContent: 'center', alignItems: 'center'}}
        accessible={true}
        accessibilityRole="progressbar"
        accessibilityLabel="Loading application"
        accessibilityLiveRegion="polite"
        importantForAccessibility="yes"
      >
        <ActivityIndicator 
          size="large" 
          accessibilityLabel="Loading"
          accessible={true}
        />
        <Text style={{marginTop: 16, fontSize: 16}}>Loading…</Text>
      </View>
    );
  }

  if (!database) {
    return (
      <View 
        style={{flex: 1, justifyContent: 'center', alignItems: 'center', padding: 20}}
        accessible={true}
        accessibilityRole="alert"
        accessibilityLabel="Application error occurred"
        accessibilityLiveRegion="assertive"
        importantForAccessibility="yes"
      >
        <Text 
          style={{fontSize: 18, textAlign: 'center', marginBottom: 20, color: '#333'}}
          accessible={true}
          accessibilityRole="text"
          accessibilityLabel="An error occurred while loading the application"
        >
          An error occurred while loading the app.
        </Text>
        <TouchableOpacity
          ref={retryButtonRef}
          style={{
            backgroundColor: '#007AFF',
            paddingHorizontal: 24,
            paddingVertical: 12,
            borderRadius: 8,
            minHeight: 44,
            justifyContent: 'center',
            alignItems: 'center'
          }}
          onPress={retryInitialization}
          accessible={true}
          accessibilityRole="button"
          accessibilityLabel="Retry loading the application"
          accessibilityHint="Double tap to retry loading the application"
          testID="retry-button"
          importantForAccessibility="yes"
        >
          <Text 
            style={{color: 'white', fontSize: 16, fontWeight: '600'}}
            accessible={false}
          >
            Retry
          </Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <GestureHandlerRootView style={{flex: 1}}>
      <DatabaseProvider database={database}>
        <SafeAreaProvider>
          <HelpProvider>
            <AppNavigator />
            <HelpOverlay />
          </HelpProvider>
        </SafeAreaProvider>
      </DatabaseProvider>
    </GestureHandlerRootView>
  );
}

export default App;
