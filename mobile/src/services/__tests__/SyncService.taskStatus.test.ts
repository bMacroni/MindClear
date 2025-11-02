/// <reference types="jest" />
import { Database } from '@nozbe/watermelondb';
import { getDatabase } from '../../db';
import Task from '../../db/models/Task';
import { authService } from '../auth';

// Unmock SyncService and TaskRepository to use real implementations
jest.unmock('../SyncService');
jest.unmock('../../repositories/TaskRepository');

import { syncService } from '../SyncService';
import { taskRepository } from '../../repositories/TaskRepository';

// Mock auth service
jest.mock('../auth', () => ({
  authService: {
    getCurrentUser: jest.fn(() => ({ id: 'test-user-id' })),
  },
}));

// Mock enhanced API
const mockCreateTask = jest.fn();
const mockUpdateTask = jest.fn();
const mockDeleteTask = jest.fn();
const mockShowInAppNotification = jest.fn();

jest.mock('../enhancedApi', () => ({
  enhancedAPI: {
    createTask: mockCreateTask,
    updateTask: mockUpdateTask,
    deleteTask: mockDeleteTask,
    createEvent: jest.fn(),
    updateEvent: jest.fn(),
    deleteEvent: jest.fn(),
    getEvents: jest.fn(() => Promise.resolve([])),
    getEventsForDate: jest.fn(() => Promise.resolve([])),
    getEventsForTask: jest.fn(() => Promise.resolve([])),
    scheduleTaskOnCalendar: jest.fn(),
  },
}));

jest.mock('../notificationService', () => ({
  notificationService: {
    showInAppNotification: mockShowInAppNotification,
  },
}));

