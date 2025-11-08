import {getDatabase} from '../db';
import {Q} from '@nozbe/watermelondb';
import ConversationThread from '../db/models/ConversationThread';
import ConversationMessage from '../db/models/ConversationMessage';
import {authService} from '../services/auth';
import logger from '../utils/logger';

/**
 * ConversationRepository handles all conversation-related database operations.
 * 
 * Behavioral Contract:
 * - All operations that modify threads (updateThread, deleteThread) will throw
 *   "Thread not found" error if the specified thread ID doesn't exist
 * - Read operations (getThreadById) return null for non-existent threads
 * - Messages are created optimistically with 'pending_create' status
 */
export class ConversationRepository {
  private getCurrentUserId(): string {
    const user = authService.getCurrentUser();
    if (!user?.id) {
      throw new Error('User not authenticated');
    }
    return user.id;
  }

  /**
   * Gets all threads for the current user, excluding deleted ones.
   */
  async getAllThreads(): Promise<ConversationThread[]> {
    try {
      const database = getDatabase();
      const userId = this.getCurrentUserId();
      return await database.get<ConversationThread>('conversation_threads')
        .query(
          Q.where('user_id', userId),
          Q.where('status', Q.notEq('pending_delete'))
        )
        .fetch();
    } catch (error) {
      logger.error('Failed to fetch all threads', { error: error instanceof Error ? error.message : 'Unknown error' });
      return [];
    }
  }

  /**
   * Gets a single thread by ID.
   */
  async getThreadById(id: string): Promise<ConversationThread | null> {
    const database = getDatabase();
    try {
      return await database.get<ConversationThread>('conversation_threads').find(id);
    } catch (err) {
      // Handle WatermelonDB "not found" errors - this is expected behavior for read operations
      const errorMessage = err instanceof Error ? err.message : String(err);
      if (errorMessage.includes('not found')) {
        // Log at debug level since this is expected behavior (thread may not exist)
        logger.debug('ConversationRepository.getThreadById: Thread not found', {
          threadId: id
        });
      } else {
        // Log other errors at error level as they indicate actual problems
        logger.error('ConversationRepository.getThreadById failed', {
          threadId: id,
          error: errorMessage,
          errorDetails: err instanceof Error ? err.stack : String(err)
        });
      }
      return null;
    }
  }

  /**
   * Gets all messages for a specific thread, sorted by creation time (oldest first).
   */
  async getMessagesByThreadId(threadId: string): Promise<ConversationMessage[]> {
    try {
      const database = getDatabase();
      return await database.get<ConversationMessage>('conversation_messages')
        .query(
          Q.where('thread_id', threadId),
          Q.sortBy('created_at', Q.asc) // Sort by creation time ascending (oldest first)
        )
        .fetch();
    } catch (error) {
      logger.error('Failed to fetch messages for thread', { 
        threadId, 
        error: error instanceof Error ? error.message : 'Unknown error' 
      });
      return [];
    }
  }

