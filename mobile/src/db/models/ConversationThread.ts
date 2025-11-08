import {Model, Query} from '@nozbe/watermelondb';
import {field, date, text, children} from '@nozbe/watermelondb/decorators';
import ConversationMessage from './ConversationMessage';

// TypeScript interface for ConversationThread
export interface ConversationThreadType {
  id: string;
  userId: string;
  title: string;
  summary?: string | null;
  isActive?: boolean;
  isPinned?: boolean;
  createdAt: Date;
  updatedAt: Date;
  status: string;
}

export default class ConversationThread extends Model {
  static table = 'conversation_threads';
  static associations = {
    messages: {type: 'has_many', foreignKey: 'thread_id'},
  } as const;

  @text('user_id') userId!: string;
  @text('title') title!: string;
  @text('summary') summary?: string | null;
  @field('is_active') isActive?: boolean;
  @field('is_pinned') isPinned?: boolean;
  @date('created_at') createdAt!: Date;
  @date('updated_at') updatedAt!: Date;
  @text('status') status!: string;

  @children('conversation_messages') messages!: Query<ConversationMessage>;
}

