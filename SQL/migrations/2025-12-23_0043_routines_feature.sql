-- Routine frequency type
CREATE TYPE routine_frequency_type AS ENUM ('daily', 'weekly', 'monthly');

-- Routine time window
CREATE TYPE routine_time_window AS ENUM ('morning', 'afternoon', 'evening', 'anytime');

-- Table: routines
CREATE TABLE public.routines (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  title text NOT NULL,
  description text,
  frequency_type routine_frequency_type NOT NULL DEFAULT 'daily',
  target_count integer NOT NULL DEFAULT 1 CHECK (target_count >= 1 AND target_count <= 10),
  time_window routine_time_window NOT NULL DEFAULT 'anytime',
  icon text DEFAULT '📌',
  color text DEFAULT '#6366F1',
  is_active boolean NOT NULL DEFAULT true,
  reminder_enabled boolean NOT NULL DEFAULT true,
  reminder_time time without time zone,
  current_streak integer NOT NULL DEFAULT 0,
  longest_streak integer NOT NULL DEFAULT 0,
  total_completions integer NOT NULL DEFAULT 0,
  grace_periods_remaining integer NOT NULL DEFAULT 1,
  grace_period_used_at date,
  last_completed_at timestamp with time zone,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now(),
  
  CONSTRAINT routines_pkey PRIMARY KEY (id),
  CONSTRAINT routines_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE,
  CONSTRAINT routines_title_length CHECK (char_length(title) <= 100)
);

-- Indexes for routines
CREATE INDEX idx_routines_user_active ON public.routines(user_id, is_active);
CREATE INDEX idx_routines_user_reminder ON public.routines(user_id, reminder_enabled, reminder_time) WHERE reminder_enabled = true;

-- Table: routine_completions
CREATE TABLE public.routine_completions (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  routine_id uuid NOT NULL,
  user_id uuid NOT NULL,
  completed_at timestamp with time zone NOT NULL DEFAULT now(),
  period_date date NOT NULL,
  notes text,
  created_at timestamp with time zone DEFAULT now(),
  
  CONSTRAINT routine_completions_pkey PRIMARY KEY (id),
  CONSTRAINT routine_completions_routine_id_fkey FOREIGN KEY (routine_id) REFERENCES public.routines(id) ON DELETE CASCADE,
  CONSTRAINT routine_completions_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE
);

-- Indexes for routine_completions
CREATE INDEX idx_routine_completions_routine_period ON public.routine_completions(routine_id, period_date);
CREATE INDEX idx_routine_completions_user_date ON public.routine_completions(user_id, completed_at DESC);

-- Add to existing user_app_preferences table
ALTER TABLE public.user_app_preferences 
ADD COLUMN routine_week_start integer NOT NULL DEFAULT 1 CHECK (routine_week_start IN (0, 1));
-- 0 = Sunday, 1 = Monday

-- Enable RLS
ALTER TABLE public.routines ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.routine_completions ENABLE ROW LEVEL SECURITY;

-- Routines policies
CREATE POLICY "Users can view own routines" ON public.routines
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can create own routines" ON public.routines
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own routines" ON public.routines
  FOR UPDATE USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own routines" ON public.routines
  FOR DELETE USING (auth.uid() = user_id);

-- Routine completions policies
CREATE POLICY "Users can view own completions" ON public.routine_completions
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can create own completions" ON public.routine_completions
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete own completions" ON public.routine_completions
  FOR DELETE USING (auth.uid() = user_id);
