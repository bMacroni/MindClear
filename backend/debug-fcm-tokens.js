#!/usr/bin/env node

/**
 * Debug script to check FCM token registration
 */

import { createClient } from '@supabase/supabase-js';

// Initialize Supabase client
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function debugFcmTokens() {
  console.log('🔍 Debugging FCM Token Registration...\n');

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

    if (!users || users.length === 0) {
      console.log('❌ No user found with email:', testEmail);
      return;
    }

    const user = users[0];
    console.log(`👤 User: ${user.full_name} (${user.id})`);

    // Check device tokens
    const { data: deviceTokens, error: tokensError } = await supabase
      .from('user_device_tokens')
      .select('*')
      .eq('user_id', user.id);

    if (tokensError) {
      console.error('❌ Error fetching device tokens:', tokensError);
      return;
    }

    console.log(`📱 Found ${deviceTokens ? deviceTokens.length : 0} device tokens:`);
    if (deviceTokens && deviceTokens.length > 0) {
      deviceTokens.forEach((token, index) => {
        console.log(`  ${index + 1}. Platform: ${token.device_type}`);
        console.log(`     Token: ${token.device_token.substring(0, 20)}...`);
        console.log(`     Created: ${token.created_at}`);
        console.log(`     Updated: ${token.updated_at}`);
        console.log('');
      });
    } else {
      console.log('❌ No device tokens found! This is the problem.');
      console.log('💡 The app needs to register its FCM token with the backend.');
    }

    // Check recent notifications
    const { data: notifications, error: notifError } = await supabase
      .from('user_notifications')
      .select('*')
      .eq('user_id', user.id)
      .eq('notification_type', 'daily_focus_reminder')
      .order('created_at', { ascending: false })
      .limit(5);

    if (notifError) {
      console.error('❌ Error fetching notifications:', notifError);
      return;
    }

    console.log(`📬 Recent focus notifications (${notifications ? notifications.length : 0}):`);
    if (notifications && notifications.length > 0) {
      notifications.forEach((notif, index) => {
        console.log(`  ${index + 1}. ${notif.title}`);
        console.log(`     Message: ${notif.message}`);
        console.log(`     Created: ${notif.created_at}`);
        console.log(`     Read: ${notif.read}`);
        console.log('');
      });
    }

  } catch (error) {
    console.error('❌ Debug failed:', error);
  }
}

// Run the debug
debugFcmTokens()
  .then(() => {
    console.log('\n🏁 Debug completed');
    process.exit(0);
  })
  .catch((error) => {
    console.error('💥 Debug crashed:', error);
    process.exit(1);
  });

