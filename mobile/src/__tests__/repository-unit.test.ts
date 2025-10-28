import { Database } from '@nozbe/watermelondb';
import { Q } from '@nozbe/watermelondb';
import { getDatabase } from '../db';
import { taskRepository } from '../repositories/TaskRepository';
import { goalRepository } from '../repositories/GoalRepository';
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
  });

  describe('TaskRepository', () => {
    test('createTask sets correct initial status', async () => {
      const task = await taskRepository.createTask({
        title: 'Test Task',
        description: 'Test Description',
        priority: 'medium',
        userId: 'test-user',
      });

      expect(task.status).toBe('pending_create');
      expect(task.title).toBe('Test Task');
      expect(task.description).toBe('Test Description');
      expect(task.priority).toBe('medium');
      expect(task.userId).toBe('test-user');
    });

    test('updateTask changes status to pending_update', async () => {
      const task = await taskRepository.createTask({
        title: 'Original Task',
        userId: 'test-user',
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
        userId: 'test-user',
      });

      await taskRepository.deleteTask(task.id);

      const deletedTask = await taskRepository.getTaskById(task.id);
      expect(deletedTask?.status).toBe('pending_delete');
    });

    test('getTasksByStatus filters correctly', async () => {
      // Create tasks with different statuses
      const task1 = await taskRepository.createTask({
        title: 'Task 1',
        userId: 'test-user',
      });

      const task2 = await taskRepository.createTask({
        title: 'Task 2',
        userId: 'test-user',
      });

      // Update one task to pending_update
      await taskRepository.updateTask(task1.id, {
        title: 'Updated Task 1',
      });

      // Get pending_create tasks
      const pendingCreateTasks = await taskRepository.getTasksByStatus('pending_create');
      expect(pendingCreateTasks).toHaveLength(1);
      expect(pendingCreateTasks[0].title).toBe('Task 2');

      // Get pending_update tasks
      const pendingUpdateTasks = await taskRepository.getTasksByStatus('pending_update');
      expect(pendingUpdateTasks).toHaveLength(1);
      expect(pendingUpdateTasks[0].title).toBe('Updated Task 1');
    });

    test('getTasksByPriority filters correctly', async () => {
      await taskRepository.createTask({
        title: 'High Priority Task',
        priority: 'high',
        userId: 'test-user',
      });

      await taskRepository.createTask({
        title: 'Medium Priority Task',
        priority: 'medium',
        userId: 'test-user',
      });

      await taskRepository.createTask({
        title: 'Low Priority Task',
        priority: 'low',
        userId: 'test-user',
      });

      const highPriorityTasks = await taskRepository.getTasksByPriority('high');
      expect(highPriorityTasks).toHaveLength(1);
      expect(highPriorityTasks[0].title).toBe('High Priority Task');

      const mediumPriorityTasks = await taskRepository.getTasksByPriority('medium');
      expect(mediumPriorityTasks).toHaveLength(1);
      expect(mediumPriorityTasks[0].title).toBe('Medium Priority Task');
    });

    test('getTasksByGoalId filters correctly', async () => {
      const goal = await goalRepository.createGoal({
        title: 'Test Goal',
        userId: 'test-user',
      });

      await taskRepository.createTask({
        title: 'Task for Goal',
        goalId: goal.id,
        userId: 'test-user',
      });

      await taskRepository.createTask({
        title: 'Task without Goal',
        userId: 'test-user',
      });

      const tasksForGoal = await taskRepository.getTasksByGoalId(goal.id);
      expect(tasksForGoal).toHaveLength(1);
      expect(tasksForGoal[0].title).toBe('Task for Goal');
    });
  });

  describe('GoalRepository', () => {
    test('createGoal sets correct initial status', async () => {
      const goal = await goalRepository.createGoal({
        title: 'Test Goal',
        description: 'Test Description',
        category: 'work',
        userId: 'test-user',
      });

      expect(goal.status).toBe('pending_create');
      expect(goal.title).toBe('Test Goal');
      expect(goal.description).toBe('Test Description');
      expect(goal.category).toBe('work');
      expect(goal.userId).toBe('test-user');
    });

    test('createGoal with milestones creates nested records', async () => {
      const goal = await goalRepository.createGoal({
        title: 'Goal with Milestones',
        userId: 'test-user',
        milestones: [
          {
            title: 'Milestone 1',
            description: 'First milestone',
            steps: [
              { text: 'Step 1', completed: false },
              { text: 'Step 2', completed: true },
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

      // Verify milestones were created
      const milestones = await goalRepository.getMilestonesForGoal(goal.id);
      expect(milestones).toHaveLength(2);
      expect(milestones[0].title).toBe('Milestone 1');
      expect(milestones[1].title).toBe('Milestone 2');
      expect(milestones[0].status).toBe('pending_create');
      expect(milestones[1].status).toBe('pending_create');

      // Verify steps were created
      const milestone1Steps = await goalRepository.getStepsForMilestone(milestones[0].id);
      const milestone2Steps = await goalRepository.getStepsForMilestone(milestones[1].id);

      expect(milestone1Steps).toHaveLength(2);
      expect(milestone2Steps).toHaveLength(1);
      expect(milestone1Steps[0].text).toBe('Step 1');
      expect(milestone1Steps[0].completed).toBe(false);
      expect(milestone1Steps[1].text).toBe('Step 2');
      expect(milestone1Steps[1].completed).toBe(true);
      expect(milestone2Steps[0].text).toBe('Step 3');
      expect(milestone2Steps[0].completed).toBe(false);
    });

    test('updateGoal changes status to pending_update', async () => {
      const goal = await goalRepository.createGoal({
        title: 'Original Goal',
        userId: 'test-user',
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
        userId: 'test-user',
      });

      await goalRepository.deleteGoal(goal.id);

      const deletedGoal = await goalRepository.getGoalById(goal.id);
      expect(deletedGoal?.status).toBe('pending_delete');
    });

    test('getGoalsByCategory filters correctly', async () => {
      await goalRepository.createGoal({
        title: 'Work Goal',
        category: 'work',
        userId: 'test-user',
      });

      await goalRepository.createGoal({
        title: 'Personal Goal',
        category: 'personal',
        userId: 'test-user',
      });

      await goalRepository.createGoal({
        title: 'Health Goal',
        category: 'health',
        userId: 'test-user',
      });

      const workGoals = await goalRepository.getGoalsByCategory('work');
      expect(workGoals).toHaveLength(1);
      expect(workGoals[0].title).toBe('Work Goal');

      const personalGoals = await goalRepository.getGoalsByCategory('personal');
      expect(personalGoals).toHaveLength(1);
      expect(personalGoals[0].title).toBe('Personal Goal');
    });

    test('getGoalsByStatus filters correctly', async () => {
      const goal1 = await goalRepository.createGoal({
        title: 'Goal 1',
        userId: 'test-user',
      });

      const goal2 = await goalRepository.createGoal({
        title: 'Goal 2',
        userId: 'test-user',
      });

      // Update one goal to pending_update
      await goalRepository.updateGoal(goal1.id, {
        title: 'Updated Goal 1',
      });

      // Get pending_create goals
      const pendingCreateGoals = await goalRepository.getGoalsByStatus('pending_create');
      expect(pendingCreateGoals).toHaveLength(1);
      expect(pendingCreateGoals[0].title).toBe('Goal 2');

      // Get pending_update goals
      const pendingUpdateGoals = await goalRepository.getGoalsByStatus('pending_update');
      expect(pendingUpdateGoals).toHaveLength(1);
      expect(pendingUpdateGoals[0].title).toBe('Updated Goal 1');
    });
  });

  describe('Milestone Operations', () => {
    test('createMilestone sets correct initial status', async () => {
      const goal = await goalRepository.createGoal({
        title: 'Test Goal',
        userId: 'test-user',
      });

      const milestone = await goalRepository.createMilestone(goal.id, {
        title: 'Test Milestone',
        description: 'Test Description',
      });

      expect(milestone.status).toBe('pending_create');
      expect(milestone.title).toBe('Test Milestone');
      expect(milestone.description).toBe('Test Description');
      expect(milestone.goalId).toBe(goal.id);
    });

    test('updateMilestone changes status to pending_update', async () => {
      const goal = await goalRepository.createGoal({
        title: 'Test Goal',
        userId: 'test-user',
      });

      const milestone = await goalRepository.createMilestone(goal.id, {
        title: 'Original Milestone',
      });

      await goalRepository.updateMilestone(milestone.id, {
        title: 'Updated Milestone',
        completed: true,
      });

      const updatedMilestone = await goalRepository.getMilestoneById(milestone.id);
      expect(updatedMilestone?.status).toBe('pending_update');
      expect(updatedMilestone?.title).toBe('Updated Milestone');
      expect(updatedMilestone?.completed).toBe(true);
    });

    test('deleteMilestone changes status to pending_delete', async () => {
      const goal = await goalRepository.createGoal({
        title: 'Test Goal',
        userId: 'test-user',
      });

      const milestone = await goalRepository.createMilestone(goal.id, {
        title: 'Milestone to Delete',
      });

      await goalRepository.deleteMilestone(milestone.id);

      const deletedMilestone = await goalRepository.getMilestoneById(milestone.id);
      expect(deletedMilestone?.status).toBe('pending_delete');
    });
  });

  describe('Step Operations', () => {
    test('createStep sets correct initial status', async () => {
      const goal = await goalRepository.createGoal({
        title: 'Test Goal',
        userId: 'test-user',
      });

      const milestone = await goalRepository.createMilestone(goal.id, {
        title: 'Test Milestone',
      });

      const step = await goalRepository.createStep(milestone.id, {
        text: 'Test Step',
        completed: false,
      });

      expect(step.status).toBe('pending_create');
      expect(step.text).toBe('Test Step');
      expect(step.completed).toBe(false);
      expect(step.milestoneId).toBe(milestone.id);
    });

    test('updateStep changes status to pending_update', async () => {
      const goal = await goalRepository.createGoal({
        title: 'Test Goal',
        userId: 'test-user',
      });

      const milestone = await goalRepository.createMilestone(goal.id, {
        title: 'Test Milestone',
      });

      const step = await goalRepository.createStep(milestone.id, {
        text: 'Original Step',
        completed: false,
      });

      await goalRepository.updateStep(step.id, {
        text: 'Updated Step',
        completed: true,
      });

      const updatedStep = await goalRepository.getStepById(step.id);
      expect(updatedStep?.status).toBe('pending_update');
      expect(updatedStep?.text).toBe('Updated Step');
      expect(updatedStep?.completed).toBe(true);
    });

    test('deleteStep changes status to pending_delete', async () => {
      const goal = await goalRepository.createGoal({
        title: 'Test Goal',
        userId: 'test-user',
      });

      const milestone = await goalRepository.createMilestone(goal.id, {
        title: 'Test Milestone',
      });

      const step = await goalRepository.createStep(milestone.id, {
        text: 'Step to Delete',
      });

      await goalRepository.deleteStep(step.id);

      const deletedStep = await goalRepository.getStepById(step.id);
      expect(deletedStep?.status).toBe('pending_delete');
    });
  });

  describe('Complex Queries', () => {
    test('getGoalsWithMilestones returns goals with nested data', async () => {
      const goal = await goalRepository.createGoal({
        title: 'Complex Goal',
        userId: 'test-user',
        milestones: [
          {
            title: 'Milestone 1',
            steps: [
              { text: 'Step 1', completed: false },
              { text: 'Step 2', completed: true },
            ],
          },
          {
            title: 'Milestone 2',
            steps: [
              { text: 'Step 3', completed: false },
            ],
          },
        ],
      });

      const goalsWithMilestones = await goalRepository.getGoalsWithMilestones();
      const complexGoal = goalsWithMilestones.find(g => g.id === goal.id);

      expect(complexGoal).toBeTruthy();
      expect(complexGoal?.milestones).toHaveLength(2);
      expect(complexGoal?.milestones[0].steps).toHaveLength(2);
      expect(complexGoal?.milestones[1].steps).toHaveLength(1);
    });

    test('getTasksByDueDate filters correctly', async () => {
      const today = new Date();
      const tomorrow = new Date(today.getTime() + 24 * 60 * 60 * 1000);
      const yesterday = new Date(today.getTime() - 24 * 60 * 60 * 1000);

      await taskRepository.createTask({
        title: 'Today Task',
        dueDate: today,
        userId: 'test-user',
      });

      await taskRepository.createTask({
        title: 'Tomorrow Task',
        dueDate: tomorrow,
        userId: 'test-user',
      });

      await taskRepository.createTask({
        title: 'Yesterday Task',
        dueDate: yesterday,
        userId: 'test-user',
      });

      const todayTasks = await taskRepository.getTasksByDueDate(today);
      expect(todayTasks).toHaveLength(1);
      expect(todayTasks[0].title).toBe('Today Task');

      const overdueTasks = await taskRepository.getOverdueTasks();
      expect(overdueTasks).toHaveLength(1);
      expect(overdueTasks[0].title).toBe('Yesterday Task');
    });
  });
});
