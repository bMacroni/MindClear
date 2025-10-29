import { configure } from '@testing-library/react-native';

// Configure testing library
configure({
  // Add any configuration options here
});

// Mock AsyncStorage
jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock')
);

// Mock NetInfo
jest.mock('@react-native-community/netinfo', () => ({
  addEventListener: jest.fn(),
  fetch: jest.fn(() => Promise.resolve({ isConnected: true })),
}));

// Mock WatermelonDB database
jest.mock('../db', () => ({
  getDatabase: jest.fn(() => ({
    write: jest.fn(),
    collections: {
      get: jest.fn(() => ({
        query: jest.fn(() => ({
          fetch: jest.fn(() => Promise.resolve([])),
          observe: jest.fn(() => ({
            subscribe: jest.fn(),
            unsubscribe: jest.fn(),
          })),
        })),
        findAndObserve: jest.fn(() => ({
          subscribe: jest.fn(),
          unsubscribe: jest.fn(),
        })),
        create: jest.fn(),
        find: jest.fn(),
      })),
    },
  })),
}));

// Mock navigation
jest.mock('@react-navigation/native', () => ({
  useNavigation: () => ({
    navigate: jest.fn(),
    goBack: jest.fn(),
  }),
  useRoute: () => ({
    params: {},
  }),
}));

// Mock React Native components
jest.mock('react-native', () => ({
  Alert: {
    alert: jest.fn(),
  },
  Platform: {
    OS: 'ios',
  },
  Dimensions: {
    get: jest.fn(() => ({ width: 375, height: 812 })),
  },
  StyleSheet: {
    create: jest.fn((styles) => styles),
  },
  View: 'View',
  Text: 'Text',
  ScrollView: 'ScrollView',
  FlatList: 'FlatList',
  TouchableOpacity: 'TouchableOpacity',
  TouchableHighlight: 'TouchableHighlight',
  TextInput: 'TextInput',
  Image: 'Image',
  ActivityIndicator: 'ActivityIndicator',
  Modal: 'Modal',
  SafeAreaView: 'SafeAreaView',
  StatusBar: 'StatusBar',
  AppRegistry: {
    registerComponent: jest.fn(),
  },
  NativeModules: {
    DevMenu: {
      addItem: jest.fn(),
      removeItem: jest.fn(),
    },
  },
  DevMenu: {
    addItem: jest.fn(),
    removeItem: jest.fn(),
  },
}));

// Mock React Native Paper
jest.mock('react-native-paper', () => ({
  Provider: ({ children }: { children: React.ReactNode }) => children,
  Button: 'Button',
  Card: 'Card',
  Text: 'Text',
  TextInput: 'TextInput',
  ActivityIndicator: 'ActivityIndicator',
  FAB: 'FAB',
  IconButton: 'IconButton',
  List: {
    Item: 'ListItem',
    Section: 'ListSection',
  },
  Portal: 'Portal',
  Modal: 'Modal',
  Surface: 'Surface',
  Divider: 'Divider',
  Chip: 'Chip',
  Badge: 'Badge',
  Avatar: 'Avatar',
  Title: 'Title',
  Paragraph: 'Paragraph',
  Caption: 'Caption',
  Subheading: 'Subheading',
  Headline: 'Headline',
  Display1: 'Display1',
  Display2: 'Display2',
  Display3: 'Display3',
  Display4: 'Display4',
  useTheme: () => ({
    colors: {
      primary: '#6200ee',
      background: '#ffffff',
      surface: '#ffffff',
      text: '#000000',
      disabled: '#cccccc',
      placeholder: '#999999',
      backdrop: 'rgba(0, 0, 0, 0.5)',
      onSurface: '#000000',
      notification: '#ff0000',
    },
    fonts: {
      regular: {
        fontFamily: 'System',
        fontWeight: '400' as const,
      },
      medium: {
        fontFamily: 'System',
        fontWeight: '500' as const,
      },
      light: {
        fontFamily: 'System',
        fontWeight: '300' as const,
      },
      thin: {
        fontFamily: 'System',
        fontWeight: '100' as const,
      },
    },
  }),
}));

