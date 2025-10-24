import { PermissionsAndroid, Platform, Alert } from 'react-native';
import { notificationsAPI } from './api';
// import PushNotification from 'react-native-push-notification'; // A popular library for local notifications and badge count

class NotificationService {
  // Unsubscribe functions for cleanup
  private foregroundUnsubscribe: (() => void) | null = null;
  private openedUnsubscribe: (() => void) | null = null;
  private tokenRefreshUnsubscribe: (() => void) | null = null;

  private setBadgeCount(count: number) {
    // This is where you would integrate with a library like react-native-push-notification
    // or another library to set the app icon badge count.
    // e.g., PushNotification.setApplicationIconBadgeNumber(count);
    console.log(`Setting badge count to: ${count}`);
  }

  private async updateBadgeCount() {
    try {
      // Import auth service to check authentication status
      const { authService } = await import('./auth');
      
      // Only try to update badge count if user is authenticated
      if (!authService.isAuthenticated()) {
        console.log('Skipping badge count update - user not authenticated');
        return;
      }

      const count = await notificationsAPI.getUnreadCount();
      this.setBadgeCount(count);
    } catch (error) {
      // Only log error if it's not an authentication issue
      if (error instanceof Error && !error.message.includes('authentication') && !error.message.includes('not logged in')) {
        console.error('Failed to update badge count', error);
      }
    }
  }

  async requestUserPermission(): Promise<boolean> {
    try {
      if (Platform.OS === 'android') {
        // Check if we're on Android 13+ (API level 33+)
        const androidVersion = Platform.Version;
        const isAndroid13Plus = typeof androidVersion === 'number' && androidVersion >= 33;
        
        if (isAndroid13Plus) {
          // Check current permission status first (check() returns a boolean)
          const currentStatus = await PermissionsAndroid.check(PermissionsAndroid.PERMISSIONS.POST_NOTIFICATIONS);
          
          if (currentStatus) {
            console.log('Notification permissions already granted');
            return true;
          }
          
          // Request permission with rationale for Android 13+
          const result = await PermissionsAndroid.request(
            PermissionsAndroid.PERMISSIONS.POST_NOTIFICATIONS,
            {
              title: 'Notification Permission',
              message: 'Mind Clear would like to send you notifications for task reminders, goal updates, and important updates. You can change this later in your device settings.',
              buttonNeutral: 'Ask Me Later',
              buttonNegative: 'Cancel',
              buttonPositive: 'Allow',
            }
          );
          
          const granted = result === PermissionsAndroid.RESULTS.GRANTED;
          console.log(`Notification permission ${granted ? 'granted' : 'denied'}`);
          return granted;
        } else {
          // < Android 13: no runtime notif permission required
          console.log(`Notification permission not required on Android ${androidVersion}`);
          return true;
        }
      } else if (Platform.OS === 'ios') {
        // iOS notification permissions will be handled by the backend push notification system
        console.log('iOS notification permissions will be handled by backend');
        return true; // Assume granted for iOS since backend handles it
      }
      
      return false;
    } catch (error) {
      console.error('Error requesting notification permissions:', error);
      return false;
    }
  }

  async checkNotificationPermission(): Promise<boolean> {
    try {
      if (Platform.OS === 'android') {
        const status = await PermissionsAndroid.check(PermissionsAndroid.PERMISSIONS.POST_NOTIFICATIONS);
        return status;
      } else if (Platform.OS === 'ios') {
        // For iOS, assume permission is granted since backend handles it
        return true;
      }
      return false;
    } catch (error) {
      console.error('Error checking notification permissions:', error);
      return false;
    }
  }

  async getFcmToken(): Promise<string | null> {
    try {
      const messaging = (await import('@react-native-firebase/messaging')).default;
      const token = await messaging().getToken();
      console.log('FCM Token obtained:', token.substring(0, 20) + '...');
      return token;
    } catch (error) {
      console.error('Error getting FCM token:', error);
      
      // Show user-visible error message
      Alert.alert(
        'Push Notifications',
        'Unable to get push notifications token. You may not receive notifications.',
        [{ text: 'OK' }]
      );
      
      return null;
    }
  }

  async registerTokenWithBackend(token: string) {
    try {
      // Import auth service to check authentication status
      const { authService } = await import('./auth');
      
      // Only try to register token if user is authenticated
      if (!authService.isAuthenticated()) {
        console.log('Skipping device token registration - user not authenticated');
        return;
      }

      await notificationsAPI.registerDeviceToken(token, Platform.OS);
      console.log('Device token registered with backend successfully');
    } catch (error) {
      // Only log error if it's not an authentication issue
      if (error instanceof Error && !error.message.includes('authentication') && !error.message.includes('not logged in')) {
        console.error('Error registering device token with backend', error);
      }
    }
  }

  // Public method to manually update badge count (can be called after authentication)
  public async refreshBadgeCount() {
    await this.updateBadgeCount();
  }

