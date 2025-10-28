import {getDatabase} from '../db';
import {Q} from '@nozbe/watermelondb';
import Task from '../db/models/Task';
import {authService} from '../services/auth';

export class TaskRepository {
  private getCurrentUserId(): string {
    const user = authService.getCurrentUser();
    if (!user?.uid) {
      throw new Error('User not authenticated');
    }
    return user.uid;
  }

  async getAllTasks(): Promise<Task[]> {
    const database = getDatabase();
    const userId = this.getCurrentUserId();
    return await database.get<Task>('tasks')
      .query(
        Q.where('user_id', userId),
        Q.where('status', Q.notEq('pending_delete'))
      )
      .fetch();
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

  async updateTask(id: string, data: {
    title?: string;
    description?: string;
    priority?: string;
    estimatedDurationMinutes?: number;
    dueDate?: Date;
    goalId?: string;
    isTodayFocus?: boolean;
  }): Promise<Task> {
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

  async deleteTask(id: string): Promise<void> {
    const database = getDatabase();
    const task = await this.getTaskById(id);
    if (!task) return;
    
    await database.write(async () => {
      await task.update(t => {
        t.status = 'pending_delete';
        t.updatedAt = new Date();
      });
    });
  }

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
