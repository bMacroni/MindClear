-- Migration: Add description to milestones
-- Description: Adds a text 'description' column to the milestones table.

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM information_schema.columns
        WHERE table_schema = 'public'
        AND table_name = 'milestones'
        AND column_name = 'description'
    ) THEN
        ALTER TABLE public.milestones
        ADD COLUMN description TEXT;
    END IF;
END $$;

COMMENT ON COLUMN public.milestones.description IS 'Optional description for the milestone.';
