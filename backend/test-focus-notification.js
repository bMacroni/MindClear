#!/usr/bin/env node

/**
 * Test script to manually trigger the daily focus reminder cron job
 * Run this to test the focus notification feature without waiting for 7 AM
 */

import { createClient } from '@supabase/supabase-js';
import { sendDailyFocusReminder } from './src/services/notificationService.js';

// Initialize Supabase client
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function testFocusNotifications() {
  console.log('🧪 Testing Focus Notifications...\n');

  try {
    // Get a test user by email (modify this to target your specific user)
    const testEmail = 'bmcornell88@gmail.com'; // Change this to your email
    const { data: users, error: usersError } = await supabase
      .from('users')
      .select(`
        id,
        full_name,
        email,
        timezone,
        focus_notification_time,
        last_focus_notification_sent
      `)
      .eq('email', testEmail)
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
    console.log(`👤 Testing with user: ${user.full_name || 'No name'} (${user.id})`);
    console.log(`📧 Email: ${user.email}`);
    console.log(`🌍 Timezone: ${user.timezone || 'America/Chicago'}`);

    // Check if user has focus notification preference enabled
    const { data: prefs, error: prefsError } = await supabase
      .from('user_notification_preferences')
      .select('enabled')
      .eq('user_id', user.id)
      .eq('notification_type', 'daily_focus_reminder')
      .eq('channel', 'push')
      .single();

    if (prefsError && prefsError.code !== 'PGRST116') {
      console.error('❌ Error checking notification preferences:', prefsError);
      return;
    }

    const isEnabled = prefs ? prefs.enabled : true;
    console.log(`🔔 Focus notifications enabled: ${isEnabled}`);

    if (!isEnabled) {
      console.log('⚠️  Focus notifications are disabled for this user');
      console.log('💡 Enable them via Profile > Notifications > Tasks toggle');
      return;
    }

    // First, let's see all tasks for this user to debug
    const { data: allTasks, error: allTasksError } = await supabase
      .from('tasks')
      .select('id, title, description, status, is_today_focus')
      .eq('user_id', user.id);

    if (allTasksError) {
      console.error('❌ Error fetching all tasks:', allTasksError);
      return;
    }

    console.log(`📋 Found ${allTasks ? allTasks.length : 0} total tasks for user`);
    if (allTasks && allTasks.length > 0) {
      console.log('📝 All tasks:');
      allTasks.forEach((task, index) => {
        console.log(`  ${index + 1}. "${task.title}" (status: ${task.status}, is_today_focus: ${task.is_today_focus})`);
      });
    }

    // Now get user's focus task
    const { data: focusTask, error: taskError } = await supabase
      .from('tasks')
      .select('id, title, description')
      .eq('user_id', user.id)
      .eq('is_today_focus', true)
      .eq('status', 'not_started')
      .single();

    if (taskError && taskError.code !== 'PGRST116') {
      console.error('❌ Error fetching focus task:', taskError);
      return;
    }

    if (focusTask) {
      console.log(`🎯 Focus task found: "${focusTask.title}"`);
    } else {
      console.log('📝 No focus task set for today (is_today_focus=true AND status=not_started)');
    }

    // Send the notification
    console.log('\n📤 Sending focus notification...');
    const result = await sendDailyFocusReminder(user.id, focusTask, user.full_name);

    if (result.success) {
      console.log('✅ Notification sent successfully!');
      
      // Update last_focus_notification_sent timestamp
      const { error: updateError } = await supabase
        .from('users')
        .update({ last_focus_notification_sent: new Date().toISOString() })
        .eq('id', user.id);
        
      if (updateError) {
        console.error('⚠️  Failed to update timestamp:', updateError);
      } else {
        console.log('📅 Timestamp updated successfully');
      }
    } else {
      console.error('❌ Failed to send notification:', result.error);
    }

  } catch (error) {
    console.error('❌ Test failed:', error);
  }
}

// Run the test
testFocusNotifications()
  .then(() => {
    console.log('\n🏁 Test completed');
    process.exit(0);
  })
  .catch((error) => {
    console.error('💥 Test crashed:', error);
    process.exit(1);
  });
