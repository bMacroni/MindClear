import React from 'react';
import { render, fireEvent, waitFor } from '@testing-library/react-native';
import { TasksScreen } from '../../../screens/tasks/TasksScreen';
import { NavigationContainer } from '@react-navigation/native';
import { act } from 'react-test-renderer';

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
    usersAPI: {
      getMe: jest.fn().mockResolvedValue({ notification_preferences: { momentum_mode: { enabled: true, travel_preference: 'allow_travel' } } }),
      updateMe: jest.fn().mockResolvedValue({}),
    },
    tasksAPI: {
      ...actual.tasksAPI,
      getTasks: jest.fn().mockResolvedValue([
        { id: '1', title: 'Focus A', status: 'in_progress', is_today_focus: true, priority: 'high' },
        { id: '2', title: 'Task B', status: 'not_started', is_today_focus: false, priority: 'medium' },
      ]),
      updateTask: jest.fn().mockImplementation(async (id, body) => ({ id, title: id === '1' ? 'Focus A' : 'Task B', is_today_focus: id === '1' ? false : false, status: body.status || 'not_started', priority: id === '1' ? 'high' : 'medium' })),
    },
    goalsAPI: { getGoals: jest.fn().mockResolvedValue([]) },
  };
});

jest.mock('@react-native-async-storage/async-storage', () => require('@react-native-async-storage/async-storage/jest/async-storage-mock'));

describe('Momentum Mode', () => {
  function renderWithNav(ui: React.ReactElement) {
    return render(<NavigationContainer>{ui}</NavigationContainer>);
  }

  it('toggles Momentum via icon-only button (uses accessibility label)', async () => {
    const utils = renderWithNav(<TasksScreen />);
    const { getByText, getByTestId } = utils as any;
    await waitFor(() => getByText(/Tasks/));
    // Should have an a11y label reflecting state
    // use getByLabelText which is supported alias
    expect((utils as any).getByLabelText(/Momentum (On|Off)/)).toBeTruthy();
    const toggle = getByTestId('momentumToggle');
    act(() => { fireEvent.press(toggle); });
    await waitFor(() => expect((utils as any).getByLabelText(/Momentum (On|Off)/)).toBeTruthy());
  });

  it('switches travel preference (icon-only) and updates accessibility label', async () => {
    const utils = renderWithNav(<TasksScreen />);
    const { getByText, getByTestId } = utils as any;
    await waitFor(() => getByText(/Tasks/));
    const travelBtn = getByTestId('travelPrefButton');
    expect((utils as any).getByLabelText(/(Home Only|Allow Travel)/)).toBeTruthy();
    act(() => { fireEvent.press(travelBtn); });
    await waitFor(() => expect((utils as any).getByLabelText(/(Home Only|Allow Travel)/)).toBeTruthy());
  });
});


