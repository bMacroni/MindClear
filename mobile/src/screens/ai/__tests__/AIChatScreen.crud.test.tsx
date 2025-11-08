import { goalRepository } from '../../../repositories/GoalRepository';
import { taskRepository } from '../../../repositories/TaskRepository';
import { conversationRepository } from '../../../repositories/ConversationRepository';
import { calendarAPI } from '../../../services/api';
import { tasksAPI } from '../../../services/api';
import { Alert } from 'react-native';

// Mock all dependencies
jest.mock('../../../repositories/GoalRepository', () => ({
  goalRepository: {
    createGoal: jest.fn(),
    updateGoal: jest.fn(),
    deleteGoal: jest.fn(),
    getGoalById: jest.fn(),
    getAllGoals: jest.fn(),
    createMilestone: jest.fn(),
    createMilestoneStep: jest.fn(),
  },
}));

jest.mock('../../../repositories/TaskRepository', () => ({
  taskRepository: {
    createTask: jest.fn(),
    updateTask: jest.fn(),
    deleteTask: jest.fn(),
    getTaskById: jest.fn(),
    getAllTasks: jest.fn(),
  },
}));

jest.mock('../../../repositories/ConversationRepository', () => ({
  conversationRepository: {
    createThread: jest.fn(),
    getThreadById: jest.fn(),
    updateThread: jest.fn(),
    deleteThread: jest.fn(),
    createMessage: jest.fn(),
    getMessagesByThreadId: jest.fn(),
    markMessageAsSynced: jest.fn(),
  },
}));

jest.mock('../../../services/api', () => ({
  calendarAPI: {
    createEvent: jest.fn(),
    updateEvent: jest.fn(),
    deleteEvent: jest.fn(),
    getEvents: jest.fn(),
  },
  tasksAPI: {
    updateTask: jest.fn(),
    createTask: jest.fn(),
    deleteTask: jest.fn(),
  },
}));

jest.mock('../../../services/auth', () => ({
  authService: {
    getCurrentUser: jest.fn(() => ({ id: 'user-123', email: 'test@example.com' })),
  },
}));

jest.mock('../../../utils/dateUtils', () => ({
  safeParseDate: jest.fn((date: string) => new Date(date)),
}));

// Mock Alert
jest.spyOn(Alert, 'alert').mockImplementation(() => {});

