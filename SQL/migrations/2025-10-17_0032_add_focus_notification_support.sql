-- Migration: Add Focus Notification Support
-- Description: Adds timezone, focus notification time, and tracking columns to users table
-- Date: 2025-10-17

-- Add timezone column to users table (defaults to America/Chicago)
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'users' AND column_name = 'timezone'
  ) THEN
    ALTER TABLE public.users ADD COLUMN timezone TEXT DEFAULT 'America/Chicago';
  END IF;
END $$;

-- Add focus notification time column (defaults to 07:00:00)
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'users' AND column_name = 'focus_notification_time'
  ) THEN
    ALTER TABLE public.users ADD COLUMN focus_notification_time TIME DEFAULT '07:00:00';
  END IF;
END $$;

-- Add last focus notification sent timestamp
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'users' AND column_name = 'last_focus_notification_sent'
  ) THEN
    ALTER TABLE public.users ADD COLUMN last_focus_notification_sent TIMESTAMP WITH TIME ZONE;
  END IF;
END $$;

-- Create index on timezone for efficient cron queries
CREATE INDEX IF NOT EXISTS idx_users_timezone ON public.users(timezone);

-- Add comments for clarity
COMMENT ON COLUMN public.users.timezone IS 'User timezone for scheduling notifications (e.g., America/Chicago)';
COMMENT ON COLUMN public.users.focus_notification_time IS 'Time of day to send focus task notification (e.g., 07:00:00)';
COMMENT ON COLUMN public.users.last_focus_notification_sent IS 'Timestamp of last daily focus notification sent to prevent duplicates';
