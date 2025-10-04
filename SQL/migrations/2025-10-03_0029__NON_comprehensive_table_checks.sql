-- Migration: Comprehensive table existence and column checks
-- Date: 2025-10-03
-- Description: Makes ALL table deletions conditional to handle databases with different schemas
--              This ensures the function works regardless of which migrations have been run

DROP FUNCTION IF EXISTS delete_user_data_atomic(UUID, UUID, TEXT, INET);

CREATE OR REPLACE FUNCTION delete_user_data_atomic(
  target_user_id UUID,
  performed_by UUID DEFAULT NULL,
  reason TEXT DEFAULT NULL,
  ip_address INET DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_deleted_counts jsonb := '{}';
  row_count integer;
  audit_record_id UUID;
  table_exists boolean;
BEGIN
  -- Record deletion audit BEFORE any deletions
  INSERT INTO user_deletion_audit (
    deleted_user_id,
    deleted_by,
    reason,
    ip_address,
    deleted_at
  ) VALUES (
    target_user_id,
    COALESCE(performed_by, target_user_id),
    COALESCE(reason, 'User-initiated account deletion'),
    ip_address,
    NOW()
  )
  RETURNING id INTO audit_record_id;
  
  -- Helper function to check if table exists
  -- All deletions are now conditional based on table existence
  
  -- Delete user notification preferences
  SELECT EXISTS (
    SELECT 1 FROM information_schema.tables 
    WHERE table_schema = 'public' AND table_name = 'user_notification_preferences'
  ) INTO table_exists;
  IF table_exists THEN
    DELETE FROM user_notification_preferences WHERE user_id = target_user_id;
    GET DIAGNOSTICS row_count = ROW_COUNT;
    v_deleted_counts := jsonb_set(v_deleted_counts, '{user_notification_preferences}', to_jsonb(row_count));
  END IF;
  
  -- Delete user device tokens
  SELECT EXISTS (
    SELECT 1 FROM information_schema.tables 
    WHERE table_schema = 'public' AND table_name = 'user_device_tokens'
  ) INTO table_exists;
  IF table_exists THEN
    DELETE FROM user_device_tokens WHERE user_id = target_user_id;
    GET DIAGNOSTICS row_count = ROW_COUNT;
    v_deleted_counts := jsonb_set(v_deleted_counts, '{user_device_tokens}', to_jsonb(row_count));
  END IF;
  
  -- Delete user app preferences
  SELECT EXISTS (
    SELECT 1 FROM information_schema.tables 
    WHERE table_schema = 'public' AND table_name = 'user_app_preferences'
  ) INTO table_exists;
  IF table_exists THEN
    DELETE FROM user_app_preferences WHERE user_id = target_user_id;
    GET DIAGNOSTICS row_count = ROW_COUNT;
    v_deleted_counts := jsonb_set(v_deleted_counts, '{user_app_preferences}', to_jsonb(row_count));
  END IF;
  
  -- Delete email digest logs
  SELECT EXISTS (
    SELECT 1 FROM information_schema.tables 
    WHERE table_schema = 'public' AND table_name = 'email_digest_logs'
  ) INTO table_exists;
  IF table_exists THEN
    DELETE FROM email_digest_logs WHERE user_id = target_user_id;
    GET DIAGNOSTICS row_count = ROW_COUNT;
    v_deleted_counts := jsonb_set(v_deleted_counts, '{email_digest_logs}', to_jsonb(row_count));
  END IF;
  
  -- Delete chat history
  SELECT EXISTS (
    SELECT 1 FROM information_schema.tables 
    WHERE table_schema = 'public' AND table_name = 'chat_history'
  ) INTO table_exists;
  IF table_exists THEN
    DELETE FROM chat_history WHERE user_id = target_user_id;
    GET DIAGNOSTICS row_count = ROW_COUNT;
    v_deleted_counts := jsonb_set(v_deleted_counts, '{chat_history}', to_jsonb(row_count));
  END IF;
  
  -- Delete conversation threads
  SELECT EXISTS (
    SELECT 1 FROM information_schema.tables 
    WHERE table_schema = 'public' AND table_name = 'conversation_threads'
  ) INTO table_exists;
  IF table_exists THEN
    DELETE FROM conversation_threads WHERE user_id = target_user_id;
    GET DIAGNOSTICS row_count = ROW_COUNT;
    v_deleted_counts := jsonb_set(v_deleted_counts, '{conversation_threads}', to_jsonb(row_count));
  END IF;
  
  -- Delete calendar events
  SELECT EXISTS (
    SELECT 1 FROM information_schema.tables 
    WHERE table_schema = 'public' AND table_name = 'calendar_events'
  ) INTO table_exists;
  IF table_exists THEN
    DELETE FROM calendar_events WHERE user_id = target_user_id;
    GET DIAGNOSTICS row_count = ROW_COUNT;
    v_deleted_counts := jsonb_set(v_deleted_counts, '{calendar_events}', to_jsonb(row_count));
  END IF;
  
  -- Delete tasks
  SELECT EXISTS (
    SELECT 1 FROM information_schema.tables 
    WHERE table_schema = 'public' AND table_name = 'tasks'
  ) INTO table_exists;
  IF table_exists THEN
    DELETE FROM tasks WHERE user_id = target_user_id;
    GET DIAGNOSTICS row_count = ROW_COUNT;
    v_deleted_counts := jsonb_set(v_deleted_counts, '{tasks}', to_jsonb(row_count));
  END IF;
  
  -- Delete milestones
  SELECT EXISTS (
    SELECT 1 FROM information_schema.tables 
    WHERE table_schema = 'public' AND table_name = 'milestones'
  ) INTO table_exists;
  IF table_exists THEN
    DELETE FROM milestones WHERE user_id = target_user_id;
    GET DIAGNOSTICS row_count = ROW_COUNT;
    v_deleted_counts := jsonb_set(v_deleted_counts, '{milestones}', to_jsonb(row_count));
  END IF;
  
  -- Delete goals
  SELECT EXISTS (
    SELECT 1 FROM information_schema.tables 
    WHERE table_schema = 'public' AND table_name = 'goals'
  ) INTO table_exists;
  IF table_exists THEN
    DELETE FROM goals WHERE user_id = target_user_id;
    GET DIAGNOSTICS row_count = ROW_COUNT;
    v_deleted_counts := jsonb_set(v_deleted_counts, '{goals}', to_jsonb(row_count));
  END IF;
  
  -- Delete Google tokens
  SELECT EXISTS (
    SELECT 1 FROM information_schema.tables 
    WHERE table_schema = 'public' AND table_name = 'google_tokens'
  ) INTO table_exists;
  IF table_exists THEN
    DELETE FROM google_tokens WHERE user_id = target_user_id;
    GET DIAGNOSTICS row_count = ROW_COUNT;
    v_deleted_counts := jsonb_set(v_deleted_counts, '{google_tokens}', to_jsonb(row_count));
  END IF;
  
  -- Delete from users table (primary record) - this should always exist
  DELETE FROM users WHERE id = target_user_id;
  GET DIAGNOSTICS row_count = ROW_COUNT;
  v_deleted_counts := jsonb_set(v_deleted_counts, '{users}', to_jsonb(row_count));
  
  -- If we got here, all deletions succeeded
  -- Update audit record with success
  UPDATE user_deletion_audit
  SET 
    success = true,
    deleted_counts = v_deleted_counts
  WHERE id = audit_record_id;
  
  -- Return the counts of deleted rows per table
  RETURN jsonb_build_object(
    'success', true,
    'user_id', target_user_id,
    'audit_id', audit_record_id,
    'deleted_rows', v_deleted_counts
  );
  
EXCEPTION
  WHEN OTHERS THEN
    -- Update audit record with failure
    IF audit_record_id IS NOT NULL THEN
      BEGIN
        UPDATE user_deletion_audit
        SET 
          success = false,
          error_message = SQLERRM
        WHERE id = audit_record_id;
      EXCEPTION
        WHEN OTHERS THEN
          -- If audit update fails, continue with the RAISE
          NULL;
      END;
    END IF;
    
    -- Any error will cause automatic rollback of all changes
    RAISE EXCEPTION 'Atomic user deletion failed for user %: % (SQLSTATE: %)', 
      target_user_id, SQLERRM, SQLSTATE;
END;
$$;

-- Grant execute permission
GRANT EXECUTE ON FUNCTION delete_user_data_atomic(UUID, UUID, TEXT, INET) TO authenticated;

-- Add comment
COMMENT ON FUNCTION delete_user_data_atomic(UUID, UUID, TEXT, INET) IS 
  'Atomically deletes all user-related data across all tables in a single transaction with audit trail. ALL table deletions are conditional - checks if each table exists before attempting deletion. This makes the function robust across different database states and migration histories.';

-- Log migration completion
DO $$
BEGIN
  RAISE NOTICE '✓ Migration 2025-10-03_0029 completed successfully';
  RAISE NOTICE '  - Made ALL table deletions conditional';
  RAISE NOTICE '  - Function now checks for table existence before every delete';
  RAISE NOTICE '  - Works with any combination of applied migrations';
END $$;