// Mock vector icons
jest.mock('react-native-vector-icons/Octicons', () => 'Icon');

// Mock date utilities
jest.mock('../utils/dateUtils', () => ({
  formatDate: jest.fn((date: Date) => date.toISOString()),
  parseDate: jest.fn((dateString: string) => new Date(dateString)),
  safeParseDate: jest.fn((dateString: string) => {
    try {
      return new Date(dateString);
    } catch {
      return undefined;
    }
  }),
  isToday: jest.fn((date: Date) => {
    const today = new Date();
    return date.toDateString() === today.toDateString();
  }),
  isOverdue: jest.fn((date: Date) => {
    const today = new Date();
    return date < today;
  }),
}));

// Mock error handling service
jest.mock('../services/errorHandling', () => ({
  errorHandlingService: {
    handleError: jest.fn(),
    subscribe: jest.fn(),
    getErrorLogs: jest.fn(),
    resolveError: jest.fn(),
    clearResolvedErrors: jest.fn(),
    getNetworkStatus: jest.fn(),
    isNetworkError: jest.fn(),
    getRetryConfig: jest.fn(),
  },
  ErrorCategory: {
    CALENDAR: 'CALENDAR',
    TASKS: 'TASKS',
    GOALS: 'GOALS',
    AUTH: 'AUTH',
    SYNC: 'SYNC',
    GENERAL: 'GENERAL',
  },
  ErrorType: {
    NETWORK: 'NETWORK',
    AUTHENTICATION: 'AUTHENTICATION',
    AUTHORIZATION: 'AUTHORIZATION',
    VALIDATION: 'VALIDATION',
    SERVER: 'SERVER',
    TIMEOUT: 'TIMEOUT',
    OFFLINE: 'OFFLINE',
    UNKNOWN: 'UNKNOWN',
  },
  ErrorSeverity: {
    LOW: 'LOW',
    MEDIUM: 'MEDIUM',
    HIGH: 'HIGH',
    CRITICAL: 'CRITICAL',
  },
}));

// Mock notification service
jest.mock('../services/notificationService', () => ({
  notificationService: {
    showInAppNotification: jest.fn(),
    scheduleNotification: jest.fn(),
    cancelNotification: jest.fn(),
  },
}));

// Mock auth service
jest.mock('../services/auth', () => ({
  authService: {
    getCurrentUser: jest.fn(() => ({ id: 'test-user-id' })),
    isAuthenticated: jest.fn(() => true),
    signOut: jest.fn(),
  },
}));

// Mock API services
jest.mock('../services/api', () => ({
  tasksAPI: {
    getTasks: jest.fn(() => Promise.resolve([])),
    createTask: jest.fn(() => Promise.resolve({})),
    updateTask: jest.fn(() => Promise.resolve({})),
    deleteTask: jest.fn(() => Promise.resolve()),
  },
  goalsAPI: {
    getGoals: jest.fn(() => Promise.resolve([])),
    createGoal: jest.fn(() => Promise.resolve({})),
    updateGoal: jest.fn(() => Promise.resolve({})),
    deleteGoal: jest.fn(() => Promise.resolve()),
  },
  appPreferencesAPI: {
    getPreferences: jest.fn(() => Promise.resolve({})),
    updatePreferences: jest.fn(() => Promise.resolve({})),
  },
}));

// Mock offline service
jest.mock('../services/offline', () => ({
  offlineService: {
    getCachedTasks: jest.fn(() => Promise.resolve([])),
    getCachedGoals: jest.fn(() => Promise.resolve([])),
    cacheTasks: jest.fn(),
    cacheGoals: jest.fn(),
    isOnline: jest.fn(() => true),
  },
}));

