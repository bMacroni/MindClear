import { PermissionsAndroid, Platform, Alert } from 'react-native';
import { notificationsAPI } from './api';
// import PushNotification from 'react-native-push-notification'; // A popular library for local notifications and badge count

class NotificationService {
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
          // Check current permission status first
          const currentStatus = await PermissionsAndroid.check(PermissionsAndroid.PERMISSIONS.POST_NOTIFICATIONS);
          
          if (currentStatus === PermissionsAndroid.RESULTS.GRANTED) {
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
          // For older Android versions, use simple request
          const result = await PermissionsAndroid.request(PermissionsAndroid.PERMISSIONS.POST_NOTIFICATIONS);
          const granted = result === PermissionsAndroid.RESULTS.GRANTED;
          console.log(`Notification permission ${granted ? 'granted' : 'denied'} for Android ${androidVersion}`);
          return granted;
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
        return status === PermissionsAndroid.RESULTS.GRANTED;
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

  // FCM token handling moved to backend-only approach
  // The backend will handle device token registration through its own FCM service
  async getFcmToken() {
    console.log('FCM token handling moved to backend-only approach');
    // This method is kept for compatibility but functionality moved to backend
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

  async initialize(): Promise<void> {
    try {
      const permissionGranted = await this.requestUserPermission();
      if (permissionGranted) {
        await this.updateBadgeCount(); // Initial count
        console.log('Notification service initialized with permissions granted');
      } else {
        console.log('Notification service initialized without permissions - continuing gracefully');
      }
      // Firebase messaging removed - using backend-only approach
      console.log('Push notifications will be handled by the backend FCM service');
    } catch (error) {
      console.error('Notification service initialization failed:', error);
      console.log('Continuing without push notifications...');
    }
  }
}

export const notificationService = new NotificationService();
