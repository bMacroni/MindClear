-- WARNING: This schema is for context only and is not meant to be run.
-- Table order and constraints may not be valid for execution.

CREATE TABLE public.analytics_events (
  id bigint GENERATED ALWAYS AS IDENTITY NOT NULL,
  user_id uuid NOT NULL,
  event_name text NOT NULL,
  payload jsonb,
  created_at timestamp with time zone DEFAULT now(),
  CONSTRAINT analytics_events_pkey PRIMARY KEY (id),
  CONSTRAINT analytics_events_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id)
);
CREATE TABLE public.archived_user_notifications (
  id uuid NOT NULL,
  user_id uuid NOT NULL,
  notification_type text NOT NULL,
  title text,
  message text,
  details jsonb,
  created_at timestamp with time zone,
  archived_at timestamp with time zone DEFAULT now(),
  CONSTRAINT archived_user_notifications_pkey PRIMARY KEY (id),
  CONSTRAINT archived_user_notifications_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id)
);
CREATE TABLE public.auth_deletion_queue (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  operation_type character varying NOT NULL DEFAULT 'auth_deletion'::character varying CHECK (operation_type::text = ANY (ARRAY['auth_deletion'::character varying::text, 'compensating_rollback'::character varying::text])),
  status character varying NOT NULL DEFAULT 'pending'::character varying CHECK (status::text = ANY (ARRAY['pending'::character varying::text, 'processing'::character varying::text, 'completed'::character varying::text, 'failed'::character varying::text, 'cancelled'::character varying::text])),
  context jsonb NOT NULL DEFAULT '{}'::jsonb,
  last_error text,
  retry_count integer NOT NULL DEFAULT 0,
  max_retries integer NOT NULL DEFAULT 3,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  last_retry_at timestamp with time zone,
  completed_at timestamp with time zone,
  processing_notes text,
  resolved_by character varying,
  CONSTRAINT auth_deletion_queue_pkey PRIMARY KEY (id)
);
CREATE TABLE public.calendar_events (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  task_id uuid,
  google_calendar_id text,
  title text NOT NULL,
  description text,
  start_time timestamp with time zone NOT NULL,
  end_time timestamp with time zone NOT NULL,
  location text,
  is_recurring boolean DEFAULT false,
  recurrence_rule text,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now(),
  event_type USER-DEFINED NOT NULL DEFAULT 'event'::calendar_event_type,
  goal_id uuid,
  is_all_day boolean NOT NULL DEFAULT false,
  CONSTRAINT calendar_events_pkey PRIMARY KEY (id),
  CONSTRAINT calendar_events_goal_id_fkey FOREIGN KEY (goal_id) REFERENCES public.goals(id),
  CONSTRAINT calendar_events_task_id_fkey FOREIGN KEY (task_id) REFERENCES public.tasks(id),
  CONSTRAINT calendar_events_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id)
);
CREATE TABLE public.chat_history (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  message text NOT NULL,
  response text NOT NULL,
  intent text,
  entities jsonb,
  created_at timestamp with time zone DEFAULT now(),
  CONSTRAINT chat_history_pkey PRIMARY KEY (id),
  CONSTRAINT chat_history_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id)
);
CREATE TABLE public.conversation_messages (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  thread_id uuid NOT NULL,
  user_id uuid NOT NULL,
  role text NOT NULL CHECK (role = ANY (ARRAY['user'::text, 'assistant'::text])),
  content text NOT NULL,
  metadata jsonb,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now(),
  CONSTRAINT conversation_messages_pkey PRIMARY KEY (id),
  CONSTRAINT conversation_messages_thread_id_fkey FOREIGN KEY (thread_id) REFERENCES public.conversation_threads(id),
  CONSTRAINT conversation_messages_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id)
);
CREATE TABLE public.conversation_threads (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  title text NOT NULL,
  summary text,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now(),
  CONSTRAINT conversation_threads_pkey PRIMARY KEY (id),
  CONSTRAINT conversation_threads_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id)
);
CREATE TABLE public.email_digest_logs (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  sent_at timestamp with time zone DEFAULT now(),
  digest_date date NOT NULL,
  tasks_count integer DEFAULT 0,
  events_count integer DEFAULT 0,
  goals_updated integer DEFAULT 0,
  email_sent boolean DEFAULT true,
  error_message text,
  CONSTRAINT email_digest_logs_pkey PRIMARY KEY (id),
  CONSTRAINT email_digest_logs_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id)
);
CREATE TABLE public.goals (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  title text NOT NULL,
  description text,
  target_completion_date date,
  progress_percentage integer DEFAULT 0 CHECK (progress_percentage >= 0 AND progress_percentage <= 100),
  category USER-DEFINED DEFAULT 'other'::goal_category,
  is_active boolean DEFAULT true,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now(),
  CONSTRAINT goals_pkey PRIMARY KEY (id),
  CONSTRAINT goals_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id)
);
CREATE TABLE public.google_tokens (
  user_id uuid NOT NULL,
  access_token text,
  refresh_token text,
  token_type text,
  scope text,
  expiry_date bigint,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now(),
  CONSTRAINT google_tokens_pkey PRIMARY KEY (user_id),
  CONSTRAINT google_tokens_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id)
);
CREATE TABLE public.milestones (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  goal_id uuid NOT NULL,
  title character varying NOT NULL,
  order integer NOT NULL DEFAULT 0,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now(),
  metadata jsonb,
  completed boolean NOT NULL DEFAULT false,
  description text,
  CONSTRAINT milestones_pkey PRIMARY KEY (id),
  CONSTRAINT milestones_goal_id_fkey FOREIGN KEY (goal_id) REFERENCES public.goals(id)
);
CREATE TABLE public.steps (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  milestone_id uuid NOT NULL,
  text character varying NOT NULL,
  order integer NOT NULL DEFAULT 0,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now(),
  metadata jsonb,
  completed boolean DEFAULT false,
  CONSTRAINT steps_pkey PRIMARY KEY (id),
  CONSTRAINT steps_milestone_id_fkey FOREIGN KEY (milestone_id) REFERENCES public.milestones(id)
);
CREATE TABLE public.task_scheduling_history (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  task_id uuid NOT NULL,
  user_id uuid NOT NULL,
  scheduled_date timestamp with time zone NOT NULL,
  weather_conditions jsonb,
  travel_time_minutes integer,
  calendar_event_id text,
  scheduling_reason text,
  created_at timestamp with time zone DEFAULT now(),
  CONSTRAINT task_scheduling_history_pkey PRIMARY KEY (id),
  CONSTRAINT task_scheduling_history_task_id_fkey FOREIGN KEY (task_id) REFERENCES public.tasks(id),
  CONSTRAINT task_scheduling_history_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id)
);
CREATE TABLE public.tasks (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  goal_id uuid,
  title text NOT NULL,
  description text,
  priority USER-DEFINED DEFAULT 'medium'::priority_level,
  estimated_duration_minutes integer,
  status USER-DEFINED DEFAULT 'not_started'::task_status,
  due_date timestamp with time zone,
  category text,
  tags ARRAY,
  calendar_event_id text,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now(),
  is_today_focus boolean DEFAULT false,
  auto_schedule_enabled boolean DEFAULT false,
  recurrence_pattern jsonb,
  scheduling_preferences jsonb,
  last_scheduled_date timestamp with time zone,
  weather_dependent boolean DEFAULT false,
  location text,
  travel_time_minutes integer,
  preferred_time_windows jsonb,
  max_daily_tasks integer DEFAULT 5,
  buffer_time_minutes integer DEFAULT 15,
  task_type USER-DEFINED DEFAULT 'other'::task_type,
  preferred_time_of_day character varying,
  deadline_type character varying,
  reminder_sent_at timestamp with time zone,
  CONSTRAINT tasks_pkey PRIMARY KEY (id),
  CONSTRAINT tasks_goal_id_fkey FOREIGN KEY (goal_id) REFERENCES public.goals(id),
  CONSTRAINT tasks_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id)
);
CREATE TABLE public.user_app_preferences (
  user_id uuid NOT NULL,
  momentum_mode_enabled boolean NOT NULL DEFAULT false,
  momentum_travel_preference text NOT NULL DEFAULT 'allow_travel'::text,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now(),
  calendar_first_import_completed boolean NOT NULL DEFAULT false,
  calendar_import_prompt_dismissed_at timestamp with time zone,
  CONSTRAINT user_app_preferences_pkey PRIMARY KEY (user_id),
  CONSTRAINT user_app_preferences_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id)
);
CREATE TABLE public.user_deletion_audit (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  deleted_user_id uuid NOT NULL,
  deleted_user_email text,
  deleted_by uuid NOT NULL,
  deleted_at timestamp with time zone NOT NULL DEFAULT now(),
  reason text,
  ip_address inet,
  deletion_requested_at timestamp with time zone,
  deleted_counts jsonb DEFAULT '{}'::jsonb,
  success boolean DEFAULT false,
  error_message text,
  created_at timestamp with time zone DEFAULT now(),
  CONSTRAINT user_deletion_audit_pkey PRIMARY KEY (id)
);
CREATE TABLE public.user_device_tokens (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  device_token text NOT NULL,
  device_type text,
  created_at timestamp with time zone DEFAULT now(),
  CONSTRAINT user_device_tokens_pkey PRIMARY KEY (id),
  CONSTRAINT user_device_tokens_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id)
);
CREATE TABLE public.user_notification_preferences (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  notification_type text NOT NULL,
  channel text NOT NULL,
  enabled boolean NOT NULL DEFAULT true,
  snooze_duration_minutes integer,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now(),
  CONSTRAINT user_notification_preferences_pkey PRIMARY KEY (id),
  CONSTRAINT user_notification_preferences_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id)
);
CREATE TABLE public.user_notifications (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  notification_type text NOT NULL,
  title text,
  message text,
  details jsonb,
  read boolean DEFAULT false,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now(),
  CONSTRAINT user_notifications_pkey PRIMARY KEY (id),
  CONSTRAINT user_notifications_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id)
);
CREATE TABLE public.user_scheduling_preferences (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL UNIQUE,
  preferred_start_time time without time zone DEFAULT '09:00:00'::time without time zone,
  preferred_end_time time without time zone DEFAULT '17:00:00'::time without time zone,
  work_days ARRAY DEFAULT '{1,2,3,4,5}'::integer[],
  max_tasks_per_day integer DEFAULT 5,
  buffer_time_minutes integer DEFAULT 15,
  weather_check_enabled boolean DEFAULT true,
  travel_time_enabled boolean DEFAULT true,
  auto_scheduling_enabled boolean DEFAULT false,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now(),
  CONSTRAINT user_scheduling_preferences_pkey PRIMARY KEY (id),
  CONSTRAINT user_scheduling_preferences_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id)
);
CREATE TABLE public.users (
  id uuid NOT NULL,
  email text NOT NULL UNIQUE,
  full_name text,
  avatar_url text,
  timezone text DEFAULT 'America/Chicago'::text,
  email_digest_enabled boolean DEFAULT true,
  email_digest_time time without time zone DEFAULT '07:00:00'::time without time zone,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now(),
  join_date timestamp with time zone DEFAULT now(),
  last_login timestamp with time zone,
  account_status USER-DEFINED DEFAULT 'active'::account_status_enum,
  theme_preference USER-DEFINED DEFAULT 'light'::theme_preference_enum,
  notification_preferences jsonb DEFAULT '{}'::jsonb,
  geographic_location text,
  subscription_tier USER-DEFINED DEFAULT 'free'::subscription_tier_enum,
  is_admin boolean DEFAULT false,
  deletion_requested_at timestamp with time zone,
  deletion_status character varying DEFAULT 'active'::character varying,
  deletion_failed_at timestamp with time zone,
  deletion_failure_context jsonb,
  focus_notification_time time without time zone DEFAULT '07:00:00'::time without time zone,
  last_focus_notification_sent timestamp with time zone,
  CONSTRAINT users_pkey PRIMARY KEY (id),
  CONSTRAINT users_id_fkey FOREIGN KEY (id) REFERENCES auth.users(id)
);