import { Database } from '@nozbe/watermelondb';
import { schema } from '../db/schema';
import { getDatabase } from '../db';
import { taskRepository } from '../repositories/TaskRepository';
import { goalRepository } from '../repositories/GoalRepository';
import { syncService } from '../services/SyncService';
import { enhancedAPI } from '../services/enhancedApi';
import Task from '../db/models/Task';
import Goal from '../db/models/Goal';
import Milestone from '../db/models/Milestone';
import MilestoneStep from '../db/models/MilestoneStep';

// Mock the enhancedAPI to avoid actual network calls
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

// Mock auth service
jest.mock('../services/auth', () => ({
  authService: {
    getCurrentUser: () => ({ id: 'test-user-id' }),
  },
}));

describe('WatermelonDB Integration Tests', () => {
  let database: Database;

  beforeAll(async () => {
    // Initialize test database
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

  describe('Task Operations', () => {
    test('Create task offline, sync online', async () => {
      // Create task using repository
      const task = await taskRepository.createTask({
        title: 'Test Task',
        description: 'Test Description',
        priority: 'medium',
        userId: 'test-user-id',
      });
      
      expect(task.status).toBe('pending_create');
      expect(task.title).toBe('Test Task');
      
      // Mock successful API response
      (enhancedAPI.createTask as jest.Mock).mockResolvedValue({
        id: task.id,
        title: 'Test Task',
        updated_at: new Date().toISOString(),
      });
      
      // Trigger sync
      await syncService.sync();
      
      // Verify task is synced
      const updatedTask = await taskRepository.getTaskById(task.id);
      expect(updatedTask?.status).toBe('synced');
    });

    test('Update task offline, sync online', async () => {
      // Create task first
      const task = await taskRepository.createTask({
        title: 'Original Task',
        userId: 'test-user-id',
      });
      
      // Mock initial sync
      (enhancedAPI.createTask as jest.Mock).mockResolvedValue({
        id: task.id,
        title: 'Original Task',
        updated_at: new Date().toISOString(),
      });
      
      await syncService.sync();
      
      // Update task
      await taskRepository.updateTask(task.id, {
        title: 'Updated Task',
        description: 'Updated Description',
      });
      
      const updatedTask = await taskRepository.getTaskById(task.id);
      expect(updatedTask?.status).toBe('pending_update');
      expect(updatedTask?.title).toBe('Updated Task');
      
      // Mock successful update
      (enhancedAPI.updateTask as jest.Mock).mockResolvedValue({
        id: task.id,
        title: 'Updated Task',
        updated_at: new Date().toISOString(),
      });
      
      // Sync update
      await syncService.sync();
      
      const syncedTask = await taskRepository.getTaskById(task.id);
      expect(syncedTask?.status).toBe('synced');
    });

    test('Delete task offline, sync online', async () => {
      // Create and sync task first
      const task = await taskRepository.createTask({
        title: 'Task to Delete',
        userId: 'test-user-id',
      });
      
      (enhancedAPI.createTask as jest.Mock).mockResolvedValue({
        id: task.id,
        title: 'Task to Delete',
        updated_at: new Date().toISOString(),
      });
      
      await syncService.sync();
      
      // Delete task
      await taskRepository.deleteTask(task.id);
      
      const deletedTask = await taskRepository.getTaskById(task.id);
      expect(deletedTask?.status).toBe('pending_delete');
      
      // Mock successful deletion
      (enhancedAPI.deleteTask as jest.Mock).mockResolvedValue(undefined);
      
      // Sync deletion
      await syncService.sync();
      
      // Task should be permanently deleted
      const finalTask = await taskRepository.getTaskById(task.id);
      expect(finalTask).toBeNull();
    });
  });

  describe('Goal Operations', () => {
    test('Create goal with nested milestones', async () => {
      const goal = await goalRepository.createGoal({
        title: 'Test Goal',
        description: 'Test Goal Description',
        userId: 'test-user-id',
        milestones: [
          {
            title: 'Milestone 1',
            description: 'First milestone',
            steps: [
              { text: 'Step 1', completed: false },
              { text: 'Step 2', completed: false },
            ],
          },
          {
            title: 'Milestone 2',
            description: 'Second milestone',
            steps: [
              { text: 'Step 3', completed: false },
            ],
          },
        ],
      });
      
      expect(goal.status).toBe('pending_create');
      expect(goal.title).toBe('Test Goal');
      
      // Verify milestones were created
      const milestones = await goalRepository.getMilestonesForGoal(goal.id);
      expect(milestones).toHaveLength(2);
      expect(milestones[0].title).toBe('Milestone 1');
      expect(milestones[1].title).toBe('Milestone 2');
      
      // Verify steps were created
      const milestone1Steps = await goalRepository.getStepsForMilestone(milestones[0].id);
      const milestone2Steps = await goalRepository.getStepsForMilestone(milestones[1].id);
      
      expect(milestone1Steps).toHaveLength(2);
      expect(milestone2Steps).toHaveLength(1);
      expect(milestone1Steps[0].text).toBe('Step 1');
      expect(milestone1Steps[1].text).toBe('Step 2');
      expect(milestone2Steps[0].text).toBe('Step 3');
    });

    test('Update milestone completion status', async () => {
      // Create goal with milestone
      const goal = await goalRepository.createGoal({
        title: 'Test Goal',
        userId: 'test-user-id',
        milestones: [
          {
            title: 'Test Milestone',
            steps: [{ text: 'Test Step', completed: false }],
          },
        ],
      });
      
      const milestones = await goalRepository.getMilestonesForGoal(goal.id);
      const milestone = milestones[0];
      
      // Update milestone completion
      await goalRepository.updateMilestone(milestone.id, {
        completed: true,
      });
      
      const updatedMilestone = await goalRepository.getMilestoneById(milestone.id);
      expect(updatedMilestone?.completed).toBe(true);
      expect(updatedMilestone?.status).toBe('pending_update');
    });

    test('Update step completion status', async () => {
      // Create goal with milestone and step
      const goal = await goalRepository.createGoal({
        title: 'Test Goal',
        userId: 'test-user-id',
        milestones: [
          {
            title: 'Test Milestone',
            steps: [{ text: 'Test Step', completed: false }],
          },
        ],
      });
      
      const milestones = await goalRepository.getMilestonesForGoal(goal.id);
      const steps = await goalRepository.getStepsForMilestone(milestones[0].id);
      const step = steps[0];
      
      // Update step completion
      await goalRepository.updateStep(step.id, {
        completed: true,
      });
      
      const updatedStep = await goalRepository.getStepById(step.id);
      expect(updatedStep?.completed).toBe(true);
      expect(updatedStep?.status).toBe('pending_update');
    });
  });

  describe('Sync Operations', () => {
    test('Sync creates new records from server', async () => {
      // Mock server response with new task
      const serverTask = {
        id: 'server-task-id',
        title: 'Server Task',
        description: 'Created on server',
        priority: 'high',
        user_id: 'test-user-id',
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
      expect(localTask?.status).toBe('synced');
    });

    test('Sync updates existing records from server', async () => {
      // Create local task
      const task = await taskRepository.createTask({
        title: 'Local Task',
        userId: 'test-user-id',
      });
      
      // Mock server response with updated task
      const serverTask = {
        id: task.id,
        title: 'Updated by Server',
        description: 'Updated on server',
        priority: 'low',
        user_id: 'test-user-id',
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };
      
      (enhancedAPI.getTasks as jest.Mock).mockResolvedValue([serverTask]);
      
      // Trigger sync
      await syncService.sync();
      
      // Verify task was updated
      const updatedTask = await taskRepository.getTaskById(task.id);
      expect(updatedTask?.title).toBe('Updated by Server');
      expect(updatedTask?.status).toBe('synced');
    });

    test('Sync handles incremental updates', async () => {
      // Mock incremental sync response
      const incrementalResponse = {
        changed: [
          {
            id: 'task-1',
            title: 'Updated Task',
            user_id: 'test-user-id',
            updated_at: new Date().toISOString(),
          },
        ],
        deleted: ['task-2'],
      };
      
      (enhancedAPI.getTasks as jest.Mock).mockResolvedValue(incrementalResponse);
      
      // Create a task with specific ID that server will mark as deleted
      await database.write(async () => {
        await database.collections.get('tasks').create((task: any) => {
          task._raw.id = 'task-2';
          task.title = 'Task to be Deleted';
          task.userId = 'test-user-id';
          task.status = 'synced';
        });
      });
      
      // Trigger incremental sync with deletion
      await syncService.sync();
      
      // Verify task was deleted
      const deletedTask = await taskRepository.getTaskById('task-2');
      expect(deletedTask).toBeNull();
    });  });

  describe('Conflict Resolution', () => {
    test('Handles 409 conflict responses', async () => {
      // Create task locally
      const task = await taskRepository.createTask({
        title: 'Conflicting Task',
        userId: 'test-user-id',
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
              user_id: 'test-user-id',
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
      expect(resolvedTask?.status).toBe('synced');
    });
  });

  describe('Milestone Sync', () => {
    test('Sync milestone operations', async () => {
      // Create goal with milestone
      const goal = await goalRepository.createGoal({
        title: 'Test Goal',
        userId: 'test-user-id',
        milestones: [
          {
            title: 'Test Milestone',
            description: 'Test milestone description',
          },
        ],
      });
      
      const milestones = await goalRepository.getMilestonesForGoal(goal.id);
      const milestone = milestones[0];
      
      // Mock successful milestone creation
      (enhancedAPI.createMilestone as jest.Mock).mockResolvedValue({
        id: milestone.id,
        title: 'Test Milestone',
        updated_at: new Date().toISOString(),
      });
      
      // Trigger sync
      await syncService.sync();
      
      // Verify milestone was synced
      const syncedMilestone = await goalRepository.getMilestoneById(milestone.id);
      expect(syncedMilestone?.status).toBe('synced');
    });

    test('Sync step operations', async () => {
      // Create goal with milestone and step
      const goal = await goalRepository.createGoal({
        title: 'Test Goal',
        userId: 'test-user-id',
        milestones: [
          {
            title: 'Test Milestone',
            steps: [{ text: 'Test Step', completed: false }],
          },
        ],
      });
      
      const milestones = await goalRepository.getMilestonesForGoal(goal.id);
      const steps = await goalRepository.getStepsForMilestone(milestones[0].id);
      const step = steps[0];
      
      // Mock successful step creation
      (enhancedAPI.createStep as jest.Mock).mockResolvedValue({
        id: step.id,
        text: 'Test Step',
        updated_at: new Date().toISOString(),
      });
      
      // Trigger sync
      await syncService.sync();
      
      // Verify step was synced
      const syncedStep = await goalRepository.getStepById(step.id);
      expect(syncedStep?.status).toBe('synced');
    });
  });

  describe('Error Handling', () => {
    test('Handles network errors gracefully', async () => {
      // Create task
      const task = await taskRepository.createTask({
        title: 'Network Error Task',
        userId: 'test-user-id',
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

    test('Handles JSON parse errors', async () => {
      // Mock empty response (common for DELETE operations)
      (enhancedAPI.deleteTask as jest.Mock).mockResolvedValue(undefined);
      
      // Create and sync task first
      const task = await taskRepository.createTask({
        title: 'Task to Delete',
        userId: 'test-user-id',
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
  });

  describe('Repository Queries', () => {
    test('Get tasks by status', async () => {
      // Create tasks with different statuses
      const task1 = await taskRepository.createTask({
        title: 'Pending Task',
        userId: 'test-user-id',
      });
      
      const task2 = await taskRepository.createTask({
        title: 'Another Task',
        userId: 'test-user-id',
      });
      
      // Sync one task
      (enhancedAPI.createTask as jest.Mock).mockResolvedValue({
        id: task1.id,
        updated_at: new Date().toISOString(),
      });
      
      await syncService.sync();
      
      // Get pending tasks
      const pendingTasks = await taskRepository.getTasksByStatus('pending_create');
      expect(pendingTasks).toHaveLength(1);
      expect(pendingTasks[0].title).toBe('Another Task');
      
      // Get synced tasks
      const syncedTasks = await taskRepository.getTasksByStatus('synced');
      expect(syncedTasks).toHaveLength(1);
      expect(syncedTasks[0].title).toBe('Pending Task');
    });

    test('Get goals by category', async () => {
      // Create goals with different categories
      await goalRepository.createGoal({
        title: 'Work Goal',
        category: 'work',
        userId: 'test-user-id',
      });
      
      await goalRepository.createGoal({
        title: 'Personal Goal',
        category: 'personal',
        userId: 'test-user-id',
      });
      
      // Get work goals
      const workGoals = await goalRepository.getGoalsByCategory('work');
      expect(workGoals).toHaveLength(1);
      expect(workGoals[0].title).toBe('Work Goal');
      
      // Get personal goals
      const personalGoals = await goalRepository.getGoalsByCategory('personal');
      expect(personalGoals).toHaveLength(1);
      expect(personalGoals[0].title).toBe('Personal Goal');
    });
  });
});