// Mock enhanced API
jest.mock('../services/enhancedApi', () => ({
  enhancedAPI: {
    createTask: jest.fn(() => Promise.resolve({})),
    updateTask: jest.fn(() => Promise.resolve({})),
    deleteTask: jest.fn(() => Promise.resolve()),
    createGoal: jest.fn(() => Promise.resolve({})),
    updateGoal: jest.fn(() => Promise.resolve({})),
    deleteGoal: jest.fn(() => Promise.resolve()),
  },
}));

// Mock sync service
jest.mock('../services/SyncService', () => ({
  syncService: {
    sync: jest.fn(async (silent = false) => {
      try {
        // Simulate actual sync behavior by calling API methods
        const { taskRepository } = require('../repositories/TaskRepository');
        const { goalRepository } = require('../repositories/GoalRepository');
        const { enhancedAPI } = require('../services/enhancedApi');
        
        // Get all pending tasks and sync them
        const allTasks = await taskRepository.getAllTasks();
        for (const task of allTasks) {
          try {
            if (task.status === 'pending_create') {
              // Simulate API call
              await enhancedAPI.createTask({
                title: task.title,
                description: task.description,
                priority: task.priority,
                due_date: task.dueDate,
                estimated_duration_minutes: task.estimatedDurationMinutes,
                goal_id: task.goalId,
                is_today_focus: task.isTodayFocus,
                user_id: task.userId,
                client_updated_at: task.updatedAt?.toISOString(),
              });
              await taskRepository.updateTask(task.id, { status: 'synced' });
            } else if (task.status === 'pending_update') {
              await enhancedAPI.updateTask(task.id, {
                title: task.title,
                description: task.description,
                priority: task.priority,
                due_date: task.dueDate,
                estimated_duration_minutes: task.estimatedDurationMinutes,
                goal_id: task.goalId,
                is_today_focus: task.isTodayFocus,
                user_id: task.userId,
                client_updated_at: task.updatedAt?.toISOString(),
              });
              await taskRepository.updateTask(task.id, { status: 'synced' });
            } else if (task.status === 'pending_delete') {
              await enhancedAPI.deleteTask(task.id);
              // Remove from mock storage by updating to null status
              await taskRepository.updateTask(task.id, { status: 'deleted' });
            }
          } catch (error) {
            console.error(`Failed to sync task ${task.id}:`, error);
            // Continue with other tasks even if one fails
          }
        }
        
        // Get all pending goals and sync them
        const allGoals = await goalRepository.getAllGoals();
        for (const goal of allGoals) {
          try {
            if (goal.status === 'pending_create') {
              await enhancedAPI.createGoal({
                title: goal.title,
                description: goal.description,
                target_completion_date: goal.targetCompletionDate,
                category: goal.category,
                user_id: goal.userId,
                client_updated_at: goal.updatedAt?.toISOString(),
              });
              await goalRepository.updateGoal(goal.id, { status: 'synced' });
            } else if (goal.status === 'pending_update') {
              await enhancedAPI.updateGoal(goal.id, {
                title: goal.title,
                description: goal.description,
                target_completion_date: goal.targetCompletionDate,
                category: goal.category,
                user_id: goal.userId,
                client_updated_at: goal.updatedAt?.toISOString(),
              });
              await goalRepository.updateGoal(goal.id, { status: 'synced' });
            } else if (goal.status === 'pending_delete') {
              await enhancedAPI.deleteGoal(goal.id);
              // Remove from mock storage by updating to null status
              await goalRepository.updateGoal(goal.id, { status: 'deleted' });
            }
          } catch (error) {
            console.error(`Failed to sync goal ${goal.id}:`, error);
            // Continue with other goals even if one fails
          }
        }
        
        return Promise.resolve();
      } catch (error) {
        console.error('Sync service failed:', error);
        throw error;
      }
    }),
    silentSync: jest.fn(async () => {
      return require('../services/SyncService').syncService.sync(true);
    }),
    isSyncing: jest.fn(() => false),
  },
}));

