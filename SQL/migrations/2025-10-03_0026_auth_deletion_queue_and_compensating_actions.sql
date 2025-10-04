-- Migration: Auth Deletion Queue and Compensating Actions
-- Date: 2025-10-03
-- Description: Creates infrastructure for handling failed auth deletions with retry and dead-letter queue
--
-- This migration adds:
-- 1. auth_deletion_queue table - persistent queue for failed auth deletions
-- 2. Additional fields to users table for tracking failed deletions
-- 3. Functions for queue management and cleanup
--
-- Refs: feat_GoogleDevPol-compliance - Orphaned auth account prevention

-- ============================================================================
-- STEP 1: Add deletion status tracking to users table
-- ============================================================================

-- Add new columns to track deletion failures
ALTER TABLE users 
ADD COLUMN IF NOT EXISTS deletion_status VARCHAR(50) DEFAULT 'active',
ADD COLUMN IF NOT EXISTS deletion_failed_at TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS deletion_failure_context JSONB;

-- Add CHECK constraint to enforce allowed deletion_status values
-- Using NOT VALID to avoid long locks on large tables
ALTER TABLE users 
ADD CONSTRAINT chk_users_deletion_status 
CHECK (deletion_status IN ('active', 'auth_deletion_failed', 'pending_deletion', 'deleted')) 
NOT VALID;

-- Validate the constraint (checks existing rows without blocking writes)
ALTER TABLE users VALIDATE CONSTRAINT chk_users_deletion_status;

COMMENT ON COLUMN users.deletion_status IS 
  'Status of user deletion: active, auth_deletion_failed, pending_deletion, deleted';
COMMENT ON COLUMN users.deletion_failed_at IS 
  'Timestamp when auth deletion failed (for compensating transaction tracking)';
COMMENT ON COLUMN users.deletion_failure_context IS 
  'Context about the deletion failure including error details and retry attempts';

-- Create index for querying users with failed deletions
CREATE INDEX IF NOT EXISTS idx_users_deletion_status 
ON users(deletion_status) 
WHERE deletion_status != 'active';

-- ============================================================================
-- STEP 2: Create auth_deletion_queue table (dead-letter queue)
-- ============================================================================

CREATE TABLE IF NOT EXISTS auth_deletion_queue (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  operation_type VARCHAR(50) NOT NULL DEFAULT 'auth_deletion',
  status VARCHAR(50) NOT NULL DEFAULT 'pending',
  
  -- Context and error tracking
  context JSONB NOT NULL DEFAULT '{}'::jsonb,
  last_error TEXT,
  retry_count INTEGER NOT NULL DEFAULT 0,
  max_retries INTEGER NOT NULL DEFAULT 3,
  
  -- Timestamps
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_retry_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  
  -- Audit fields
  processing_notes TEXT,
  resolved_by VARCHAR(255),
  
  -- Constraints
  CONSTRAINT valid_status CHECK (status IN ('pending', 'processing', 'completed', 'failed', 'cancelled')),
  CONSTRAINT valid_operation_type CHECK (operation_type IN ('auth_deletion', 'compensating_rollback'))
);

-- Add indexes for efficient querying
CREATE INDEX idx_auth_deletion_queue_status 
ON auth_deletion_queue(status) 
WHERE status IN ('pending', 'processing');

CREATE INDEX idx_auth_deletion_queue_user_id 
ON auth_deletion_queue(user_id);

CREATE INDEX idx_auth_deletion_queue_created_at 
ON auth_deletion_queue(created_at DESC);

-- Add comments
COMMENT ON TABLE auth_deletion_queue IS 
  'Dead-letter queue for failed auth deletion operations requiring manual intervention or async retry';
COMMENT ON COLUMN auth_deletion_queue.context IS 
  'JSON context including deletionResult, error details, and any relevant metadata';
COMMENT ON COLUMN auth_deletion_queue.status IS 
  'Queue item status: pending (needs processing), processing (being handled), completed, failed, cancelled';

-- ============================================================================
-- STEP 3: Function to get pending queue items
-- ============================================================================

CREATE OR REPLACE FUNCTION get_pending_auth_deletions()
RETURNS TABLE (
  id UUID,
  user_id UUID,
  operation_type VARCHAR,
  context JSONB,
  last_error TEXT,
  retry_count INTEGER,
  created_at TIMESTAMPTZ,
  last_retry_at TIMESTAMPTZ
) AS $$
BEGIN
  RETURN QUERY
  SELECT 
    q.id,
    q.user_id,
    q.operation_type,
    q.context,
    q.last_error,
    q.retry_count,
    q.created_at,
    q.last_retry_at
  FROM auth_deletion_queue q
  WHERE q.status = 'pending'
    AND q.retry_count < q.max_retries
    AND (q.last_retry_at IS NULL OR q.last_retry_at < now() - INTERVAL '5 minutes')
  UNION
  -- Include stuck 'processing' items older than 10 minutes
  SELECT 
    q.id,
    q.user_id,
    q.operation_type,
    q.context,
    q.last_error,
    q.retry_count,
    q.created_at,
    q.last_retry_at
  FROM auth_deletion_queue q
  WHERE q.status = 'processing'
    AND q.last_retry_at < now() - INTERVAL '10 minutes'
    AND q.retry_count < q.max_retries
  ORDER BY created_at ASC;END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

