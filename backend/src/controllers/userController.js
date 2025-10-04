import { createClient } from '@supabase/supabase-js';
import { 
  retryWithBackoff, 
  enqueueFailedOperation, 
  markUserDeletionFailed,
  sendOpsAlert 
} from '../utils/retryService.js';

export async function getUserSettings(req, res) {
  const user_id = req.user.id;
  const token = req.headers.authorization?.split(' ')[1];
  const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_ANON_KEY, {
    global: { headers: { Authorization: `Bearer ${token}` } }
  });

  const { data, error } = await supabase
    .from('users')
    .select('timezone, email, full_name, avatar_url')
    .eq('id', user_id)
    .single();

  if (error) {
    return res.status(400).json({ error: error.message });
  }
  res.json(data);
}

export async function updateUserSettings(req, res) {
  const user_id = req.user.id;
  const { timezone } = req.body;
  const token = req.headers.authorization?.split(' ')[1];
  const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_ANON_KEY, {
    global: { headers: { Authorization: `Bearer ${token}` } }
  });

  const updateFields = {};
  if (timezone !== undefined) updateFields.timezone = timezone;

  const { data, error } = await supabase
    .from('users')
    .update(updateFields)
    .eq('id', user_id)
    .select('timezone, email, full_name, avatar_url')
    .single();

  if (error) {
    return res.status(400).json({ error: error.message });
  }
  res.json(data);
} 

export async function getUserProfile(req, res) {
  const user_id = req.user.id;
  const token = req.headers.authorization?.split(' ')[1];
  const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_ANON_KEY, {
    global: { headers: { Authorization: `Bearer ${token}` } }
  });

  const { data, error } = await supabase
    .from('users')
    .select('*')
    .eq('id', user_id)
    .single();

  if (error) {
    return res.status(400).json({ error: error.message });
  }
  // Fallback join_date using auth user's created_at if join_date column isn't present
  try {
    const { data: authData } = await supabase.auth.getUser(token);
    const joinDate = (data && 'join_date' in data && data.join_date) ? data.join_date : authData?.user?.created_at;
    res.json({
      id: data.id,
      email: data.email,
      full_name: data.full_name,
      avatar_url: data.avatar_url,
      join_date: joinDate,
      last_login: data.last_login,
      account_status: data.account_status,
      theme_preference: data.theme_preference,
      notification_preferences: data.notification_preferences,
      geographic_location: data.geographic_location,
      timezone: data.timezone,
      is_admin: data.is_admin,
    });
  } catch (_) {
    res.json(data);
  }
}

export async function updateUserProfile(req, res) {
  const user_id = req.user.id;
  const {
    full_name,
    avatar_url,
    geographic_location,
    theme_preference,
    notification_preferences,
  } = req.body;

  const token = req.headers.authorization?.split(' ')[1];
  const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_ANON_KEY, {
    global: { headers: { Authorization: `Bearer ${token}` } }
  });

  const updateFields = {
    ...(full_name !== undefined && { full_name }),
    ...(avatar_url !== undefined && { avatar_url }),
    ...(geographic_location !== undefined && { geographic_location }),
    ...(theme_preference !== undefined && { theme_preference }),
    ...(notification_preferences !== undefined && { notification_preferences }),
  };

  const { data, error } = await supabase
    .from('users')
    .update(updateFields)
    .eq('id', user_id)
    .select('*')
    .single();

  if (error) {
    return res.status(400).json({ error: error.message });
  }
  res.json(data);
}

// === App Preferences (new table: user_app_preferences) ===

