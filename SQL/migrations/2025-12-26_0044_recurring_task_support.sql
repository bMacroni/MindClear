-- Migration: 2025-12-26_0044_recurring_task_support.sql
-- Description: Add support for enhanced recurring tasks with completion history tracking

-- 1. Add last_completed_at column to tasks table
ALTER TABLE public.tasks 
ADD COLUMN IF NOT EXISTS last_completed_at TIMESTAMP WITH TIME ZONE;

COMMENT ON COLUMN public.tasks.last_completed_at IS 'Timestamp of the last completion for recurring tasks';

-- 2. Update recurrence_pattern column comment to document enhanced schema
COMMENT ON COLUMN public.tasks.recurrence_pattern IS 
'Enhanced recurrence pattern JSON: {
  type: "daily" | "weekly" | "monthly",
  interval: number (e.g., 2 for "every 2 weeks"),
  daysOfWeek?: number[] (0=Sun, 1=Mon, ... 6=Sat),
  endCondition?: { 
    type: "never" | "count" | "date", 
    value?: number | string 
  },
  completedCount?: number,
  is_paused?: boolean,
  createdAt?: string (ISO timestamp)
}';

-- 3. Create recurring_task_completions table for history tracking
CREATE TABLE IF NOT EXISTS public.recurring_task_completions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id UUID NOT NULL,
  user_id UUID NOT NULL,
  completed_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  due_date_at_completion DATE NOT NULL,
  notes TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  
  CONSTRAINT recurring_task_completions_task_id_fkey 
    FOREIGN KEY (task_id) REFERENCES public.tasks(id) ON DELETE CASCADE,
  CONSTRAINT recurring_task_completions_user_id_fkey 
    FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE
);

-- 4. Create indexes for efficient querying
CREATE INDEX IF NOT EXISTS idx_recurring_completions_task 
  ON public.recurring_task_completions(task_id);
CREATE INDEX IF NOT EXISTS idx_recurring_completions_user_date 
  ON public.recurring_task_completions(user_id, completed_at DESC);
CREATE INDEX IF NOT EXISTS idx_recurring_completions_task_date 
  ON public.recurring_task_completions(task_id, due_date_at_completion);

-- 5. Enable Row Level Security
ALTER TABLE public.recurring_task_completions ENABLE ROW LEVEL SECURITY;

-- 6. RLS Policies
CREATE POLICY "Users can view own recurring completions" 
  ON public.recurring_task_completions
  FOR SELECT 
  USING (auth.uid() = user_id);

CREATE POLICY "Users can create own recurring completions" 
  ON public.recurring_task_completions
  FOR INSERT 
  WITH CHECK (
    auth.uid() = user_id AND
    EXISTS (
      SELECT 1 FROM public.tasks 
      WHERE tasks.id = task_id AND tasks.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can delete own recurring completions" 
  ON public.recurring_task_completions
  FOR DELETE 
  USING (auth.uid() = user_id);

-- 7. Add index for finding tasks with missed due dates (ADHD-friendly rollover query)
CREATE INDEX IF NOT EXISTS idx_tasks_recurring_missed 
  ON public.tasks(user_id, due_date, status) 
  WHERE recurrence_pattern IS NOT NULL AND status != 'completed';
