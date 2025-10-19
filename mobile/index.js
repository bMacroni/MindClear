/**
 * @format
 */

import 'react-native-gesture-handler';
import { AppRegistry, Platform } from 'react-native';
import App from './App';
import { name as appName } from './app.json';
import messaging from '@react-native-firebase/messaging';

// Register background message handler
messaging().setBackgroundMessageHandler(async remoteMessage => {
  try {
    // Process the background message here
    // Use a proper logging library with appropriate filtering in production
    if (__DEV__) {
      console.log('Background message received');
    }
  } catch (error) {
    if (__DEV__) {
      console.error('Error handling background message:', error);
    }
  }
});

AppRegistry.registerComponent(appName, () => App);
