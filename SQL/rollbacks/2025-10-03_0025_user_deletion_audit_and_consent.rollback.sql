
-- Rollback: User deletion audit trail and consent verification
-- Created: 2025-10-03
-- Description: Rolls back audit table, consent column, and restores original deletion function

-- ============================================================================
-- STEP 1: Restore the original simple function signature
-- ============================================================================

-- Drop the enhanced function
DROP FUNCTION IF EXISTS delete_user_data_atomic(UUID, UUID, TEXT, INET);

-- Recreate the original simple function
CREATE OR REPLACE FUNCTION delete_user_data_atomic(target_user_id UUID)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $DECLARE
  deleted_counts jsonb := '{}';
  row_count integer;
BEGIN
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
  -- Return the counts of deleted rows per table
  RETURN jsonb_build_object(
    'success', true,
    'user_id', target_user_id,
    'deleted_rows', deleted_counts
  );
  
EXCEPTION
  WHEN OTHERS THEN
    -- Any error will cause automatic rollback of all changes
    RAISE EXCEPTION 'Atomic user deletion failed for user %: % (SQLSTATE: %)', 
      target_user_id, SQLERRM, SQLSTATE;
END;
$$;

-- Restore original permissions
GRANT EXECUTE ON FUNCTION delete_user_data_atomic(UUID) TO authenticated;

-- Restore original comment
COMMENT ON FUNCTION delete_user_data_atomic(UUID) IS 
  'Atomically deletes all user-related data across all tables in a single transaction. Returns a JSONB object with deletion counts or raises an exception on failure, causing automatic rollback of all changes.';

-- ============================================================================
-- STEP 2: Drop audit table and indexes
-- ============================================================================

DROP TABLE IF EXISTS public.user_deletion_audit CASCADE;

-- ============================================================================
-- STEP 3: Remove consent tracking column from users table
-- ============================================================================

ALTER TABLE public.users
DROP COLUMN IF EXISTS deletion_requested_at;