  /**
   * Creates a new thread locally with 'pending_create' status.
   */
  async createThread(data: {
    title: string;
    summary?: string | null;
    isActive?: boolean;
    isPinned?: boolean;
  }): Promise<ConversationThread> {
    const database = getDatabase();
    const userId = this.getCurrentUserId();
    
    try {
      return await database.write(async () => {
        return await database.get<ConversationThread>('conversation_threads').create(thread => {
          thread.userId = userId;
          thread.title = data.title;
          thread.summary = data.summary ?? null;
          thread.isActive = data.isActive ?? true;
          thread.isPinned = data.isPinned ?? false;
          thread.status = 'pending_create';
          thread.createdAt = new Date();
          thread.updatedAt = new Date();
        });
      });
    } catch (error) {
      logger.error('Failed to create thread', {
        userId,
        title: data.title,
        summary: data.summary ?? null,
        error: error instanceof Error ? error.message : 'Unknown error',
        originalError: error
      });
      throw new Error(`Failed to create thread: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Updates an existing thread locally with 'pending_update' status.
   * @throws Error - Throws "Thread not found" if the thread doesn't exist
   */
  async updateThread(id: string, data: {
    title?: string;
    summary?: string | null;
    isActive?: boolean;
    isPinned?: boolean;
  }): Promise<ConversationThread> {
    const database = getDatabase();
    const thread = await this.getThreadById(id);
    if (!thread) throw new Error('Thread not found');
    
    try {
      return await database.write(async () => {
        return await thread.update(t => {
          if (data.title !== undefined) t.title = data.title;
          if (data.summary !== undefined) t.summary = data.summary;
          if (data.isActive !== undefined) t.isActive = data.isActive;
          if (data.isPinned !== undefined) t.isPinned = data.isPinned;
          
          // Preserve pending_create for offline-created threads, otherwise mark as pending_update
          const currentStatus = t.status as string;
          if (currentStatus !== 'pending_create') {
            t.status = 'pending_update';
          }
          t.updatedAt = new Date();
        });
      });
    } catch (error) {
      logger.error('Failed to update thread', { 
        id, 
        error: error instanceof Error ? error.message : 'Unknown error' 
      });
      throw new Error(`Failed to update thread: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Deletes a thread by marking it as pending deletion (soft delete).
   */
  async deleteThread(id: string): Promise<void> {
    const database = getDatabase();
    const thread = await this.getThreadById(id);
    if (!thread) return; // No-op for non-existent threads (idempotent)
    
    try {
      await database.write(async () => {
        await thread.update(t => {
          t.status = 'pending_delete';
          t.updatedAt = new Date();
        });
      });
    } catch (error) {
      logger.error('Failed to delete thread', { 
        id, 
        error: error instanceof Error ? error.message : 'Unknown error' 
      });
      throw new Error(`Failed to delete thread: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  /**
   * Creates a new message locally with 'pending_create' status.
   */
  async createMessage(
    threadId: string,
    content: string,
    role: 'user' | 'assistant',
    metadata?: any
  ): Promise<ConversationMessage> {
    const database = getDatabase();
    const userId = this.getCurrentUserId();
    
    try {
      return await database.write(async () => {
    try {
      return await database.write(async () => {
        return await database.get<ConversationMessage>('conversation_messages').create(message => {
          message.threadId = threadId;
          message.userId = userId;
          message.role = role;
          message.content = content;
          if (metadata) {
            try {
              message.metadata = typeof metadata === 'string' ? metadata : JSON.stringify(metadata);
            } catch (jsonError) {
              logger.warn('Failed to stringify metadata, storing as string', { jsonError });
              message.metadata = String(metadata);
            }
          }
          message.status = 'pending_create';
          message.createdAt = new Date();
          message.updatedAt = new Date();
        });
      });
    } catch (error) {
      logger.error('Failed to create message', {
        threadId,
        userId,
        role,
        error: error instanceof Error ? error.message : 'Unknown error'
      });
      throw new Error(`Failed to create message: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }   * Updates an existing message locally with 'pending_update' status.
   * @throws Error - Throws "Message not found" if the message doesn't exist
   */
  async updateMessage(id: string, data: {
    content?: string;
    metadata?: any;
  }): Promise<ConversationMessage> {
    const database = getDatabase();
    try {
      const message = await database.get<ConversationMessage>('conversation_messages').find(id);
      
      return await database.write(async () => {
        return await message.update(m => {
          if (data.content !== undefined) m.content = data.content;
          if (data.metadata !== undefined) {
            m.metadata = typeof data.metadata === 'string' ? data.metadata : JSON.stringify(data.metadata);
          }
          
          // Preserve pending_create for offline-created messages, otherwise mark as pending_update
          const currentStatus = m.status as string;
          if (currentStatus === 'pending_create') {
            m.status = 'pending_create';
          } else {
            m.status = 'pending_update';
          }
          m.updatedAt = new Date();
        });
      });
    } catch (error) {
      if (error instanceof Error && error.message.includes('not found')) {
        throw new Error('Message not found');
      }
      throw error;
    }
  }

  /**
   * Marks a message as synced after successful API sync.
   * Used internally by SyncService.
   */
  async markMessageAsSynced(id: string, serverData?: {
    id?: string;
    createdAt?: Date;
    updatedAt?: Date;
  }): Promise<void> {
    const database = getDatabase();
    try {
      const message = await database.get<ConversationMessage>('conversation_messages').find(id);
      
      await database.write(async () => {
        await message.update(m => {
          m.status = 'synced';
          if (serverData?.createdAt) {
            m.createdAt = serverData.createdAt;
          }
          if (serverData?.updatedAt) {
            m.updatedAt = serverData.updatedAt;
          }
        });
      });
    } catch (error) {
      logger.error('Failed to mark message as synced', { 
        id, 
        error: error instanceof Error ? error.message : 'Unknown error' 
      });
      throw error;
    }
  }

  /**
   * Marks a thread as synced after successful API sync.
   * Used internally by SyncService.
   */
  async markThreadAsSynced(id: string, serverData?: {
    id?: string;
    createdAt?: Date;
    updatedAt?: Date;
  }): Promise<void> {
    const database = getDatabase();
    try {
      const thread = await database.get<ConversationThread>('conversation_threads').find(id);
      
      await database.write(async () => {
        await thread.update(t => {
          t.status = 'synced';
          if (serverData?.createdAt) {
            t.createdAt = serverData.createdAt;
          }
          if (serverData?.updatedAt) {
            t.updatedAt = serverData.updatedAt;
          }
        });
      });
    } catch (error) {
      logger.error('Failed to mark thread as synced', { 
        id, 
        error: error instanceof Error ? error.message : 'Unknown error' 
      });
      throw error;
    }
  }

  /**
   * Updates a thread's server ID after creating it on the server.
   * Used internally by SyncService when a pending_create thread gets a server ID.
   */
  async updateThreadServerId(localId: string, serverId: string): Promise<void> {
    const database = getDatabase();
    try {
      const thread = await database.get<ConversationThread>('conversation_threads').find(localId);
      
      // Note: WatermelonDB doesn't support changing primary key, so we need to:
      // 1. Create new record with server ID
      // 2. Update all messages to point to new thread ID
      // 3. Delete old record
      
      const messages = await this.getMessagesByThreadId(localId);
      
      await database.write(async () => {
        // Create new thread with server ID
        const newThread = await database.get<ConversationThread>('conversation_threads').create(t => {
          t._raw.id = serverId;
          t.userId = thread.userId;
          t.title = thread.title;
          t.summary = thread.summary;
          t.isActive = thread.isActive;
          t.isPinned = thread.isPinned;
          t.status = 'synced';
          t.createdAt = thread.createdAt;
          t.updatedAt = thread.updatedAt;
        });
        
        // Update all messages to point to new thread ID
        for (const message of messages) {
          await message.update(m => {
            m.threadId = serverId;
          });
        }
        
        // Delete old thread record
        await thread.destroyPermanently();
      });
    } catch (error) {
      logger.error('Failed to update thread server ID', { 
        localId, 
        serverId, 
        error: error instanceof Error ? error.message : 'Unknown error' 
      });
      throw error;
    }
  }

  // Observable query helpers for use with withObservables
  observeAllThreads() {
    try {
      const database = getDatabase();
      const userId = this.getCurrentUserId();
      return database.get<ConversationThread>('conversation_threads')
        .query(
          Q.where('user_id', userId),
          Q.where('status', Q.notEq('pending_delete'))
        )
        .observe();
    } catch (error) {
      logger.error('Failed to observe threads', { 
        error: error instanceof Error ? error.message : 'Unknown error' 
      });
      // Return an empty observable to prevent UI crashes
      const database = getDatabase();
      return database.get<ConversationThread>('conversation_threads')
        .query(Q.where('id', '___non_existent___'))
        .observe();
    }
  }
  observeThreadById(id: string) {
    const database = getDatabase();
    return database.get<ConversationThread>('conversation_threads').findAndObserve(id);
  }

  observeMessagesByThreadId(threadId: string) {
    const database = getDatabase();
    return database.get<ConversationMessage>('conversation_messages')
      .query(
        Q.where('thread_id', threadId)
      )
      .observe();
  }
}

export const conversationRepository = new ConversationRepository();

