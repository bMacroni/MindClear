-- Migration: Performance Optimization Indexes
-- Date: 2025-01-27
-- Description: Add composite indexes to optimize common query patterns and fix N+1 query issues

-- Composite index for getNextFocusTask optimization
-- This index supports filtering by user_id, status, and ordering by priority and due_date
CREATE INDEX IF NOT EXISTS idx_tasks_user_status_priority_due 
ON public.tasks(user_id, status, priority, due_date) 
WHERE status != 'completed';

-- Index for focus task queries
CREATE INDEX IF NOT EXISTS idx_tasks_user_focus_exclude 
ON public.tasks(user_id, is_today_focus) 
WHERE status != 'completed';

-- Composite index for goal step queries optimization
CREATE INDEX IF NOT EXISTS idx_milestones_goal_order 
ON public.milestones(goal_id, "order");

-- Index for steps queries with completion status
CREATE INDEX IF NOT EXISTS idx_steps_milestone_order_completed 
ON public.steps(milestone_id, "order", completed);

-- Index for tasks with location filtering (for travel preference)
CREATE INDEX IF NOT EXISTS idx_tasks_user_location 
ON public.tasks(user_id, location) 
WHERE status != 'completed';

-- Index for tasks with estimated duration
CREATE INDEX IF NOT EXISTS idx_tasks_user_duration 
ON public.tasks(user_id, estimated_duration_minutes) 
WHERE status != 'completed';

-- Index for goal title searches (case-insensitive)
CREATE INDEX IF NOT EXISTS idx_goals_user_title_gin 
ON public.goals USING gin(to_tsvector('english', title)) 
WHERE user_id IS NOT NULL;

-- Index for task title searches (case-insensitive)
CREATE INDEX IF NOT EXISTS idx_tasks_user_title_gin 
ON public.tasks USING gin(to_tsvector('english', title)) 
WHERE user_id IS NOT NULL;

-- Composite index for calendar events with task relationships
CREATE INDEX IF NOT EXISTS idx_calendar_events_user_task_time 
ON public.calendar_events(user_id, task_id, start_time);

-- Index for conversation threads optimization
CREATE INDEX IF NOT EXISTS idx_conversation_threads_user_active_updated 
ON public.conversation_threads(user_id, is_active, updated_at DESC);

-- Index for conversation messages optimization
CREATE INDEX IF NOT EXISTS idx_conversation_messages_thread_created 
ON public.conversation_messages(thread_id, created_at);

-- Add comments to document the purpose of these indexes
COMMENT ON INDEX idx_tasks_user_status_priority_due IS 'Optimizes getNextFocusTask queries by supporting user filtering, status exclusion, and priority/due_date ordering';
COMMENT ON INDEX idx_tasks_user_focus_exclude IS 'Optimizes focus task queries and exclusions';
COMMENT ON INDEX idx_milestones_goal_order IS 'Optimizes milestone ordering queries for goal step creation';
COMMENT ON INDEX idx_steps_milestone_order_completed IS 'Optimizes step queries with completion status filtering';
COMMENT ON INDEX idx_tasks_user_location IS 'Optimizes location-based task filtering for travel preferences';
COMMENT ON INDEX idx_tasks_user_duration IS 'Optimizes duration-based task filtering';
COMMENT ON INDEX idx_goals_user_title_gin IS 'Full-text search index for goal titles';
COMMENT ON INDEX idx_tasks_user_title_gin IS 'Full-text search index for task titles';
COMMENT ON INDEX idx_calendar_events_user_task_time IS 'Optimizes calendar event queries with task relationships';
COMMENT ON INDEX idx_conversation_threads_user_active_updated IS 'Optimizes conversation thread queries with active status and ordering';
COMMENT ON INDEX idx_conversation_messages_thread_created IS 'Optimizes conversation message queries with thread and time ordering';
