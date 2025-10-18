-- Migration: Optimize Focus Notification Performance
-- Description: Adds composite indexes for efficient focus notification cron job queries
-- Date: 2025-01-27

-- Add composite index on timezone and focus_notification_time for efficient filtering
CREATE INDEX IF NOT EXISTS idx_users_timezone_focus_time 
ON public.users(timezone, focus_notification_time) 
WHERE timezone IS NOT NULL AND focus_notification_time IS NOT NULL;

-- Add index on last_focus_notification_sent for efficient duplicate checking
CREATE INDEX IF NOT EXISTS idx_users_last_focus_notification 
ON public.users(last_focus_notification_sent) 
WHERE last_focus_notification_sent IS NOT NULL;

-- Add partial index for users with focus notifications enabled
-- This helps with the common query pattern of finding users who need notifications
CREATE INDEX IF NOT EXISTS idx_users_focus_notification_candidates 
ON public.users(id, timezone, focus_notification_time, last_focus_notification_sent) 
WHERE timezone IS NOT NULL AND focus_notification_time IS NOT NULL;

-- Add comments for clarity
COMMENT ON INDEX idx_users_timezone_focus_time IS 'Composite index for efficient timezone and focus time filtering in cron jobs';
COMMENT ON INDEX idx_users_last_focus_notification IS 'Index for efficient duplicate notification checking';
COMMENT ON INDEX idx_users_focus_notification_candidates IS 'Partial index for users eligible for focus notifications';
