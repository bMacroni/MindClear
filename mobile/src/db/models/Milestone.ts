import {Model, Relation, Query} from '@nozbe/watermelondb';
import {field, date, text, relation, children} from '@nozbe/watermelondb/decorators';
import Goal from './Goal';
import MilestoneStep from './MilestoneStep';

export default class Milestone extends Model {
  static table = 'milestones';
  static associations = {
    goals: {type: 'belongs_to', key: 'goal_id'},
    milestone_steps: {type: 'has_many', foreignKey: 'milestone_id'},
  } as const;

  @text('goal_id') goalId!: string;
  @text('title') title!: string;
  @text('description') description?: string;
  @field('completed') completed!: boolean;
  @field('order') order!: number;
  @date('created_at') createdAt!: Date;
  @date('updated_at') updatedAt!: Date;
  @text('status') status!: string;

  @relation('goals', 'goal_id') goal!: Relation<Goal>;
  @children('milestone_steps') steps!: Query<MilestoneStep>;
}