// Global test setup
beforeEach(() => {
  // Reset all repository mocks before each test
  const { taskRepository } = require('../repositories/TaskRepository');
  const { goalRepository } = require('../repositories/GoalRepository');
  
  if (taskRepository.__resetMocks) {
    taskRepository.__resetMocks();
  }
  if (goalRepository.__resetMocks) {
    goalRepository.__resetMocks();
  }
  
  // Clear all jest mocks
  jest.clearAllMocks();
});

// Mock repositories with realistic behavior
jest.mock('../repositories/TaskRepository', () => {
  let mockTasks = new Map();
  let taskIdCounter = 1;

  const resetMocks = () => {
    mockTasks.clear();
    taskIdCounter = 1;
  };

  return {
    taskRepository: {
      // Add reset method for testing
      __resetMocks: resetMocks,
      createTask: jest.fn(async (taskData) => {
        // Validate date if provided (same validation as real repository)
        if (taskData.dueDate && isNaN(taskData.dueDate.getTime())) {
          throw new Error('Invalid due date provided. Date must be a valid Date object.');
        }

        const id = `task_${taskIdCounter++}`;
        const task = {
          id,
          ...taskData,
          status: 'pending_create',
          createdAt: new Date(),
          updatedAt: new Date(),
        };
        mockTasks.set(id, task);
        return task;
      }),
      updateTask: jest.fn(async (id, updates) => {
        // Validate date if provided (same validation as real repository)
        if (updates.dueDate && isNaN(updates.dueDate.getTime())) {
          throw new Error('Invalid due date provided. Date must be a valid Date object.');
        }

        const task = mockTasks.get(id);
        if (task) {
          const updatedTask = { 
            ...task, 
            ...updates, 
            status: updates.status !== undefined ? updates.status : 'pending_update', 
            updatedAt: new Date() 
          };
          mockTasks.set(id, updatedTask);
          return updatedTask;
        }
        throw new Error('Task not found');
      }),      deleteTask: jest.fn(async (id) => {
        const task = mockTasks.get(id);
        if (task) {
          const deletedTask = { ...task, status: 'pending_delete', updatedAt: new Date() };
          mockTasks.set(id, deletedTask);
          return deletedTask;
        }
        // No-op for non-existent tasks (idempotent)
        return;
      }),
      getTaskById: jest.fn(async (id) => {
        const task = mockTasks.get(id);
        return task && task.status !== 'deleted' ? task : null;
      }),
      getAllTasks: jest.fn(async () => {
        return Array.from(mockTasks.values()).filter(task => task.status !== 'deleted');
      }),
      getTasksByStatus: jest.fn(async (status) => {
        return Array.from(mockTasks.values()).filter(task => task.status === status);
      }),
      getTasksByPriority: jest.fn(async (priority) => {
        return Array.from(mockTasks.values()).filter(task => task.priority === priority && task.status !== 'pending_delete');
      }),
      getTasksByGoalId: jest.fn(async (goalId) => {
        return Array.from(mockTasks.values()).filter(task => task.goalId === goalId && task.status !== 'pending_delete');
      }),
      getTasksByDueDate: jest.fn(async (date) => {
        return Array.from(mockTasks.values()).filter(task => 
          task.dueDate && task.dueDate.toDateString() === date.toDateString() && task.status !== 'pending_delete'
        );
      }),
      getOverdueTasks: jest.fn(async () => {
        const today = new Date();
        return Array.from(mockTasks.values()).filter(task => 
          task.dueDate && task.dueDate < today && task.status !== 'pending_delete'
        );
      }),
    },
  };
});

