import {appSchema, tableSchema} from '@nozbe/watermelondb';

export const mySchema = appSchema({
  version: 2,
  tables: [
    tableSchema({
      name: 'goals',
      columns: [
        {name: 'user_id', type: 'string', isIndexed: true},
        {name: 'title', type: 'string'},
        {name: 'description', type: 'string', isOptional: true},
        {name: 'target_completion_date', type: 'number', isOptional: true},
        {name: 'progress_percentage', type: 'number', isOptional: true},
        {name: 'category', type: 'string', isOptional: true},
        {name: 'is_active', type: 'boolean', isOptional: true},
        {name: 'created_at', type: 'number'},
        {name: 'updated_at', type: 'number'},
        {name: 'status', type: 'string'}, // for sync
      ],
    }),
    tableSchema({
      name: 'milestones',
      columns: [
        {name: 'goal_id', type: 'string', isIndexed: true},
        {name: 'title', type: 'string'},
        {name: 'description', type: 'string', isOptional: true},
        {name: 'completed', type: 'boolean'},
        {name: 'order', type: 'number'},
        {name: 'created_at', type: 'number'},
        {name: 'updated_at', type: 'number'},
        {name: 'status', type: 'string'}, // for sync
      ],
    }),
    tableSchema({
      name: 'milestone_steps',
      columns: [
        {name: 'milestone_id', type: 'string', isIndexed: true},
        {name: 'text', type: 'string'},
        {name: 'completed', type: 'boolean'},
        {name: 'order', type: 'number'},
        {name: 'created_at', type: 'number'},
        {name: 'updated_at', type: 'number'},
        {name: 'status', type: 'string'}, // for sync
      ],
    }),
    tableSchema({
      name: 'tasks',
      columns: [
        {name: 'user_id', type: 'string', isIndexed: true},
        {name: 'goal_id', type: 'string', isIndexed: true, isOptional: true},
        {name: 'title', type: 'string'},
        {name: 'description', type: 'string', isOptional: true},
        {name: 'priority', type: 'string', isOptional: true},
        {name: 'estimated_duration_minutes', type: 'number', isOptional: true},
        {name: 'status', type: 'string'}, // 'synced', 'pending_create', 'pending_update'
        {name: 'due_date', type: 'number', isOptional: true},
        {name: 'calendar_event_id', type: 'string', isOptional: true},
        {name: 'created_at', type: 'number'},
        {name: 'updated_at', type: 'number'},
        {name: 'is_today_focus', type: 'boolean', isOptional: true},
      ],
    }),
    tableSchema({
      name: 'calendar_events',
      columns: [
        {name: 'user_id', type: 'string', isIndexed: true},
        {name: 'task_id', type: 'string', isIndexed: true, isOptional: true},
        {name: 'goal_id', type: 'string', isIndexed: true, isOptional: true},
        {name: 'google_calendar_id', type: 'string', isOptional: true},
        {name: 'title', type: 'string'},
        {name: 'description', type: 'string', isOptional: true},
        {name: 'start_time', type: 'number'},
        {name: 'end_time', type: 'number'},
        {name: 'location', type: 'string', isOptional: true},
        {name: 'is_all_day', type: 'boolean'},
        {name: 'created_at', type: 'number'},
        {name: 'updated_at', type: 'number'},
        {name: 'status', type: 'string'}, // for sync
      ],
    }),
  ],
});
