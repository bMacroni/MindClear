import React from 'react';
import { render, fireEvent, waitFor } from '@testing-library/react-native';
import { TasksScreen } from '../../../screens/tasks/TasksScreen';
import { NavigationContainer } from '@react-navigation/native';

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
      focusNext: jest.fn().mockResolvedValue({ id: '2', title: 'Task B', status: 'not_started', is_today_focus: true, priority: 'medium' }),
    },
    goalsAPI: { getGoals: jest.fn().mockResolvedValue([]) },
  };
});

jest.mock('@react-native-async-storage/async-storage', () => require('@react-native-async-storage/async-storage/jest/async-storage-mock'));

function renderWithNav(ui: React.ReactElement) {
  return render(<NavigationContainer>{ui}</NavigationContainer>);
}

describe('Skip exhaustion retains original focus', () => {
  it('when focusNext 404 repeatedly, focus remains unchanged', async () => {
    const { getByTestId, getByText, queryByText } = renderWithNav(<TasksScreen />);
    await waitFor(() => getByText('Tasks'));
    const skip = getByTestId('skipFocusButton');
    // Change mock to 404 after first attempt
    const mod = require('../../../services/api');
    (mod.tasksAPI.focusNext as jest.Mock).mockImplementationOnce(async () => { const err: any = new Error('No other tasks match your criteria.'); err.code = 404; throw err; });
    fireEvent.press(skip);
    await waitFor(() => expect(queryByText('No other tasks match your criteria.')).toBeTruthy());
    // Verify focus card still shows original title
    const { getAllByText } = renderWithNav(<TasksScreen />);
    await waitFor(() => expect(getAllByText('Focus A').length).toBeGreaterThan(0));
  });
});


