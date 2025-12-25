-- Migration to update log_routine_completion to support p_reset_streak
-- This ensures that when a completion is logged after a gap, the streak is reset before potentially incrementing.

CREATE OR REPLACE FUNCTION public.log_routine_completion(
  p_routine_id uuid,
  p_user_id uuid,
  p_period_date date,
  p_notes text,
  p_completed_at timestamptz,
  p_reset_streak boolean DEFAULT false
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_catalog
AS $$
DECLARE
  v_routine record;
  v_completion record;
  v_count integer;
  v_new_streak integer;
  v_longest_streak integer;
  v_streak_incremented boolean := false;
  v_effective_streak integer;
BEGIN
  -- 1. Lock the routine row for update to prevent races and check ownership
  SELECT * INTO v_routine 
  FROM public.routines 
  WHERE id = p_routine_id AND user_id = p_user_id 
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Routine not found or access denied';
  END IF;

  -- 2. Handle stale streak reset
  -- If p_reset_streak is true, we start from 0 for this calculation
  v_effective_streak := v_routine.current_streak;
  IF p_reset_streak THEN
    v_effective_streak := 0;
  END IF;

  -- 3. Insert completion
  INSERT INTO public.routine_completions (routine_id, user_id, period_date, notes, completed_at)
  VALUES (p_routine_id, p_user_id, p_period_date, p_notes, p_completed_at)
  RETURNING * INTO v_completion;

  -- 4. Count completions for this period
  SELECT count(*) INTO v_count 
  FROM public.routine_completions 
  WHERE routine_id = p_routine_id AND period_date = p_period_date;

  -- 5. Check if streak should be incremented
  -- Only if count >= target_count AND we haven't incremented for this period yet
  IF v_count >= v_routine.target_count AND (v_routine.last_streak_increment_period IS NULL OR v_routine.last_streak_increment_period < p_period_date) THEN
    v_new_streak := v_effective_streak + 1;
    v_longest_streak := GREATEST(v_new_streak, v_routine.longest_streak);
    v_streak_incremented := true;
    
    UPDATE public.routines
    SET 
      current_streak = v_new_streak,
      longest_streak = v_longest_streak,
      last_streak_increment_period = p_period_date,
      total_completions = total_completions + 1,
      last_completed_at = p_completed_at,
      updated_at = now()
    WHERE id = p_routine_id;
  ELSE
    -- Just update total completions and last completed at
    -- Also persist the streak reset if it was stale, even if we didn't reach target_count yet
    UPDATE public.routines
    SET 
      current_streak = v_effective_streak,
      total_completions = total_completions + 1,
      last_completed_at = p_completed_at,
      updated_at = now()
    WHERE id = p_routine_id;
  END IF;

  -- 6. Return the updated routine and completion
  -- Refresh v_routine to get updated values
  SELECT * INTO v_routine FROM public.routines WHERE id = p_routine_id;

  RETURN json_build_object(
    'completion', row_to_json(v_completion),
    'routine', row_to_json(v_routine),
    'streak_incremented', v_streak_incremented,
    'completions_count', v_count
  );
END;
$$;
