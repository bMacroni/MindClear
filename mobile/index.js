/**
 * @format
 */

import {AppRegistry} from 'react-native';
import App from './App';
import {name as appName} from './app.json';
import messaging from '@react-native-firebase/messaging';
import { syncService } from './src/services/SyncService';

let isSyncing = false;

// Register background handler for silent push notifications
messaging().setBackgroundMessageHandler(async remoteMessage => {
  console.log('Silent push received in background!', remoteMessage);
  
  // Check for a data payload that indicates a sync is needed
  if (remoteMessage.data && remoteMessage.data.sync) {
    if (isSyncing) {
      console.log('Background sync already in progress. Ignoring new trigger.');
      return;
    }
    
    console.log('Sync trigger received from silent push, starting sync...');
    try {
      isSyncing = true;
      await syncService.sync();
      console.log('Background sync complete.');
    } catch (error) {
      console.error('Background sync failed:', error);
    } finally {
      isSyncing = false;
    }
  }
});

AppRegistry.registerComponent(appName, () => App);
