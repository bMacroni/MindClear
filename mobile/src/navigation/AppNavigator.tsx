import React, { useState, useEffect, useRef } from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { StatusBar, View, ActivityIndicator } from 'react-native';
import { colors } from '../themes/colors';
import { RootStackParamList } from './types';
import { authService } from '../services/auth';
import { navigationRef } from './navigationRef';

// Import screens directly for now to fix lazy loading issues
import LoginScreen from '../screens/auth/LoginScreen';
import SignupScreen from '../screens/auth/SignupScreen';
import TabNavigator from './TabNavigator';
import GoalFormScreen from '../screens/goals/GoalFormScreen';
import GoalDetailScreen from '../screens/goals/GoalDetailScreen';
import TaskFormScreen from '../screens/tasks/TaskFormScreen';
import TaskDetailScreen from '../screens/tasks/TaskDetailScreen';
import NotificationScreen from '../screens/notifications/NotificationScreen';

const Stack = createNativeStackNavigator<RootStackParamList>();

export default function AppNavigator() {
  const [isLoading, setIsLoading] = useState(true);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  // Use shared navigationRef for global route awareness

  useEffect(() => {
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

    return unsubscribe;
  }, [isAuthenticated]);

  if (isLoading) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: colors.background.primary }}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  }

  return (
    <NavigationContainer ref={navigationRef}>
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
      </Stack.Navigator>
    </NavigationContainer>
  );
}
