import {Model} from '@nozbe/watermelondb';
import {
  field,
  date,
  text,
  relation,
} from '@nozbe/watermelondb/decorators';

// TypeScript interface for Task
export interface TaskType {
  id: string;
  title: string;
  description?: string;
  priority?: string;
  estimatedDurationMinutes?: number;
  status: string;
  dueDate?: Date;
  calendarEventId?: string;
  createdAt: Date;
  updatedAt: Date;
  isTodayFocus?: boolean;
  userId: string;
  goalId?: string;
  location?: string;
  autoScheduleEnabled?: boolean;
  category?: string;
  goal?: any;
}

export default class Task extends Model {
  static table = 'tasks';
  static associations = {
    goals: {type: 'belongs_to', key: 'goal_id'},
  } as const;

  @text('title') title!: string;
  @text('description') description?: string;
  @text('priority') priority?: string;
  @field('estimated_duration_minutes') estimatedDurationMinutes?: number;
  @text('status') status!: string;
  @date('due_date') dueDate?: Date;
  @text('calendar_event_id') calendarEventId?: string;
  @date('created_at') createdAt!: Date;
  @date('updated_at') updatedAt!: Date;
  @field('is_today_focus') isTodayFocus?: boolean;
  @text('user_id') userId!: string;
  @text('goal_id') goalId?: string;
  @text('location') location?: string;
  @field('auto_schedule_enabled') autoScheduleEnabled?: boolean;
  @text('category') category?: string;

  @relation('goals', 'goal_id') goal: any;

  // Getter for camelCase compatibility
  get auto_schedule_enabled(): boolean {
    return this.autoScheduleEnabled ?? false;
  }

}
