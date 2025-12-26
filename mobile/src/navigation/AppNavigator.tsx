import React, { useState, useEffect, useRef } from 'react';
import { NavigationContainer, LinkingOptions } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { StatusBar, View, ActivityIndicator, Linking } from 'react-native';
import { colors } from '../themes/colors';
import { RootStackParamList } from './types';
import { authService } from '../services/auth';
import { navigationRef } from './navigationRef';
import { OnboardingService } from '../services/onboarding';
import { configService } from '../services/config';

// Import screens directly for now to fix lazy loading issues
import LoginScreen from '@src/screens/auth/LoginScreen';
import SignupScreen from '@src/screens/auth/SignupScreen';
import ForgotPasswordScreen from '@src/screens/auth/ForgotPasswordScreen';
import ResetPasswordScreen from '@src/screens/auth/ResetPasswordScreen';
import EmailConfirmationScreen from '@src/screens/auth/EmailConfirmationScreen';

import TabNavigator from './TabNavigator';
import { MainHeader } from './MainHeader';
import GoalFormScreen from '../screens/goals/GoalFormScreen';
import GoalDetailScreen from '../screens/goals/GoalDetailScreen';
import TaskFormScreen from '../screens/tasks/TaskFormScreen';
import TaskDetailScreen from '../screens/tasks/TaskDetailScreen';
import NotificationScreen from '../screens/notifications/NotificationScreen';
import MobileAnalyticsDashboard from '../components/analytics/MobileAnalyticsDashboard';
import ProfileScreen from '../screens/profile/ProfileScreen';
import RoutineDetailScreen from '../screens/routines/RoutineDetailScreen';
import { RoutineProvider } from '../contexts/RoutineContext';
import { parseAccessTokenFromUrl } from '@src/utils/deeplink';



const Stack = createNativeStackNavigator<RootStackParamList>();

// Helper for strict URL matching and error handling
const isMatchingUrl = (url: string | null | undefined, configUri: string | undefined): boolean => {
  if (!url || !configUri) {
    if (!configUri) {
      console.error('AppNavigator: Config URI is missing for match');
    }
    return false;
  }

  try {
    const parsedUrl = new URL(url);
    const parsedConfig = new URL(configUri);

    // Normalize: origin + pathname
    const getNormalizedPrefix = (u: URL) => {
      // Handle custom schemes where origin might be 'null'
      const origin = u.origin !== 'null' ? u.origin : `${u.protocol}//${u.host}`;
      return `${origin}${u.pathname}`;
    };

    const urlPrefix = getNormalizedPrefix(parsedUrl);
    const configPrefix = getNormalizedPrefix(parsedConfig);

    return urlPrefix.startsWith(configPrefix);
  } catch (error) {
    console.error('AppNavigator: Error matching URL:', error);
    return false;
  }
};

