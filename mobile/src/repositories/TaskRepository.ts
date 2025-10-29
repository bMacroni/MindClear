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
  }): Promise<Task> {
    // Validate date if provided
    if (data.dueDate && isNaN(data.dueDate.getTime())) {
      throw new Error('Invalid due date provided. Date must be a valid Date object.');
    }

    const database = getDatabase();
    const userId = this.getCurrentUserId();
    
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
        task.status = 'pending_create';
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
  }): Promise<Task> {
    // Validate date if provided
    if (data.dueDate && isNaN(data.dueDate.getTime())) {
      throw new Error('Invalid due date provided. Date must be a valid Date object.');
    }

    const database = getDatabase();
    const task = await this.getTaskById(id);
    if (!task) throw new Error('Task not found');
    
    return await database.write(async () => {
      return await task.update(t => {
        if (data.title !== undefined) t.title = data.title;
        if (data.description !== undefined) t.description = data.description;
        if (data.priority !== undefined) t.priority = data.priority;
        if (data.estimatedDurationMinutes !== undefined) t.estimatedDurationMinutes = data.estimatedDurationMinutes;
        if (data.dueDate !== undefined) t.dueDate = data.dueDate;
        if (data.goalId !== undefined) t.goalId = data.goalId;
        if (data.isTodayFocus !== undefined) t.isTodayFocus = data.isTodayFocus;
        t.status = 'pending_update';
        t.updatedAt = new Date();
      });
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
   * Completes a task by updating its status.
   * @param id - The ID of the task to complete
   * @returns Promise<Task> - The completed task
   * @throws Error - Throws "Task not found" if the task doesn't exist
   */
  async completeTask(id: string): Promise<Task> {
    const database = getDatabase();
    const task = await this.getTaskById(id);
    if (!task) throw new Error('Task not found');
    
    return await database.write(async () => {
      return await task.update(t => {
        t.status = 'pending_update';
        t.updatedAt = new Date();
        // Note: The actual completion logic would depend on your business rules
        // This might involve updating a completion field or changing status
      });
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
