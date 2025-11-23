
/**
 * Script to enable focus notifications for testing
 */

import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function enableFocusNotifications() {
  console.log('🔔 Enabling focus notifications for testing...\n');

  try {
    // Get a test user
    const { data: users, error: usersError } = await supabase
      .from('users')
      .select('id, full_name')
      .limit(1);

    if (usersError) {
      console.error('❌ Error fetching users:', usersError);
      return;
    }

    if (!users || users.length === 0) {
      console.log('❌ No users found in database');
      return;
    }

    const user = users[0];
    console.log(`👤 Enabling notifications for user: ${user.full_name} (${user.id})`);

    // Enable focus notification preference
    const { data: preference, error: prefError } = await supabase
      .from('user_notification_preferences')
      .upsert({
        user_id: user.id,
        notification_type: 'daily_focus_reminder',
        channel: 'push',
        enabled: true,
        updated_at: new Date().toISOString()
      }, {
        onConflict: 'user_id,notification_type,channel'
      })
      .select()
      .single();

    if (prefError) {
      console.error('❌ Error enabling notification preference:', prefError);
      return;
    }

    console.log('✅ Focus notifications enabled successfully!');
    console.log(`🔔 Preference ID: ${preference.id}`);
    console.log('\n💡 You can now test the notification feature');

  } catch (error) {
    console.error('❌ Failed to enable notifications:', error);
  }
}

enableFocusNotifications()
  .then(() => {
    console.log('\n🏁 Script completed');
    process.exit(0);
  })
  .catch((error) => {
    console.error('💥 Script crashed:', error);
    process.exit(1);
  });

