/**
 * @format
 */

import {AppRegistry} from 'react-native';
import App from './App';
import {name as appName} from './app.json';
import messaging from '@react-native-firebase/messaging';
import { syncService } from './src/services/SyncService';

// Register background handler for silent push notifications
messaging().setBackgroundMessageHandler(async remoteMessage => {
  console.log('Silent push received in background!', remoteMessage);
  
  // Check for a data payload that indicates a sync is needed
  if (remoteMessage.data && remoteMessage.data.sync) {
    console.log('Sync trigger received from silent push, starting sync...');
    await syncService.sync();
    console.log('Background sync complete.');
  }
});

AppRegistry.registerComponent(appName, () => App);
