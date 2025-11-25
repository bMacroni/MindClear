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
import { ToastProvider, useToast } from './src/contexts/ToastContext';
import { SuccessToast } from './src/components/common/SuccessToast';
import { ErrorToast } from './src/components/common/ErrorToast';
import { InfoToast } from './src/components/common/InfoToast';
import { authService } from './src/services/auth';
import { getCurrentRouteName } from './src/navigation/navigationRef';
import messaging from '@react-native-firebase/messaging';
import { Database } from '@nozbe/watermelondb';
import { initializeDatabase } from './src/db';
import { DatabaseProvider } from './src/contexts/DatabaseContext';
import { syncService } from './src/services/SyncService';
import secureConfigService from './src/services/secureConfig';
import getSupabaseClient from './src/services/supabaseClient';
import { initializeErrorHandling } from './src/services/errorHandling';
import { colors } from './src/themes/colors';
// import { initializeScreenPreloading } from './src/utils/screenPreloader';

// Constants for initialization
const SECURE_CONFIG_TIMEOUT = 15000; // 15 seconds

// Shared core initialization logic
const performCoreInitialization = async (): Promise<Database> => {
  // First, initialize secure config with timeout protection using AbortController
  
  const controller = new AbortController();
  const timeoutId = setTimeout(() => {
    controller.abort();
  }, SECURE_CONFIG_TIMEOUT);

  try {
    await secureConfigService.initialize(controller.signal);
    // Clear timeout on success
    clearTimeout(timeoutId);
  } catch (error) {
    // Clear timeout on error
    clearTimeout(timeoutId);
    
    if (error instanceof Error && error.name === 'AbortError') {
      throw new Error('Secure config initialization timeout');
    }
    
    // Re-throw other errors
    throw error;
  }

  // Now, set up other services that depend on this config
  // Set Google Client IDs if available (they may come from remote config later)
  const googleConfig = {
    web: configService.getGoogleWebClientId(),
    android: configService.getGoogleAndroidClientId(),
    ios: configService.getGoogleIosClientId(),
  };
  // Only set if we have at least one ID (don't overwrite with empty values)
  if (googleConfig.web || googleConfig.android || googleConfig.ios) {
    configService.setGoogleClientIds(googleConfig);
  }

  // Then, set up the database
  const db = await initializeDatabase();
  
  // Initialize error handling service
  await initializeErrorHandling();
  
  return db;
};

function App() {
  const [database, setDatabase] = useState<Database | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const retryButtonRef = useRef<any>(null);

  const retryInitialization = async () => {
    setIsLoading(true);
    setDatabase(null);
    
    try {
      const db = await performCoreInitialization();
      setDatabase(db);

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
        const db = await performCoreInitialization();
        setDatabase(db);

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
          if (__DEV__) {
            console.warn('Failed to load remote config after initialization:', error);
          }
        });

        if (!mounted) return; // Check again after async operation

        // Set up sync triggers and token refresh only after successful initialization
        appStateSubscription = AppState.addEventListener(
          'change',
          nextAppState => {
            if (nextAppState === 'active') {
              // Check and refresh token if needed when app comes to foreground
              // This handles cases where app was killed and background timer was lost
              if (authService.isAuthenticated()) {
                // Proactively refresh token if expired or expiring soon
                authService.checkAndRefreshTokenIfNeeded().catch(error => {
                  if (__DEV__) {
                    console.warn('Failed to refresh token on app foreground:', error);
                  }
                });
                // Trigger sync after token check
                syncService.sync();
              }
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
                  if (__DEV__) {
                    console.log('Realtime update received!', payload);
                  }
                  syncService.sync();
                })
                .subscribe();
            }

            notificationService.initialize();
            if (tokenRefreshUnsubscribe) {
              tokenRefreshUnsubscribe();
            }
            tokenRefreshUnsubscribe = messaging().onTokenRefresh(async (token: string) => {
              if (__DEV__) {
                console.log('FCM token refreshed:', token.substring(0, 20) + '...');
              }
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
        // Only configure if we have at least the web client ID (required for offline access)
        try {
          const webClientId = configService.getGoogleWebClientId();
          
          // Skip configuration if web client ID is not available
          // The googleAuthService will handle configuration when IDs become available
          if (!webClientId) {
            if (__DEV__) {
              console.info('Skipping Google Sign-In configuration - web client ID not available yet. Will retry when remote config loads.');
            }
          } else {
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

            if (Platform.OS === 'android' && androidClientId) {
              baseConfig.androidClientId = androidClientId;
            }

            if (Platform.OS === 'ios' && iosClientId) {
              baseConfig.iosClientId = iosClientId;
            }

            GoogleSignin.configure(baseConfig);
            if (__DEV__) {
              console.info('Google Sign-In configured successfully');
            }
          }
        } catch (e) {
          if (__DEV__) {
            console.warn('Failed to configure Google Sign-In at app init:', e);
          }
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
      }
      webSocketService.disconnect();
    };
  }, []);


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
          style={{fontSize: 18, textAlign: 'center', marginBottom: 20, color: colors.text.primary}}
          accessible={true}
          accessibilityRole="text"
          accessibilityLabel="An error occurred while loading the application"
        >
          An error occurred while loading the app.
        </Text>
        <TouchableOpacity
          ref={retryButtonRef}
          style={{
            backgroundColor: colors.primary,
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
            style={{color: colors.secondary, fontSize: 16, fontWeight: '600'}}
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
          <ToastProvider>
            <HelpProvider>
              <AppNavigator />
              <HelpOverlay />
              <ToastContainer />
            </HelpProvider>
          </ToastProvider>
        </SafeAreaProvider>
      </DatabaseProvider>
    </GestureHandlerRootView>
  );
}

/**
 * ToastContainer component that renders toast notifications based on context state.
 * This component must be inside ToastProvider to access toast context.
 */
const ToastContainer: React.FC = () => {
  const { toast, hideToast } = useToast();

  if (toast.type === 'success') {
    return (
      <SuccessToast
        visible={toast.visible}
        message={toast.message}
        onClose={hideToast}
        duration={toast.duration}
      />
    );
  }

  if (toast.type === 'info') {
    return (
      <InfoToast
        visible={toast.visible}
        message={toast.message}
        onClose={hideToast}
        duration={toast.duration}
      />
    );
  }

  if (toast.type === 'error' || toast.type === 'warning') {
    return (
      <ErrorToast
        visible={toast.visible}
        message={toast.message}
        onClose={hideToast}
        duration={toast.duration}
      />
    );
  }

  return null;
}

export default App;