async function ensureAppPreferencesTable() {
  try {
    // Use service role for DDL operations
    const admin = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
    await admin.rpc('exec_sql', {
      sql: `
        CREATE TABLE IF NOT EXISTS public.user_app_preferences (
          user_id UUID PRIMARY KEY REFERENCES public.users(id) ON DELETE CASCADE,
          momentum_mode_enabled BOOLEAN NOT NULL DEFAULT false,
          momentum_travel_preference TEXT NOT NULL DEFAULT 'allow_travel',
          created_at TIMESTAMPTZ DEFAULT NOW(),
          updated_at TIMESTAMPTZ DEFAULT NOW()
        );

        ALTER TABLE public.user_app_preferences ENABLE ROW LEVEL SECURITY;
        DO $$ BEGIN
          IF NOT EXISTS (
            SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'user_app_preferences' AND policyname = 'Users can view own app prefs'
          ) THEN
            CREATE POLICY "Users can view own app prefs" ON public.user_app_preferences FOR SELECT USING (auth.uid() = user_id);
          END IF;
          IF NOT EXISTS (
            SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'user_app_preferences' AND policyname = 'Users can insert own app prefs'
          ) THEN
            CREATE POLICY "Users can insert own app prefs" ON public.user_app_preferences FOR INSERT WITH CHECK (auth.uid() = user_id);
          END IF;
          IF NOT EXISTS (
            SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'user_app_preferences' AND policyname = 'Users can update own app prefs'
          ) THEN
            CREATE POLICY "Users can update own app prefs" ON public.user_app_preferences FOR UPDATE USING (auth.uid() = user_id);
          END IF;
        END $$;
      `
    });
  } catch (_e) {
    // Silent fail; endpoint will attempt without DDL
  }
}

export async function getAppPreferences(req, res) {
  const user_id = req.user.id;
  const token = req.headers.authorization?.split(' ')[1];
  const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_ANON_KEY, {
    global: { headers: { Authorization: `Bearer ${token}` } }
  });
  try {
    const { data, error } = await supabase
      .from('user_app_preferences')
      .select('*')
      .eq('user_id', user_id)
      .single();
    if (error) {
      if (error.code === '42P01') {
        return res.status(400).json({ error: 'user_app_preferences table not found. Please run the SQL migration to create it.' });
      }
      if (error.code === 'PGRST116') {
        // No row yet; return defaults
        return res.json({
          user_id,
          momentum_mode_enabled: false,
          momentum_travel_preference: 'allow_travel',
        });
      }
      return res.status(400).json({ error: error.message });
    }
    res.json(data || {
      user_id,
      momentum_mode_enabled: false,
      momentum_travel_preference: 'allow_travel',
    });
  } catch (_e) {
    res.status(500).json({ error: 'Failed to fetch app preferences' });
  }
}

export async function updateAppPreferences(req, res) {
  const user_id = req.user.id;
  const { momentum_mode_enabled, momentum_travel_preference } = req.body || {};
  const token = req.headers.authorization?.split(' ')[1];
  const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_ANON_KEY, {
    global: { headers: { Authorization: `Bearer ${token}` } }
  });
  const updates = {};
  if (typeof momentum_mode_enabled === 'boolean') updates.momentum_mode_enabled = momentum_mode_enabled;
  if (momentum_travel_preference && ['allow_travel','home_only'].includes(momentum_travel_preference)) {
    updates.momentum_travel_preference = momentum_travel_preference;
  }
  try {
    // Try update first
    const { data: updated, error: updErr } = await supabase
      .from('user_app_preferences')
      .update({ ...updates, updated_at: new Date().toISOString() })
      .eq('user_id', user_id)
      .select()
      .single();

    if (!updErr && updated) {
      return res.json(updated);
    }

    // If no row, insert
    const { data: inserted, error: insErr } = await supabase
      .from('user_app_preferences')
      .insert([{ user_id, ...updates }])
      .select()
      .single();
    if (insErr) {
      if (insErr.code === '42P01') {
        return res.status(400).json({ error: 'user_app_preferences table not found. Please run the SQL migration to create it.' });
      }
      return res.status(400).json({ error: insErr.message });
    }
    res.json(inserted);
  } catch (_e) {
    res.status(500).json({ error: 'Failed to update app preferences' });
  }
}


// === Notification Preferences ===