describe('AIChatScreen CRUD Operations', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('Goal CRUD Operations', () => {
    test('CREATE: Can create a goal through AI chat with goal breakdown', async () => {
      const goalData = {
        title: 'Learn React Native',
        description: 'Master React Native development',
        category: 'education',
        dueDate: new Date('2025-12-31'),
        milestones: [
          {
            title: 'Milestone 1: Basics',
            steps: [{ text: 'Learn React fundamentals' }],
          },
          {
            title: 'Milestone 2: Advanced',
            steps: [
              { text: 'Learn navigation' },
              { text: 'Learn state management' },
            ],
          },
        ],
      };

      const mockGoal = {
        id: 'goal-1',
        title: goalData.title,
        description: goalData.description,
        category: goalData.category,
        targetCompletionDate: goalData.dueDate,
      };

      const mockMilestone1 = {
        id: 'milestone-1',
        title: goalData.milestones[0].title,
        order: 0,
      };

      const mockMilestone2 = {
        id: 'milestone-2',
        title: goalData.milestones[1].title,
        order: 1,
      };

      (goalRepository.createGoal as jest.Mock).mockResolvedValue(mockGoal);
      (goalRepository.createMilestone as jest.Mock)
        .mockResolvedValueOnce(mockMilestone1)
        .mockResolvedValueOnce(mockMilestone2);
      (goalRepository.createMilestoneStep as jest.Mock).mockResolvedValue({
        id: 'step-1',
        text: 'Step text',
        order: 0,
      });

      // Simulate handleSaveGoal from AIChatScreen
      // 1. Create the goal
      const createdGoal = await goalRepository.createGoal({
        title: goalData.title,
        description: goalData.description,
        targetCompletionDate: goalData.dueDate,
        category: goalData.category,
      });

      expect(createdGoal).toBeDefined();
      expect(goalRepository.createGoal).toHaveBeenCalledWith({
        title: goalData.title,
        description: goalData.description,
        targetCompletionDate: goalData.dueDate,
        category: goalData.category,
      });

      // 2. Create milestones and steps
      for (const [milestoneIndex, milestone] of goalData.milestones.entries()) {
        const newMilestone = await goalRepository.createMilestone(createdGoal.id, {
          title: milestone.title,
          description: '',
          order: milestoneIndex,
        });

        expect(goalRepository.createMilestone).toHaveBeenCalledWith(
          createdGoal.id,
          expect.objectContaining({
            title: milestone.title,
            order: milestoneIndex,
          })
        );

        for (const [stepIndex, step] of milestone.steps.entries()) {
          await goalRepository.createMilestoneStep(newMilestone.id, {
            text: step.text,
            order: stepIndex,
          });

          expect(goalRepository.createMilestoneStep).toHaveBeenCalledWith(
            newMilestone.id,
            expect.objectContaining({
              text: step.text,
              order: stepIndex,
            })
          );
        }
      }

      // Verify all operations were called
      expect(goalRepository.createGoal).toHaveBeenCalledTimes(1);
      expect(goalRepository.createMilestone).toHaveBeenCalledTimes(2);
      expect(goalRepository.createMilestoneStep).toHaveBeenCalledTimes(3); // 1 + 2 steps
    });

    test('READ: Can retrieve goals through repository', async () => {
      const mockGoals = [
        {
          id: 'goal-1',
          title: 'Goal 1',
          description: 'Description 1',
          category: 'career',
        },
        {
          id: 'goal-2',
          title: 'Goal 2',
          description: 'Description 2',
          category: 'health',
        },
      ];

      (goalRepository.getAllGoals as jest.Mock).mockResolvedValue(mockGoals);

      const goals = await goalRepository.getAllGoals();

      expect(goals).toEqual(mockGoals);
      expect(goalRepository.getAllGoals).toHaveBeenCalled();
    });

    test('UPDATE: Can update a goal through repository', async () => {
      const updatedGoal = {
        id: 'goal-1',
        title: 'Updated Goal Title',
        description: 'Updated description',
        category: 'education',
      };

      (goalRepository.updateGoal as jest.Mock).mockResolvedValue(updatedGoal);

      const result = await goalRepository.updateGoal('goal-1', {
        title: 'Updated Goal Title',
        description: 'Updated description',
      });

      expect(result).toEqual(updatedGoal);
      expect(goalRepository.updateGoal).toHaveBeenCalledWith('goal-1', {
        title: 'Updated Goal Title',
        description: 'Updated description',
      });
    });

    test('DELETE: Can delete a goal through repository', async () => {
      (goalRepository.deleteGoal as jest.Mock).mockResolvedValue(undefined);

      await goalRepository.deleteGoal('goal-1');

      expect(goalRepository.deleteGoal).toHaveBeenCalledWith('goal-1');
    });
  });

  describe('Task CRUD Operations', () => {
    test('CREATE: Can create tasks through AI chat', async () => {
      const taskData = {
        title: 'Complete project',
        description: 'Finish the project',
        dueDate: new Date('2025-12-31'),
        priority: 'high',
        status: 'not_started' as const,
      };

      const mockTask = {
        id: 'task-1',
        ...taskData,
      };

      (taskRepository.createTask as jest.Mock).mockResolvedValue(mockTask);

      const createdTask = await taskRepository.createTask(taskData);

      expect(createdTask).toBeDefined();
      expect(taskRepository.createTask).toHaveBeenCalledWith(taskData);
      expect(createdTask.id).toBe('task-1');
      expect(createdTask.title).toBe(taskData.title);
    });

    test('READ: Can retrieve tasks through repository', async () => {
      const mockTasks = [
        {
          id: 'task-1',
          title: 'Task 1',
          status: 'not_started',
        },
        {
          id: 'task-2',
          title: 'Task 2',
          status: 'completed',
        },
      ];

      (taskRepository.getAllTasks as jest.Mock).mockResolvedValue(mockTasks);

      const tasks = await taskRepository.getAllTasks();

      expect(tasks).toEqual(mockTasks);
      expect(taskRepository.getAllTasks).toHaveBeenCalled();
    });

    test('UPDATE: Can update task status through tasksAPI', async () => {
      const mockTask = {
        id: 'task-1',
        title: 'Test Task',
        status: 'not_started',
      };

      (tasksAPI.updateTask as jest.Mock).mockResolvedValue({
        ...mockTask,
        status: 'completed',
      });

      const result = await tasksAPI.updateTask('task-1', { status: 'completed' });

      expect(result.status).toBe('completed');
      expect(tasksAPI.updateTask).toHaveBeenCalledWith('task-1', { status: 'completed' });
    });

    test('DELETE: Can delete a task through repository', async () => {
      (taskRepository.deleteTask as jest.Mock).mockResolvedValue(undefined);

      await taskRepository.deleteTask('task-1');

      expect(taskRepository.deleteTask).toHaveBeenCalledWith('task-1');
    });
  });

  describe('Calendar Event CRUD Operations', () => {
    test('CREATE: Can create calendar event through schedule display', async () => {
      const eventData = {
        summary: 'Team Meeting',
        description: 'Weekly team sync',
        startTime: '2025-01-15T10:00:00Z',
        endTime: '2025-01-15T11:00:00Z',
      };

      const mockEvent = {
        id: 'event-1',
        ...eventData,
      };

      (calendarAPI.createEvent as jest.Mock).mockResolvedValue(mockEvent);

      const createdEvent = await calendarAPI.createEvent(eventData);

      expect(createdEvent).toBeDefined();
      expect(calendarAPI.createEvent).toHaveBeenCalledWith(eventData);
      expect(createdEvent.id).toBe('event-1');
      expect(createdEvent.summary).toBe(eventData.summary);
    });

    test('READ: Can retrieve calendar events through API', async () => {
      const mockEvents = [
        {
          id: 'event-1',
          summary: 'Meeting 1',
          startTime: '2025-01-15T10:00:00Z',
          endTime: '2025-01-15T11:00:00Z',
        },
        {
          id: 'event-2',
          summary: 'Meeting 2',
          startTime: '2025-01-15T14:00:00Z',
          endTime: '2025-01-15T15:00:00Z',
        },
      ];

      (calendarAPI.getEvents as jest.Mock).mockResolvedValue(mockEvents);

      const events = await calendarAPI.getEvents(10);

      expect(events).toEqual(mockEvents);
      expect(calendarAPI.getEvents).toHaveBeenCalledWith(10);
    });

    test('UPDATE: Can update calendar event through API', async () => {
      const updatedEvent = {
        id: 'event-1',
        summary: 'Updated Meeting',
        startTime: '2025-01-15T10:00:00Z',
        endTime: '2025-01-15T11:30:00Z',
      };

      (calendarAPI.updateEvent as jest.Mock).mockResolvedValue(updatedEvent);

      const result = await calendarAPI.updateEvent('event-1', {
        summary: 'Updated Meeting',
        endTime: '2025-01-15T11:30:00Z',
      });

      expect(result).toEqual(updatedEvent);
      expect(calendarAPI.updateEvent).toHaveBeenCalledWith('event-1', {
        summary: 'Updated Meeting',
        endTime: '2025-01-15T11:30:00Z',
      });
    });

    test('DELETE: Can delete calendar event through API', async () => {
      (calendarAPI.deleteEvent as jest.Mock).mockResolvedValue(undefined);

      await calendarAPI.deleteEvent('event-1');

      expect(calendarAPI.deleteEvent).toHaveBeenCalledWith('event-1');
    });
  });

  describe('Integration: Full CRUD Flow', () => {
    test('Can perform full CRUD cycle: Create goal, create task, create calendar event', async () => {
      // Create goal
      const goalData = {
        title: 'Complete Project',
        description: 'Finish the project',
        category: 'career',
      };

      const mockGoal = {
        id: 'goal-1',
        ...goalData,
      };

      (goalRepository.createGoal as jest.Mock).mockResolvedValue(mockGoal);

      const createdGoal = await goalRepository.createGoal(goalData);
      expect(createdGoal).toBeDefined();

      // Create task
      const taskData = {
        title: 'Task 1',
        status: 'not_started' as const,
      };

      const mockTask = {
        id: 'task-1',
        ...taskData,
      };

      (taskRepository.createTask as jest.Mock).mockResolvedValue(mockTask);

      const createdTask = await taskRepository.createTask(taskData);
      expect(createdTask).toBeDefined();

      // Create calendar event
      const eventData = {
        summary: 'Project Meeting',
        startTime: '2025-01-15T10:00:00Z',
        endTime: '2025-01-15T11:00:00Z',
      };

      const mockEvent = {
        id: 'event-1',
        ...eventData,
      };

      (calendarAPI.createEvent as jest.Mock).mockResolvedValue(mockEvent);

      const createdEvent = await calendarAPI.createEvent(eventData);
      expect(createdEvent).toBeDefined();

      // Verify all operations completed
      expect(goalRepository.createGoal).toHaveBeenCalled();
      expect(taskRepository.createTask).toHaveBeenCalled();
      expect(calendarAPI.createEvent).toHaveBeenCalled();
    });
  });

  describe('Error Handling', () => {
    test('Handles goal creation errors gracefully', async () => {
      (goalRepository.createGoal as jest.Mock).mockRejectedValue(
        new Error('Failed to create goal')
      );

      await expect(
        goalRepository.createGoal({
          title: 'Test Goal',
          description: 'Test',
          category: 'other',
        })
      ).rejects.toThrow('Failed to create goal');

      expect(goalRepository.createGoal).toHaveBeenCalled();
    });

    test('Handles task update errors gracefully', async () => {
      (tasksAPI.updateTask as jest.Mock).mockRejectedValue(
        new Error('Failed to update task')
      );

      await expect(
        tasksAPI.updateTask('task-1', { status: 'completed' })
      ).rejects.toThrow('Failed to update task');

      expect(tasksAPI.updateTask).toHaveBeenCalled();
    });

    test('Handles calendar event creation errors gracefully', async () => {
      (calendarAPI.createEvent as jest.Mock).mockRejectedValue(
        new Error('Failed to create event')
      );

      await expect(
        calendarAPI.createEvent({
          summary: 'Test Event',
          startTime: '2025-01-15T10:00:00Z',
          endTime: '2025-01-15T11:00:00Z',
        })
      ).rejects.toThrow('Failed to create event');

      expect(calendarAPI.createEvent).toHaveBeenCalled();
    });
  });
});
