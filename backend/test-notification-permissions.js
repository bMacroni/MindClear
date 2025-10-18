#!/usr/bin/env node

/**
 * Test script to check notification permissions and send a test notification
 */

import { createClient } from '@supabase/supabase-js';

// Initialize Supabase client
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function testNotificationPermissions() {
  console.log('🔔 Testing Notification Permissions...\n');

  try {
    const testEmail = 'bmcornell88@gmail.com';
    
    // Get the user
    const { data: users, error: usersError } = await supabase
      .from('users')
      .select('id, full_name, email')
      .eq('email', testEmail)
      .limit(1);

    if (usersError) {
      console.error('❌ Error fetching user:', usersError);
      return;
    }

    const user = users[0];
    console.log(`👤 User: ${user.full_name} (${user.id})`);

    // Check notification preferences
    const { data: prefs, error: prefsError } = await supabase
      .from('user_notification_preferences')
      .select('*')
      .eq('user_id', user.id)
      .eq('notification_type', 'daily_focus_reminder');

    console.log(`🔔 Notification preferences (${prefs ? prefs.length : 0}):`);
    if (prefs && prefs.length > 0) {
      prefs.forEach((pref, index) => {
        console.log(`  ${index + 1}. Channel: ${pref.channel}, Enabled: ${pref.enabled}`);
      });
    } else {
      console.log('  No specific preferences found (defaults to enabled)');
    }

    // Get device tokens
    const { data: deviceTokens, error: tokensError } = await supabase
      .from('user_device_tokens')
      .select('*')
      .eq('user_id', user.id);

    if (tokensError) {
      console.error('❌ Error fetching device tokens:', tokensError);
      return;
    }

    console.log(`📱 Device tokens (${deviceTokens ? deviceTokens.length : 0}):`);
    if (deviceTokens && deviceTokens.length > 0) {
      deviceTokens.forEach((token, index) => {
        console.log(`  ${index + 1}. Platform: ${token.device_type}`);
        console.log(`     Token: ${token.device_token.substring(0, 30)}...`);
      });
    }

    // Send a test notification with different content to bypass spam protection
    console.log('\n📤 Sending test notification...');
    
    const { sendNotification } = await import('./src/services/notificationService.js');
    
    const testNotification = {
      notification_type: 'daily_focus_reminder',
      title: '🧪 Test Notification',
      message: `Test notification sent at ${new Date().toLocaleTimeString()}`,
      details: { 
        test: true,
        timestamp: Date.now()
      }
    };

    const result = await sendNotification(user.id, testNotification);
    
    if (result.success) {
      console.log('✅ Test notification sent successfully!');
      console.log('📱 Check your device for the notification');
    } else {
      console.error('❌ Test notification failed:', result.error);
    }

  } catch (error) {
    console.error('❌ Test failed:', error);
  }
}

// Run the test
testNotificationPermissions()
  .then(() => {
    console.log('\n🏁 Test completed');
    process.exit(0);
  })
  .catch((error) => {
    console.error('💥 Test crashed:', error);
    process.exit(1);
  });

