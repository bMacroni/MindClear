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

describe('TaskRepository.getNextFocusTask()', () => {
  let database: Database;
  let mockCollection: any;

  beforeAll(async () => {
    try {
      database = getDatabase();
      // Get the mock collection to access its internal tasks array
      mockCollection = (database as any).collections.get('tasks');
    } catch (error) {
      throw new Error(`Failed to initialize test database: ${error instanceof Error ? error.message : String(error)}`);
    }
  });
  beforeEach(async () => {
    // Clear database before each test
    if (mockCollection._mockTasks) {
      mockCollection._mockTasks.length = 0;
    }
  });

  describe('Basic Selection', () => {
    test('selects highest priority task', async () => {
      // Create tasks with different priorities
      await taskRepository.createTask({
        title: 'Low Priority Task',
        priority: 'low',
        status: 'not_started',
      });
      await taskRepository.createTask({
        title: 'High Priority Task',
        priority: 'high',
        status: 'not_started',
      });
      await taskRepository.createTask({
        title: 'Medium Priority Task',
        priority: 'medium',
        status: 'not_started',
      });

      const next = await taskRepository.getNextFocusTask({});

      expect(next.title).toBe('High Priority Task');
      expect(next.isTodayFocus).toBe(true);
    });

    test('selects earliest due date when priorities are equal', async () => {
      const today = new Date();
      const tomorrow = new Date(today);
      tomorrow.setDate(tomorrow.getDate() + 1);
      const nextWeek = new Date(today);
      nextWeek.setDate(nextWeek.getDate() + 7);

      await taskRepository.createTask({
        title: 'Task Next Week',
        priority: 'medium',
        dueDate: nextWeek,
        status: 'not_started',
      });
      await taskRepository.createTask({
        title: 'Task Tomorrow',
        priority: 'medium',
        dueDate: tomorrow,
        status: 'not_started',
      });
      await taskRepository.createTask({
        title: 'Task Today',
        priority: 'medium',
        dueDate: today,
        status: 'not_started',
      });

      const next = await taskRepository.getNextFocusTask({});

      expect(next.title).toBe('Task Today');
      expect(next.isTodayFocus).toBe(true);
    });

    test('handles null due dates correctly (nulls last)', async () => {
      const today = new Date();

      await taskRepository.createTask({
        title: 'Task With No Due Date',
        priority: 'medium',
        dueDate: undefined,
        status: 'not_started',
      });
      await taskRepository.createTask({
        title: 'Task With Due Date',
        priority: 'medium',
        dueDate: today,
        status: 'not_started',
      });

      const next = await taskRepository.getNextFocusTask({});

      expect(next.title).toBe('Task With Due Date');
    });

    test('sorts by priority first, then due date', async () => {
      const today = new Date();
      const tomorrow = new Date(today);
      tomorrow.setDate(tomorrow.getDate() + 1);

      // Medium priority with earlier due date
      await taskRepository.createTask({
        title: 'Medium Early',
        priority: 'medium',
        dueDate: today,
        status: 'not_started',
      });
      // High priority with later due date
      await taskRepository.createTask({
        title: 'High Late',
        priority: 'high',
        dueDate: tomorrow,
        status: 'not_started',
      });

      const next = await taskRepository.getNextFocusTask({});

      // High priority should win even with later due date
      expect(next.title).toBe('High Late');
    });
  });

  describe('Travel Preference', () => {
    test('allow_travel includes all tasks', async () => {
      await taskRepository.createTask({
        title: 'Task With Location',
        priority: 'high',
        location: 'Office',
        status: 'not_started',
      });
      await taskRepository.createTask({
        title: 'Task Without Location',
        priority: 'high',
        location: undefined,
        status: 'not_started',
      });

      const next = await taskRepository.getNextFocusTask({
        travelPreference: 'allow_travel',
      });

      // Should select first task (both have same priority, order may vary)
      expect(next.isTodayFocus).toBe(true);
    });

    test('home_only prefers tasks without location', async () => {
      await taskRepository.createTask({
        title: 'Task With Location',
        priority: 'high',
        location: 'Office',
        status: 'not_started',
      });
      await taskRepository.createTask({
        title: 'Task Without Location',
        priority: 'high',
        location: undefined,
        status: 'not_started',
      });

      const next = await taskRepository.getNextFocusTask({
        travelPreference: 'home_only',
      });

      // Should prefer task without location
      expect(next.title).toBe('Task Without Location');
      expect(next.isTodayFocus).toBe(true);
    });

    test('home_only still includes tasks with location if no alternatives', async () => {
      await taskRepository.createTask({
        title: 'Only Task With Location',
        priority: 'high',
        location: 'Office',
        status: 'not_started',
      });

      const next = await taskRepository.getNextFocusTask({
        travelPreference: 'home_only',
      });

      // Should still select the task even though it has location
      expect(next.title).toBe('Only Task With Location');
      expect(next.isTodayFocus).toBe(true);
    });

    test('home_only handles empty string location as no location', async () => {
      await taskRepository.createTask({
        title: 'Task With Empty Location',
        priority: 'high',
        location: '',
        status: 'not_started',
      });
      await taskRepository.createTask({
        title: 'Task With Location',
        priority: 'high',
        location: 'Office',
        status: 'not_started',
      });

      const next = await taskRepository.getNextFocusTask({
        travelPreference: 'home_only',
      });

      // Should prefer task with empty location
      expect(next.title).toBe('Task With Empty Location');
    });
  });

  describe('Exclusion', () => {
    test('excludes tasks in excludeIds', async () => {
      const task1 = await taskRepository.createTask({
        title: 'Task 1',
        priority: 'high',
        status: 'not_started',
      });
      const task2 = await taskRepository.createTask({
        title: 'Task 2',
        priority: 'high',
        status: 'not_started',
      });

      const next = await taskRepository.getNextFocusTask({
        excludeIds: [task1.id],
      });

      // Should select task2, not task1
      expect(next.id).toBe(task2.id);
      expect(next.title).toBe('Task 2');
    });

    test('excludes multiple tasks', async () => {
      const task1 = await taskRepository.createTask({
        title: 'Task 1',
        priority: 'high',
        status: 'not_started',
      });
      const task2 = await taskRepository.createTask({
        title: 'Task 2',
        priority: 'high',
        status: 'not_started',
      });
      const task3 = await taskRepository.createTask({
        title: 'Task 3',
        priority: 'high',
        status: 'not_started',
      });

      const next = await taskRepository.getNextFocusTask({
        excludeIds: [task1.id, task2.id],
      });

      // Should select task3
      expect(next.id).toBe(task3.id);
      expect(next.title).toBe('Task 3');
    });
  });

  describe('Current Task Handling', () => {
    test('unsets current focus task when currentTaskId provided', async () => {
      const currentFocus = await taskRepository.createTask({
        title: 'Current Focus',
        priority: 'high',
        isTodayFocus: true,
        status: 'not_started',
      });
      await taskRepository.createTask({
        title: 'Next Task',
        priority: 'high',
        status: 'not_started',
      });

      const next = await taskRepository.getNextFocusTask({
        currentTaskId: currentFocus.id,
      });

      // Verify current focus was unset
      const updatedCurrent = await taskRepository.getTaskById(currentFocus.id);
      expect(updatedCurrent?.isTodayFocus).toBe(false);

      // Verify new focus was set
      expect(next.title).toBe('Next Task');
      expect(next.isTodayFocus).toBe(true);
    });

    test('does not select current task as next', async () => {
      const currentFocus = await taskRepository.createTask({
        title: 'Current Focus',
        priority: 'high',
        isTodayFocus: true,
        status: 'not_started',
      });
      await taskRepository.createTask({
        title: 'Next Task',
        priority: 'medium',
        status: 'not_started',
      });

      const next = await taskRepository.getNextFocusTask({
        currentTaskId: currentFocus.id,
      });

      // Should select next task, not current
      expect(next.id).not.toBe(currentFocus.id);
      expect(next.title).toBe('Next Task');
    });
  });

  describe('Edge Cases', () => {
    test('throws error when no candidates found', async () => {
      // Create no tasks
      await expect(
        taskRepository.getNextFocusTask({})
      ).rejects.toThrow('No other tasks match your criteria.');
    });

    test('throws error when all tasks are completed', async () => {
      await taskRepository.createTask({
        title: 'Completed Task 1',
        priority: 'high',
        status: 'completed',
      });
      await taskRepository.createTask({
        title: 'Completed Task 2',
        priority: 'medium',
        status: 'completed',
      });

      await expect(
        taskRepository.getNextFocusTask({})
      ).rejects.toThrow('No other tasks match your criteria.');
    });

    test('throws error when all tasks are excluded', async () => {
      const task1 = await taskRepository.createTask({
        title: 'Task 1',
        priority: 'high',
        status: 'not_started',
      });
      const task2 = await taskRepository.createTask({
        title: 'Task 2',
        priority: 'medium',
        status: 'not_started',
      });

      await expect(
        taskRepository.getNextFocusTask({
          excludeIds: [task1.id, task2.id],
        })
      ).rejects.toThrow('No other tasks match your criteria.');
    });

    test('handles tasks with pending_delete status (excluded)', async () => {
      // Create a task and then mark it as deleted
      const deletedTask = await taskRepository.createTask({
        title: 'Deleted Task',
        priority: 'high',
        status: 'not_started',
      });
      // Mark it as deleted
      await taskRepository.deleteTask(deletedTask.id);
      
      await taskRepository.createTask({
        title: 'Valid Task',
        priority: 'medium',
        status: 'not_started',
      });

      const next = await taskRepository.getNextFocusTask({});

      // Should select valid task, not deleted one
      // Note: The query filters pending_delete, but in test mocks this might not work perfectly
      // The actual implementation correctly filters pending_delete tasks
      expect(next.title).toBe('Valid Task');
    });
  });

  describe('Focus Update Behavior', () => {
    test('sets isTodayFocus to true', async () => {
      await taskRepository.createTask({
        title: 'Task',
        priority: 'high',
        status: 'not_started',
      });

      const next = await taskRepository.getNextFocusTask({});

      expect(next.isTodayFocus).toBe(true);
    });

    test('ensures estimated duration (defaults to 30 if missing)', async () => {
      await taskRepository.createTask({
        title: 'Task Without Duration',
        priority: 'high',
        estimatedDurationMinutes: undefined,
        status: 'not_started',
      });

      const next = await taskRepository.getNextFocusTask({});

      expect(next.estimatedDurationMinutes).toBe(30);
    });

    test('preserves existing estimated duration if valid', async () => {
      await taskRepository.createTask({
        title: 'Task With Duration',
        priority: 'high',
        estimatedDurationMinutes: 60,
        status: 'not_started',
      });

      const next = await taskRepository.getNextFocusTask({});

      expect(next.estimatedDurationMinutes).toBe(60);
    });

    test('defaults to 30 if estimated duration is 0', async () => {
      await taskRepository.createTask({
        title: 'Task With Zero Duration',
        priority: 'high',
        estimatedDurationMinutes: 0,
        status: 'not_started',
      });

      const next = await taskRepository.getNextFocusTask({});

      expect(next.estimatedDurationMinutes).toBe(30);
    });

    test('defaults to 30 if estimated duration is negative', async () => {
      await taskRepository.createTask({
        title: 'Task With Negative Duration',
        priority: 'high',
        estimatedDurationMinutes: -10,
        status: 'not_started',
      });

      const next = await taskRepository.getNextFocusTask({});

      expect(next.estimatedDurationMinutes).toBe(30);
    });

    test('preserves sync status format when updating focus', async () => {
      const task = await taskRepository.createTask({
        title: 'Task',
        priority: 'high',
        status: 'not_started',
      });

      // Task starts with pending_create status
      expect(task.status).toMatch(/pending_create:/);

      const next = await taskRepository.getNextFocusTask({});

      // Should preserve pending_create status for newly created tasks
      // This is correct behavior - newly created tasks keep pending_create until synced
      expect(next.status).toMatch(/pending_create:/);
    });

    test('preserves pending_create status for offline-created tasks', async () => {
      const task = await taskRepository.createTask({
        title: 'Offline Task',
        priority: 'high',
        status: 'not_started',
      });

      // Verify it has pending_create status
      expect(task.status).toMatch(/pending_create:/);

      const next = await taskRepository.getNextFocusTask({});

      // Should preserve pending_create status (not change to pending_update)
      expect(next.status).toMatch(/pending_create:/);
      expect(next.status).not.toMatch(/pending_update:/);
    });
  });

  describe('Lifecycle Status Handling', () => {
    test('excludes completed tasks', async () => {
      await taskRepository.createTask({
        title: 'Completed Task',
        priority: 'high',
        status: 'completed',
      });
      await taskRepository.createTask({
        title: 'In Progress Task',
        priority: 'medium',
        status: 'in_progress',
      });

      const next = await taskRepository.getNextFocusTask({});

      expect(next.title).toBe('In Progress Task');
    });

    test('handles combined status format (pending_update:completed)', async () => {
      // Create a task with combined status format
      const task = await taskRepository.createTask({
        title: 'Completed Task',
        priority: 'high',
        status: 'completed',
      });
      // Manually set combined status to simulate sync state
      await taskRepository.updateTask(task.id, { status: 'completed' });
      const updatedTask = await taskRepository.getTaskById(task.id);
      // The update should have created pending_update:completed (or pending_create if still unsynced)
      // Newly created tasks keep pending_create until first sync
      expect(updatedTask?.status).toMatch(/pending_(create|update):completed/);

      await taskRepository.createTask({
        title: 'Not Started Task',
        priority: 'medium',
        status: 'not_started',
      });

      const next = await taskRepository.getNextFocusTask({});

      // Should select not started task, not completed one
      expect(next.title).toBe('Not Started Task');
    });
  });

  describe('Complex Scenarios', () => {
    test('combines all filters correctly', async () => {
      const today = new Date();
      const tomorrow = new Date(today);
      tomorrow.setDate(tomorrow.getDate() + 1);

      // Create various tasks
      const exclude1 = await taskRepository.createTask({
        title: 'Excluded High Priority',
        priority: 'high',
        dueDate: today,
        status: 'not_started',
      });
      await taskRepository.createTask({
        title: 'Completed High Priority',
        priority: 'high',
        dueDate: today,
        status: 'completed',
      });
      await taskRepository.createTask({
        title: 'Task With Location',
        priority: 'high',
        dueDate: today,
        location: 'Office',
        status: 'not_started',
      });
      const expected = await taskRepository.createTask({
        title: 'Best Candidate',
        priority: 'high',
        dueDate: today,
        location: undefined,
        status: 'not_started',
      });

      const next = await taskRepository.getNextFocusTask({
        travelPreference: 'home_only',
        excludeIds: [exclude1.id],
      });

      // Should select best candidate (high priority, no location, not excluded, not completed)
      // With home_only preference, should prefer task without location
      expect(next.title).toBe('Best Candidate');
      expect(next.id).toBe(expected.id);
      // Verify it's not the task with location
      expect(next.location).toBeUndefined();
    });

    test('handles multiple tasks with same priority and due date', async () => {
      const today = new Date();

      await taskRepository.createTask({
        title: 'Task A',
        priority: 'high',
        dueDate: today,
        status: 'not_started',
      });
      await taskRepository.createTask({
        title: 'Task B',
        priority: 'high',
        dueDate: today,
        status: 'not_started',
      });

      const next = await taskRepository.getNextFocusTask({});

      // Should select one of them (order may vary, but should be valid)
      expect(['Task A', 'Task B']).toContain(next.title);
      expect(next.isTodayFocus).toBe(true);
    });
  });
});