export default function AppNavigator() {
  const [isLoading, setIsLoading] = useState(true);
  const [isAuthenticated, setIsAuthenticated] = useState(false);

  const handledInitialLink = useRef(false);
  const cachedInitialLink = useRef<{
    type: 'confirm' | 'reset';
    code?: string;
    token?: string;
    access_token?: string;
    refresh_token?: string;
    error?: string;
    error_description?: string
  } | null>(null);
  const prevAuthRef = useRef<boolean>(false);
  // Use shared navigationRef for global route awareness

  // Handle initial URL only once on app launch
  useEffect(() => {
    if (handledInitialLink.current) return;

    const handleInitialUrl = (url?: string | null) => {
      if (!url) return;

      const confirmUri = configService.getMindClearConfirmUri();
      const resetUri = configService.getMindClearResetPasswordUri();

      // Check if it's a confirmation link
      if (isMatchingUrl(url, confirmUri)) {
        const { code, access_token, token, error, error_description } = parseAccessTokenFromUrl(url);
        // Use code if available, fallback to token (magic link) or access_token (legacy)
        const authCode = code || token || access_token;

        // Navigate if we have a code OR an error
        if (authCode || error) {
          if (navigationRef.current) {
            navigationRef.current.navigate('EmailConfirmation', {
              code: authCode,
              error,
              error_description
            });
          } else {
            cachedInitialLink.current = {
              type: 'confirm',
              code: authCode,
              error,
              error_description
            };
          }
        }
        return;
      }

      // Check if it's a password reset link
      if (isMatchingUrl(url, resetUri)) {
        const { access_token, token } = parseAccessTokenFromUrl(url);
        const navToken = access_token || token;
        if (navToken) {
          if (navigationRef.current) {
            navigationRef.current.navigate('ResetPassword', { access_token: navToken });
          } else {
            cachedInitialLink.current = {
              type: 'reset',
              token: navToken,
              access_token: navToken
            };
          }
        }
      }
    };

    Linking.getInitialURL().then(handleInitialUrl).catch((error) => {
      console.error('AppNavigator: Error getting initial URL:', error);
    }); handledInitialLink.current = true;
  }, []); // Empty dependency array - runs only once

  useEffect(() => {
    // Deep link handler: navigate to appropriate screen based on URL
    const handleUrl = (url?: string | null) => {
      if (!url) return;

      const confirmUri = configService.getMindClearConfirmUri();
      const resetUri = configService.getMindClearResetPasswordUri();

      // Check if it's a confirmation link
      if (isMatchingUrl(url, confirmUri)) {
        const { code, access_token, token, error, error_description } = parseAccessTokenFromUrl(url);
        const authCode = code || token || access_token;

        if ((authCode || error) && navigationRef.current) {
          navigationRef.current.navigate('EmailConfirmation', {
            code: authCode,
            error,
            error_description
          });
        }
        return;
      }

      // Check if it's a password reset link
      if (isMatchingUrl(url, resetUri)) {
        const { access_token, token } = parseAccessTokenFromUrl(url);
        const navToken = access_token || token;
        if (navToken && navigationRef.current) {
          navigationRef.current.navigate('ResetPassword', { access_token: navToken });
        }
      }
    };

    // Subscribe to future URL events
    const sub = Linking.addEventListener('url', (event) => handleUrl(event.url));

    // Check authentication state on app start
    const checkAuthState = async () => {
      try {
        // Wait for auth service to initialize
        await new Promise((resolve, reject) => {
          const startTime = Date.now();
          const timeout = 10000; // 10 second timeout

          const checkInitialized = () => {
            if (authService.isInitialized()) {
              resolve(true);
            } else if (Date.now() - startTime > timeout) {
              reject(new Error('Auth service initialization timeout'));
            } else {
              setTimeout(checkInitialized, 100);
            }
          };
          checkInitialized();
        });

        const authenticated = authService.isAuthenticated();
        setIsAuthenticated(authenticated);
        prevAuthRef.current = authenticated;


        // Note: First session check is handled in auth state change callback below
      } catch (error) {
        console.error('AppNavigator: Error checking auth state:', error);
        setIsAuthenticated(false);
      } finally {
        setIsLoading(false);
      }
    };

    checkAuthState();

    // Listen for auth state changes
    const unsubscribe = authService.subscribe((authState) => {
      const wasAuthenticated = prevAuthRef.current;
      const isNowAuthenticated = authState.isAuthenticated;
      setIsAuthenticated(isNowAuthenticated);

      // Handle navigation when auth state changes
      if (navigationRef.current && !authState.isLoading) {
        if (isNowAuthenticated && !wasAuthenticated) {
          // Check if first session for onboarding flow
          // Use IIFE to handle async operation in callback
          (async () => {
            try {
              const firstSession = await OnboardingService.isFirstSession();
              if (firstSession) {
                // Navigate to Main tab, then to BrainDump stack with BrainDumpInput screen
                navigationRef.current?.reset({ index: 0, routes: [{ name: 'Main' }] });
                // Use setTimeout to ensure Main tab is mounted before navigating to nested screen
                setTimeout(() => {
                  if (navigationRef.current) {
                    navigationRef.current.navigate('Main', {
                      screen: 'BrainDump',
                      params: {
                        screen: 'BrainDumpInput',
                      },
                    });
                  }
                }, 100);
              } else {
                // Returning user - use existing navigation
                navigationRef.current?.reset({ index: 0, routes: [{ name: 'Main' }] });
              }
            } catch (error) {
              console.warn('AppNavigator: Error checking first session for navigation:', error);
              // Fallback to existing navigation on error
              navigationRef.current?.reset({ index: 0, routes: [{ name: 'Main' }] });
            }
          })();
        } else if (!isNowAuthenticated && wasAuthenticated) {
          navigationRef.current.reset({ index: 0, routes: [{ name: 'Login' }] });
        }
      }

      // Update the previous auth state ref for next comparison
      prevAuthRef.current = isNowAuthenticated;
    });

    return () => {
      unsubscribe();
      // Remove listener
      // @ts-ignore - RN returns an object with remove() in this version
      sub.remove?.();
    };
  }, []); // Empty dependency array - runs only once for auth setup and event listener

  if (isLoading) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: colors.background.primary }}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  }

  const linking: LinkingOptions<RootStackParamList> = {
    prefixes: ['mindclear://'],
    config: {
      screens: {
        ResetPassword: 'reset-password',
        EmailConfirmation: 'confirm',
      },
    },
  };

  // Handle cached initial link when navigator is ready
  const handleNavigatorReady = () => {
    if (cachedInitialLink.current && navigationRef.current) {
      const link = cachedInitialLink.current;
      if (link.type === 'confirm') {
        navigationRef.current.navigate('EmailConfirmation', {
          code: link.code,
          error: link.error,
          error_description: link.error_description
        });
      } else if (link.type === 'reset') {
        navigationRef.current.navigate('ResetPassword', { access_token: link.access_token || link.token });
      }
      cachedInitialLink.current = null; // Clear the cached link after navigation
    }
  };

  return (
    <NavigationContainer ref={navigationRef} linking={linking} onReady={handleNavigatorReady}>
      <StatusBar barStyle="dark-content" backgroundColor={colors.secondary} animated />
      <RoutineProvider>
        <Stack.Navigator
          initialRouteName={isAuthenticated ? "Main" : "Login"}
          screenOptions={{
            headerShown: true,
            header: (props) => <MainHeader {...props} />
          }}
        >
          <Stack.Screen
            name="Login"
            component={LoginScreen}
            options={{ headerShown: false }}
          />
          <Stack.Screen
            name="Signup"
            component={SignupScreen}
            options={{ headerShown: false }}
          />
          <Stack.Screen
            name="ForgotPassword"
            component={ForgotPasswordScreen}
            options={{ headerShown: false }}
          />
          <Stack.Screen
            name="ResetPassword"
            component={ResetPasswordScreen}
            options={{ headerShown: false }}
          />
          <Stack.Screen
            name="EmailConfirmation"
            component={EmailConfirmationScreen}
            options={{ headerShown: false }}
          />

          <Stack.Screen
            name="Main"
            component={TabNavigator}
            options={{ headerShown: false }}
          />
          <Stack.Screen
            name="GoalForm"
            component={GoalFormScreen}
          />
          <Stack.Screen
            name="GoalDetail"
            component={GoalDetailScreen}
          />
          <Stack.Screen
            name="TaskForm"
            component={TaskFormScreen}
          />
          <Stack.Screen
            name="TaskDetail"
            component={TaskDetailScreen}
          />
          <Stack.Screen
            name="Notifications"
            component={NotificationScreen}
          />
          <Stack.Screen
            name="AnalyticsDashboard"
            component={MobileAnalyticsDashboard}
          />
          <Stack.Screen
            name="Profile"
            component={ProfileScreen}
          />
          <Stack.Screen
            name="RoutineDetail"
            component={RoutineDetailScreen}
          />
        </Stack.Navigator>
      </RoutineProvider>
    </NavigationContainer>
  );
}
