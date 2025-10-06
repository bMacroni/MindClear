import React, { useState, useEffect, useRef } from 'react';
import { NavigationContainer, LinkingOptions } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { StatusBar, View, ActivityIndicator, Linking } from 'react-native';
import { colors } from '../themes/colors';
import { RootStackParamList } from './types';
import { authService } from '../services/auth';
import { navigationRef } from './navigationRef';

// Import screens directly for now to fix lazy loading issues
import LoginScreen from '@src/screens/auth/LoginScreen';
import SignupScreen from '@src/screens/auth/SignupScreen';
import ForgotPasswordScreen from '@src/screens/auth/ForgotPasswordScreen';
import ResetPasswordScreen from '@src/screens/auth/ResetPasswordScreen';
import TabNavigator from './TabNavigator';
import GoalFormScreen from '../screens/goals/GoalFormScreen';
import GoalDetailScreen from '../screens/goals/GoalDetailScreen';
import TaskFormScreen from '../screens/tasks/TaskFormScreen';
import TaskDetailScreen from '../screens/tasks/TaskDetailScreen';
import NotificationScreen from '../screens/notifications/NotificationScreen';
import MobileAnalyticsDashboard from '../components/analytics/MobileAnalyticsDashboard';
import { parseAccessTokenFromUrl } from '@src/utils/deeplink';

const Stack = createNativeStackNavigator<RootStackParamList>();

export default function AppNavigator() {
  const [isLoading, setIsLoading] = useState(true);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const handledInitialLink = useRef(false);
  // Use shared navigationRef for global route awareness

  // Handle initial URL only once on app launch
  useEffect(() => {
    if (handledInitialLink.current) return;
    
    const handleInitialUrl = (url?: string | null) => {
      if (!url) return;
      const { access_token, token } = parseAccessTokenFromUrl(url);
      const navToken = access_token || token;
      if (navToken && navigationRef.current) {
        navigationRef.current.navigate('ResetPassword', { access_token: navToken });
      }
    };

    Linking.getInitialURL().then(handleInitialUrl).catch(() => {});
    handledInitialLink.current = true;
  }, []); // Empty dependency array - runs only once

  useEffect(() => {
    // Deep link handler: navigate to ResetPassword when access_token is present
    const handleUrl = (url?: string | null) => {
      if (!url) return;
      const { access_token, token } = parseAccessTokenFromUrl(url);
      const navToken = access_token || token;
      if (navToken && navigationRef.current) {
        navigationRef.current.navigate('ResetPassword', { access_token: navToken });
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
      const wasAuthenticated = isAuthenticated;
      setIsAuthenticated(authState.isAuthenticated);

      // Handle navigation when auth state changes
      if (navigationRef.current && !authState.isLoading) {
        if (authState.isAuthenticated && !wasAuthenticated) {
          navigationRef.current.reset({ index: 0, routes: [{ name: 'Main' }] });
        } else if (!authState.isAuthenticated && wasAuthenticated) {
          navigationRef.current.reset({ index: 0, routes: [{ name: 'Login' }] });
        }
      }
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
      },
    },
  };

  return (
    <NavigationContainer ref={navigationRef} linking={linking}>
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
