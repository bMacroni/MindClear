-- Migration to add reset_routine_period RPC
-- This allows clearing all completions for a specific period (e.g. today/this week)

CREATE OR REPLACE FUNCTION public.reset_routine_period(
  p_routine_id uuid,
  p_user_id uuid,
  p_period_date date
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_routine record;
  v_completions_count integer;
  v_new_streak integer;
  v_new_longest_streak integer;
  v_prev_completion record;
BEGIN
  -- 1. Lock the routine row for update and check ownership
  SELECT * INTO v_routine 
  FROM public.routines 
  WHERE id = p_routine_id AND user_id = p_user_id 
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Routine not found or access denied';
  END IF;

  -- 2. Count completions in this period before deleting
  SELECT count(*) INTO v_completions_count
  FROM public.routine_completions
  WHERE routine_id = p_routine_id AND period_date = p_period_date;

  IF v_completions_count = 0 THEN
    RETURN json_build_object('routine', row_to_json(v_routine), 'reset', false, 'completions_removed', 0);
  END IF;

  -- 3. Delete all completions for this period
  DELETE FROM public.routine_completions
  WHERE routine_id = p_routine_id AND period_date = p_period_date;

  -- 4. Find the most recent remaining completion to update last_completed_at
  SELECT * INTO v_prev_completion
  FROM public.routine_completions
  WHERE routine_id = p_routine_id AND user_id = p_user_id
  ORDER BY completed_at DESC, created_at DESC
  LIMIT 1;

  -- 5. Rollback streak if it was incremented for this period
  IF v_routine.last_streak_increment_period = p_period_date THEN
    v_new_streak := GREATEST(0, v_routine.current_streak - 1);
    
    v_new_longest_streak := v_routine.longest_streak;
    IF v_routine.longest_streak = v_routine.current_streak AND v_routine.current_streak > 0 THEN
       v_new_longest_streak := GREATEST(0, v_routine.longest_streak - 1);
    END IF;

    UPDATE public.routines
    SET 
      current_streak = v_new_streak,
      longest_streak = v_new_longest_streak,
      last_streak_increment_period = NULL,
      total_completions = GREATEST(0, total_completions - v_completions_count),
      last_completed_at = v_prev_completion.completed_at,
      updated_at = now()
    WHERE id = p_routine_id;
  ELSE
    -- Just update total completions
    UPDATE public.routines
    SET 
      total_completions = GREATEST(0, total_completions - v_completions_count),
      last_completed_at = v_prev_completion.completed_at,
      updated_at = now()
    WHERE id = p_routine_id;
  END IF;

  -- 6. Return refreshed routine
  SELECT * INTO v_routine FROM public.routines WHERE id = p_routine_id;

  RETURN json_build_object(
    'routine', row_to_json(v_routine),
    'reset', true,
    'completions_removed', v_completions_count
  );
END;
$$;
