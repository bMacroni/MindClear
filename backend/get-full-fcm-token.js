
/**
 * Script to get the full FCM token for Firebase Console testing
 */

import { createClient } from '@supabase/supabase-js';

// Initialize Supabase client
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function getFullFcmToken() {
  console.log('🔑 Getting Full FCM Token for Firebase Console...\n');

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

    // Get device tokens
    const { data: deviceTokens, error: tokensError } = await supabase
      .from('user_device_tokens')
      .select('*')
      .eq('user_id', user.id)
      .eq('device_type', 'android');

    if (tokensError) {
      console.error('❌ Error fetching device tokens:', tokensError);
      return;
    }

    if (!deviceTokens || deviceTokens.length === 0) {
      console.log('❌ No Android device tokens found');
      return;
    }

    console.log(`📱 Found ${deviceTokens.length} Android device token(s):\n`);

    deviceTokens.forEach((token, index) => {
      console.log(`Token ${index + 1}:`);
      console.log(`  Platform: ${token.device_type}`);
      console.log(`  Created: ${token.created_at}`);
      console.log(`  Full Token: ${token.device_token}`);
      console.log('');
    });

    console.log('📋 Copy the full token above and paste it into Firebase Console');
    console.log('🔗 Go to: Firebase Console → Cloud Messaging → Send test message');

  } catch (error) {
    console.error('❌ Script failed:', error);
  }
}

// Run the script
getFullFcmToken()
  .then(() => {
    console.log('🏁 Script completed');
    process.exit(0);
  })
  .catch((error) => {
    console.error('💥 Script crashed:', error);
    process.exit(1);
  });
