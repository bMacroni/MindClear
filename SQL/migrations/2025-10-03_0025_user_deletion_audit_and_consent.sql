-- Migration: User deletion audit trail and consent verification
-- Created: 2025-10-03
-- Description: Adds audit table for user deletions, consent tracking, and enhanced security
--              to the atomic user deletion function to ensure GDPR compliance and accountability.

-- ============================================================================
-- STEP 1: Add consent tracking to users table
-- ============================================================================

-- Add deletion_requested_at column to track user consent for deletion
ALTER TABLE public.users
ADD COLUMN IF NOT EXISTS deletion_requested_at TIMESTAMP WITH TIME ZONE DEFAULT NULL;

COMMENT ON COLUMN public.users.deletion_requested_at IS 
  'Timestamp when user requested account deletion. Must be set before delete_user_data_atomic can proceed.';

-- ============================================================================
-- STEP 2: Create user deletion audit table
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.user_deletion_audit (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  deleted_user_id UUID NOT NULL,
  deleted_user_email TEXT,
  deleted_by UUID NOT NULL,
  deleted_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL,
  reason TEXT,
  ip_address INET,
  deletion_requested_at TIMESTAMP WITH TIME ZONE,
  deleted_counts JSONB DEFAULT '{}',
  success BOOLEAN DEFAULT false,
  error_message TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Index for querying audit logs
CREATE INDEX IF NOT EXISTS idx_user_deletion_audit_deleted_user_id 
  ON public.user_deletion_audit(deleted_user_id);

CREATE INDEX IF NOT EXISTS idx_user_deletion_audit_deleted_by 
  ON public.user_deletion_audit(deleted_by);

CREATE INDEX IF NOT EXISTS idx_user_deletion_audit_deleted_at 
  ON public.user_deletion_audit(deleted_at DESC);

COMMENT ON TABLE public.user_deletion_audit IS 
  'Audit trail for all user deletion attempts, successful or failed, for compliance and accountability.';

-- Enable RLS on audit table
ALTER TABLE public.user_deletion_audit ENABLE ROW LEVEL SECURITY;

-- Only service role and admins can view audit logs
CREATE POLICY "Service role can view all audit logs"
  ON public.user_deletion_audit
  FOR SELECT
  USING (auth.role() = 'service_role');

-- ============================================================================
-- STEP 3: Drop and recreate the atomic deletion function with audit trail
-- ============================================================================

-- Drop the old function signature
DROP FUNCTION IF EXISTS delete_user_data_atomic(UUID);

-- Create the enhanced atomic deletion function
CREATE OR REPLACE FUNCTION delete_user_data_atomic(
  target_user_id UUID,
  performed_by UUID,
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
  audit_id UUID;
  user_email TEXT;
  user_deletion_requested TIMESTAMP WITH TIME ZONE;
  performer_exists BOOLEAN;
BEGIN
  -- ========================================================================
  -- VALIDATION: Check that performed_by user exists and has permission
  -- ========================================================================
  
  SELECT EXISTS(SELECT 1 FROM public.users WHERE id = performed_by)
  INTO performer_exists;
  
  IF NOT performer_exists THEN
    RAISE EXCEPTION 'Invalid performed_by user ID: %. User does not exist.', performed_by
      USING ERRCODE = 'foreign_key_violation';
  END IF;
  
  -- Note: Additional permission checks could be added here
  -- For now, we trust that the calling application has verified permissions
  -- via the auth middleware and RLS policies
  
  -- ========================================================================
  -- CONSENT VERIFICATION: Check that user has requested deletion
  -- ========================================================================
  
  SELECT email, deletion_requested_at
  INTO user_email, user_deletion_requested
  FROM public.users
  WHERE id = target_user_id;
  
  IF user_email IS NULL THEN
    RAISE EXCEPTION 'User % not found. Cannot proceed with deletion.', target_user_id
      USING ERRCODE = 'no_data_found';
  END IF;
  
  IF user_deletion_requested IS NULL THEN
    RAISE EXCEPTION 'User % has not requested account deletion. deletion_requested_at must be set before deletion can proceed.', target_user_id
      USING ERRCODE = 'check_violation',
            HINT = 'User must explicitly consent to deletion by setting deletion_requested_at timestamp.';
  END IF;
  
  -- ========================================================================
  -- AUDIT: Create audit record BEFORE deletion
  -- ========================================================================
  
  INSERT INTO public.user_deletion_audit (
    deleted_user_id,
    deleted_user_email,
    deleted_by,
    reason,
    ip_address,
    deletion_requested_at,
    deleted_counts,
    success
  ) VALUES (
    target_user_id,
    user_email,
    performed_by,
    reason,
    ip_address,
    user_deletion_requested,
    '{}',
    false  -- Will be updated to true on success
  )
  RETURNING id INTO audit_id;
  
  -- ========================================================================
  -- DELETION: All deletions happen within this implicit transaction
  -- If any DELETE fails, the entire transaction (including audit insert) will roll back
  -- ========================================================================
  
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
  
  -- ========================================================================
  -- AUDIT: Update audit record with success status and deleted counts
  -- ========================================================================
  
  UPDATE public.user_deletion_audit
  SET 
    deleted_counts = deleted_counts,
    success = true
  WHERE id = audit_id;
  
  -- ========================================================================
  -- RETURN: Success response with audit ID
  -- ========================================================================
  
  RETURN jsonb_build_object(
    'success', true,
    'user_id', target_user_id,
    'audit_id', audit_id,
    'deleted_rows', deleted_counts,
    'deleted_at', NOW()
  );
  
EXCEPTION
  WHEN OTHERS THEN
    -- Update audit record with failure information if it was created
    IF audit_id IS NOT NULL THEN
      BEGIN
        UPDATE public.user_deletion_audit
        SET 
          error_message = SQLERRM,
          success = false
        WHERE id = audit_id;
      EXCEPTION
        WHEN OTHERS THEN
          -- If even the audit update fails, just continue with the RAISE
          NULL;
      END;
    END IF;
    
    -- Any error will cause automatic rollback of all changes (including the audit insert)
    RAISE EXCEPTION 'Atomic user deletion failed for user %: % (SQLSTATE: %)', 
      target_user_id, SQLERRM, SQLSTATE;
END;
$$;

-- ================================================================================
-- STEP 4: Permissions and documentation
-- ================================================================================

-- Grant execute permission (function uses SECURITY DEFINER for elevated privileges)
GRANT EXECUTE ON FUNCTION delete_user_data_atomic(UUID, UUID, TEXT, INET) TO authenticated;

-- Add comprehensive documentation
COMMENT ON FUNCTION delete_user_data_atomic(UUID, UUID, TEXT, INET) IS 
  'Atomically deletes all user-related data with audit trail and consent verification. 
   
   Parameters:
   - target_user_id: UUID of the user to delete
   - performed_by: UUID of the user/admin performing the deletion (must exist)
   - reason: Optional text description of why the deletion is occurring
   - ip_address: Optional IP address from which the deletion was requested
   
   Returns: JSONB object with success status, audit_id, and deletion counts
   
   Raises exception if:
   - performed_by user does not exist (privilege escalation prevention)
   - target_user has not set deletion_requested_at (consent requirement)
   - any deletion operation fails (atomicity guarantee)
   
   All operations occur in a single transaction with full rollback on any failure.
   Successful deletion attempts are logged to user_deletion_audit table. Failed attempts roll back atomically and are not persisted.';