describe('SyncService Task Status Handling', () => {
  let database: Database;

  beforeAll(async () => {
    database = getDatabase();
  });

  beforeEach(async () => {
    // Clear database before each test
    await database.write(async () => {
      const tasks = await database.collections.get('tasks').query().fetch();
      await Promise.all(tasks.map(task => task.destroyPermanently()));
    });

    // Reset mocks
    mockCreateTask.mockClear();
    mockUpdateTask.mockClear();
    mockDeleteTask.mockClear();
    mockShowInAppNotification.mockClear();
  });

  describe('Push Data - Combined Status Format', () => {
    test('pushes task with pending_create:not_started format', async () => {
      const task = await taskRepository.createTask({
        title: 'New Task',
        status: 'not_started',
      });

      mockCreateTask.mockResolvedValue({
        id: task.id,
        title: 'New Task',
        status: 'not_started',
      });

      await syncService.pushData();

      expect(mockCreateTask).toHaveBeenCalledWith(
        expect.objectContaining({
          title: 'New Task',
          status: 'not_started', // Lifecycle status extracted
        })
      );
    });

    test('pushes task with pending_create:completed format', async () => {
      const task = await taskRepository.createTask({
        title: 'Completed Task',
        status: 'completed',
      });

      mockCreateTask.mockResolvedValue({
        id: task.id,
        title: 'Completed Task',
        status: 'completed',
      });

      await syncService.pushData();

      expect(mockCreateTask).toHaveBeenCalledWith(
        expect.objectContaining({
          status: 'completed',
        })
      );
    });

    test('pushes task with pending_update:in_progress format', async () => {
      const task = await taskRepository.createTask({
        title: 'In Progress Task',
      });

      await taskRepository.updateTaskStatus(task.id, 'in_progress');

      mockUpdateTask.mockResolvedValue({
        id: task.id,
        title: 'In Progress Task',
        status: 'in_progress',
      });

      await syncService.pushData();

      expect(mockUpdateTask).toHaveBeenCalledWith(
        task.id,
        expect.objectContaining({
          status: 'in_progress',
        })
      );
    });

    test('pushes task with pending_update:completed format', async () => {
      const task = await taskRepository.createTask({
        title: 'Task to Complete',
      });

      await taskRepository.updateTaskStatus(task.id, 'completed');

      mockUpdateTask.mockResolvedValue({
        id: task.id,
        title: 'Task to Complete',
        status: 'completed',
      });

      await syncService.pushData();

      expect(mockUpdateTask).toHaveBeenCalledWith(
        task.id,
        expect.objectContaining({
          status: 'completed',
        })
      );
    });

    test('preserves lifecycle status when updating task fields', async () => {
      const task = await taskRepository.createTask({
        title: 'Original Task',
        status: 'in_progress',
      });

      // Update title but preserve status
      await taskRepository.updateTask(task.id, {
        title: 'Updated Task',
      });

      mockUpdateTask.mockResolvedValue({
        id: task.id,
        title: 'Updated Task',
        status: 'in_progress',
      });

      await syncService.pushData();

      expect(mockUpdateTask).toHaveBeenCalledWith(
        task.id,
        expect.objectContaining({
          title: 'Updated Task',
          status: 'in_progress', // Lifecycle status preserved
        })
      );
    });

    test('does not send undefined optional fields', async () => {
      const task = await taskRepository.createTask({
        title: 'Task without goal',
        goalId: undefined,
        isTodayFocus: false,
      });

      mockCreateTask.mockResolvedValue({
        id: task.id,
        title: 'Task without goal',
      });

      await syncService.pushData();

      const callArgs = mockCreateTask.mock.calls[0][0];
      
      // goal_id should not be in the payload if undefined
      expect(callArgs).not.toHaveProperty('goal_id');
      
      // is_today_focus should be included if explicitly set to false
      expect(callArgs).toHaveProperty('is_today_focus', false);
    });
    test('sends goal_id only when task has goal', async () => {
      const task = await taskRepository.createTask({
        title: 'Task with goal',
        goalId: 'goal-123',
      });

      mockCreateTask.mockResolvedValue({
        id: task.id,
        title: 'Task with goal',
      });

      await syncService.pushData();

      const callArgs = mockCreateTask.mock.calls[0][0];
      expect(callArgs).toHaveProperty('goal_id', 'goal-123');
    });

    test('sends is_today_focus only when explicitly set', async () => {
      const task = await taskRepository.createTask({
        title: 'Focus Task',
        isTodayFocus: true,
      });

      mockCreateTask.mockResolvedValue({
        id: task.id,
        title: 'Focus Task',
      });

      await syncService.pushData();

      const callArgs = mockCreateTask.mock.calls[0][0];
      expect(callArgs).toHaveProperty('is_today_focus', true);
    });
  });

  describe('Push Data - Status Updates After Sync', () => {
    test('updates local task status to synced after successful push', async () => {
      const task = await taskRepository.createTask({
        title: 'Task to Sync',
        status: 'completed',
      });

      mockCreateTask.mockResolvedValue({
        id: task.id,
        title: 'Task to Sync',
        status: 'completed',
      });

      await syncService.pushData();

      const syncedTask = await taskRepository.getTaskById(task.id);

      expect(syncedTask?.status).toBe('completed');
    });

    test('marks task as sync_failed on push error', async () => {
      const task = await taskRepository.createTask({
        title: 'Task that Fails',
      });

      const apiError = new Error('API Error');
      mockCreateTask.mockRejectedValue(apiError);

      await syncService.pushData();

      const failedTask = await taskRepository.getTaskById(task.id);

      expect(failedTask?.status).toBe('sync_failed');
      expect(mockShowInAppNotification).toHaveBeenCalledWith(
        'Push Incomplete',
        expect.stringContaining('Failed to push'),
      );
    });
  });

  describe('Pull Data - Processing Server Responses', () => {
    test.todo('processes server response with lifecycle status');

    test('preserves local lifecycle status during conflict resolution', async () => {
      // Create task locally with completed status
      const task = await taskRepository.createTask({
        title: 'Local Task',
        status: 'completed',
      });

      // Simulate server response with different status
      mockCreateTask.mockResolvedValue({
        id: task.id,
        title: 'Local Task',
        status: 'in_progress', // Different from local
      });

      await syncService.pushData();

      const resolvedTask = await taskRepository.getTaskById(task.id);
      // Verify conflict resolution behavior
      expect(resolvedTask?.status).toBe('completed'); // Or 'in_progress' based on resolution strategy
    });
  });

  describe('Edge Cases', () => {
    test('handles task status changes during sync', async () => {
      const task = await taskRepository.createTask({
        title: 'Task Changing Status',
      });

      let releaseServerResponse: (() => void) | undefined;
      const serverCallStarted = new Promise<void>(resolve => {
        mockUpdateTask.mockImplementation(() => {
          resolve();
          return new Promise(resolveServer => {
            releaseServerResponse = () =>
              resolveServer({
                id: task.id,
                status: 'completed',
              });
          });
        });
      });

      const syncPromise = syncService.pushData();
      await serverCallStarted;

      await taskRepository.updateTaskStatus(task.id, 'completed');

      releaseServerResponse?.();
      await syncPromise;

      const finalTask = await taskRepository.getTaskById(task.id);
      expect(finalTask?.status).toBe('completed');
    });

    test('handles multiple status updates before sync', async () => {
      const task = await taskRepository.createTask({
        title: 'Multi Update Task',
      });

      await taskRepository.updateTaskStatus(task.id, 'in_progress');
      await taskRepository.updateTaskStatus(task.id, 'completed');
      await taskRepository.updateTaskStatus(task.id, 'not_started');

      mockUpdateTask.mockResolvedValue({
        id: task.id,
        status: 'not_started',
      });

      await syncService.pushData();

      // Should sync the final status
      expect(mockUpdateTask).toHaveBeenCalledWith(
        task.id,
        expect.objectContaining({
          status: 'not_started',
        })
      );
    });
  });
});
