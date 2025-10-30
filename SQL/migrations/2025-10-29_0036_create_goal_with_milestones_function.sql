-- Migration: Atomic goal creation function
-- Created: 2025-01-15
-- Description: Creates a PostgreSQL stored function to create a goal with milestones and steps
--              atomically in a single transaction to prevent partial data creation.

-- Drop the function if it exists (for idempotency)
DROP FUNCTION IF EXISTS fn_create_goal_with_milestones(UUID, JSONB, JSONB);

-- Create the atomic goal creation function
CREATE OR REPLACE FUNCTION fn_create_goal_with_milestones(
  p_user_id UUID,
  p_goal_data JSONB,
  p_milestones JSONB DEFAULT '[]'::JSONB
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_goal_id UUID;
  v_milestone JSONB;
  v_created_milestone_id UUID;
  v_step JSONB;
  v_milestone_index INTEGER := 0;
  v_step_index INTEGER;
BEGIN
  -- All inserts happen within this function's implicit transaction
  -- If any INSERT fails, the entire transaction will roll back
  
  -- Create the goal first
  INSERT INTO goals (
    user_id,
    title,
    description,
    target_completion_date,
    category
  )
  VALUES (
    p_user_id,
    p_goal_data->>'title',
    p_goal_data->>'description',
    CASE 
      WHEN p_goal_data->>'target_completion_date' IS NULL OR p_goal_data->>'target_completion_date' = 'null' THEN NULL
      ELSE (p_goal_data->>'target_completion_date')::DATE
    END,
    p_goal_data->>'category'
  )
  RETURNING id INTO v_goal_id;
  
  -- Create milestones and steps if provided
  IF p_milestones IS NOT NULL AND jsonb_array_length(p_milestones) > 0 THEN
    FOR v_milestone_index IN 0..jsonb_array_length(p_milestones) - 1 LOOP
      v_milestone := p_milestones->v_milestone_index;
      
      -- Create the milestone
      INSERT INTO milestones (
        goal_id,
        title,
        description,
        "order"
      )
      VALUES (
        v_goal_id,
        v_milestone->>'title',
        v_milestone->>'description',
        -- Handle order: if order key exists (even if 0), use it; otherwise use default
        CASE 
          WHEN v_milestone ? 'order' AND (v_milestone->>'order') IS NOT NULL THEN (v_milestone->>'order')::INTEGER
          ELSE v_milestone_index + 1
        END
      )
      RETURNING id INTO v_created_milestone_id;
      
      -- Create steps for this milestone if provided
      IF v_milestone->'steps' IS NOT NULL AND jsonb_array_length(v_milestone->'steps') > 0 THEN
        FOR v_step_index IN 0..jsonb_array_length(v_milestone->'steps') - 1 LOOP
          v_step := v_milestone->'steps'->v_step_index;
          
          INSERT INTO steps (
            milestone_id,
            text,
            "order",
            completed
          )
          VALUES (
            v_created_milestone_id,
            COALESCE(v_step->>'text', v_step::TEXT),
            -- Handle order: if order key exists (even if 0), use it; otherwise use default
            CASE 
              WHEN v_step ? 'order' AND (v_step->>'order') IS NOT NULL THEN (v_step->>'order')::INTEGER
              ELSE v_step_index + 1
            END,
            COALESCE((v_step->>'completed')::BOOLEAN, false)
          );
        END LOOP;
      END IF;
    END LOOP;
  END IF;
  
  -- Return the complete goal with milestones and steps as JSONB
  RETURN (
    SELECT jsonb_build_object(
      'id', g.id,
      'user_id', g.user_id,
      'title', g.title,
      'description', g.description,
      'target_completion_date', g.target_completion_date,
      'category', g.category,
      'progress_percentage', g.progress_percentage,
      'is_active', g.is_active,
      'created_at', g.created_at,
      'updated_at', g.updated_at,
      'milestones', COALESCE(
        (
          SELECT jsonb_agg(
            jsonb_build_object(
              'id', m.id,
              'goal_id', m.goal_id,
              'title', m.title,
              'description', m.description,
              'order', m.order,
              'completed', m.completed,
              'created_at', m.created_at,
              'updated_at', m.updated_at,
              'steps', COALESCE(
                (
                  SELECT jsonb_agg(
                    jsonb_build_object(
                      'id', s.id,
                      'milestone_id', s.milestone_id,
                      'text', s.text,
                      'order', s.order,
                      'completed', s.completed,
                      'created_at', s.created_at,
                      'updated_at', s.updated_at
                    ) ORDER BY s.order
                  )
                  FROM steps s
                  WHERE s.milestone_id = m.id
                ),
                '[]'::JSONB
              )
            ) ORDER BY m.order
          )
          FROM milestones m
          WHERE m.goal_id = g.id
        ),
        '[]'::JSONB
      )
    )
    FROM goals g
    WHERE g.id = v_goal_id
  );
  
EXCEPTION
  WHEN OTHERS THEN
    -- Any error will cause automatic rollback of all changes
    RAISE EXCEPTION 'Atomic goal creation failed: % (SQLSTATE: %)', 
      SQLERRM, SQLSTATE;
END;
$$;

-- Grant execute permission to authenticated users
-- Note: This function uses SECURITY DEFINER, so it runs with the privileges of the function owner
GRANT EXECUTE ON FUNCTION fn_create_goal_with_milestones(UUID, JSONB, JSONB) TO authenticated;

-- Add a comment describing the function
COMMENT ON FUNCTION fn_create_goal_with_milestones(UUID, JSONB, JSONB) IS 
  'Atomically creates a goal with milestones and steps in a single transaction. Returns the complete goal with nested milestones and steps as JSONB or raises an exception on failure, causing automatic rollback of all changes.';

