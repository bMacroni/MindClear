import {Model} from '@nozbe/watermelondb';
import {
  field,
  date,
  text,
  relation,
} from '@nozbe/watermelondb/decorators';

export default class CalendarEvent extends Model {
  static table = 'calendar_events';
  static associations = {
    tasks: {type: 'belongs_to', key: 'task_id'},
    goals: {type: 'belongs_to', key: 'goal_id'},
  } as const;

  @text('google_calendar_id') googleCalendarId?: string;
  @text('title') title!: string;
  @text('description') description?: string;
  @date('start_time') startTime!: Date;
  @date('end_time') endTime!: Date;
  @text('location') location?: string;
  @field('is_all_day') isAllDay!: boolean;
  @date('created_at') createdAt!: Date;
  @date('updated_at') updatedAt!: Date;
  @text('status') status!: string;
  @text('user_id') userId!: string;

  @relation('tasks', 'task_id') task: any;
  @relation('goals', 'goal_id') goal: any;
}
