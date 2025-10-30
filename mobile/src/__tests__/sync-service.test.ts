import { Database } from '@nozbe/watermelondb';
import { getDatabase } from '../db';
import { syncService } from '../services/SyncService';
import { enhancedAPI } from '../services/enhancedApi';
import { taskRepository } from '../repositories/TaskRepository';
import { goalRepository } from '../repositories/GoalRepository';
import Task from '../db/models/Task';
import Goal from '../db/models/Goal';
import Milestone from '../db/models/Milestone';
import MilestoneStep from '../db/models/MilestoneStep';

// Mock the enhancedAPI
jest.mock('../services/enhancedApi', () => ({
  enhancedAPI: {
    createTask: jest.fn(),
    updateTask: jest.fn(),
    deleteTask: jest.fn(),
    getTasks: jest.fn(),
    createGoal: jest.fn(),
    updateGoal: jest.fn(),
    deleteGoal: jest.fn(),
    getGoals: jest.fn(),
    createMilestone: jest.fn(),
    updateMilestone: jest.fn(),
    deleteMilestone: jest.fn(),
    createStep: jest.fn(),
    updateStep: jest.fn(),
    deleteStep: jest.fn(),
  },
}));

describe('SyncService Tests', () => {
  let database: Database;

  beforeAll(async () => {
    database = getDatabase();
  });

  beforeEach(async () => {
    // Clear database before each test
    await database.write(async () => {
      const tasks = await database.collections.get('tasks').query().fetch();
      const goals = await database.collections.get('goals').query().fetch();
      const milestones = await database.collections.get('milestones').query().fetch();
      const steps = await database.collections.get('milestone_steps').query().fetch();
      
      await Promise.all([
        ...tasks.map(task => task.destroyPermanently()),
        ...goals.map(goal => goal.destroyPermanently()),
        ...milestones.map(milestone => milestone.destroyPermanently()),
        ...steps.map(step => step.destroyPermanently()),
      ]);
    });

    // Reset mocks
    jest.clearAllMocks();
  });

  describe('Push Data (Local to Server)', () => {
    test('pushes pending_create tasks to server', async () => {
      // Create task locally
      const task = await taskRepository.createTask({
        title: 'Test Task',
        userId: 'test-user',
      });

      expect(task.status).toBe('pending_create');

      // Mock successful API response
      (enhancedAPI.createTask as jest.Mock).mockResolvedValue({
        id: task.id,
        title: 'Test Task',
        updated_at: new Date().toISOString(),
      });

      // Trigger sync
      await syncService.sync();

      // Verify API was called
      expect(enhancedAPI.createTask).toHaveBeenCalledWith({
        title: 'Test Task',
        description: undefined,
        priority: undefined,
        estimated_duration_minutes: undefined,
        due_date: undefined,
        goal_id: undefined,
        is_today_focus: undefined,
        user_id: 'test-user',
        client_updated_at: expect.any(String),
      });

      // Verify task status was updated
      const syncedTask = await taskRepository.getTaskById(task.id);
      expect(syncedTask?.status).toBe('synced');
    });

    test('pushes pending_update tasks to server', async () => {
      // Create and sync task first
      const task = await taskRepository.createTask({
        title: 'Original Task',
        userId: 'test-user',
      });

      (enhancedAPI.createTask as jest.Mock).mockResolvedValue({
        id: task.id,
        updated_at: new Date().toISOString(),
      });

      await syncService.sync();

      // Update task
      await taskRepository.updateTask(task.id, {
        title: 'Updated Task',
        description: 'Updated Description',
      });

      // Mock successful update
      (enhancedAPI.updateTask as jest.Mock).mockResolvedValue({
        id: task.id,
        title: 'Updated Task',
        updated_at: new Date().toISOString(),
      });

      // Trigger sync
      await syncService.sync();

      // Verify API was called with update
      expect(enhancedAPI.updateTask).toHaveBeenCalledWith(task.id, {
        title: 'Updated Task',
        description: 'Updated Description',
        priority: undefined,
        estimated_duration_minutes: undefined,
        due_date: undefined,
        goal_id: undefined,
        is_today_focus: undefined,
        user_id: 'test-user',
        client_updated_at: expect.any(String),
      });

      // Verify task status was updated
      const syncedTask = await taskRepository.getTaskById(task.id);
      expect(syncedTask?.status).toBe('synced');
    });

    test('pushes pending_delete tasks to server', async () => {
      // Create and sync task first
      const task = await taskRepository.createTask({
        title: 'Task to Delete',
        userId: 'test-user',
      });

      (enhancedAPI.createTask as jest.Mock).mockResolvedValue({
        id: task.id,
        updated_at: new Date().toISOString(),
      });

      await syncService.sync();

      // Delete task
      await taskRepository.deleteTask(task.id);

      // Mock successful deletion
      (enhancedAPI.deleteTask as jest.Mock).mockResolvedValue(undefined);

      // Trigger sync
      await syncService.sync();

      // Verify API was called
      expect(enhancedAPI.deleteTask).toHaveBeenCalledWith(task.id);

      // Verify task was permanently deleted
      const deletedTask = await taskRepository.getTaskById(task.id);
      expect(deletedTask).toBeNull();
    });

    test('pushes pending_create goals to server', async () => {
      // Create goal locally
      const goal = await goalRepository.createGoal({
        title: 'Test Goal',
        description: 'Test Description',
        userId: 'test-user',
      });

      expect(goal.status).toBe('pending_create');

      // Mock successful API response
      (enhancedAPI.createGoal as jest.Mock).mockResolvedValue({
        id: goal.id,
        title: 'Test Goal',
        updated_at: new Date().toISOString(),
      });

      // Trigger sync
      await syncService.sync();

      // Verify API was called
      expect(enhancedAPI.createGoal).toHaveBeenCalledWith({
        title: 'Test Goal',
        description: 'Test Description',
        target_completion_date: undefined,
        category: undefined,
        user_id: 'test-user',
        client_updated_at: expect.any(String),
      });

      // Verify goal status was updated
      const syncedGoal = await goalRepository.getGoalById(goal.id);
      expect(syncedGoal?.status).toBe('synced');
    });

    test('pushes pending_create milestones to server', async () => {
      // Create goal with milestone
      const goal = await goalRepository.createGoal({
        title: 'Test Goal',
        userId: 'test-user',
        milestones: [
          {
            title: 'Test Milestone',
            description: 'Test Description',
          },
        ],
      });

      const milestones = await goalRepository.getMilestonesForGoal(goal.id);
      const milestone = milestones[0];

      expect(milestone.status).toBe('pending_create');

      // Mock successful API responses
      (enhancedAPI.createGoal as jest.Mock).mockResolvedValue({
        id: goal.id,
        updated_at: new Date().toISOString(),
      });

      (enhancedAPI.createMilestone as jest.Mock).mockResolvedValue({
        id: milestone.id,
        title: 'Test Milestone',
        updated_at: new Date().toISOString(),
      });

      // Trigger sync
      await syncService.sync();

      // Verify milestone API was called
      expect(enhancedAPI.createMilestone).toHaveBeenCalledWith(goal.id, {
        title: 'Test Milestone',
        description: 'Test Description',
        completed: false,
        order: 1,
        client_updated_at: expect.any(String),
      });

      // Verify milestone status was updated
      const syncedMilestone = await goalRepository.getMilestoneById(milestone.id);
      expect(syncedMilestone?.status).toBe('synced');
    });

    test('pushes pending_create steps to server', async () => {
      // Create goal with milestone and step
      const goal = await goalRepository.createGoal({
        title: 'Test Goal',
        userId: 'test-user',
        milestones: [
          {
            title: 'Test Milestone',
            steps: [
              { text: 'Test Step', completed: false },
            ],
          },
        ],
      });

      const milestones = await goalRepository.getMilestonesForGoal(goal.id);
      const steps = await goalRepository.getStepsForMilestone(milestones[0].id);
      const step = steps[0];

      expect(step.status).toBe('pending_create');

      // Mock successful API responses
      (enhancedAPI.createGoal as jest.Mock).mockResolvedValue({
        id: goal.id,
        updated_at: new Date().toISOString(),
      });

      (enhancedAPI.createMilestone as jest.Mock).mockResolvedValue({
        id: milestones[0].id,
        updated_at: new Date().toISOString(),
      });

      (enhancedAPI.createStep as jest.Mock).mockResolvedValue({
        id: step.id,
        text: 'Test Step',
        updated_at: new Date().toISOString(),
      });

      // Trigger sync
      await syncService.sync();

      // Verify step API was called
      expect(enhancedAPI.createStep).toHaveBeenCalledWith(milestones[0].id, {
        text: 'Test Step',
        completed: false,
        order: 1,
        client_updated_at: expect.any(String),
      });

      // Verify step status was updated
      const syncedStep = await goalRepository.getStepById(step.id);
      expect(syncedStep?.status).toBe('synced');
    });
  });

  describe('Pull Data (Server to Local)', () => {
    test('pulls new tasks from server', async () => {
      // Mock server response with new task
      const serverTask = {
        id: 'server-task-id',
        title: 'Server Task',
        description: 'Created on server',
        priority: 'high',
        user_id: 'test-user',
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };

      (enhancedAPI.getTasks as jest.Mock).mockResolvedValue([serverTask]);

      // Trigger sync
      await syncService.sync();

      // Verify task was created locally
      const localTask = await taskRepository.getTaskById('server-task-id');
      expect(localTask).toBeTruthy();
      expect(localTask?.title).toBe('Server Task');
      expect(localTask?.description).toBe('Created on server');
      expect(localTask?.priority).toBe('high');
      expect(localTask?.status).toBe('synced');
    });

    test('pulls updated tasks from server', async () => {
      // Create local task
      const task = await taskRepository.createTask({
        title: 'Local Task',
        userId: 'test-user',
      });

      // Mock server response with updated task
      const serverTask = {
        id: task.id,
        title: 'Updated by Server',
        description: 'Updated on server',
        priority: 'low',
        user_id: 'test-user',
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };

      (enhancedAPI.getTasks as jest.Mock).mockResolvedValue([serverTask]);

      // Trigger sync
      await syncService.sync();

      // Verify task was updated
      const updatedTask = await taskRepository.getTaskById(task.id);
      expect(updatedTask?.title).toBe('Updated by Server');
      expect(updatedTask?.description).toBe('Updated on server');
      expect(updatedTask?.priority).toBe('low');
      expect(updatedTask?.status).toBe('synced');
    });

    test('handles incremental sync with deleted records', async () => {
      // Create local task
      const task = await taskRepository.createTask({
        title: 'Task to be Deleted',
        userId: 'test-user',
      });

      // Mock initial sync
      (enhancedAPI.createTask as jest.Mock).mockResolvedValue({
        id: task.id,
        updated_at: new Date().toISOString(),
      });

      await syncService.sync();

      // Mock incremental sync response with deletion
      const incrementalResponse = {
        changed: [],
        deleted: [task.id],
      };

      (enhancedAPI.getTasks as jest.Mock).mockResolvedValue(incrementalResponse);

      // Trigger incremental sync
      await syncService.sync();

      // Verify task was deleted
      const deletedTask = await taskRepository.getTaskById(task.id);
      expect(deletedTask).toBeNull();
    });

    test('pulls new goals with milestones from server', async () => {
      // Mock server response with goal and milestones
      const serverGoal = {
        id: 'server-goal-id',
        title: 'Server Goal',
        description: 'Created on server',
        user_id: 'test-user',
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        milestones: [
          {
            id: 'server-milestone-id',
            title: 'Server Milestone',
            description: 'Server milestone description',
            goal_id: 'server-goal-id',
            completed: false,
            order: 1,
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
            steps: [
              {
                id: 'server-step-id',
                text: 'Server Step',
                milestone_id: 'server-milestone-id',
                completed: false,
                order: 1,
                created_at: new Date().toISOString(),
                updated_at: new Date().toISOString(),
              },
            ],
          },
        ],
      };

      (enhancedAPI.getGoals as jest.Mock).mockResolvedValue([serverGoal]);

      // Trigger sync
      await syncService.sync();

      // Verify goal was created
      const localGoal = await goalRepository.getGoalById('server-goal-id');
      expect(localGoal).toBeTruthy();
      expect(localGoal?.title).toBe('Server Goal');
      expect(localGoal?.status).toBe('synced');

      // Verify milestone was created
      const milestones = await goalRepository.getMilestonesForGoal('server-goal-id');
      expect(milestones).toHaveLength(1);
      expect(milestones[0].title).toBe('Server Milestone');
      expect(milestones[0].status).toBe('synced');

      // Verify step was created
      const steps = await goalRepository.getStepsForMilestone('server-milestone-id');
      expect(steps).toHaveLength(1);
      expect(steps[0].text).toBe('Server Step');
      expect(steps[0].status).toBe('synced');
    });
  });

  describe('Conflict Resolution', () => {
    test('handles 409 conflict responses for tasks', async () => {
      // Create task locally
      const task = await taskRepository.createTask({
        title: 'Conflicting Task',
        userId: 'test-user',
      });

      // Mock conflict response
      const conflictError = {
        response: {
          status: 409,
          data: {
            server_record: {
              id: task.id,
              title: 'Server Version',
              description: 'Server description',
              priority: 'high',
              user_id: 'test-user',
              updated_at: new Date().toISOString(),
            },
          },
        },
      };

      (enhancedAPI.createTask as jest.Mock).mockRejectedValue(conflictError);

      // Trigger sync (should handle conflict)
      await syncService.sync();

      // Verify local record was updated with server version
      const resolvedTask = await taskRepository.getTaskById(task.id);
      expect(resolvedTask?.title).toBe('Server Version');
      expect(resolvedTask?.description).toBe('Server description');
      expect(resolvedTask?.priority).toBe('high');
      expect(resolvedTask?.status).toBe('synced');
    });

    test('handles 409 conflict responses for goals', async () => {
      // Create goal locally
      const goal = await goalRepository.createGoal({
        title: 'Conflicting Goal',
        userId: 'test-user',
      });

      // Mock conflict response
      const conflictError = {
        response: {
          status: 409,
          data: {
            server_record: {
              id: goal.id,
              title: 'Server Goal Version',
              description: 'Server goal description',
              category: 'work',
              user_id: 'test-user',
              updated_at: new Date().toISOString(),
            },
          },
        },
      };

      (enhancedAPI.createGoal as jest.Mock).mockRejectedValue(conflictError);

      // Trigger sync (should handle conflict)
      await syncService.sync();

      // Verify local record was updated with server version
      const resolvedGoal = await goalRepository.getGoalById(goal.id);
      expect(resolvedGoal?.title).toBe('Server Goal Version');
      expect(resolvedGoal?.description).toBe('Server goal description');
      expect(resolvedGoal?.category).toBe('work');
      expect(resolvedGoal?.status).toBe('synced');
    });
  });

  describe('Error Handling', () => {
    test('handles network errors gracefully', async () => {
      // Create task
      const task = await taskRepository.createTask({
        title: 'Network Error Task',
        userId: 'test-user',
      });

      // Mock network error
      (enhancedAPI.createTask as jest.Mock).mockRejectedValue(
        new Error('Network error')
      );

      // Sync should not throw
      await expect(syncService.sync()).resolves.not.toThrow();

      // Task should remain in pending state
      const pendingTask = await taskRepository.getTaskById(task.id);
      expect(pendingTask?.status).toBe('pending_create');
    });

    test('handles empty DELETE responses', async () => {
      // Mock empty response (common for DELETE operations)
      (enhancedAPI.deleteTask as jest.Mock).mockResolvedValue(undefined);

      // Create and sync task first
      const task = await taskRepository.createTask({
        title: 'Task to Delete',
        userId: 'test-user',
      });

      (enhancedAPI.createTask as jest.Mock).mockResolvedValue({
        id: task.id,
        updated_at: new Date().toISOString(),
      });

      await syncService.sync();

      // Delete task
      await taskRepository.deleteTask(task.id);

      // Sync deletion should handle empty response
      await expect(syncService.sync()).resolves.not.toThrow();
    });

    test('handles malformed date strings', async () => {
      // Mock server response with malformed date
      const serverTask = {
        id: 'malformed-date-task',
        title: 'Task with Bad Date',
        user_id: 'test-user',
        created_at: 'invalid-date',
        updated_at: 'invalid-date',
      };

      (enhancedAPI.getTasks as jest.Mock).mockResolvedValue([serverTask]);

      // Sync should not throw
      await expect(syncService.sync()).resolves.not.toThrow();

      // Task should still be created (with undefined dates)
      const localTask = await taskRepository.getTaskById('malformed-date-task');
      expect(localTask).toBeTruthy();
      expect(localTask?.title).toBe('Task with Bad Date');
    });
  });

  describe('Silent Sync', () => {
    test('silentSync does not show notifications', async () => {
      // Spy on notification service
      const notificationService = require('../services/notificationService').notificationService;
      const mockShowNotification = jest.spyOn(notificationService, 'showInAppNotification');

      // Create task
      await taskRepository.createTask({
        title: 'Silent Task',
        userId: 'test-user',
      });

      // Mock successful sync
      (enhancedAPI.createTask as jest.Mock).mockResolvedValue({
        id: 'silent-task-id',
        updated_at: new Date().toISOString(),
      });

      // Trigger silent sync
      await syncService.silentSync();

      // Verify no notifications were shown
      expect(mockShowNotification).not.toHaveBeenCalled();
    });
  });});
