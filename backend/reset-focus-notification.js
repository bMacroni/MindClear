#!/usr/bin/env node

/**
 * Script to reset focus notification spam protection and timestamp
 * This allows you to test the notification again immediately
 */

import { createClient } from '@supabase/supabase-js';

// Initialize Supabase client
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function resetFocusNotification() {
  console.log('🔄 Resetting focus notification for testing...\n');

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
    console.log(`👤 Found user: ${user.full_name} (${user.id})`);

    // Clear the last_focus_notification_sent timestamp
    const { error: updateError } = await supabase
      .from('users')
      .update({ last_focus_notification_sent: null })
      .eq('id', user.id);

    if (updateError) {
      console.error('❌ Error clearing notification timestamp:', updateError);
      return;
    }

    // Clear any recent notifications that might trigger spam protection
    const { error: deleteError } = await supabase
      .from('user_notifications')
      .delete()
      .eq('user_id', user.id)
      .eq('notification_type', 'daily_focus_reminder')
      .gte('created_at', new Date(Date.now() - 10 * 60 * 1000).toISOString()); // Last 10 minutes

    if (deleteError) {
      console.error('❌ Error clearing recent notifications:', deleteError);
      return;
    }

    console.log('✅ Successfully reset focus notification!');
    console.log('📝 Cleared last_focus_notification_sent timestamp');
    console.log('📝 Cleared recent daily_focus_reminder notifications');
    console.log('\n🚀 You can now run the test again:');
    console.log('   node test-focus-notification.js');

  } catch (error) {
    console.error('❌ Reset failed:', error);
  }
}

// Run the reset
resetFocusNotification()
  .then(() => {
    console.log('\n🏁 Reset completed');
    process.exit(0);
  })
  .catch((error) => {
    console.error('💥 Reset crashed:', error);
    process.exit(1);
  });

