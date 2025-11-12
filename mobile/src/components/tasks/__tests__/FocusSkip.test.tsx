import React from 'react';
import { render, fireEvent, waitFor } from '@testing-library/react-native';
import { TasksScreen } from '../../../screens/tasks/TasksScreen';
import { NavigationContainer } from '@react-navigation/native';

jest.mock('../../../repositories/TaskRepository', () => ({
  taskRepository: {
    getNextFocusTask: jest.fn().mockResolvedValue({
      id: '2',
      title: 'Task B',
      status: 'pending_update:not_started',
      isTodayFocus: true,
      priority: 'medium',
      estimatedDurationMinutes: 30,
    }),
    updateTaskStatus: jest.fn(),
    setTaskAsFocus: jest.fn(),
  },
}));

jest.mock('../../../services/api', () => {
  const actual = jest.requireActual('../../../services/api');
  return {
    ...actual,
    appPreferencesAPI: {
      get: jest.fn(async () => ({ momentum_mode_enabled: true, momentum_travel_preference: 'allow_travel' })),
      update: jest.fn(async (p) => p),
    },
    tasksAPI: {
      ...actual.tasksAPI,
      getTasks: jest.fn().mockResolvedValue([
        { id: '1', title: 'Focus A', status: 'in_progress', is_today_focus: true, priority: 'high' },
        { id: '2', title: 'Task B', status: 'not_started', is_today_focus: false, priority: 'medium' },
      ]),
      updateTask: jest.fn().mockResolvedValue({ id: '1', title: 'Focus A', status: 'in_progress', is_today_focus: false, priority: 'high' }),
    },
    goalsAPI: { getGoals: jest.fn().mockResolvedValue([]) },
  };
});

jest.mock('@react-native-async-storage/async-storage', () => require('@react-native-async-storage/async-storage/jest/async-storage-mock'));

describe('Focus Skip', () => {
  function renderWithNav(ui: React.ReactElement) {
    return render(<NavigationContainer>{ui}</NavigationContainer>);
  }

  it('skips current focus and shows Next up toast', async () => {
    const { getByText, getByTestId, queryByText } = renderWithNav(<TasksScreen />);
    await waitFor(() => getByText(/Tasks/));
    // Momentum is enabled in mock usersAPI; skip button should be visible
    const skip = getByTestId('skipFocusButton');
    fireEvent.press(skip);
    await waitFor(() => expect(queryByText(/Next up:/)).toBeTruthy());
  });
});


