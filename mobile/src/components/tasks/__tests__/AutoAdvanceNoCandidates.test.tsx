import React from 'react';
import { render, fireEvent, waitFor } from '@testing-library/react-native';
import { TasksScreen } from '../../../screens/tasks/TasksScreen';
import { NavigationContainer } from '@react-navigation/native';

jest.mock('../../../repositories/TaskRepository', () => ({
  taskRepository: {
    getNextFocusTask: jest.fn().mockImplementation(async () => {
      const err: any = new Error('No other tasks match your criteria.');
      throw err;
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
      ]),
      updateTask: jest.fn().mockResolvedValue({ id: '1', title: 'Focus A', status: 'completed', is_today_focus: false, priority: 'high' }),
    },
    goalsAPI: { getGoals: jest.fn().mockResolvedValue([]) },
  };
});

jest.mock('@react-native-async-storage/async-storage', () => require('@react-native-async-storage/async-storage/jest/async-storage-mock'));

function renderWithNav(ui: React.ReactElement) {
  return render(<NavigationContainer>{ui}</NavigationContainer>);
}

describe('Auto-advance no candidates path', () => {
  it('shows cleared-all toast when no candidates', async () => {
    const { getByTestId, getByText, queryByText } = renderWithNav(<TasksScreen />);
    await waitFor(() => getByText(/Tasks/));
    const complete = getByTestId('completeFocusButton');
    fireEvent.press(complete);
    await waitFor(() => expect(queryByText("Great work, you've cleared all your tasks!")).toBeTruthy());
  });
});


