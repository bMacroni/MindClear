-- Migration: Fix audit table column names in delete function
-- Date: 2025-10-03
-- Description: Corrects the column names used when inserting into user_deletion_audit
--              (deleted_user_id and deleted_by instead of user_id and performed_by)

-- Drop and recreate the function with correct column names
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
  
  -- All deletions happen within this function's implicit transaction
  -- If any DELETE fails, the entire transaction will roll back
  
  -- Delete user notification preferences
  DELETE FROM user_notification_preferences WHERE user_id = target_user_id;
  GET DIAGNOSTICS row_count = ROW_COUNT;
  v_deleted_counts := jsonb_set(v_deleted_counts, '{user_notification_preferences}', to_jsonb(row_count));
  
  -- Delete user device tokens
  DELETE FROM user_device_tokens WHERE user_id = target_user_id;
  GET DIAGNOSTICS row_count = ROW_COUNT;
  v_deleted_counts := jsonb_set(v_deleted_counts, '{user_device_tokens}', to_jsonb(row_count));
  
  -- Delete user app preferences
  DELETE FROM user_app_preferences WHERE user_id = target_user_id;
  GET DIAGNOSTICS row_count = ROW_COUNT;
  v_deleted_counts := jsonb_set(v_deleted_counts, '{user_app_preferences}', to_jsonb(row_count));
  
  -- Delete email digest logs (if table exists)
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'email_digest_logs') THEN
    DELETE FROM email_digest_logs WHERE user_id = target_user_id;
    GET DIAGNOSTICS row_count = ROW_COUNT;
    v_deleted_counts := jsonb_set(v_deleted_counts, '{email_digest_logs}', to_jsonb(row_count));
  END IF;
  
  -- Delete chat history (if table exists)
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'chat_history') THEN
    DELETE FROM chat_history WHERE user_id = target_user_id;
    GET DIAGNOSTICS row_count = ROW_COUNT;
    v_deleted_counts := jsonb_set(v_deleted_counts, '{chat_history}', to_jsonb(row_count));
  END IF;
  
  -- Delete conversation threads
  DELETE FROM conversation_threads WHERE user_id = target_user_id;
  GET DIAGNOSTICS row_count = ROW_COUNT;
  v_deleted_counts := jsonb_set(v_deleted_counts, '{conversation_threads}', to_jsonb(row_count));
  
  -- Delete calendar events
  DELETE FROM calendar_events WHERE user_id = target_user_id;
  GET DIAGNOSTICS row_count = ROW_COUNT;
  v_deleted_counts := jsonb_set(v_deleted_counts, '{calendar_events}', to_jsonb(row_count));
  
  -- Delete tasks
  DELETE FROM tasks WHERE user_id = target_user_id;
  GET DIAGNOSTICS row_count = ROW_COUNT;
  v_deleted_counts := jsonb_set(v_deleted_counts, '{tasks}', to_jsonb(row_count));
  
  -- Delete milestones
  DELETE FROM milestones WHERE user_id = target_user_id;
  GET DIAGNOSTICS row_count = ROW_COUNT;
  v_deleted_counts := jsonb_set(v_deleted_counts, '{milestones}', to_jsonb(row_count));
  
  -- Delete goals
  DELETE FROM goals WHERE user_id = target_user_id;
  GET DIAGNOSTICS row_count = ROW_COUNT;
  v_deleted_counts := jsonb_set(v_deleted_counts, '{goals}', to_jsonb(row_count));
  
  -- Delete Google tokens
  DELETE FROM google_tokens WHERE user_id = target_user_id;
  GET DIAGNOSTICS row_count = ROW_COUNT;
  v_deleted_counts := jsonb_set(v_deleted_counts, '{google_tokens}', to_jsonb(row_count));
  
  -- Delete from users table (primary record)
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
  'Atomically deletes all user-related data across all tables in a single transaction with audit trail. Uses correct audit table column names (deleted_user_id, deleted_by). Conditionally handles email_digest_logs and chat_history if tables exist. Returns a JSONB object with deletion counts or raises an exception on failure, causing automatic rollback of all changes.';

-- Log migration completion
DO $$
BEGIN
  RAISE NOTICE '✓ Migration 2025-10-03_0028 completed successfully';
  RAISE NOTICE '  - Fixed audit table column names (deleted_user_id, deleted_by)';
  RAISE NOTICE '  - Renamed variable to v_deleted_counts to avoid ambiguity';
  RAISE NOTICE '  - Added conditional checks for email_digest_logs and chat_history tables';
END $$;