export async function registerDeviceToken(req, res) {
  // Check if user is authenticated
  if (!req.user || !req.user.id) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  
  const user_id = req.user.id;
  const { token: device_token, device_type } = req.body;

  if (!device_token) {
    return res.status(400).json({ error: 'Device token is required' });
  }

  // Validate device_type against allowed values
  const allowedDeviceTypes = ['ios', 'android', 'web'];
  if (!device_type || !allowedDeviceTypes.includes(device_type)) {
    return res.status(400).json({ 
      error: 'Invalid device_type. Must be one of: ios, android, web' 
    });
  }

  const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

  try {
    const currentTimestamp = new Date().toISOString();
    
    const { error } = await supabase
      .from('user_device_tokens')
      .upsert({
        user_id,
        device_token,
        device_type
      }, { onConflict: 'user_id, device_token' });

    if (error) {
      console.error('Error registering device token:', error);
      return res.status(500).json({ error: 'Failed to register device token' });
    }

    res.status(200).json({ success: true, message: 'Device token registered or updated successfully' });
  } catch (e) {
    console.error('Exception in registerDeviceToken:', e);
    res.status(500).json({ error: 'An unexpected error occurred' });
  }
}

export async function getNotificationPreferences(req, res) {
  // Check if user is authenticated
  if (!req.user || !req.user.id) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  
  const user_id = req.user.id;
  const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

  try {
    const { data, error } = await supabase
      .from('user_notification_preferences')
      .select('*')
      .eq('user_id', user_id);

    if (error) {
      console.error('Error fetching notification preferences:', error);
      return res.status(500).json({ error: 'Failed to fetch notification preferences' });
    }

    res.json(data);
  } catch (e) {
    console.error('Exception in getNotificationPreferences:', e);
    res.status(500).json({ error: 'An unexpected error occurred' });
  }
}

export async function updateNotificationPreferences(req, res) {
  // Check if user is authenticated
  if (!req.user || !req.user.id) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  
  const user_id = req.user.id;
  const preferences = req.body;

  if (!Array.isArray(preferences)) {
    return res.status(400).json({ error: 'Request body must be an array of preference objects' });
  }

  const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

  const allowedTypes = ['goal_completed','milestone_completed','task_reminder','new_message'];
  const allowedChannels = ['in_app','push','email'];
  const validationError = preferences.some(p =>
    !p.notification_type ||
    !allowedTypes.includes(p.notification_type) ||
    !p.channel ||
    !allowedChannels.includes(p.channel) ||
    (p.enabled !== undefined && typeof p.enabled !== 'boolean') ||
    (p.snooze_duration_minutes !== undefined && (!Number.isInteger(p.snooze_duration_minutes) || p.snooze_duration_minutes < 0 || p.snooze_duration_minutes > 10080))
  );
  if (validationError) {
    return res.status(400).json({ error: 'Invalid preference(s): check notification_type, channel, enabled:boolean, snooze_duration_minutes:0-10080' });
  }

  const upsertData = preferences.map(p => {
    const baseData = {
      user_id,
      notification_type: p.notification_type,
      channel: p.channel,
      enabled: p.enabled !== undefined ? p.enabled : true
    };
    
    // Only include snooze_duration_minutes if it's defined
    if (p.snooze_duration_minutes !== undefined) {
      baseData.snooze_duration_minutes = p.snooze_duration_minutes;
    }
    
    return baseData;
  });

  try {
    const { data, error } = await supabase
      .from('user_notification_preferences')
      .upsert(upsertData, { onConflict: 'user_id, notification_type, channel' })
      .select();

    if (error) {
      console.error('Error updating notification preferences:', error);
      return res.status(500).json({ error: 'Failed to update notification preferences' });
    }

    res.json(data);
  } catch (e) {
    console.error('Exception in updateNotificationPreferences:', e);
    res.status(500).json({ error: 'An unexpected error occurred' });
  }
}

/**
 * Delete user account and all associated data
 * This endpoint provides user-initiated account deletion for Play policy compliance
 * Now includes audit trail, consent verification, and IP tracking
 */
