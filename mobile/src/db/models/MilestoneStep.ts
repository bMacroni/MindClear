import {Model} from '@nozbe/watermelondb';
import {field, date, text, relation} from '@nozbe/watermelondb/decorators';

export default class MilestoneStep extends Model {
  static table = 'milestone_steps';
  static associations = {
    milestones: {type: 'belongs_to', key: 'milestone_id'},
  } as const;

  @text('milestone_id') milestoneId!: string;
  @text('text') text!: string;
  @field('completed') completed!: boolean;
  @field('order') order!: number;
  @date('created_at') createdAt!: Date;
  @date('updated_at') updatedAt!: Date;
  @text('status') status!: string;

  @relation('milestones', 'milestone_id') milestone: any;
}
