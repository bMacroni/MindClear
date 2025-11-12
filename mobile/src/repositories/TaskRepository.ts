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

  private extractLifecycleStatus(statusStr: string): 'not_started' | 'in_progress' | 'completed' {
    const lifecycleStatuses = ['not_started', 'in_progress', 'completed'] as const;
    type LifecycleStatus = typeof lifecycleStatuses[number];
    const lifecycleStatusesSet = new Set<string>(lifecycleStatuses);
    const syncStatuses = new Set(['pending_create', 'pending_update', 'pending_delete', 'synced']);

    if (!statusStr) {
      return 'not_started';
    }

    if (lifecycleStatusesSet.has(statusStr)) {
      return statusStr as LifecycleStatus;
    }

    if (statusStr.includes(':')) {
      const [, lifecycleStatus] = statusStr.split(':');
      if (lifecycleStatus && lifecycleStatusesSet.has(lifecycleStatus)) {
        return lifecycleStatus as LifecycleStatus;
      }
    }

    if (syncStatuses.has(statusStr)) {
      return 'not_started';
    }

    return 'not_started';
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
    
    const currentLifecycleStatus = this.extractLifecycleStatus(task.status as string);
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
        // Store lifecycle status with sync marker, preserving pending_create for offline-created tasks
        // SyncService will extract lifecycle status during push
        const currentStatus = t.status as string;
        if (currentStatus && currentStatus.startsWith('pending_create:')) {
          t.status = `pending_create:${newLifecycleStatus}`;
        } else {
          t.status = `pending_update:${newLifecycleStatus}`;
        }
        t.updatedAt = new Date();
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
    try {
      // First unset all focus tasks
      await this.unsetFocusTasks();

      // Then set this task as focus
      return await this.updateTask(taskId, { isTodayFocus: true });
    } catch (error) {
      logger.error('Failed to set task as focus', {
        context: 'TaskRepository.setTaskAsFocus',
        taskId,
        error: error instanceof Error
          ? { message: error.message, stack: error.stack }
          : { message: 'Unknown error type' }
      });
      throw error;
    }
  }

  /**
   * Momentum Mode: Find and set the next focus task for today.
   * Replicates backend logic from getNextFocusTask() controller.
   * 
   * Selection criteria:
   * 1. Unset current focus if currentTaskId provided
   * 2. Filter candidates: user's tasks, not completed, not in excludeIds
   * 3. If travelPreference === 'home_only', prefer tasks without location
   * 4. Sort by priority (high > medium > low), then due date (earliest first, nulls last)
   * 5. Select first candidate
   * 6. Ensure estimated_duration_minutes (default to 30 if missing)
   * 7. Set is_today_focus = true and mark for sync
   * 
   * @param options - Selection options
   * @param options.currentTaskId - ID of current focus task to unset (optional)
   * @param options.travelPreference - 'allow_travel' or 'home_only' (optional, defaults to 'allow_travel')
   * @param options.excludeIds - Array of task IDs to exclude (optional)
   * @returns Promise<Task> - The selected and updated focus task
   * @throws Error - If no matching task found (message: 'No other tasks match your criteria.')
   */
  async getNextFocusTask(options: {
    currentTaskId?: string | null;
    travelPreference?: 'allow_travel' | 'home_only';
    excludeIds?: string[];
  }): Promise<Task> {
    const database = getDatabase();
    const userId = this.getCurrentUserId();
    const { currentTaskId, travelPreference = 'allow_travel', excludeIds = [] } = options;

    return await database.write(async () => {
      // Step 1: Unset current focus if provided (inline to avoid nested writes)
      if (currentTaskId) {
        const focusTasks = await database.get<Task>('tasks')
          .query(
            Q.where('user_id', userId),
            Q.where('is_today_focus', true),
            Q.where('status', Q.notEq('pending_delete'))
          )
          .fetch();

        for (const task of focusTasks) {
          const currentLifecycleStatus = this.extractLifecycleStatus(task.status as string);
          await task.update(t => {
            t.isTodayFocus = false;
            // Preserve lifecycle status while marking for sync, preserving pending_create for offline-created tasks
            const currentStatus = t.status as string;
            if (currentStatus && currentStatus.startsWith('pending_create:')) {
              t.status = `pending_create:${currentLifecycleStatus}`;
            } else {
              t.status = `pending_update:${currentLifecycleStatus}`;
            }
            t.updatedAt = new Date();
          });
        }
      }

      // Step 2: Fetch candidate tasks
      // WatermelonDB doesn't support complex OR conditions, so we'll fetch and filter in JavaScript
      let candidates = await database.get<Task>('tasks')
        .query(
          Q.where('user_id', userId),
          Q.where('status', Q.notEq('pending_delete'))
        )
        .fetch();

      // Step 3: Filter candidates in JavaScript
      candidates = candidates.filter(task => {
        // Exclude completed tasks (extract lifecycle status from combined format)
        const lifecycleStatus = this.extractLifecycleStatus(task.status as string);
        if (lifecycleStatus === 'completed') {
          return false;
        }

        // Exclude tasks in excludeIds
        if (excludeIds.includes(task.id)) {
          return false;
        }

        // Exclude current task if provided (already unset, but don't select it)
        if (currentTaskId && task.id === currentTaskId) {
          return false;
        }

        return true;
      });

      // Step 4: Sort candidates
      // Priority mapping: high=3, medium=2, low=1, undefined/null=0
      const priorityMap: Record<string, number> = {
        'high': 3,
        'medium': 2,
        'low': 1,
      };

      candidates.sort((a, b) => {
        // Primary sort: Priority (descending - higher priority first)
        const aPriority = priorityMap[a.priority || ''] || 0;
        const bPriority = priorityMap[b.priority || ''] || 0;
        if (aPriority !== bPriority) {
          return bPriority - aPriority; // Descending
        }

        // Secondary sort: Due date (ascending - earliest first, nulls last)
        const aDueDate = a.dueDate?.getTime() ?? Number.MAX_SAFE_INTEGER;
        const bDueDate = b.dueDate?.getTime() ?? Number.MAX_SAFE_INTEGER;
        return aDueDate - bDueDate;
      });

      // Step 5: Apply travel preference (if home_only)
      // Filter out tasks with non-empty location (exclude tasks that require travel)
      if (travelPreference === 'home_only') {
        candidates = candidates.filter(t => !t.location || t.location.trim() === '');
        // Preserve existing priority/due-date ordering (already sorted in Step 4)
        // If candidates array is empty after filtering, Step 6 will handle the error
      }

      // Step 6: Select first candidate
      if (candidates.length === 0) {
        throw new Error('No other tasks match your criteria.');
      }

      const next = candidates[0];

      // Step 7: Ensure estimated duration (default to 30 if missing or invalid)
      const ensureDuration = (task: Task): number => {
        const duration = task.estimatedDurationMinutes;
        return (Number.isFinite(duration) && duration && duration > 0) ? duration : 30;
      };

      // Step 8: Update task as focus
      const currentLifecycleStatus = this.extractLifecycleStatus(next.status as string);
      const updatedTask = await next.update(t => {
        t.isTodayFocus = true;
        t.estimatedDurationMinutes = ensureDuration(next);
        // Preserve lifecycle status while marking for sync, preserving pending_create for offline-created tasks
        const currentStatus = t.status as string;
        if (currentStatus && currentStatus.startsWith('pending_create:')) {
          t.status = `pending_create:${currentLifecycleStatus}`;
        } else {
          t.status = `pending_update:${currentLifecycleStatus}`;
        }
        t.updatedAt = new Date();
      });

      return updatedTask;
    });
  }

  /**
   * Unsets all tasks as today's focus.
   * @returns Promise<void>
   */
  async unsetFocusTasks(): Promise<void> {
    const database = getDatabase();
    const userId = this.getCurrentUserId();
    
    try {
      const focusTasks = await database.get<Task>('tasks')
        .query(
          Q.where('user_id', userId),
          Q.where('is_today_focus', true),
          Q.where('status', Q.notEq('pending_delete'))
        )
        .fetch();

      if (!focusTasks.length) {
        return;
      }

      await database.write(async () => {
        for (const task of focusTasks) {
          const currentLifecycleStatus = this.extractLifecycleStatus(task.status as string);

          await task.update(t => {
            t.isTodayFocus = false;
            // Preserve lifecycle status while marking for sync, preserving pending_create for offline-created tasks
            const currentStatus = t.status as string;
            if (currentStatus && currentStatus.startsWith('pending_create:')) {
              t.status = `pending_create:${currentLifecycleStatus}`;
            } else {
              t.status = `pending_update:${currentLifecycleStatus}`;
            }
            t.updatedAt = new Date();
          });
        }
      });
    } catch (error) {
      logger.error('[TaskRepository] Failed to unset focus tasks', {
        operation: 'unsetFocusTasks',
        userId,
        error: error instanceof Error ? error.message : 'Unknown error'
      });
      throw error;
    }
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

  /**
   * Updates a task's server ID after creating it on the server.
   * Used internally by SyncService when a pending_create task gets a server ID.
   * Migrates the local task ID to match the server ID and updates any related calendar events.
   */
  async updateTaskServerId(localId: string, serverId: string): Promise<void> {
    const database = getDatabase();
    try {
      const localTask = await this.getTaskById(localId);
      if (!localTask) {
        throw new Error(`Task with local ID ${localId} not found`);
      }

      // Find any calendar events that reference this task
      const calendarEvents = await database.get('calendar_events')
        .query(Q.where('task_id', localId))
        .fetch();

      await database.write(async () => {
        const lifecycleStatus = this.extractLifecycleStatus(localTask.status as string);

        // Create new task with server ID
        const newTask = await database.get<Task>('tasks').create(t => {
          t._raw.id = serverId;
          t._raw._status = 'synced';
          t._raw._changed = '';
          t.title = localTask.title;
          t.description = localTask.description;
          t.priority = localTask.priority;
          t.estimatedDurationMinutes = localTask.estimatedDurationMinutes;
          t.dueDate = localTask.dueDate;
          t.goalId = localTask.goalId;
          t.isTodayFocus = localTask.isTodayFocus;
          t.autoScheduleEnabled = localTask.autoScheduleEnabled;
          t.category = localTask.category;
          t.location = localTask.location;
          t.calendarEventId = localTask.calendarEventId;
          t.userId = localTask.userId;
          t.status = 'synced';
          t.createdAt = localTask.createdAt;
          t.updatedAt = localTask.updatedAt;
        });

        // Update all calendar events to point to new task ID
        for (const event of calendarEvents) {
          await event.update((e: any) => {
            e.taskId = serverId;
          });
        }

        // Delete old task record
        await localTask.destroyPermanently();
      });
    } catch (error) {
      logger.error('Failed to update task server ID', {
        localId,
        serverId,
        error: error instanceof Error ? error.message : 'Unknown error'
      });
      throw error;
    }
  }
}

export const taskRepository = new TaskRepository();
