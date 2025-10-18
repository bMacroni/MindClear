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
  console.log('Message handled in the background!', remoteMessage);
  console.log('Notification title:', remoteMessage.notification?.title);
  console.log('Notification body:', remoteMessage.notification?.body);
});

AppRegistry.registerComponent(appName, () => App);
