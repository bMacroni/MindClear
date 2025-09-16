import React from 'react';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { createLazyScreen } from '../utils/lazyLoading';
import { CustomTabBar } from '../components/common/CustomTabBar';
import { MainTabParamList } from './types';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { BrainDumpProvider } from '../contexts/BrainDumpContext';
import AsyncStorage from '@react-native-async-storage/async-storage';

// Import screens directly for now to fix lazy loading issues
import AIChatScreen from '../screens/ai/AIChatScreen';
import BrainDumpInputScreen from '../screens/brain/BrainDumpInputScreen';
import BrainDumpRefinementScreen from '../screens/brain/BrainDumpRefinementScreen';
import BrainDumpOnboardingScreen from '../screens/brain/BrainDumpOnboardingScreen';
import BrainDumpPrioritizationScreen from '../screens/brain/BrainDumpPrioritizationScreen';
import BrainDumpEntryScreen from '../screens/brain/BrainDumpEntryScreen';
import GoalsScreen from '../screens/goals/GoalsScreen';
import TasksScreen from '../screens/tasks/TasksScreen';
import CalendarScreen from '../screens/calendar/CalendarScreen';
import ProfileScreen from '../screens/profile/ProfileScreen';

const Tab = createBottomTabNavigator<MainTabParamList>();

export default function TabNavigator() {
  const BrainStack = createNativeStackNavigator();
  return (
    <Tab.Navigator
      screenOptions={{
        headerShown: false,
        tabBarHideOnKeyboard: true,
      }}
      tabBar={props => <CustomTabBar {...props} />}
    >
      <Tab.Screen 
        name="BrainDump" 
        options={{ title: 'Brain Dump' }}
        listeners={({ navigation }) => ({
          tabPress: () => {
            (async () => {
              try {
                const [sessionStr, lastItemsStr] = await AsyncStorage.multiGet(['brainDumpSession', 'lastBrainDumpItems']).then(entries => entries.map(e => e[1]));
                const sessionHasItems = (() => {
                  try { const parsed = sessionStr ? JSON.parse(sessionStr) : null; return Array.isArray(parsed?.items) && parsed.items.length > 0; } catch { return false; }
                })();
                const lastHasItems = (() => {
                  try { const parsed = lastItemsStr ? JSON.parse(lastItemsStr) : []; return Array.isArray(parsed) && parsed.length > 0; } catch { return false; }
                })();
                if (!sessionHasItems && !lastHasItems) {
                  navigation.navigate('BrainDump' as never);
                }
              } catch {}
            })();
          },
        })}
      >
        {() => (
          <BrainDumpProvider>
            <BrainStack.Navigator screenOptions={{ headerShown: false }}>
              <BrainStack.Screen name="BrainDumpEntry" component={BrainDumpEntryScreen} />
              <BrainStack.Screen name="BrainDumpOnboarding" component={BrainDumpOnboardingScreen} />
              <BrainStack.Screen name="BrainDumpInput" component={BrainDumpInputScreen} />
              <BrainStack.Screen name="BrainDumpRefinement" component={BrainDumpRefinementScreen} />
              <BrainStack.Screen name="BrainDumpPrioritization" component={BrainDumpPrioritizationScreen} />
            </BrainStack.Navigator>
          </BrainDumpProvider>
        )}
      </Tab.Screen>
      <Tab.Screen 
        name="AIChat" 
        component={AIChatScreen}
        options={{ title: 'AI Chat' }}
      />
      <Tab.Screen 
        name="Goals" 
        component={GoalsScreen}
        options={{ title: 'Goals' }}
      />
      <Tab.Screen 
        name="Tasks" 
        component={TasksScreen}
        options={{ title: 'Tasks' }}
      />
      <Tab.Screen 
        name="Calendar" 
        component={CalendarScreen}
        options={{ title: 'Calendar' }}
      />
      <Tab.Screen 
        name="Profile" 
        component={ProfileScreen}
        options={{ title: 'Profile' }}
      />
    </Tab.Navigator>
  );
}