export async function deleteUserAccount(req, res) {
  // Check if user is authenticated
  if (!req.user || !req.user.id) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  
  const user_id = req.user.id;
  const { confirmDeletion, reason } = req.body;

  // Require explicit confirmation to prevent accidental deletion
  if (!confirmDeletion) {
    return res.status(400).json({ 
      error: 'Account deletion requires confirmation. Please set confirmDeletion to true.' 
    });
  }

  // Extract IP address from request (handle proxies)
  const ip_address = req.headers['x-forwarded-for']?.split(',')[0].trim() 
    || req.headers['x-real-ip']
    || req.socket.remoteAddress
    || req.connection.remoteAddress;

  const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

  try {
    console.log(`Starting atomic account deletion for user: ${user_id}`);

    // Call the atomic deletion stored procedure with audit parameters
    // This sets deletion_requested_at AND deletes all user data in a single transaction
    // Either ALL operations succeed or ALL roll back (including the timestamp)
    const { data: deletionResult, error: rpcError } = await supabase
      .rpc('delete_user_data_atomic', { 
        target_user_id: user_id,
        performed_by: user_id, // User is deleting their own account
        reason: reason || 'User-initiated account deletion',
        ip_address: ip_address || null
      });

    if (rpcError) {
      console.error('Atomic deletion RPC failed:', {
        user_id,
        error: rpcError.message,
        code: rpcError.code,
        details: rpcError.details,
        hint: rpcError.hint
      });
      return res.status(500).json({ 
        error: 'Failed to delete user account. No data was removed (transaction rolled back).',
        details: rpcError.message
      });
    }

    console.log('Database deletion completed atomically:', deletionResult);

    // STEP 3: Delete auth user with retry logic and compensating transactions
    // Uses exponential backoff for transient errors and dead-letter queue for failures
    console.log('Attempting auth account deletion with retry logic...');
    
    const authDeletionResult = await retryWithBackoff(
      async () => {
        const { error } = await supabase.auth.admin.deleteUser(user_id);
        if (error) {
          throw error;
        }
        return { success: true };
      },
      {
        maxRetries: 3,
        baseDelayMs: 1000,
        maxDelayMs: 10000
      }
    );
  
  // Check if auth deletion succeeded
  if (authDeletionResult.success) {
    console.log('Auth account deletion completed successfully');
    return res.status(200).json({ 
      success: true, 
      message: 'Account and all associated data have been permanently deleted.',
      audit_id: deletionResult?.audit_id
    });
  }

  // Auth deletion failed after retries - execute compensating actions
  console.error('Auth deletion failed after retries:', authDeletionResult.error);

  // COMPENSATING ACTION 1: Mark user with failed deletion status
  let markResult;
  try {
    markResult = await markUserDeletionFailed(user_id, {
      error: authDeletionResult.error.message,
      attempts: authDeletionResult.attempts,
      db_deletion_result: deletionResult
    });
  } catch (markError) {
    console.error('CRITICAL: Failed to mark user deletion as failed:', markError);
    markResult = { error: markError.message };
  }

  // COMPENSATING ACTION 2: Enqueue for async/manual cleanup
  const queueResult = await enqueueFailedOperation({
    user_id,
    operation_type: 'auth_deletion',
    context: {
      db_deletion_result: deletionResult,
      audit_id: deletionResult?.audit_id,
      deletion_reason: reason || 'User-initiated account deletion',
      ip_address
    },
    retry_count: authDeletionResult.attempts,
    last_error: authDeletionResult.error
  });

  // COMPENSATING ACTION 3: Send ops alert for manual intervention
  await sendOpsAlert({
    user_id,
    operation_type: 'auth_deletion',
    error_message: authDeletionResult.error.message,
    retry_count: authDeletionResult.attempts,
    context: {
      db_deletion_result: deletionResult,
      audit_id: deletionResult?.audit_id,
      mark_result: markResult,
      queue_result: queueResult
    },
    queue_id: queueResult?.data?.id
  });

  // Return response indicating partial success
  return res.status(202).json({ 
    success: 'partial',
    message: 'Database records deleted successfully. Authentication removal is pending manual intervention.',
    details: {
      db_deletion: 'completed',
      auth_deletion: 'pending',
      audit_id: deletionResult?.audit_id,
      queue_id: queueResult?.data?.id,
      action_required: 'Operations team has been notified and will complete the process.'
    },
    contact_support: true
  });

  } catch (e) {
    console.error('Exception in deleteUserAccount:', e);
    res.status(500).json({ error: 'An unexpected error occurred during account deletion' });
  }
}