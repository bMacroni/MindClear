-- Migration: Move deletion_requested_at update into atomic transaction
-- Date: 2025-10-03
-- Description: Sets deletion_requested_at inside delete_user_data_atomic to ensure
--              atomicity. If deletion fails, the consent timestamp will also roll back,
--              preventing "consent set but deletion failed" inconsistent states.

DROP FUNCTION IF EXISTS delete_user_data_atomic(UUID);
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
  user_exists boolean;
  v_deletion_requested_at TIMESTAMP WITH TIME ZONE;
BEGIN
  -- ========================================================================
  -- STEP 1: Verify user exists and set deletion_requested_at atomically
  -- ========================================================================
  -- This update happens inside the transaction, so if any subsequent
  -- operation fails, this timestamp will also be rolled back
  
  UPDATE users 
  SET deletion_requested_at = NOW()
  WHERE id = target_user_id
  RETURNING deletion_requested_at INTO v_deletion_requested_at;
  
  IF NOT FOUND THEN
    RAISE EXCEPTION 'User % not found. Cannot proceed with deletion.', target_user_id
      USING ERRCODE = 'no_data_found';
  END IF;
  
  -- ========================================================================
  -- STEP 2: Record deletion audit BEFORE any deletions
  -- ========================================================================
  
  INSERT INTO user_deletion_audit (
    deleted_user_id,
    deleted_by,
    reason,
    ip_address,
    deletion_requested_at,
    deleted_at
  ) VALUES (
    target_user_id,
    COALESCE(performed_by, target_user_id),
    COALESCE(reason, 'User-initiated account deletion'),
    ip_address,
    v_deletion_requested_at,
    NOW()
  )
  RETURNING id INTO audit_record_id;
  
  -- ========================================================================
  -- STEP 3: All deletions are conditional based on table existence
  -- ========================================================================
  
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
  
  -- Delete milestones (via goal_id relationship, not user_id)
  -- Milestones don't have user_id - they're related via goals
  SELECT EXISTS (
    SELECT 1 FROM information_schema.tables 
    WHERE table_schema = 'public' AND table_name = 'milestones'
  ) INTO table_exists;
  IF table_exists THEN
    DELETE FROM milestones WHERE goal_id IN (
      SELECT id FROM goals WHERE user_id = target_user_id
    );
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
  
  -- ========================================================================
  -- STEP 4: Update audit record with success
  -- ========================================================================
  
  UPDATE user_deletion_audit
  SET 
    success = true,
    deleted_counts = v_deleted_counts
  WHERE id = audit_record_id;
  
  -- ========================================================================
  -- STEP 5: Return success response
  -- ========================================================================
  
  RETURN jsonb_build_object(
    'success', true,
    'user_id', target_user_id,
    'audit_id', audit_record_id,
    'deletion_requested_at', v_deletion_requested_at,
    'deleted_rows', v_deleted_counts
  );
  
EXCEPTION
  WHEN OTHERS THEN
    -- Update audit record with failure if it was created
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
    
    -- Any error will cause automatic rollback of ALL changes,
    -- including the deletion_requested_at timestamp update
    RAISE EXCEPTION 'Atomic user deletion failed for user %: % (SQLSTATE: %)', 
      target_user_id, SQLERRM, SQLSTATE;
END;
$$;

-- Grant execute permission
GRANT EXECUTE ON FUNCTION delete_user_data_atomic(UUID, UUID, TEXT, INET) TO authenticated;

-- Add comprehensive documentation
COMMENT ON FUNCTION delete_user_data_atomic(UUID, UUID, TEXT, INET) IS 
  'Atomically deletes all user-related data with consent timestamp set in same transaction.
   
   ATOMICITY GUARANTEE: The deletion_requested_at timestamp is set at the start of this
   function, ensuring that if ANY part of the deletion fails, the timestamp will also
   roll back. This prevents inconsistent "consent set but deletion failed" states.
   
   Parameters:
   - target_user_id: UUID of the user to delete
   - performed_by: UUID of the user performing the deletion (defaults to target_user_id)
   - reason: Optional text description of why deletion is occurring
   - ip_address: Optional IP address from which deletion was requested
   
   Returns: JSONB object with success status, audit_id, deletion_requested_at, and deletion counts
   
   Raises exception if:
   - target_user does not exist
   - any deletion operation fails (with full rollback including timestamp)
   
   All operations occur in a single transaction with full rollback on any failure.';

-- Log migration completion
DO $$
BEGIN
  RAISE NOTICE '✓ Migration 2025-10-03_0031 completed successfully';
  RAISE NOTICE '  - Moved deletion_requested_at update inside atomic transaction';
  RAISE NOTICE '  - Ensures timestamp rolls back if deletion fails';
  RAISE NOTICE '  - Prevents inconsistent "consent set but deletion failed" states';
END $$;