  // Show in-app notification
  public showInAppNotification(title: string, body: string) {
    try {
      // For now, use Alert.alert for in-app notifications
      // TODO: Implement proper toast queue system or use a global notification context
      // This would typically involve:
      // 1. A notification queue/context
      // 2. A toast manager component at the app root level
      // 3. Methods to show/hide toasts from anywhere in the app
      
      console.log('In-app notification:', { title, body });
      
      // Show a simple alert for now
      Alert.alert(title, body, [{ text: 'OK' }]);
    } catch (error) {
      console.error('Error showing in-app notification:', error);
      // Fallback to console log
      console.log('Notification (error fallback):', { title, body });
    }
  }

  private async setupForegroundHandler() {
    try {
      // Clear any existing listeners first
      this.cleanup();
      
      const messaging = (await import('@react-native-firebase/messaging')).default;
      
      // Handle foreground messages
      this.foregroundUnsubscribe = messaging().onMessage(async remoteMessage => {
        try {
          if (__DEV__) {
            console.log('Foreground notification received:', remoteMessage);
          } else {
            console.log('Foreground notification received');
          }
          
          // Update badge count
          await this.updateBadgeCount();
          
          // Show local notification or handle in-app
          if (remoteMessage.notification) {
            // Use SuccessToast instead of Alert.alert for better UX
            this.showInAppNotification(
              remoteMessage.notification.title || 'Notification',
              remoteMessage.notification.body || ''
            );
          }
        } catch (error) {
          console.error('Error handling foreground notification:', error);
        }
      });
      
      // Handle notification opened app (from background/killed state)
      this.openedUnsubscribe = messaging().onNotificationOpenedApp(remoteMessage => {
        if (__DEV__) {
          console.log('Notification opened app from background:', remoteMessage);
        } else {
          console.log('Notification opened app from background');
        }
        // Handle navigation based on notification data
      });
      
      // Handle token refresh
      this.tokenRefreshUnsubscribe = messaging().onTokenRefresh(async (fcmToken) => {
        try {
          if (__DEV__) {
            console.log('FCM token refreshed:', fcmToken);
          } else {
            console.log('FCM token refreshed');
          }
          
          // Re-register token with backend
          await this.registerTokenWithBackend(fcmToken);
        } catch (error) {
          // Log detailed error for developers
          console.error('Error handling token refresh:', error);
          
          // Show user-friendly notification about push settings issue
          try {
            Alert.alert(
              'Push Notification Update',
              'Unable to update push settings — some notifications may not arrive',
              [{ text: 'OK' }],
              { cancelable: true }
            );
          } catch (alertError) {
            // Fallback to console if Alert fails
            console.error('Failed to show push settings alert:', alertError);
          }
        }
      });
      
      // Handle notification that opened app from killed state
      messaging()
        .getInitialNotification()
        .then(remoteMessage => {
          if (remoteMessage) {
            if (__DEV__) {
              console.log('Notification opened app from killed state:', remoteMessage);
            } else {
              console.log('Notification opened app from killed state');
            }
          }
        })
        .catch(error => {
          console.error('Error getting initial notification:', error);
        });
    } catch (error) {
      console.error('Error setting up foreground notification handler:', error);
    }
  }

  // Handle background notifications
  public async handleBackgroundNotification(remoteMessage: any) {
    try {
      if (__DEV__) {
        console.log('Handling background notification:', remoteMessage);
      } else {
        console.log('Handling background notification');
      }
      
      // Update badge count
      await this.updateBadgeCount();
      
      // For background notifications, we rely on the system to display them
      // The notification should already be displayed by Firebase
      console.log('Background notification processed');
    } catch (error) {
      console.error('Error handling background notification:', error);
    }
  }

  async initialize(): Promise<void> {
    try {
      const permissionGranted = await this.requestUserPermission();
      if (permissionGranted) {
        await this.updateBadgeCount();
        
        // Get FCM token and register with backend
        const fcmToken = await this.getFcmToken();
        if (fcmToken) {
          await this.registerTokenWithBackend(fcmToken);
        }
        
        // Set up foreground notification handler
        await this.setupForegroundHandler();
        
        console.log('Notification service initialized successfully');
      } else {
        console.log('Notification service initialized without permissions');
      }
    } catch (error) {
      console.error('Notification service initialization failed:', error);
      console.log('Continuing without push notifications...');
    }
  }

  /**
   * Cleanup method to remove all notification listeners
   * Call this when the service is no longer needed or before re-initializing
   */
  public cleanup(): void {
    try {
      if (this.foregroundUnsubscribe) {
        this.foregroundUnsubscribe();
        this.foregroundUnsubscribe = null;
      }
      
      if (this.openedUnsubscribe) {
        this.openedUnsubscribe();
        this.openedUnsubscribe = null;
      }
      
      if (this.tokenRefreshUnsubscribe) {
        this.tokenRefreshUnsubscribe();
        this.tokenRefreshUnsubscribe = null;
      }
      
      if (__DEV__) {
        console.log('Notification service listeners cleaned up');
      }
    } catch (error) {
      console.error('Error during notification service cleanup:', error);
    }
  }
}

export const notificationService = new NotificationService();
