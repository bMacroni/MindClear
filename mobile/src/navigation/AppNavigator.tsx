import React, { useState, useEffect, useRef } from 'react';
import { NavigationContainer, LinkingOptions } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { StatusBar, View, ActivityIndicator, Linking } from 'react-native';
import { colors } from '../themes/colors';
import { RootStackParamList } from './types';
import { authService } from '../services/auth';
import { navigationRef } from './navigationRef';
import { OnboardingService } from '../services/onboarding';
import AsyncStorage from '@react-native-async-storage/async-storage';

// Import screens directly for now to fix lazy loading issues
import LoginScreen from '@src/screens/auth/LoginScreen';
import SignupScreen from '@src/screens/auth/SignupScreen';
import ForgotPasswordScreen from '@src/screens/auth/ForgotPasswordScreen';
import ResetPasswordScreen from '@src/screens/auth/ResetPasswordScreen';
import EmailConfirmationScreen from '@src/screens/auth/EmailConfirmationScreen';
import BetaThankYouScreen from '@src/screens/beta/BetaThankYouScreen';
import TabNavigator from './TabNavigator';
import GoalFormScreen from '../screens/goals/GoalFormScreen';
import GoalDetailScreen from '../screens/goals/GoalDetailScreen';
import TaskFormScreen from '../screens/tasks/TaskFormScreen';
import TaskDetailScreen from '../screens/tasks/TaskDetailScreen';
import NotificationScreen from '../screens/notifications/NotificationScreen';
import MobileAnalyticsDashboard from '../components/analytics/MobileAnalyticsDashboard';
import { parseAccessTokenFromUrl } from '@src/utils/deeplink';

const BETA_SCREEN_SEEN_KEY = 'beta_thank_you_seen';

const Stack = createNativeStackNavigator<RootStackParamList>();

export default function AppNavigator() {
  const [isLoading, setIsLoading] = useState(true);
  const [isAuthenticated, setIsAuthenticated] = useState(false);

  const handledInitialLink = useRef(false);
  const cachedInitialLink = useRef<{ 
    type: 'confirm' | 'reset'; 
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
      
      // Check if it's a confirmation link
      if (url.includes('mindclear://confirm')) {
        const { access_token, refresh_token, token, error, error_description } = parseAccessTokenFromUrl(url);
        const navToken = access_token || token;
        
        // Navigate if we have a token OR an error
        if (navToken || error) {
          if (navigationRef.current) {
            navigationRef.current.navigate('EmailConfirmation', { 
              access_token: navToken, 
              refresh_token,
              error,
              error_description
            });
          } else {
            cachedInitialLink.current = {
              type: 'confirm',
              token: navToken,
              access_token: navToken,
              refresh_token,
              error,
              error_description
            };
          }
        }
        return;
      }
      
      // Check if it's a password reset link
      if (url.includes('mindclear://reset-password')) {
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

    Linking.getInitialURL().then(handleInitialUrl).catch(() => {});
    handledInitialLink.current = true;
  }, []); // Empty dependency array - runs only once

  useEffect(() => {
    // Deep link handler: navigate to appropriate screen based on URL
    const handleUrl = (url?: string | null) => {
      if (!url) return;
      // Check if it's a confirmation link
      if (url.includes('mindclear://confirm')) {
        const { access_token, refresh_token, token, error, error_description } = parseAccessTokenFromUrl(url);
        const navToken = access_token || token;
        if ((navToken || error) && navigationRef.current) {
          navigationRef.current.navigate('EmailConfirmation', { 
            access_token: navToken, 
            refresh_token,
            error,
            error_description
          });
        }
        return;
      }
      
      // Check if it's a password reset link
      if (url.includes('mindclear://reset-password')) {
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
        await new Promise(resolve => {
          const checkInitialized = () => {
            if (authService.isInitialized()) {
              resolve(true);
            } else {
              setTimeout(checkInitialized, 100);
            }
          };
          checkInitialized();
        });

        const authenticated = authService.isAuthenticated();
        setIsAuthenticated(authenticated);
        prevAuthRef.current = authenticated;
        
        // If already authenticated on app start, check if beta screen should be shown
        if (authenticated && navigationRef.current) {
          try {
            const hasSeenBetaScreen = await AsyncStorage.getItem(BETA_SCREEN_SEEN_KEY);
            if (!hasSeenBetaScreen) {
              // Show beta screen on next navigation cycle
              setTimeout(() => {
                if (navigationRef.current) {
                  navigationRef.current.reset({ index: 0, routes: [{ name: 'BetaThankYou' }] });
                  AsyncStorage.setItem(BETA_SCREEN_SEEN_KEY, 'true').catch((err) => {
                    console.warn('AppNavigator: Error saving beta screen seen flag:', err);
                  });
                }
              }, 100);            }
          } catch (error) {
            console.warn('AppNavigator: Error checking beta screen on app start:', error);
          }
        }
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
        // Check for cached initial link when auth is no longer loading
        if (cachedInitialLink.current) {
          const link = cachedInitialLink.current;
          if (link.type === 'confirm') {
            navigationRef.current.navigate('EmailConfirmation', { 
              access_token: link.access_token || link.token, 
              refresh_token: link.refresh_token,
              error: link.error,
              error_description: link.error_description
            });
          } else if (link.type === 'reset') {
            navigationRef.current.navigate('ResetPassword', { access_token: link.access_token || link.token });
          }
          cachedInitialLink.current = null; // Clear the cached link after navigation
        } else if (isNowAuthenticated && !wasAuthenticated) {
          // Check if user has seen beta screen, then check first session
          // Use IIFE to handle async operation in callback
          (async () => {
            try {
              // Check if user has seen the beta thank you screen
              const hasSeenBetaScreen = await AsyncStorage.getItem(BETA_SCREEN_SEEN_KEY);
              
              if (!hasSeenBetaScreen) {
                // First time login - show beta thank you screen
                navigationRef.current?.reset({ index: 0, routes: [{ name: 'BetaThankYou' }] });
                // Mark as seen
                await AsyncStorage.setItem(BETA_SCREEN_SEEN_KEY, 'true');
                return;
              }

              // User has seen beta screen, proceed with normal flow
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
              console.warn('AppNavigator: Error checking beta screen or first session for navigation:', error);
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
          access_token: link.access_token || link.token, 
          refresh_token: link.refresh_token,
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
      <Stack.Navigator 
        initialRouteName={isAuthenticated ? "Main" : "Login"}
        screenOptions={{ headerShown: false }}
      >
        <Stack.Screen 
          name="Login" 
          component={LoginScreen} 
        />
        <Stack.Screen 
          name="Signup" 
          component={SignupScreen} 
        />
        <Stack.Screen 
          name="ForgotPassword" 
          component={ForgotPasswordScreen} 
        />
        <Stack.Screen 
          name="ResetPassword" 
          component={ResetPasswordScreen} 
        />
        <Stack.Screen 
          name="EmailConfirmation" 
          component={EmailConfirmationScreen} 
        />
        <Stack.Screen 
          name="BetaThankYou" 
          component={BetaThankYouScreen} 
        />
        <Stack.Screen 
          name="Main" 
          component={TabNavigator} 
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
      </Stack.Navigator>
    </NavigationContainer>
  );
}
