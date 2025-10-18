#!/usr/bin/env node

/**
 * Script to manually register a test FCM token for debugging
 */

import { createClient } from '@supabase/supabase-js';

// Initialize Supabase client
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function registerTestToken() {
  console.log('🔧 Registering test FCM token...\n');

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

    // Create a test FCM token (this is a fake token for testing)
    const testToken = 'test-fcm-token-' + Date.now();
    
    // Register the test token
    const { data: tokenData, error: tokenError } = await supabase
      .from('user_device_tokens')
      .upsert({
        user_id: user.id,
        device_token: testToken,
        device_type: 'android',
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      }, {
        onConflict: 'user_id,device_type'
      })
      .select()
      .single();

    if (tokenError) {
      console.error('❌ Error registering test token:', tokenError);
      return;
    }

    console.log('✅ Test FCM token registered successfully!');
    console.log(`📱 Token: ${testToken}`);
    console.log('\n🚀 Now try running the notification test again:');
    console.log('   node test-focus-notification.js');

  } catch (error) {
    console.error('❌ Registration failed:', error);
  }
}

// Run the registration
registerTestToken()
  .then(() => {
    console.log('\n🏁 Registration completed');
    process.exit(0);
  })
  .catch((error) => {
    console.error('💥 Registration crashed:', error);
    process.exit(1);
  });

