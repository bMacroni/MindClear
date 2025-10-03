-- Rollback: Atomic user deletion function
-- Created: 2025-10-03
-- Description: Removes the atomic user deletion stored function

-- Drop the function
DROP FUNCTION IF EXISTS delete_user_data_atomic(UUID);

-- Note: After rolling back this migration, the application code in
-- backend/src/controllers/userController.js will need to be reverted
-- to use the sequential deletion loop pattern, or account deletion
-- will fail with "function delete_user_data_atomic does not exist"