jest.mock('../repositories/GoalRepository', () => {
  let mockGoals = new Map();
  let mockMilestones = new Map();
  let mockSteps = new Map();
  let goalIdCounter = 1;
  let milestoneIdCounter = 1;
  let stepIdCounter = 1;

  const resetMocks = () => {
    mockGoals.clear();
    mockMilestones.clear();
    mockSteps.clear();
    goalIdCounter = 1;
    milestoneIdCounter = 1;
    stepIdCounter = 1;
  };

  return {
    goalRepository: {
      // Add reset method for testing
      __resetMocks: resetMocks,
      createGoal: jest.fn(async (goalData) => {
        const id = `goal_${goalIdCounter++}`;
        const goal = {
          id,
          ...goalData,
          status: 'pending_create',
          createdAt: new Date(),
          updatedAt: new Date(),
        };
        mockGoals.set(id, goal);

        // Handle nested milestones
        if (goalData.milestones) {
          for (const milestoneData of goalData.milestones) {
            const milestoneId = `milestone_${milestoneIdCounter++}`;
            const milestone = {
              id: milestoneId,
              goalId: id,
              ...milestoneData,
              status: 'pending_create',
              createdAt: new Date(),
              updatedAt: new Date(),
            };
            mockMilestones.set(milestoneId, milestone);

            // Handle nested steps
            if (milestoneData.steps) {
              for (const stepData of milestoneData.steps) {
                const stepId = `step_${stepIdCounter++}`;
                const step = {
                  id: stepId,
                  milestoneId: milestoneId,
                  ...stepData,
                  status: 'pending_create',
                  createdAt: new Date(),
                  updatedAt: new Date(),
                };
                mockSteps.set(stepId, step);
              }
            }
          }
        }

        return goal;
      }),
      updateGoal: jest.fn(async (id, updates) => {
        const goal = mockGoals.get(id);
        if (goal) {
          const updatedGoal = { 
            ...goal, 
            ...updates, 
            status: updates.status !== undefined ? updates.status : 'pending_update', 
            updatedAt: new Date() 
          };
          mockGoals.set(id, updatedGoal);
          return updatedGoal;
        }
        return null;
      }),      deleteGoal: jest.fn(async (id) => {
        const goal = mockGoals.get(id);
        if (goal) {
          const deletedGoal = { ...goal, status: 'pending_delete', updatedAt: new Date() };
          mockGoals.set(id, deletedGoal);
          return deletedGoal;
        }
        return null;
      }),
      getGoalById: jest.fn(async (id) => {
        const goal = mockGoals.get(id);
        return goal && goal.status !== 'deleted' ? goal : null;
      }),
      getAllGoals: jest.fn(async () => {
        return Array.from(mockGoals.values()).filter(goal => goal.status !== 'deleted');
      }),
      getGoalsByStatus: jest.fn(async (status) => {
        return Array.from(mockGoals.values()).filter(goal => goal.status === status);
      }),
      getGoalsByCategory: jest.fn(async (category) => {
        return Array.from(mockGoals.values()).filter(goal => goal.category === category && goal.status !== 'pending_delete');
      }),
      getGoalsWithMilestones: jest.fn(async () => {
        return Array.from(mockGoals.values())
          .filter(goal => goal.status !== 'pending_delete')
          .map(goal => ({
            ...goal,
            milestones: Array.from(mockMilestones.values())
              .filter(milestone => milestone.goalId === goal.id && milestone.status !== 'pending_delete')
              .map(milestone => ({
                ...milestone,
                steps: Array.from(mockSteps.values())
                  .filter(step => step.milestoneId === milestone.id && step.status !== 'pending_delete')
              }))
          }));
      }),
      createMilestone: jest.fn(async (goalId, milestoneData) => {
        const id = `milestone_${milestoneIdCounter++}`;
        const milestone = {
          id,
          goalId,
          ...milestoneData,
          status: 'pending_create',
          createdAt: new Date(),
          updatedAt: new Date(),
        };
        mockMilestones.set(id, milestone);
        return milestone;
      }),
      updateMilestone: jest.fn(async (id, updates) => {
        const milestone = mockMilestones.get(id);
        if (milestone) {
          const updatedMilestone = { ...milestone, ...updates, status: 'pending_update', updatedAt: new Date() };
          mockMilestones.set(id, updatedMilestone);
          return updatedMilestone;
        }
        return null;
      }),
      deleteMilestone: jest.fn(async (id) => {
        const milestone = mockMilestones.get(id);
        if (milestone) {
          const deletedMilestone = { ...milestone, status: 'pending_delete', updatedAt: new Date() };
          mockMilestones.set(id, deletedMilestone);
          return deletedMilestone;
        }
        return null;
      }),
      getMilestoneById: jest.fn(async (id) => {
        return mockMilestones.get(id) || null;
      }),
      getMilestonesForGoal: jest.fn(async (goalId) => {
        return Array.from(mockMilestones.values())
          .filter(milestone => milestone.goalId === goalId && milestone.status !== 'pending_delete')
          .sort((a, b) => (a.order || 0) - (b.order || 0));
      }),
      createMilestoneStep: jest.fn(async (milestoneId, stepData) => {
        const id = `step_${stepIdCounter++}`;
        const step = {
          id,
          milestoneId,
          ...stepData,
          status: 'pending_create',
          createdAt: new Date(),
          updatedAt: new Date(),
        };
        mockSteps.set(id, step);
        return step;
      }),
      updateMilestoneStep: jest.fn(async (id, updates) => {
        const step = mockSteps.get(id);
        if (step) {
          const updatedStep = { ...step, ...updates, status: 'pending_update', updatedAt: new Date() };
          mockSteps.set(id, updatedStep);
          return updatedStep;
        }
        return null;
      }),
      deleteMilestoneStep: jest.fn(async (id) => {
        const step = mockSteps.get(id);
        if (step) {
          const deletedStep = { ...step, status: 'pending_delete', updatedAt: new Date() };
          mockSteps.set(id, deletedStep);
          return deletedStep;
        }
        // No-op for non-existent steps (idempotent)
        return;
      }),
      getStepById: jest.fn(async (id) => {
        return mockSteps.get(id) || null;
      }),
      getMilestoneStepById: jest.fn(async (id) => {
        return mockSteps.get(id) || null;
      }),
      getStepsForMilestone: jest.fn(async (milestoneId) => {
        return Array.from(mockSteps.values())
          .filter(step => step.milestoneId === milestoneId && step.status !== 'pending_delete')
          .sort((a, b) => (a.order || 0) - (b.order || 0));
      }),
    },
  };
});

// Mock database context
jest.mock('../contexts/DatabaseContext', () => ({
  DatabaseProvider: ({ children }: { children: React.ReactNode }) => children,
  useDatabase: jest.fn(() => ({
    write: jest.fn(),
    collections: {
      get: jest.fn(() => ({
        query: jest.fn(() => ({
          fetch: jest.fn(() => Promise.resolve([])),
          observe: jest.fn(() => ({
            subscribe: jest.fn(),
            unsubscribe: jest.fn(),
          })),
        })),
        findAndObserve: jest.fn(() => ({
          subscribe: jest.fn(),
          unsubscribe: jest.fn(),
        })),
        create: jest.fn(),
        find: jest.fn(),
      })),
    },
  })),
}));

// Mock withObservables HOC
jest.mock('@nozbe/watermelondb/react/withObservables', () => {
  return jest.fn((Component) => Component);
});

// Mock Q query builder
jest.mock('@nozbe/watermelondb', () => ({
  Q: {
    where: jest.fn(),
    notEq: jest.fn(),
    sortBy: jest.fn(),
    asc: jest.fn(),
    desc: jest.fn(),
  },
  Database: jest.fn(),
}));


// Global test teardown
afterEach(() => {
  jest.restoreAllMocks();
});
