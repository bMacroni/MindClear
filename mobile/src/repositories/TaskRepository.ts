import {getDatabase} from '../db';
import {Q} from '@nozbe/watermelondb';
import Task from '../db/models/Task';
import {authService} from '../services/auth';
import logger from '../utils/logger';

/**
 * TaskRepository handles all task-related database operations.
 * 
 * Behavioral Contract:
 * - All operations that modify tasks (updateTask, deleteTask, completeTask) will throw
 *   "Task not found" error if the specified task ID doesn't exist
 * - This ensures consistent error handling across all modification operations
 * - Read operations (getTaskById) return null for non-existent tasks
 */
export class TaskRepository {
  private getCurrentUserId(): string {
    const user = authService.getCurrentUser();
    if (!user?.id) {
      throw new Error('User not authenticated');
    }
    return user.id;
  }

  async getAllTasks(): Promise<Task[]> {
    try {
      const database = getDatabase();
      const userId = this.getCurrentUserId();
      return await database.get<Task>('tasks')
        .query(
          Q.where('user_id', userId),
          Q.where('status', Q.notEq('pending_delete'))
        )
        .fetch();
    } catch (error) {
      logger.error('Failed to fetch all tasks', { error: error instanceof Error ? error.message : 'Unknown error' });
      return [];
    }
  }

  async getTaskById(id: string): Promise<Task | null> {
    const database = getDatabase();
    try {
      return await database.get<Task>('tasks').find(id);
    } catch {
      return null;
    }
  }

  async createTask(data: {
    title: string;
    description?: string;
    priority?: string;
    estimatedDurationMinutes?: number;
    dueDate?: Date;
    goalId?: string;
    isTodayFocus?: boolean;
    status?: 'not_started' | 'in_progress' | 'completed'; // Lifecycle status
  }): Promise<Task> {
    // Validate date if provided
    if (data.dueDate && isNaN(data.dueDate.getTime())) {
      throw new Error('Invalid due date provided. Date must be a valid Date object.');
    }

    const database = getDatabase();
    const userId = this.getCurrentUserId();
    const lifecycleStatus = data.status || 'not_started';
    
    return await database.write(async () => {
      return await database.get<Task>('tasks').create(task => {
        task.title = data.title;
        task.description = data.description;
        task.priority = data.priority;
        task.estimatedDurationMinutes = data.estimatedDurationMinutes;
        task.dueDate = data.dueDate;
        task.goalId = data.goalId;
        task.isTodayFocus = data.isTodayFocus;
        task.userId = userId;
        // Store lifecycle status with sync marker: "pending_create:<lifecycle_status>"
        task.status = `pending_create:${lifecycleStatus}`;
        task.createdAt = new Date();
        task.updatedAt = new Date();
      });
    });
  }

  /**
   * Updates an existing task with the provided data.
   * @param id - The ID of the task to update
   * @param data - The data to update the task with
   * @returns Promise<Task> - The updated task
   * @throws Error - Throws "Task not found" if the task doesn't exist
   */
  async updateTask(id: string, data: {
    title?: string;
    description?: string;
    priority?: string;
    estimatedDurationMinutes?: number;
    dueDate?: Date;
    goalId?: string;
    isTodayFocus?: boolean;
    status?: 'not_started' | 'in_progress' | 'completed'; // Lifecycle status
  }): Promise<Task> {
    // Validate date if provided
    if (data.dueDate && isNaN(data.dueDate.getTime())) {
      throw new Error('Invalid due date provided. Date must be a valid Date object.');
    }

    const database = getDatabase();
    const task = await this.getTaskById(id);
    if (!task) throw new Error('Task not found');
    
    // Extract current lifecycle status if it exists, or default to 'not_started'
    // Status field can contain either lifecycle status or sync status or combined format
    const lifecycleStatuses = ['not_started', 'in_progress', 'completed'];
    const syncStatuses = ['pending_create', 'pending_update', 'pending_delete', 'synced'];
    
    // Determine current lifecycle status from task.status
    // Handle combined format like "pending_update:completed"
    let currentLifecycleStatus: 'not_started' | 'in_progress' | 'completed' = 'not_started';
    const statusStr = task.status as string;
    
    if (lifecycleStatuses.includes(statusStr)) {
      // Direct lifecycle status
      currentLifecycleStatus = statusStr as 'not_started' | 'in_progress' | 'completed';
    } else if (statusStr.includes(':')) {
      // Combined format: "pending_update:completed" or "pending_create:not_started"
      const parts = statusStr.split(':');
      if (parts.length > 1 && lifecycleStatuses.includes(parts[1])) {
        currentLifecycleStatus = parts[1] as 'not_started' | 'in_progress' | 'completed';
      }
    } else if (syncStatuses.includes(statusStr)) {
      // Pure sync status without lifecycle info, use default
      currentLifecycleStatus = 'not_started';
    }
    
    // Use provided status or preserve current
    const newLifecycleStatus = data.status || currentLifecycleStatus;
    
    return await database.write(async () => {
      const updatedTask = await task.update(t => {
        if (data.title !== undefined) t.title = data.title;
        if (data.description !== undefined) t.description = data.description;
        if (data.priority !== undefined) t.priority = data.priority;
        if (data.estimatedDurationMinutes !== undefined) t.estimatedDurationMinutes = data.estimatedDurationMinutes;
        if (data.dueDate !== undefined) t.dueDate = data.dueDate;
        if (data.goalId !== undefined) t.goalId = data.goalId;
        if (data.isTodayFocus !== undefined) t.isTodayFocus = data.isTodayFocus;
        // Store lifecycle status with sync marker: "pending_update:<lifecycle_status>"
        // SyncService will extract lifecycle status during push
        const newStatus = `pending_update:${newLifecycleStatus}`;
        console.log('[TaskRepository] Updating task status', { 
          taskId: task.id, 
          oldStatus: task.status, 
          newLifecycleStatus, 
          newStatus 
        });
        t.status = newStatus;
        t.updatedAt = new Date();
      });
      
      // Verify the update after the transaction completes
      console.log('[TaskRepository] Update transaction completed', {
        taskId: updatedTask.id,
        newStatus: updatedTask.status,
        updatedAt: updatedTask.updatedAt
      });
      
      return updatedTask;
    });
  }

