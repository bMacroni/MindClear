import {Model} from '@nozbe/watermelondb';
import {field, date, text, children} from '@nozbe/watermelondb/decorators';

export default class Goal extends Model {
  static table = 'goals';
  static associations = {
    milestones: {type: 'has_many', foreignKey: 'goal_id'},
  } as const;

  @text('title') title!: string;
  @text('description') description?: string;
  @date('target_completion_date') targetCompletionDate?: Date;
  @field('progress_percentage') progressPercentage?: number;
  @text('category') category?: string;
  @field('is_active') isActive?: boolean;
  @date('created_at') createdAt!: Date;
  @date('updated_at') updatedAt!: Date;
  @text('status') status!: string;
  @text('user_id') userId!: string;

import {Query} from '@nozbe/watermelondb';
import Milestone from './Milestone';

  @children('milestones') milestones!: Query<Milestone>;}
