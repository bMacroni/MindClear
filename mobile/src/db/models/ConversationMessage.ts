import {Model} from '@nozbe/watermelondb';
import {field, date, text, relation} from '@nozbe/watermelondb/decorators';
import {ConversationThreadType} from './ConversationThread';

// TypeScript interface for ConversationMessage
export interface ConversationMessageType {
  id: string;
  threadId: string;
  userId: string;
  role: 'user' | 'assistant';
  content: string;
  metadata?: any;
  createdAt: Date;
  updatedAt: Date;
  status: string;
}

export default class ConversationMessage extends Model {
  static table = 'conversation_messages';
  static associations = {
    thread: {type: 'belongs_to', key: 'thread_id'},
  } as const;

  @text('thread_id') threadId!: string;
  @text('user_id') userId!: string;
  @text('role') role!: 'user' | 'assistant';
  @text('content') content!: string;
  @text('metadata') metadata?: string; // JSON stringified
  @date('created_at') createdAt!: Date;
  @date('updated_at') updatedAt!: Date;
  @text('status') status!: string;

  @relation('conversation_threads', 'thread_id') thread?: ConversationThreadType;

  // Helper to parse metadata
  get parsedMetadata(): any {
    if (!this.metadata) return null;
    try {
      return JSON.parse(this.metadata);
    } catch {
      return null;
    }
  }

  // Helper to set metadata
  setMetadata(value: any): void {
    this.metadata = value ? JSON.stringify(value) : undefined;
  }
}

