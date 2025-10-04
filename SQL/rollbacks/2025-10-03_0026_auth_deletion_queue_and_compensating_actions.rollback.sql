-- Rollback: Auth Deletion Queue and Compensating Actions
-- Date: 2025-10-03
-- Description: Removes auth deletion queue infrastructure
-- Refs: feat_GoogleDevPol-compliance

-- ============================================================================
-- STEP 1: Drop view
-- ============================================================================

DROP VIEW IF EXISTS failed_auth_deletions_summary;

-- ============================================================================
-- STEP 2: Drop functions
-- ============================================================================

DROP FUNCTION IF EXISTS cleanup_old_auth_deletion_queue();
DROP FUNCTION IF EXISTS update_auth_deletion_queue_status(UUID, VARCHAR, TEXT, VARCHAR);
DROP FUNCTION IF EXISTS get_pending_auth_deletions();

-- ============================================================================
-- STEP 3: Drop table
-- ============================================================================

DROP TABLE IF EXISTS auth_deletion_queue CASCADE;

-- ============================================================================
-- STEP 4: Remove columns from users table
-- ============================================================================

ALTER TABLE users 
DROP COLUMN IF EXISTS deletion_status,
DROP COLUMN IF EXISTS deletion_failed_at,
DROP COLUMN IF EXISTS deletion_failure_context;

-- Drop index (if not auto-dropped)
DROP INDEX IF EXISTS idx_users_deletion_status;

-- ============================================================================
-- Rollback Complete
-- ============================================================================

DO $$
BEGIN
  RAISE NOTICE '✓ Rollback 2025-10-03_0026 completed successfully';
  RAISE NOTICE '  - Removed auth deletion queue infrastructure';
  RAISE NOTICE '  - Removed deletion status tracking from users table';
END $$;

