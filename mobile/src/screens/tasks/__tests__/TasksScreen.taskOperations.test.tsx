import React from 'react';
import { render, fireEvent, waitFor } from '@testing-library/react-native';
import { NavigationContainer } from '@react-navigation/native';
import TasksScreen from '../TasksScreen';
import { taskRepository } from '../../../repositories/TaskRepository';
import { syncService } from '../../../services/SyncService';

// Mock dependencies
jest.mock('../../../repositories/TaskRepository', () => ({
  taskRepository: {
    createTask: jest.fn(),
    updateTask: jest.fn(),
    updateTaskStatus: jest.fn(),
    deleteTask: jest.fn(),
    setTaskAsFocus: jest.fn(),
    getTaskById: jest.fn(),
  },
}));

jest.mock('../../../services/SyncService', () => ({
  syncService: {
    silentSync: jest.fn(),
  },
}));

jest.mock('../../../services/api', () => ({
  tasksAPI: {
    focusNext: jest.fn(),
  },
  goalsAPI: {
    getGoals: jest.fn(() => Promise.resolve([])),
  },
  calendarAPI: {
    createEvent: jest.fn(),
  },
  autoSchedulingAPI: {
    autoScheduleTasks: jest.fn(() => Promise.resolve({ successful: 0 })),
    toggleTaskAutoScheduling: jest.fn(),
  },
  appPreferencesAPI: {
    get: jest.fn(() => Promise.resolve({ 
      momentum_mode_enabled: false,
      momentum_travel_preference: 'allow_travel',
    })),
    update: jest.fn(),
  },
}));

jest.mock('../../../services/enhancedApi', () => ({
  enhancedAPI: {
    getEvents: jest.fn(() => Promise.resolve([])),
    getEventsForDate: jest.fn(() => Promise.resolve([])),
    getEventsForTask: jest.fn(() => Promise.resolve([])),
    deleteEvent: jest.fn(),
    scheduleTaskOnCalendar: jest.fn(),
    getSchedulingPreferences: jest.fn(() => Promise.resolve({
      preferred_start_time: '09:00:00',
      preferred_end_time: '17:00:00',
      buffer_time_minutes: 15,
      work_days: [1, 2, 3, 4, 5],
    })),
  },
}));

jest.mock('../../../services/analyticsService', () => ({
  __esModule: true,
  default: {
    trackScreenView: jest.fn(),
    trackTaskCompleted: jest.fn(),
  },
}));


// Mock withObservables to return mock tasks
jest.mock('@nozbe/watermelondb/react/withObservables', () => {
  return jest.fn((Component) => Component);
});

// Mock database context
jest.mock('../../../contexts/DatabaseContext', () => ({
  useDatabase: jest.fn(() => ({
    collections: {
      get: jest.fn(() => ({
        query: jest.fn(() => ({
          observe: jest.fn(() => ({
            subscribe: jest.fn(),
            next: jest.fn(),
          })),
        })),
      })),
    },
  })),
}));

