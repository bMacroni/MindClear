#!/usr/bin/env node

/**
 * Script to create a test focus task for notification testing
 */

import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function createTestFocusTask() {
  console.log('🎯 Creating test focus task...\n');

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
    console.log(`👤 Creating task for user: ${user.full_name} (${user.id})`);

    // First, clear any existing focus tasks
    await supabase
      .from('tasks')
      .update({ is_today_focus: false })
      .eq('user_id', user.id);

    // Create a new focus task
    const { data: task, error: taskError } = await supabase
      .from('tasks')
      .insert({
        user_id: user.id,
        title: 'Test Focus Task - Complete project proposal',
        description: 'This is a test task to verify focus notifications work correctly',
        priority: 'high',
        status: 'not_started',
        is_today_focus: true,
        category: 'work'
      })
      .select()
      .single();

    if (taskError) {
      console.error('❌ Error creating task:', taskError);
      return;
    }

    console.log('✅ Test focus task created successfully!');
    console.log(`📝 Task: "${task.title}"`);
    console.log(`🆔 Task ID: ${task.id}`);
    console.log('\n💡 You can now run the notification test script');

  } catch (error) {
    console.error('❌ Failed to create test task:', error);
  }
}

createTestFocusTask()
  .then(() => {
    console.log('\n🏁 Script completed');
    process.exit(0);
  })
  .catch((error) => {
    console.error('💥 Script crashed:', error);
    process.exit(1);
  });

