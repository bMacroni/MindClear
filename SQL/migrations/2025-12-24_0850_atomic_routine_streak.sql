-- Migration to make routine streak increments atomic
-- Adds last_streak_increment_period to track streak increments per period
-- Adds a stored procedure to handle completion logging and streak updates in a single transaction

-- 1. Add the column to routines table
ALTER TABLE public.routines ADD COLUMN IF NOT EXISTS last_streak_increment_period date;

-- 2. Create the RPC function for logging completions
CREATE OR REPLACE FUNCTION log_routine_completion(
  p_routine_id uuid,
  p_user_id uuid,
  p_period_date date,
  p_notes text,
  p_completed_at timestamptz
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_routine record;
  v_completion record;
  v_count integer;
  v_new_streak integer;
  v_longest_streak integer;
  v_streak_incremented boolean := false;
BEGIN
  -- 1. Lock the routine row for update to prevent races and check ownership
  SELECT * INTO v_routine 
  FROM public.routines 
  WHERE id = p_routine_id AND user_id = p_user_id 
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Routine not found or access denied';
  END IF;

  -- 2. Insert completion
  INSERT INTO public.routine_completions (routine_id, user_id, period_date, notes, completed_at)
  VALUES (p_routine_id, p_user_id, p_period_date, p_notes, p_completed_at)
  RETURNING * INTO v_completion;

  -- 3. Count completions for this period
  SELECT count(*) INTO v_count 
  FROM public.routine_completions 
  WHERE routine_id = p_routine_id AND period_date = p_period_date;

  -- 4. Check if streak should be incremented
  -- Only if count >= target_count AND we haven't incremented for this period yet
  IF v_count >= v_routine.target_count AND (v_routine.last_streak_increment_period IS NULL OR v_routine.last_streak_increment_period < p_period_date) THEN
    v_new_streak := v_routine.current_streak + 1;
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
    UPDATE public.routines
    SET 
      total_completions = total_completions + 1,
      last_completed_at = p_completed_at,
      updated_at = now()
    WHERE id = p_routine_id;
  END IF;

  -- 5. Return the updated routine and completion
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

-- 3. Add a stored procedure for undoing completion
CREATE OR REPLACE FUNCTION undo_routine_completion(
  p_routine_id uuid,
  p_user_id uuid
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_routine record;
  v_completion_to_delete record;
  v_prev_completion record;
  v_count_after_delete integer;
  v_new_streak integer;
  v_new_longest_streak integer;
  v_streak_reverted boolean := false;
BEGIN
  -- 1. Lock the routine row for update and check ownership
  SELECT * INTO v_routine 
  FROM public.routines 
  WHERE id = p_routine_id AND user_id = p_user_id 
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'User does not own routine';
  END IF;

  -- 2. Find latest completion
  SELECT * INTO v_completion_to_delete 
  FROM public.routine_completions 
  WHERE routine_id = p_routine_id AND user_id = p_user_id
  ORDER BY completed_at DESC, created_at DESC
  LIMIT 1;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'No completions to undo';
  END IF;

  -- 3. Delete it (after lock)
  DELETE FROM public.routine_completions WHERE id = v_completion_to_delete.id;

  -- 4. Recalculate Period Stats
  -- 4. Recalculate Period Stats
  SELECT count(*) INTO v_count_after_delete 
  FROM public.routine_completions 
  WHERE routine_id = p_routine_id AND period_date = v_completion_to_delete.period_date;

  -- 5. Find the next latest completion to update last_completed_at
  SELECT * INTO v_prev_completion
  FROM public.routine_completions
  WHERE routine_id = p_routine_id AND user_id = p_user_id
  ORDER BY completed_at DESC, created_at DESC
  LIMIT 1;

  -- 6. Streak Rollback Logic
  -- If we dropped below the target count AND the streak was incremented for this period
  IF v_count_after_delete < v_routine.target_count AND v_routine.last_streak_increment_period = v_completion_to_delete.period_date THEN
    v_new_streak := GREATEST(0, v_routine.current_streak - 1);
    v_streak_reverted := true;
    
    -- Heuristic for longest streak: if it was exactly what we just reached, roll it back too
    -- This isn't perfect but mirrors the increment logic
    v_new_longest_streak := v_routine.longest_streak;
    IF v_routine.longest_streak = v_routine.current_streak AND v_routine.current_streak > 0 THEN
       v_new_longest_streak := v_routine.longest_streak - 1;
    END IF;

    UPDATE public.routines
    SET 
      current_streak = v_new_streak,
      longest_streak = v_new_longest_streak,
      last_streak_increment_period = NULL, -- Reset so it can be re-incremented if they re-complete
      total_completions = GREATEST(0, total_completions - 1),
      last_completed_at = v_prev_completion.completed_at,
      updated_at = now()
    WHERE id = p_routine_id;
  ELSE
    UPDATE public.routines
    SET 
      total_completions = GREATEST(0, total_completions - 1),
      last_completed_at = v_prev_completion.completed_at,
      updated_at = now()
    WHERE id = p_routine_id;
  END IF;

  -- 7. Return refreshed routine
  SELECT * INTO v_routine FROM public.routines WHERE id = p_routine_id;

  RETURN json_build_object(
    'routine', row_to_json(v_routine),
    'streak_reverted', v_streak_reverted,
    'completions_count', v_count_after_delete,
    'period_date', v_completion_to_delete.period_date
  );
END;
$$;
