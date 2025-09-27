-- Migration: Add admin flag to users table
-- Date: 2025-09-27
-- Description: Adds is_admin column to users table for analytics dashboard access control

-- Add is_admin column to users table
ALTER TABLE public.users
ADD COLUMN IF NOT EXISTS is_admin BOOLEAN DEFAULT false;

-- Add comment for documentation
COMMENT ON COLUMN public.users.is_admin IS 'Flag indicating if user has admin privileges for accessing analytics dashboard';

-- Create index for performance when filtering admin users
CREATE INDEX IF NOT EXISTS idx_users_is_admin ON public.users(is_admin);

-- Set the current user as admin (you can change this user ID as needed)
-- UPDATE public.users SET is_admin = true WHERE id = 'your-user-id-here';
