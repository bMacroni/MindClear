/**
 * @format
 */

import 'react-native-url-polyfill/auto';
import 'react-native-reanimated';
import {AppRegistry} from 'react-native';
import App from './App';
import {name as appName} from './app.json';
import messaging from '@react-native-firebase/messaging';
import { syncService } from './src/services/SyncService';

// Debug utilities are now available via the GoalsScreen debug buttons

let isSyncing = false;

// Register background handler for silent push notifications
messaging().setBackgroundMessageHandler(async remoteMessage => {
  // Check for a data payload that indicates a sync is needed
  if (remoteMessage.data && remoteMessage.data.sync) {
    if (isSyncing) {
      return;
    }
    
    try {
      isSyncing = true;
      await Promise.race([
        syncService.sync(),
        new Promise((_, reject) => 
          setTimeout(() => reject(new Error('Sync timeout')), 30000)
        )
      ]);
    } catch (error) {
      console.error('Background sync failed:', error);
    } finally {
      isSyncing = false;
    }  }
});

AppRegistry.registerComponent(appName, () => App);
