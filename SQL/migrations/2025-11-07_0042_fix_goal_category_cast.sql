-- Migration: Fix goal category enum casting in atomic goal creation function
-- Date: 2025-11-07
-- Description: Ensures p_goal_data.category is safely cast to goal_category enum, or NULL if invalid

DROP FUNCTION IF EXISTS fn_create_goal_with_milestones(UUID, JSONB, JSONB);

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
  v_category_text TEXT;
  v_category goal_category;
BEGIN
  -- Normalize and validate category from JSON
  v_category_text := NULLIF(TRIM(LOWER(p_goal_data->>'category')), '');
  IF v_category_text IS NOT NULL AND v_category_text <> 'null' THEN
    -- Whitelist allowed enum values to avoid invalid_cast errors
    IF v_category_text IN ('career','health','personal','education','finance','relationships','other') THEN
      v_category := v_category_text::goal_category;
    ELSE
      v_category := NULL; -- unknown value -> default to NULL
    END IF;
  ELSE
    v_category := NULL;
  END IF;

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
    v_category
  )
  RETURNING id INTO v_goal_id;

  -- Create milestones and steps if provided
  IF p_milestones IS NOT NULL AND jsonb_array_length(p_milestones) > 0 THEN
    FOR v_milestone_index IN 0..jsonb_array_length(p_milestones) - 1 LOOP
      v_milestone := p_milestones->v_milestone_index;
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
        CASE 
          WHEN v_milestone ? 'order' AND (v_milestone->>'order') IS NOT NULL THEN (v_milestone->>'order')::INTEGER
          ELSE v_milestone_index + 1
        END
      )
      RETURNING id INTO v_created_milestone_id;

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
    RAISE EXCEPTION 'Atomic goal creation failed: % (SQLSTATE: %)', SQLERRM, SQLSTATE;
END;
$$;

GRANT EXECUTE ON FUNCTION fn_create_goal_with_milestones(UUID, JSONB, JSONB) TO authenticated;