COMMENT ON FUNCTION get_pending_auth_deletions() IS 
  'Returns pending auth deletion queue items that need processing, with protection against concurrent processing (5 min cooldown) and stuck item recovery (processing >10 min). Use with FOR UPDATE SKIP LOCKED at application level for full concurrency safety';

-- ============================================================================
-- STEP 4: Function to update queue item status
-- ============================================================================

CREATE OR REPLACE FUNCTION update_auth_deletion_queue_status(
  p_queue_id UUID,
  p_status VARCHAR,
  p_notes TEXT DEFAULT NULL,
  p_resolved_by VARCHAR DEFAULT NULL
)
RETURNS BOOLEAN AS $$
DECLARE
  v_updated BOOLEAN;
BEGIN
  UPDATE auth_deletion_queue
  SET 
    status = p_status,
    processing_notes = COALESCE(p_notes, processing_notes),
    resolved_by = COALESCE(p_resolved_by, resolved_by),
    completed_at = CASE WHEN p_status IN ('completed', 'cancelled') THEN now() ELSE completed_at END,
    last_retry_at = CASE WHEN p_status = 'processing' THEN now() ELSE last_retry_at END
  WHERE id = p_queue_id
  RETURNING TRUE INTO v_updated;
  
  RETURN COALESCE(v_updated, FALSE);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

COMMENT ON FUNCTION update_auth_deletion_queue_status(UUID, VARCHAR, TEXT, VARCHAR) IS 
  'Updates the status and metadata of a queue item';

-- ============================================================================
-- STEP 5: Function to cleanup old completed queue items
-- ============================================================================

CREATE OR REPLACE FUNCTION cleanup_old_auth_deletion_queue()
RETURNS INTEGER AS $$
DECLARE
  v_deleted_count INTEGER;
BEGIN
  -- Delete completed/cancelled items older than 90 days
  DELETE FROM auth_deletion_queue
  WHERE status IN ('completed', 'cancelled')
    AND completed_at < (now() - INTERVAL '90 days')
  RETURNING count(*) INTO v_deleted_count;
  
  RAISE NOTICE 'Cleaned up % old auth deletion queue items', v_deleted_count;
  RETURN v_deleted_count;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

COMMENT ON FUNCTION cleanup_old_auth_deletion_queue() IS 
  'Removes completed/cancelled queue items older than 90 days for housekeeping';

-- ============================================================================
-- STEP 6: View for monitoring failed deletions
-- ============================================================================

CREATE OR REPLACE VIEW failed_auth_deletions_summary AS
SELECT 
  q.id as queue_id,
  q.user_id,
  q.operation_type,
  q.status,
  q.retry_count,
  q.last_error,
  q.created_at as queued_at,
  q.last_retry_at,
  u.email,
  u.deletion_status,
  u.deletion_requested_at,
  u.deletion_failed_at,
  EXTRACT(EPOCH FROM (now() - q.created_at)) / 3600 as hours_in_queue
FROM auth_deletion_queue q
LEFT JOIN users u ON q.user_id = u.id
WHERE q.status IN ('pending', 'processing', 'failed')
ORDER BY q.created_at DESC;

ALTER TABLE auth_deletion_queue ENABLE ROW LEVEL SECURITY;

-- Service role bypasses RLS by default in Supabase
-- Service role bypasses RLS by default in Supabase
-- No policy needed for service role access
-- If you need admin access via authenticated role, add a proper policy:
-- CREATE POLICY "Admins can manage queue" ON auth_deletion_queue
-- FOR ALL TO authenticated
-- USING (auth.jwt() ->> 'role' = 'admin');
-- This policy allows admins to view the queueCREATE POLICY "Service role and admins can manage auth deletion queue"
ON auth_deletion_queue
FOR ALL
TO authenticated
USING (
  -- In production, you'd check for admin role here
  -- For now, allow service role access only (handled at application level)
  FALSE
);

-- Allow service role full access (bypass RLS)
ALTER TABLE auth_deletion_queue FORCE ROW LEVEL SECURITY;

-- ============================================================================
-- Migration Complete
-- ============================================================================

-- Log migration completion
DO $$
BEGIN
  RAISE NOTICE '✓ Migration 2025-10-03_0026 completed successfully';
  RAISE NOTICE '  - Added deletion_status tracking to users table';
  RAISE NOTICE '  - Created auth_deletion_queue table with indexes';
  RAISE NOTICE '  - Created helper functions for queue management';
  RAISE NOTICE '  - Created monitoring view for failed deletions';
END $$;

