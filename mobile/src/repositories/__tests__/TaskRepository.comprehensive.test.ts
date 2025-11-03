/// <reference types="jest" />
import { Database } from '@nozbe/watermelondb';
import { Q } from '@nozbe/watermelondb';
import { getDatabase } from '../../db';
import Task from '../../db/models/Task';
import { authService } from '../../services/auth';

// Mock auth service first
jest.mock('../../services/auth', () => ({
  authService: {
    getCurrentUser: jest.fn(() => ({ id: 'test-user-id' })),
  },
}));

// Unmock TaskRepository to use real implementation
jest.unmock('../TaskRepository');
const { taskRepository } = require('../TaskRepository');

describe('TaskRepository Comprehensive Tests', () => {
  let database: Database;
  let mockCollection: any;

  beforeAll(async () => {
    database = getDatabase();
    // Get the mock collection to access its internal tasks array
    mockCollection = (database as any).collections.get('tasks');
  });

  beforeEach(async () => {
    // Clear database before each test
    if (mockCollection._mockTasks) {
      mockCollection._mockTasks.length = 0;
    }
  });

  describe('Task Creation', () => {
    test('creates task with default status (not_started)', async () => {
      const task = await taskRepository.createTask({
        title: 'Test Task',
        description: 'Test Description',
        priority: 'medium',
      });

      expect(task.title).toBe('Test Task');
      expect(task.description).toBe('Test Description');
      expect(task.priority).toBe('medium');
      // Task should have combined status format with lifecycle status
      expect(task.status).toMatch(/pending_create:not_started/);
      expect(task.userId).toBe('test-user-id');
    });

    test('creates task with explicit lifecycle status', async () => {
      const task = await taskRepository.createTask({
        title: 'In Progress Task',
        status: 'in_progress',
      });

      expect(task.status).toBe('pending_create:in_progress');
    });

    test('creates task with completed status', async () => {
      const task = await taskRepository.createTask({
        title: 'Completed Task',
        status: 'completed',
      });

      expect(task.status).toBe('pending_create:completed');
    });

    test('creates task with all fields', async () => {
      const dueDate = new Date('2025-12-31');
      const task = await taskRepository.createTask({
        title: 'Full Task',
        description: 'Full Description',
        priority: 'high',
        estimatedDurationMinutes: 120,
        dueDate,
        goalId: 'goal-123',
        isTodayFocus: true,
        status: 'in_progress',
      });

      expect(task.title).toBe('Full Task');
      expect(task.description).toBe('Full Description');
      expect(task.priority).toBe('high');
      expect(task.estimatedDurationMinutes).toBe(120);
      expect(task.dueDate).toEqual(dueDate);
      expect(task.goalId).toBe('goal-123');
      expect(task.isTodayFocus).toBe(true);
      expect(task.status).toBe('pending_create:in_progress');
    });

    test('rejects invalid due date', async () => {
      await expect(
        taskRepository.createTask({
          title: 'Invalid Date Task',
          dueDate: new Date('invalid'),
        })
      ).rejects.toThrow('Invalid due date');
    });
  });

  describe('Task Updates', () => {
    let testTask: Task;

    beforeEach(async () => {
      testTask = await taskRepository.createTask({
        title: 'Original Task',
        description: 'Original Description',
        priority: 'low',
      });
    });

    test('updates task title', async () => {
      const updated = await taskRepository.updateTask(testTask.id, {
        title: 'Updated Title',
      });

      expect(updated.title).toBe('Updated Title');
      expect(updated.description).toBe('Original Description');
      expect(updated.status).toMatch(/pending_update:/);
    });

    test('updates task with combined status format', async () => {
      // Task starts with pending_create:not_started
      expect(testTask.status).toBe('pending_create:not_started');

      const updated = await taskRepository.updateTask(testTask.id, {
        title: 'Updated Title',
      });

      // Should preserve lifecycle status and add pending_update marker
      expect(updated.status).toBe('pending_update:not_started');
    });

    test('updates task status from combined format', async () => {
      // Start with pending_create:not_started
      const updated1 = await taskRepository.updateTask(testTask.id, {
        title: 'Updated',
      });
      expect(updated1.status).toBe('pending_update:not_started');

      // Update status to completed
      const updated2 = await taskRepository.updateTask(testTask.id, {
        status: 'completed',
      });

      expect(updated2.status).toBe('pending_update:completed');
    });

    test('preserves lifecycle status when updating other fields', async () => {
      // First set status to completed
      await taskRepository.updateTask(testTask.id, {
        status: 'completed',
      });

      // Then update title - should preserve completed status
      const updated = await taskRepository.updateTask(testTask.id, {
        title: 'New Title',
      });

      expect(updated.title).toBe('New Title');
      expect(updated.status).toBe('pending_update:completed');
    });

    test('handles update from synced status', async () => {
      // Manually set status to synced (simulating after sync)
      await database.write(async () => {
        await testTask.update(t => {
          t.status = 'synced';
        });
      });

      const updated = await taskRepository.updateTask(testTask.id, {
        title: 'Updated from synced',
      });

      // Should default to not_started lifecycle status
      expect(updated.status).toBe('pending_update:not_started');
    });

    test('rejects update for non-existent task', async () => {
      await expect(
        taskRepository.updateTask('non-existent-id', {
          title: 'Should Fail',
        })
      ).rejects.toThrow('Task not found');
    });

    test('rejects invalid due date in update', async () => {
      await expect(
        taskRepository.updateTask(testTask.id, {
          dueDate: new Date('invalid'),
        })
      ).rejects.toThrow('Invalid due date');
    });
  });

  describe('Task Status Updates', () => {
    let testTask: Task;

    beforeEach(async () => {
      testTask = await taskRepository.createTask({
        title: 'Status Test Task',
      });
    });

    test('updates status to not_started', async () => {
      const updated = await taskRepository.updateTaskStatus(testTask.id, 'not_started');
      expect(updated.status).toBe('pending_update:not_started');
    });

    test('updates status to in_progress', async () => {
      const updated = await taskRepository.updateTaskStatus(testTask.id, 'in_progress');
      expect(updated.status).toBe('pending_update:in_progress');
    });

    test('updates status to completed', async () => {
      const updated = await taskRepository.updateTaskStatus(testTask.id, 'completed');
      expect(updated.status).toBe('pending_update:completed');
    });

    test('updates status from combined format', async () => {
      // First update to pending_update:in_progress
      await taskRepository.updateTaskStatus(testTask.id, 'in_progress');
      
      // Then update to completed
      const updated = await taskRepository.updateTaskStatus(testTask.id, 'completed');
      expect(updated.status).toBe('pending_update:completed');
    });

    test('preserves lifecycle status when task has combined status', async () => {
      // Set to pending_update:in_progress
      await taskRepository.updateTaskStatus(testTask.id, 'in_progress');
      
      // Update other field - should preserve in_progress status
      const updated = await taskRepository.updateTask(testTask.id, {
        title: 'Updated Title',
      });
      
      expect(updated.status).toBe('pending_update:in_progress');
    });

    test('rejects status update for non-existent task', async () => {
      await expect(
        taskRepository.updateTaskStatus('non-existent-id', 'completed')
      ).rejects.toThrow('Task not found');
    });
  });

  describe('Task Completion', () => {
    let testTask: Task;

    beforeEach(async () => {
      testTask = await taskRepository.createTask({
        title: 'Task to Complete',
      });
    });

    test('completes task', async () => {
      const completed = await taskRepository.completeTask(testTask.id);
      expect(completed.status).toBe('pending_update:completed');
    });

    test('completes task from different statuses', async () => {
      // From not_started
      await taskRepository.completeTask(testTask.id);
      let task = await taskRepository.getTaskById(testTask.id);
      expect(task?.status).toBe('pending_update:completed');

      // Reset to not_started
      await database.write(async () => {
        await task!.update(t => {
          t.status = 'pending_update:not_started';
        });
      });

      // Complete from in_progress
      await taskRepository.updateTaskStatus(testTask.id, 'in_progress');
      const completed = await taskRepository.completeTask(testTask.id);
      expect(completed.status).toBe('pending_update:completed');
    });

    test('rejects completion for non-existent task', async () => {
      await expect(
        taskRepository.completeTask('non-existent-id')
      ).rejects.toThrow('Task not found');
    });
  });

  describe('Focus Task Management', () => {
    let task1: Task;
    let task2: Task;
    let task3: Task;

    beforeEach(async () => {
      task1 = await taskRepository.createTask({
        title: 'Task 1',
      });
      task2 = await taskRepository.createTask({
        title: 'Task 2',
      });
      task3 = await taskRepository.createTask({
        title: 'Task 3',
      });
    });

    test('sets task as focus', async () => {
      const focused = await taskRepository.setTaskAsFocus(task1.id);
      
      expect(focused.isTodayFocus).toBe(true);
      expect(focused.status).toMatch(/pending_update:/);
      
      // Verify task is actually focus
      const retrieved = await taskRepository.getTaskById(task1.id);
      expect(retrieved?.isTodayFocus).toBe(true);
    });

    test('unsets other focus tasks when setting new focus', async () => {
      // Set task1 as focus
      await database.write(async () => {
        await task1.update(t => {
          t.isTodayFocus = true;
          t.status = 'synced';
        });
      });

      // Set task2 as focus
      const focused = await taskRepository.setTaskAsFocus(task2.id);
      
      expect(focused.isTodayFocus).toBe(true);
      
      // Verify task1 is no longer focus
      const retrieved1 = await taskRepository.getTaskById(task1.id);
      expect(retrieved1?.isTodayFocus).toBe(false);
      
      // Verify task2 is focus
      const retrieved2 = await taskRepository.getTaskById(task2.id);
      expect(retrieved2?.isTodayFocus).toBe(true);
    });

    test('preserves lifecycle status when setting focus', async () => {
      // Set task to completed
      await taskRepository.updateTaskStatus(task1.id, 'completed');
      
      // Set as focus
      const focused = await taskRepository.setTaskAsFocus(task1.id);
      
      expect(focused.isTodayFocus).toBe(true);
      expect(focused.status).toBe('pending_update:completed');
    });

    test('preserves lifecycle status when unsetting focus', async () => {
      // Set task1 as completed and focus
      await taskRepository.updateTaskStatus(task1.id, 'completed');
      await database.write(async () => {
        await task1.update(t => {
          t.isTodayFocus = true;
        });
      });

      // Set task2 as focus (this unsets task1)
      await taskRepository.setTaskAsFocus(task2.id);
      
      // Verify task1 is not focus but still completed
      const retrieved1 = await taskRepository.getTaskById(task1.id);
      expect(retrieved1?.isTodayFocus).toBe(false);
      expect(retrieved1?.status).toBe('pending_update:completed');
    });

    test('unsets all focus tasks', async () => {
      // Set multiple tasks as focus
      await database.write(async () => {
        await task1.update(t => {
          t.isTodayFocus = true;
          t.status = 'synced';
        });
        await task2.update(t => {
          t.isTodayFocus = true;
          t.status = 'synced';
        });
      });

      await taskRepository.unsetFocusTasks();
      
      const retrieved1 = await taskRepository.getTaskById(task1.id);
      const retrieved2 = await taskRepository.getTaskById(task2.id);
      
      expect(retrieved1?.isTodayFocus).toBe(false);
      expect(retrieved2?.isTodayFocus).toBe(false);
    });

    test('rejects setting non-existent task as focus', async () => {
      await expect(
        taskRepository.setTaskAsFocus('non-existent-id')
      ).rejects.toThrow('Task not found');
    });
  });

  describe('Task Deletion', () => {
    let testTask: Task;

    beforeEach(async () => {
      testTask = await taskRepository.createTask({
        title: 'Task to Delete',
      });
    });

    test('deletes task by marking as pending_delete', async () => {
      await taskRepository.deleteTask(testTask.id);
      
      const deleted = await taskRepository.getTaskById(testTask.id);
      expect(deleted?.status).toBe('pending_delete');
    });

    test('deletion is idempotent for non-existent task', async () => {
      await expect(
        taskRepository.deleteTask('non-existent-id')
      ).resolves.not.toThrow();
    });

    test('deleted task is excluded from queries', async () => {
      await taskRepository.deleteTask(testTask.id);
      
      const allTasks = await taskRepository.getAllTasks();
      const deletedTask = allTasks.find(t => t.id === testTask.id);
      expect(deletedTask).toBeUndefined();
    });
  });

  describe('Combined Status Format Handling', () => {
    let testTask: Task;

    beforeEach(async () => {
      testTask = await taskRepository.createTask({
        title: 'Status Format Test',
      });
    });

    test('handles pending_create:not_started format', async () => {
      expect(testTask.status).toBe('pending_create:not_started');
      
      const updated = await taskRepository.updateTask(testTask.id, {
        title: 'Updated',
      });
      
      expect(updated.status).toBe('pending_update:not_started');
    });

    test('handles pending_update:in_progress format', async () => {
      await taskRepository.updateTaskStatus(testTask.id, 'in_progress');
      
      const updated = await taskRepository.updateTask(testTask.id, {
        title: 'Updated',
      });
      
      expect(updated.status).toBe('pending_update:in_progress');
    });

    test('handles pending_update:completed format', async () => {
      await taskRepository.updateTaskStatus(testTask.id, 'completed');
      
      const updated = await taskRepository.updateTask(testTask.id, {
        title: 'Updated',
      });
      
      expect(updated.status).toBe('pending_update:completed');
    });

    test('extracts lifecycle status from combined format', async () => {
      // Create with completed status
      const task = await taskRepository.createTask({
        title: 'Completed Task',
        status: 'completed',
      });
      
      expect(task.status).toBe('pending_create:completed');
      
      // Update should preserve completed status
      const updated = await taskRepository.updateTask(task.id, {
        title: 'Updated Completed Task',
      });
      
      expect(updated.status).toBe('pending_update:completed');
    });
  });

  describe('Edge Cases', () => {
    test('handles task with null goalId', async () => {
      const task = await taskRepository.createTask({
        title: 'Task without goal',
        goalId: undefined,
      });
      
      expect(task.goalId).toBeUndefined();
      
      const updated = await taskRepository.updateTask(task.id, {
        goalId: 'new-goal-id',
      });
      
      expect(updated.goalId).toBe('new-goal-id');
    });

    test('handles task with null description', async () => {
      const task = await taskRepository.createTask({
        title: 'Task without description',
        description: undefined,
      });
      
      expect(task.description).toBeUndefined();
    });

    test('handles multiple status updates in sequence', async () => {
      const task = await taskRepository.createTask({
        title: 'Sequential Updates',
      });
      
      await taskRepository.updateTaskStatus(task.id, 'in_progress');
      await taskRepository.updateTaskStatus(task.id, 'completed');
      await taskRepository.updateTaskStatus(task.id, 'not_started');
      
      const final = await taskRepository.getTaskById(task.id);
      expect(final?.status).toBe('pending_update:not_started');
    });

    test('handles focus task changes with status updates', async () => {
      const task = await taskRepository.createTask({
        title: 'Focus with Status',
      });
      
      // Set as focus with completed status
      await taskRepository.updateTaskStatus(task.id, 'completed');
      const focused = await taskRepository.setTaskAsFocus(task.id);
      
      expect(focused.isTodayFocus).toBe(true);
      expect(focused.status).toBe('pending_update:completed');
      
      // Unset focus - should preserve completed status
      await taskRepository.setTaskAsFocus(task.id); // Set again (unsets first)
      await database.write(async () => {
        await task.update(t => {
          t.isTodayFocus = false;
        });
      });
      
      const afterUnset = await taskRepository.getTaskById(task.id);
      expect(afterUnset?.status).toBe('pending_update:completed');
    });
  });

  describe('Query Methods', () => {
    let task1: Task;
    let task2: Task;
    let task3: Task;

    beforeEach(async () => {
      task1 = await taskRepository.createTask({
        title: 'Task 1',
        priority: 'high',
      });
      task2 = await taskRepository.createTask({
        title: 'Task 2',
        priority: 'medium',
      });
      task3 = await taskRepository.createTask({
        title: 'Task 3',
        priority: 'low',
      });
    });

    test('getAllTasks returns all non-deleted tasks', async () => {
      const allTasks = await taskRepository.getAllTasks();
      
      expect(allTasks.length).toBeGreaterThanOrEqual(3);
      const taskIds = allTasks.map(t => t.id);
      expect(taskIds).toContain(task1.id);
      expect(taskIds).toContain(task2.id);
      expect(taskIds).toContain(task3.id);
    });

    test('getAllTasks excludes deleted tasks', async () => {
      await taskRepository.deleteTask(task2.id);
      
      const allTasks = await taskRepository.getAllTasks();
      const taskIds = allTasks.map(t => t.id);
      
      expect(taskIds).toContain(task1.id);
      expect(taskIds).not.toContain(task2.id);
      expect(taskIds).toContain(task3.id);
    });

    test('getTaskById returns task', async () => {
      const task = await taskRepository.getTaskById(task1.id);
      
      expect(task).not.toBeNull();
      expect(task?.id).toBe(task1.id);
      expect(task?.title).toBe('Task 1');
    });

    test('getTaskById returns null for non-existent task', async () => {
      const task = await taskRepository.getTaskById('non-existent-id');
      
      expect(task).toBeNull();
    });
  });
});