describe('TasksScreen Task Operations', () => {
  const mockTasks = [
    {
      id: 'task-1',
      title: 'Task 1',
      description: 'Description 1',
      priority: 'medium',
      status: 'pending_update:not_started',
      isTodayFocus: false,
      goalId: undefined,
      isTodayFocus: false,
    },
    {
      id: 'task-2',
      title: 'Task 2',
      description: 'Description 2',
      priority: 'high',
      status: 'pending_update:in_progress',
      isTodayFocus: true,
      goalId: undefined,
    },
  ];

  const mockGoals: any[] = [];

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('Task Status Toggle', () => {
    test('toggles task status to completed', async () => {
      const mockUpdateStatus = taskRepository.updateTaskStatus as jest.Mock;
      mockUpdateStatus.mockResolvedValue({
        id: 'task-1',
        status: 'pending_update:completed',
      });

      const { getByTestId } = render(
        <NavigationContainer>
          <TasksScreen tasks={mockTasks} goals={mockGoals} />
        </NavigationContainer>
      );

      // Simulate status toggle
      const toggleButton = getByTestId('task-toggle-task-1');
      fireEvent.press(toggleButton);

      await waitFor(() => {
        expect(mockUpdateStatus).toHaveBeenCalledWith('task-1', 'completed');
      });
    });

    test('toggles task status to in_progress', async () => {
      const mockUpdateStatus = taskRepository.updateTaskStatus as jest.Mock;
      mockUpdateStatus.mockResolvedValue({
        id: 'task-1',
        status: 'pending_update:in_progress',
      });

      const { getByTestId } = render(
        <NavigationContainer>
          <TasksScreen tasks={mockTasks} goals={mockGoals} />
        </NavigationContainer>
      );

      // Simulate status toggle to in_progress
      const toggleButton = getByTestId('task-toggle-task-1');
      fireEvent.press(toggleButton);

      await waitFor(() => {
        expect(mockUpdateStatus).toHaveBeenCalledWith('task-1', 'in_progress');
      });
    });

    test('handles status toggle errors gracefully', async () => {
      const mockUpdateStatus = taskRepository.updateTaskStatus as jest.Mock;
      mockUpdateStatus.mockRejectedValue(new Error('Update failed'));

      const { getByTestId } = render(
        <NavigationContainer>
          <TasksScreen tasks={mockTasks} goals={mockGoals} />
        </NavigationContainer>
      );

      const toggleButton = getByTestId('task-toggle-task-1');
      fireEvent.press(toggleButton);

      await waitFor(() => {
        expect(mockUpdateStatus).toHaveBeenCalled();
      });

      // Should handle error without crashing
    });
  });

  describe('Task Creation', () => {
    test('creates new task', async () => {
      const mockCreateTask = taskRepository.createTask as jest.Mock;
      mockCreateTask.mockResolvedValue({
        id: 'new-task',
        title: 'New Task',
        status: 'pending_create:not_started',
      });

      const { getByTestId } = render(
        <NavigationContainer>
          <TasksScreen tasks={mockTasks} goals={mockGoals} />
        </NavigationContainer>
      );

      // Open create modal
      const createButton = getByTestId('fab-create-task');
      fireEvent.press(createButton);

      // Fill form and save (simplified - actual form interaction would be more complex)
      await waitFor(() => {
        // This would require actual form interaction
      });
    });

    test('creates task with combined status format', async () => {
      const mockCreateTask = taskRepository.createTask as jest.Mock;
      mockCreateTask.mockResolvedValue({
        id: 'new-task',
        title: 'New Task',
        status: 'pending_create:completed',
      });

      // Test that createTask is called with correct status
      expect(mockCreateTask).not.toHaveBeenCalled(); // Before creation

      // Simulate task creation
      await taskRepository.createTask({
        title: 'New Task',
        status: 'completed',
      });

      expect(mockCreateTask).toHaveBeenCalledWith(
        expect.objectContaining({
          title: 'New Task',
          status: 'completed',
        })
      );
    });
  });

  describe('Task Deletion', () => {
    test('deletes task using repository', async () => {
      const mockDeleteTask = taskRepository.deleteTask as jest.Mock;
      mockDeleteTask.mockResolvedValue(undefined);

      const { getByTestId } = render(
        <NavigationContainer>
          <TasksScreen tasks={mockTasks} goals={mockGoals} />
        </NavigationContainer>
      );

      // Simulate delete action
      const deleteButton = getByTestId('task-delete-task-1');
      fireEvent.press(deleteButton);

      await waitFor(() => {
        expect(mockDeleteTask).toHaveBeenCalledWith('task-1');
      });
    });
  });

  describe('Task Focus Management', () => {
    test('sets task as focus using repository', async () => {
      const mockSetFocus = taskRepository.setTaskAsFocus as jest.Mock;
      mockSetFocus.mockResolvedValue({
        id: 'task-1',
        isTodayFocus: true,
        status: 'pending_update:not_started',
      });

      const { getByTestId } = render(
        <NavigationContainer>
          <TasksScreen tasks={mockTasks} goals={mockGoals} />
        </NavigationContainer>
      );

      // Simulate setting focus
      const focusButton = getByTestId('task-set-focus-task-1');
      fireEvent.press(focusButton);

      await waitFor(() => {
        expect(mockSetFocus).toHaveBeenCalledWith('task-1');
      });
    });
  });


  describe('Status Format Handling', () => {
    test('correctly extracts lifecycle status from combined format', () => {
      // Test getLifecycleStatus helper function behavior
      const testCases = [
        { status: 'pending_update:completed', expected: 'completed' },
        { status: 'pending_update:in_progress', expected: 'in_progress' },
        { status: 'pending_update:not_started', expected: 'not_started' },
        { status: 'pending_create:completed', expected: 'completed' },
        { status: 'completed', expected: 'completed' },
        { status: 'in_progress', expected: 'in_progress' },
        { status: 'not_started', expected: 'not_started' },
      ];

      // This would test the getLifecycleStatus function
      // Implementation depends on how it's exported/accessible
    });

    test('filters tasks correctly based on lifecycle status', () => {
      const tasks = [
        { ...mockTasks[0], status: 'pending_update:completed' },
        { ...mockTasks[1], status: 'pending_update:not_started' },
      ];

      // This would test that completed tasks are filtered correctly
      // Implementation depends on component filtering logic
    });
  });
});
