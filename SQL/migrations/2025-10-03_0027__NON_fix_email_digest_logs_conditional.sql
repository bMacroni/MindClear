-- Migration: Fix email_digest_logs conditional deletion
-- Date: 2025-10-03
-- Description: Updates delete_user_data_atomic to check if email_digest_logs table exists before deleting
-- 
-- This fixes the error: column "user_id" does not exist
-- The email_digest_logs table may not exist in all environments, so we check before deleting

-- Drop and recreate the function with the fix
DROP FUNCTION IF EXISTS delete_user_data_atomic(UUID, UUID, TEXT, INET);

-- Recreate with audit parameters and conditional email_digest_logs check
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
  deleted_counts jsonb := '{}';
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
  deleted_counts := jsonb_set(deleted_counts, '{user_notification_preferences}', to_jsonb(row_count));
  
  -- Delete user device tokens
  DELETE FROM user_device_tokens WHERE user_id = target_user_id;
  GET DIAGNOSTICS row_count = ROW_COUNT;
  deleted_counts := jsonb_set(deleted_counts, '{user_device_tokens}', to_jsonb(row_count));
  
  -- Delete user app preferences
  DELETE FROM user_app_preferences WHERE user_id = target_user_id;
  GET DIAGNOSTICS row_count = ROW_COUNT;
  deleted_counts := jsonb_set(deleted_counts, '{user_app_preferences}', to_jsonb(row_count));
  
  -- Delete email digest logs (if table exists)
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'email_digest_logs') THEN
    DELETE FROM email_digest_logs WHERE user_id = target_user_id;
    GET DIAGNOSTICS row_count = ROW_COUNT;
    deleted_counts := jsonb_set(deleted_counts, '{email_digest_logs}', to_jsonb(row_count));
  END IF;
  
  -- Delete chat history
  DELETE FROM chat_history WHERE user_id = target_user_id;
  GET DIAGNOSTICS row_count = ROW_COUNT;
  deleted_counts := jsonb_set(deleted_counts, '{chat_history}', to_jsonb(row_count));
  
  -- Delete conversation threads
  DELETE FROM conversation_threads WHERE user_id = target_user_id;
  GET DIAGNOSTICS row_count = ROW_COUNT;
  deleted_counts := jsonb_set(deleted_counts, '{conversation_threads}', to_jsonb(row_count));
  
  -- Delete calendar events
  DELETE FROM calendar_events WHERE user_id = target_user_id;
  GET DIAGNOSTICS row_count = ROW_COUNT;
  deleted_counts := jsonb_set(deleted_counts, '{calendar_events}', to_jsonb(row_count));
  
  -- Delete tasks
  DELETE FROM tasks WHERE user_id = target_user_id;
  GET DIAGNOSTICS row_count = ROW_COUNT;
  deleted_counts := jsonb_set(deleted_counts, '{tasks}', to_jsonb(row_count));
  
  -- Delete milestones
  DELETE FROM milestones WHERE user_id = target_user_id;
  GET DIAGNOSTICS row_count = ROW_COUNT;
  deleted_counts := jsonb_set(deleted_counts, '{milestones}', to_jsonb(row_count));
  
  -- Delete goals
  DELETE FROM goals WHERE user_id = target_user_id;
  GET DIAGNOSTICS row_count = ROW_COUNT;
  deleted_counts := jsonb_set(deleted_counts, '{goals}', to_jsonb(row_count));
  
  -- Delete Google tokens
  DELETE FROM google_tokens WHERE user_id = target_user_id;
  GET DIAGNOSTICS row_count = ROW_COUNT;
  deleted_counts := jsonb_set(deleted_counts, '{google_tokens}', to_jsonb(row_count));
  
  -- Delete from users table (primary record)
  DELETE FROM users WHERE id = target_user_id;
  GET DIAGNOSTICS row_count = ROW_COUNT;
  deleted_counts := jsonb_set(deleted_counts, '{users}', to_jsonb(row_count));
  
  -- If we got here, all deletions succeeded
  -- Update audit record with success
  UPDATE user_deletion_audit
  SET 
    success = true,
    deleted_counts = deleted_counts
  WHERE id = audit_record_id;
  
  -- Return the counts of deleted rows per table
  RETURN jsonb_build_object(
    'success', true,
    'user_id', target_user_id,
    'audit_id', audit_record_id,
    'deleted_rows', deleted_counts
  );
  
EXCEPTION
  WHEN OTHERS THEN
    -- Update audit record with failure
    UPDATE user_deletion_audit
    SET 
      success = false,
      error_message = SQLERRM
    WHERE id = audit_record_id;
    
    -- Any error will cause automatic rollback of all changes
    RAISE EXCEPTION 'Atomic user deletion failed for user %: % (SQLSTATE: %)', 
      target_user_id, SQLERRM, SQLSTATE;
END;
$$;

-- Grant execute permission
GRANT EXECUTE ON FUNCTION delete_user_data_atomic(UUID, UUID, TEXT, INET) TO authenticated;

-- Add comment
COMMENT ON FUNCTION delete_user_data_atomic(UUID, UUID, TEXT, INET) IS 
  'Atomically deletes all user-related data across all tables in a single transaction with audit trail. Conditionally handles email_digest_logs if table exists. Returns a JSONB object with deletion counts or raises an exception on failure, causing automatic rollback of all changes.';

-- Log migration completion
DO $$
BEGIN
  RAISE NOTICE '✓ Migration 2025-10-03_0027 completed successfully';
  RAISE NOTICE '  - Fixed email_digest_logs conditional check in delete_user_data_atomic';
END $$;