  /**
   * Deletes a task by marking it as pending deletion.
   * @param id - The ID of the task to delete
   * @returns Promise<void>
   */
  async deleteTask(id: string): Promise<void> {
    const database = getDatabase();
    const task = await this.getTaskById(id);
    if (!task) return; // No-op for non-existent tasks (idempotent)
    
    await database.write(async () => {
      await task.update(t => {
        t.status = 'pending_delete';
        t.updatedAt = new Date();
      });
    });
  }

  /**
   * Updates task lifecycle status.
   * @param id - The ID of the task to update
   * @param status - The new lifecycle status
   * @returns Promise<Task> - The updated task
   * @throws Error - Throws "Task not found" if the task doesn't exist
   */
  async updateTaskStatus(
    id: string,
    status: 'not_started' | 'in_progress' | 'completed'
  ): Promise<Task> {
    const database = getDatabase();
    const task = await this.getTaskById(id);
    if (!task) throw new Error('Task not found');
    
    return await this.updateTask(id, { status });
  }

  /**
   * Completes a task by updating its status.
   * @param id - The ID of the task to complete
   * @returns Promise<Task> - The completed task
   * @throws Error - Throws "Task not found" if the task doesn't exist
   */
  async completeTask(id: string): Promise<Task> {
    return await this.updateTaskStatus(id, 'completed');
  }

  /**
   * Sets a task as today's focus, unsetting any other focus tasks.
   * @param taskId - The ID of the task to set as focus
   * @returns Promise<Task> - The updated task
   * @throws Error - Throws "Task not found" if the task doesn't exist
   */
  async setTaskAsFocus(taskId: string): Promise<Task> {
    // First unset all focus tasks
    await this.unsetFocusTasks();
    
    // Then set this task as focus
    return await this.updateTask(taskId, { isTodayFocus: true });
  }

  /**
   * Unsets all tasks as today's focus.
   * @returns Promise<void>
   */
  async unsetFocusTasks(): Promise<void> {
    const database = getDatabase();
    const userId = this.getCurrentUserId();
    
    const focusTasks = await database.get<Task>('tasks')
      .query(
        Q.where('user_id', userId),
        Q.where('is_today_focus', true),
        Q.where('status', Q.notEq('pending_delete'))
      )
      .fetch();
    
    await database.write(async () => {
      for (const task of focusTasks) {
        // Extract lifecycle status before updating
        const lifecycleStatuses = ['not_started', 'in_progress', 'completed'];
        let currentLifecycleStatus = 'not_started';
        const statusStr = task.status as string;
        if (lifecycleStatuses.includes(statusStr)) {
          currentLifecycleStatus = statusStr;
        } else if (statusStr.includes(':')) {
          const parts = statusStr.split(':');
          if (parts.length > 1 && lifecycleStatuses.includes(parts[1])) {
            currentLifecycleStatus = parts[1];
          }
        }
        
        await task.update(t => {
          t.isTodayFocus = false;
          // Preserve lifecycle status while marking for sync
          t.status = `pending_update:${currentLifecycleStatus}`;
          t.updatedAt = new Date();
        });
      }
    });
  }

  // Observable query helpers for use with withObservables
  observeAllTasks() {
    const database = getDatabase();
    const userId = this.getCurrentUserId();
    return database.get<Task>('tasks')
      .query(
        Q.where('user_id', userId),
        Q.where('status', Q.notEq('pending_delete'))
      )
      .observe();
  }

  observeTaskById(id: string) {
    const database = getDatabase();
    return database.get<Task>('tasks').findAndObserve(id);
  }

  observeTasksByGoal(goalId: string) {
    const database = getDatabase();
    const userId = this.getCurrentUserId();
    return database.get<Task>('tasks')
      .query(
        Q.where('user_id', userId),
        Q.where('goal_id', goalId),
        Q.where('status', Q.notEq('pending_delete'))
      )
      .observe();
  }

  observeTodayFocusTasks() {
    const database = getDatabase();
    const userId = this.getCurrentUserId();
    return database.get<Task>('tasks')
      .query(
        Q.where('user_id', userId),
        Q.where('is_today_focus', true),
        Q.where('status', Q.notEq('pending_delete'))
      )
      .observe();
  }
}

export const taskRepository = new TaskRepository();
