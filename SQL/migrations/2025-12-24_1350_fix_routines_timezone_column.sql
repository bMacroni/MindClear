-- Migration: 2025-12-24_1350_fix_routines_timezone_column.sql
-- Description: Add missing timezone column to routines table if it was skipped during initial migration, 
-- and update index to include it. Also reloads PostgREST schema cache.

DO $$ 
BEGIN 
    -- 1. Add timezone column if missing
    IF NOT EXISTS (
        SELECT 1 
        FROM information_schema.columns 
        WHERE table_schema = 'public' 
        AND table_name = 'routines' 
        AND column_name = 'timezone'
    ) THEN
        ALTER TABLE public.routines ADD COLUMN timezone text NOT NULL DEFAULT 'UTC';
    END IF;

    -- 2. Update the index to include timezone
    -- Drop old index if it exists
    DROP INDEX IF EXISTS idx_routines_user_reminder;
    CREATE INDEX idx_routines_user_reminder ON public.routines(user_id, reminder_enabled, reminder_time, timezone) WHERE reminder_enabled = true;

    -- 3. Notify PostgREST to reload schema cache
    -- This is essential for the Supabase client to see the new column immediately
    EXECUTE 'NOTIFY pgrst, ''reload schema''';

END $$;
