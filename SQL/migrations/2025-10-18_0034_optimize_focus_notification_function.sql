-- Migration: Create Optimized Focus Notification Function
-- Description: Creates a database function to efficiently find users who need focus notifications
-- Date: 2025-01-27

-- Create function to get users who need focus notifications
-- This replaces the in-memory filtering with database-level computation
CREATE OR REPLACE FUNCTION get_users_for_focus_notifications(
  current_utc_time TIMESTAMP WITH TIME ZONE,
  target_date DATE
)
RETURNS TABLE (
  id UUID,
  full_name TEXT,
  timezone TEXT,
  focus_notification_time TIME,
  last_focus_notification_sent TIMESTAMP WITH TIME ZONE
) 
LANGUAGE plpgsql
AS $$
BEGIN
  RETURN QUERY
  SELECT 
    u.id,
    u.full_name,
    u.timezone,
    u.focus_notification_time,
    u.last_focus_notification_sent
  FROM users u
  WHERE 
    -- Only users with timezone and focus notification time set
    u.timezone IS NOT NULL 
    AND u.focus_notification_time IS NOT NULL
    -- Check if notification wasn't already sent today
    AND (
      u.last_focus_notification_sent IS NULL 
      OR DATE(u.last_focus_notification_sent AT TIME ZONE 'UTC') < target_date
    )
    -- Check if current time matches user's notification time in their timezone
    AND (
      -- Convert current UTC time to user's timezone
      EXTRACT(HOUR FROM (current_utc_time AT TIME ZONE u.timezone)) = EXTRACT(HOUR FROM u.focus_notification_time)
      AND (
        -- Exact minute match
        EXTRACT(MINUTE FROM (current_utc_time AT TIME ZONE u.timezone)) = EXTRACT(MINUTE FROM u.focus_notification_time)
        -- Or within 1-minute tolerance (for cron job frequency)
        OR EXTRACT(MINUTE FROM (current_utc_time AT TIME ZONE u.timezone)) = (EXTRACT(MINUTE FROM u.focus_notification_time) + 1) % 60
      )
    );
END;
$$;

-- Add comment for clarity
COMMENT ON FUNCTION get_users_for_focus_notifications IS 'Efficiently finds users who need focus notifications based on current UTC time and user timezones';

-- Create index to support the function's timezone conversions
-- This helps with the AT TIME ZONE operations
CREATE INDEX IF NOT EXISTS idx_users_timezone_conversion 
ON public.users(timezone) 
WHERE timezone IS NOT NULL;
