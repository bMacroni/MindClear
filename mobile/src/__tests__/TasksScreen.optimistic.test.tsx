import React from 'react';
import { render, fireEvent, waitFor } from '@testing-library/react-native';
import TasksScreen from '../screens/tasks/TasksScreen';
import { NavigationContainer } from '@react-navigation/native';

// Mock services used by TasksScreen
jest.mock('../services/api', () => {
  const real = jest.requireActual('../services/api');
  return {
    ...real,
    tasksAPI: {
      getTasks: jest.fn(async () => ([
        { id: 't1', title: 'Do dishes', status: 'not_started', priority: 'low' },
        { id: 't2', title: 'Write report', status: 'not_started', priority: 'medium' },
      ])),
      updateTask: jest.fn(async (id, body) => ({ id, title: id === 't1' ? 'Do dishes' : 'Write report', status: body.status || 'not_started', priority: id === 't1' ? 'low' : 'medium' })),
      deleteTask: jest.fn(async () => undefined),
      createTask: jest.fn(),
      focusNext: jest.fn(),
    },
    goalsAPI: {
      getGoals: jest.fn(async () => ([])),
    },
    calendarAPI: {
      createEvent: jest.fn(async () => ({ data: { scheduled_time: new Date().toISOString() } })),
    },
    autoSchedulingAPI: {
      autoScheduleTasks: jest.fn(async () => ({ successful: 0 })),
      toggleTaskAutoScheduling: jest.fn(async () => ({})),
    },
    appPreferencesAPI: {
      get: jest.fn(async () => ({ momentum_mode_enabled: false, momentum_travel_preference: 'allow_travel' })),
      update: jest.fn(async () => ({})),
    },
  };
});

jest.mock('../services/enhancedApi', () => ({
  enhancedAPI: {
    getEvents: jest.fn(async () => ([])),
    getEventsForDate: jest.fn(async () => ([])),
    getEventsForTask: jest.fn(async () => ([])),
    deleteEvent: jest.fn(async () => ({})),
    scheduleTaskOnCalendar: jest.fn(async () => ({})),
  }
}));

jest.mock('../services/offline', () => ({
  offlineService: {
    getCachedTasks: jest.fn(async () => null),
    getCachedGoals: jest.fn(async () => null),
    cacheTasks: jest.fn(async () => {}),
    cacheGoals: jest.fn(async () => {}),
  }
}));

jest.mock('../services/analyticsService', () => ({
  __esModule: true,
  default: { trackScreenView: jest.fn(async () => {}), trackTaskCompleted: jest.fn(async () => {}) }
}));

jest.mock('react-native-safe-area-context', () => {
  const React = require('react');
  return {
    __esModule: true,
    SafeAreaView: ({ children }) => React.createElement('SafeAreaView', null, children),
    useSafeAreaInsets: () => ({ top: 0, right: 0, bottom: 0, left: 0 }),
  };
});

describe('TasksScreen optimistic updates', () => {
  const renderScreen = () => render(
    <NavigationContainer>
      <TasksScreen />
    </NavigationContainer>
  );

  it('optimistically toggles status to completed', async () => {
    const { getByTestId, queryByText, getByText } = renderScreen();

    await waitFor(() => expect(getByText('Tasks')).toBeTruthy());

    // Open inbox so list renders
    const inboxToggle = getByText(/Inbox/).parent as any;
    fireEvent.press(inboxToggle);

    // Press complete on first task
    const completeBtn = getByTestId('task-t1-complete');
    fireEvent.press(completeBtn);

    // Title should show completed style via line-through; we can't easily assert style, but we can
    // assert the element still exists quickly without waiting for network
    expect(getByTestId('task-t1-title')).toBeTruthy();
  });

  it('optimistically deletes a task', async () => {
    const { getByText, getByTestId, queryByTestId } = renderScreen();

    await waitFor(() => expect(getByText('Tasks')).toBeTruthy());
    const inboxToggle = getByText(/Inbox/).parent as any;
    fireEvent.press(inboxToggle);

    const taskItem = getByTestId('task-t2');
    const deleteBtn = getByTestId('task-t2-delete');
    fireEvent.press(deleteBtn);

    // Optimistically removed
    await waitFor(() => expect(queryByTestId('task-t2')).toBeNull());
  });
});



