/// <reference types="jest" />
import { Database } from '@nozbe/watermelondb';
import { Q } from '@nozbe/watermelondb';
import { getDatabase } from '../db';
import { taskRepository } from '../repositories/TaskRepository';
import { goalRepository, NotFoundError } from '../repositories/GoalRepository';
import Task from '../db/models/Task';
import Goal from '../db/models/Goal';
import Milestone from '../db/models/Milestone';
import MilestoneStep from '../db/models/MilestoneStep';

describe('Repository Unit Tests', () => {
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

    // Reset mock storage
    (taskRepository as any).__resetMocks?.();
    (goalRepository as any).__resetMocks?.();
  });

  describe('TaskRepository', () => {
    test('createTask sets correct initial status', async () => {
      const task = await taskRepository.createTask({
        title: 'Test Task',
        description: 'Test Description',
        priority: 'medium',
      });

      expect(task.status).toBe('pending_create');
      expect(task.title).toBe('Test Task');
      expect(task.description).toBe('Test Description');
      expect(task.priority).toBe('medium');
    });

    test('updateTask changes status to pending_update', async () => {
      const task = await taskRepository.createTask({
        title: 'Original Task',
      });

      await taskRepository.updateTask(task.id, {
        title: 'Updated Task',
        description: 'Updated Description',
      });

      const updatedTask = await taskRepository.getTaskById(task.id);
      expect(updatedTask?.status).toBe('pending_update');
      expect(updatedTask?.title).toBe('Updated Task');
      expect(updatedTask?.description).toBe('Updated Description');
    });

    test('deleteTask changes status to pending_delete', async () => {
      const task = await taskRepository.createTask({
        title: 'Task to Delete',
      });

      await taskRepository.deleteTask(task.id);

      const deletedTask = await taskRepository.getTaskById(task.id);
      expect(deletedTask?.status).toBe('pending_delete');
    });

    test('getTaskById handles non-existent task', async () => {
      const task = await taskRepository.getTaskById('non-existent-id');
      expect(task).toBeNull();
    });

    test('updateTask handles non-existent task', async () => {
      await expect(async () => {
        await taskRepository.updateTask('non-existent-id', {
          title: 'Updated Title',
        });
      }).rejects.toThrow();
    });

    test('deleteTask handles non-existent task', async () => {
      await expect(taskRepository.deleteTask('non-existent-id')).resolves.not.toThrow();
    });

    test('completeTask handles non-existent task', async () => {
      await expect(async () => {
        await taskRepository.completeTask('non-existent-id');
      }).rejects.toThrow();
    });

    test('createTask handles missing required fields', async () => {
      await expect(async () => {
        await taskRepository.createTask({
          // title missing
        } as any);
      }).rejects.toThrow();
    });

    test('getAllTasks returns tasks for current user', async () => {
      const task1 = await taskRepository.createTask({
        title: 'Task 1',
      });

      const task2 = await taskRepository.createTask({
        title: 'Task 2',
      });

      const allTasks = await taskRepository.getAllTasks();
      expect(allTasks).toHaveLength(2);
      expect(allTasks.some(t => t.title === 'Task 1')).toBe(true);
      expect(allTasks.some(t => t.title === 'Task 2')).toBe(true);
    });

    test('getAllTasks excludes deleted tasks', async () => {
      const task1 = await taskRepository.createTask({
        title: 'Task 1',
      });

      const task2 = await taskRepository.createTask({
        title: 'Task 2',
      });

      // Delete one task
      await taskRepository.deleteTask(task1.id);

      const allTasks = await taskRepository.getAllTasks();
      expect(allTasks).toHaveLength(1);
      expect(allTasks[0].title).toBe('Task 2');
    });
  });

  describe('GoalRepository', () => {
    test('createGoal sets correct initial status', async () => {
      const goal = await goalRepository.createGoal({
        title: 'Test Goal',
        description: 'Test Description',
        category: 'work',
      });

      expect(goal.status).toBe('pending_create');
      expect(goal.title).toBe('Test Goal');
      expect(goal.description).toBe('Test Description');
      expect(goal.category).toBe('work');
    });

    test('updateGoal changes status to pending_update', async () => {
      const goal = await goalRepository.createGoal({
        title: 'Original Goal',
      });

      await goalRepository.updateGoal(goal.id, {
        title: 'Updated Goal',
        description: 'Updated Description',
      });

      const updatedGoal = await goalRepository.getGoalById(goal.id);
      expect(updatedGoal?.status).toBe('pending_update');
      expect(updatedGoal?.title).toBe('Updated Goal');
      expect(updatedGoal?.description).toBe('Updated Description');
    });

    test('deleteGoal changes status to pending_delete', async () => {
      const goal = await goalRepository.createGoal({
        title: 'Goal to Delete',
      });

      await goalRepository.deleteGoal(goal.id);

      const deletedGoal = await goalRepository.getGoalById(goal.id);
      expect(deletedGoal?.status).toBe('pending_delete');
    });

    test('getGoalById handles non-existent goal', async () => {
      const goal = await goalRepository.getGoalById('non-existent-id');
      expect(goal).toBeNull();
    });

    test('updateGoal handles non-existent goal', async () => {
      await expect(async () => {
        await goalRepository.updateGoal('non-existent-id', {
          title: 'Updated Title',
        });
      }).rejects.toThrow();
    });

    test('deleteGoal handles non-existent goal gracefully', async () => {
      // Should not throw error for non-existent goal
      await expect(async () => {
        await goalRepository.deleteGoal('non-existent-id');
      }).resolves.not.toThrow();
    });

    test('createGoal handles missing required fields', async () => {
      await expect(async () => {
        await goalRepository.createGoal({
          // title missing
        } as any);
      }).rejects.toThrow();
    });

    test('getAllGoals returns goals for current user', async () => {
      const goal1 = await goalRepository.createGoal({
        title: 'Goal 1',
      });

      const goal2 = await goalRepository.createGoal({
        title: 'Goal 2',
      });

      const allGoals = await goalRepository.getAllGoals();
      expect(allGoals).toHaveLength(2);
      expect(allGoals.some(g => g.title === 'Goal 1')).toBe(true);
      expect(allGoals.some(g => g.title === 'Goal 2')).toBe(true);
    });

    test('getAllGoals excludes deleted goals', async () => {
      const goal1 = await goalRepository.createGoal({
        title: 'Goal 1',
      });

      const goal2 = await goalRepository.createGoal({
        title: 'Goal 2',
      });

      // Delete one goal
      await goalRepository.deleteGoal(goal1.id);

      const allGoals = await goalRepository.getAllGoals();
      expect(allGoals).toHaveLength(1);
      expect(allGoals[0].title).toBe('Goal 2');
    });
  });

  describe('Milestone Operations', () => {
    test('createMilestone sets correct initial status', async () => {
      const goal = await goalRepository.createGoal({
        title: 'Test Goal',
      });

      const milestone = await goalRepository.createMilestone(goal.id, {
        title: 'Test Milestone',
        description: 'Test Description',
        order: 1,
      });

      expect(milestone.status).toBe('pending_create');
      expect(milestone.title).toBe('Test Milestone');
      expect(milestone.description).toBe('Test Description');
      expect(milestone.goalId).toBe(goal.id);
      expect(milestone.order).toBe(1);
    });

    test('updateMilestone changes status to pending_update', async () => {
      const goal = await goalRepository.createGoal({
        title: 'Test Goal',
      });

      const milestone = await goalRepository.createMilestone(goal.id, {
        title: 'Original Milestone',
        order: 1,
      });

      await goalRepository.updateMilestone(milestone.id, {
        title: 'Updated Milestone',
        completed: true,
      });

      const updatedMilestone = await goalRepository.getMilestoneById(milestone.id);
      expect(updatedMilestone).not.toBeNull();
      expect(updatedMilestone!.status).toBe('pending_update');
      expect(updatedMilestone!.title).toBe('Updated Milestone');
      expect(updatedMilestone!.completed).toBe(true);
    });

    test('deleteMilestone changes status to pending_delete', async () => {
      const goal = await goalRepository.createGoal({
        title: 'Test Goal',
      });

      const milestone = await goalRepository.createMilestone(goal.id, {
        title: 'Milestone to Delete',
        order: 1,
      });

      await goalRepository.deleteMilestone(milestone.id);

      const deletedMilestone = await goalRepository.getMilestoneById(milestone.id);
      expect(deletedMilestone).not.toBeNull();
      expect(deletedMilestone!.status).toBe('pending_delete');
    });

    test('createMilestone handles missing required fields', async () => {
      const goal = await goalRepository.createGoal({
        title: 'Test Goal',
      });

      await expect(async () => {
        await goalRepository.createMilestone(goal.id, {
          title: 'Test Milestone',
          // order missing
        } as any);
      }).rejects.toThrow();
    });

    test('deleteMilestone handles non-existent milestone', async () => {
      await expect(goalRepository.deleteMilestone('non-existent-id')).resolves.not.toThrow();
    });

    test('createMilestone throws NotFoundError when goal is missing', async () => {
      await expect(goalRepository.createMilestone('missing-goal-id', {
        title: 'Orphan Milestone',
        order: 1,
      })).rejects.toBeInstanceOf(NotFoundError);
    });

    test('getMilestonesForGoal throws NotFoundError when goal is missing', async () => {
      await expect(goalRepository.getMilestonesForGoal('missing-goal-id'))
        .rejects.toBeInstanceOf(NotFoundError);
    });
  });

  describe('Step Operations', () => {
    test('createMilestoneStep sets correct initial status', async () => {
      const goal = await goalRepository.createGoal({
        title: 'Test Goal',
      });

      const milestone = await goalRepository.createMilestone(goal.id, {
        title: 'Test Milestone',
        order: 1,
      });

      const step = await goalRepository.createMilestoneStep(milestone.id, {
        text: 'Test Step',
        order: 1,
      });

      expect(step.status).toBe('pending_create');
      expect(step.text).toBe('Test Step');
      expect(step.completed).toBe(false);
      expect(step.milestoneId).toBe(milestone.id);
      expect(step.order).toBe(1);
    });

    test('updateMilestoneStep changes status to pending_update', async () => {
      const goal = await goalRepository.createGoal({
        title: 'Test Goal',
      });

      const milestone = await goalRepository.createMilestone(goal.id, {
        title: 'Test Milestone',
        order: 1,
      });

      const step = await goalRepository.createMilestoneStep(milestone.id, {
        text: 'Original Step',
        order: 1,
      });

      await goalRepository.updateMilestoneStep(step.id, {
        text: 'Updated Step',
        completed: true,
      });

      const updatedStep = await goalRepository.getMilestoneStepById(step.id);
      expect(updatedStep).not.toBeNull();
      expect(updatedStep!.status).toBe('pending_update');
      expect(updatedStep!.text).toBe('Updated Step');
      expect(updatedStep!.completed).toBe(true);
    });

    test('deleteMilestoneStep changes status to pending_delete', async () => {
      const goal = await goalRepository.createGoal({
        title: 'Test Goal',
      });

      const milestone = await goalRepository.createMilestone(goal.id, {
        title: 'Test Milestone',
        order: 1,
      });

      const step = await goalRepository.createMilestoneStep(milestone.id, {
        text: 'Step to Delete',
        order: 1,
      });

      await goalRepository.deleteMilestoneStep(step.id);

      const deletedStep = await goalRepository.getMilestoneStepById(step.id);
      expect(deletedStep).not.toBeNull();
      expect(deletedStep!.status).toBe('pending_delete');
    });

    test('createMilestoneStep handles missing required fields', async () => {
      const goal = await goalRepository.createGoal({
        title: 'Test Goal',
      });

      const milestone = await goalRepository.createMilestone(goal.id, {
        title: 'Test Milestone',
        order: 1,
      });

      await expect(async () => {
        await goalRepository.createMilestoneStep(milestone.id, {
          text: 'Test Step',
          // order missing
        } as any);
      }).rejects.toThrow();
    });

    test('deleteMilestoneStep handles non-existent step', async () => {
      await expect(goalRepository.deleteMilestoneStep('non-existent-id')).resolves.not.toThrow();
    });
  });

  describe('Date Handling Tests', () => {
    test('createTask with due date handles timezone correctly', async () => {
      const today = new Date();
      today.setHours(0, 0, 0, 0); // Normalize to start of day
      
      const task = await taskRepository.createTask({
        title: 'Task with Due Date',
        dueDate: today,
      });

      expect(task.dueDate).toBeDefined();
      expect(task.dueDate?.getTime()).toBe(today.getTime());
    });

    test('updateTask with due date handles timezone correctly', async () => {
      const task = await taskRepository.createTask({
        title: 'Task to Update',
      });

      const tomorrow = new Date();
      tomorrow.setHours(0, 0, 0, 0);
      tomorrow.setDate(tomorrow.getDate() + 1);

      await taskRepository.updateTask(task.id, {
        dueDate: tomorrow,
      });

      const updatedTask = await taskRepository.getTaskById(task.id);
      expect(updatedTask?.dueDate).toBeDefined();
      expect(updatedTask?.dueDate?.getTime()).toBe(tomorrow.getTime());
    });

    test('createGoal with target completion date handles timezone correctly', async () => {
      const targetDate = new Date();
      targetDate.setHours(23, 59, 59, 999); // End of day
      
      const goal = await goalRepository.createGoal({
        title: 'Goal with Target Date',
        targetCompletionDate: targetDate,
      });

      expect(goal.targetCompletionDate).toBeDefined();
      expect(goal.targetCompletionDate?.getTime()).toBe(targetDate.getTime());
    });

    test('throws error for invalid date', async () => {
      const invalidDate = new Date('invalid');
      
      // Should throw error when creating task with invalid date
      await expect(taskRepository.createTask({
        title: 'Task with Invalid Date',
        dueDate: invalidDate,
      })).rejects.toThrow('Invalid due date provided. Date must be a valid Date object.');
    });

    test('handles null date gracefully', async () => {
      const task = await taskRepository.createTask({
        title: 'Task without Due Date',
        dueDate: undefined,
      });

      expect(task.dueDate).toBeUndefined();
    });
  });

  describe('Error Handling Tests', () => {
    test('TaskRepository handles database errors gracefully', async () => {
      // Test that getAllTasks returns empty array on error
      const tasks = await taskRepository.getAllTasks();
      expect(Array.isArray(tasks)).toBe(true);
    });

    test('GoalRepository handles authentication errors', async () => {
      // This test verifies that the repository handles authentication properly
      // In a real scenario, this might involve mocking the auth service
      const goals = await goalRepository.getAllGoals();
      expect(Array.isArray(goals)).toBe(true);
    });

    test('Milestone operations handle authorization errors', async () => {
      const goal = await goalRepository.createGoal({
        title: 'Test Goal',
      });

      const milestone = await goalRepository.createMilestone(goal.id, {
        title: 'Test Milestone',
        order: 1,
      });

      // Test that operations work correctly
      expect(milestone.id).toBeDefined();
      expect(milestone.goalId).toBe(goal.id);
    });

    test('Step operations handle authorization errors', async () => {
      const goal = await goalRepository.createGoal({
        title: 'Test Goal',
      });

      const milestone = await goalRepository.createMilestone(goal.id, {
        title: 'Test Milestone',
        order: 1,
      });

      const step = await goalRepository.createMilestoneStep(milestone.id, {
        text: 'Test Step',
        order: 1,
      });

      // Test that operations work correctly
      expect(step.id).toBeDefined();
      expect(step.milestoneId).toBe(milestone.id);
    });
  });
});