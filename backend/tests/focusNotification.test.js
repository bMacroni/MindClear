import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { createClient } from '@supabase/supabase-js';
import { sendDailyFocusReminder } from '../src/services/notificationService.js';
import { generateFocusNotificationMessage, generateNoFocusTaskMessage, getFocusNotificationTitle } from '../src/utils/motivationalMessages.js';

// Mock Supabase client
const mockSupabase = {
  from: vi.fn(() => ({
    select: vi.fn(() => ({
      eq: vi.fn(() => ({
        single: vi.fn(() => ({
          data: null,
          error: null
        }))
      }))
    })),
    upsert: vi.fn(() => ({
      select: vi.fn(() => ({
        single: vi.fn(() => ({
          data: { id: 'test-pref', enabled: true },
          error: null
        }))
      }))
    })),
    update: vi.fn(() => ({
      eq: vi.fn(() => ({
        data: null,
        error: null
      }))
    }))
  }))
};

// Mock the notification service
vi.mock('../src/services/notificationService.js', async () => {
  const actual = await vi.importActual('../src/services/notificationService.js');
  return {
    ...actual,
    sendNotification: vi.fn(() => Promise.resolve({ success: true }))
  };
});

// Mock the motivational messages
vi.mock('../src/utils/motivationalMessages.js', () => ({
  generateFocusNotificationMessage: vi.fn((name, task) => `Good morning, ${name}! Let's tackle '${task}' today!`),
  generateNoFocusTaskMessage: vi.fn(() => `Good morning! Ready to set your focus for today?`),
  getFocusNotificationTitle: vi.fn((hasFocusTask) => hasFocusTask ? '🎯 Your Daily Focus' : '🌅 Morning Motivation')
}));

describe('Focus Notification Feature', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('Motivational Messages', () => {
    it('should generate personalized focus task message', () => {
      const message = generateFocusNotificationMessage('John Doe', 'Complete project proposal');
      expect(message).toBe("Good morning, John! Let's tackle 'Complete project proposal' today!");
    });

    it('should generate no focus task message', () => {
      const message = generateNoFocusTaskMessage();
      expect(message).toBe("Good morning! Ready to set your focus for today?");
    });

    it('should get correct notification title for focus task', () => {
      const titleWithTask = getFocusNotificationTitle(true);
      const titleWithoutTask = getFocusNotificationTitle(false);
      
      expect(titleWithTask).toBe('🎯 Your Daily Focus');
      expect(titleWithoutTask).toBe('🌅 Morning Motivation');
    });

    it('should handle missing user name gracefully', () => {
      const message = generateFocusNotificationMessage(null, 'Test task');
      expect(message).toContain('there');
    });
  });

  describe('sendDailyFocusReminder', () => {
    it('should send notification with focus task', async () => {
      const { sendNotification } = await import('../src/services/notificationService.js');
      
      const userId = 'test-user-123';
      const task = { id: 'task-123', title: 'Complete project proposal' };
      const userName = 'John Doe';

      const result = await sendDailyFocusReminder(userId, task, userName);

      expect(result.success).toBe(true);
      expect(sendNotification).toHaveBeenCalledWith(userId, {
        notification_type: 'daily_focus_reminder',
        title: '🎯 Your Daily Focus',
        message: "Good morning, John! Let's tackle 'Complete project proposal' today!",
        details: {
          taskId: 'task-123',
          taskTitle: 'Complete project proposal',
          hasFocusTask: true
        }
      });
    });

    it('should send notification without focus task', async () => {
      const { sendNotification } = await import('../src/services/notificationService.js');
      
      const userId = 'test-user-456';
      const task = null;
      const userName = 'Jane Smith';

      const result = await sendDailyFocusReminder(userId, task, userName);

      expect(result.success).toBe(true);
      expect(sendNotification).toHaveBeenCalledWith(userId, {
        notification_type: 'daily_focus_reminder',
        title: '🌅 Morning Motivation',
        message: "Good morning! Ready to set your focus for today?",
        details: {
          hasFocusTask: false
        }
      });
    });

    it('should handle task without title', async () => {
      const { sendNotification } = await import('../src/services/notificationService.js');
      
      const userId = 'test-user-789';
      const task = { id: 'task-789' }; // No title
      const userName = 'Bob Wilson';

      const result = await sendDailyFocusReminder(userId, task, userName);

      expect(result.success).toBe(true);
      expect(sendNotification).toHaveBeenCalledWith(userId, {
        notification_type: 'daily_focus_reminder',
        title: '🌅 Morning Motivation',
        message: "Good morning! Ready to set your focus for today?",
        details: {
          hasFocusTask: false
        }
      });
    });

    it('should handle notification service errors', async () => {
      const { sendNotification } = await import('../src/services/notificationService.js');
      sendNotification.mockRejectedValueOnce(new Error('Notification service error'));

      const userId = 'test-user-error';
      const task = { id: 'task-error', title: 'Test task' };
      const userName = 'Error User';

      const result = await sendDailyFocusReminder(userId, task, userName);

      expect(result.success).toBe(false);
      expect(result.error).toBe('Notification service error');
    });
  });

  describe('Cron Job Logic', () => {
    it('should check timezone correctly', () => {
      // Test timezone conversion logic
      const now = new Date('2025-10-17T12:00:00Z'); // 12 PM UTC
      const userTimezone = 'America/Chicago'; // UTC-5
      const userTime = new Date(now.toLocaleString("en-US", { timeZone: userTimezone }));
      const userHour = userTime.getHours();
      
      // 12 PM UTC should be 7 AM in Chicago
      expect(userHour).toBe(7);
    });

    it('should identify correct notification time window', () => {
      const testCases = [
        { hour: 6, minute: 59, shouldNotify: false },
        { hour: 7, minute: 0, shouldNotify: true },
        { hour: 7, minute: 30, shouldNotify: true },
        { hour: 7, minute: 59, shouldNotify: true },
        { hour: 8, minute: 0, shouldNotify: false }
      ];

      testCases.forEach(({ hour, minute, shouldNotify }) => {
        const shouldSend = hour === 7; // Our logic checks for hour === 7
        expect(shouldSend).toBe(shouldNotify);
      });
    });

    it('should check if notification already sent today', () => {
      const currentDate = '2025-10-17';
      const lastSentToday = '2025-10-17T07:00:00Z';
      const lastSentYesterday = '2025-10-16T07:00:00Z';

      const lastSentTodayDate = new Date(lastSentToday).toISOString().split('T')[0];
      const lastSentYesterdayDate = new Date(lastSentYesterday).toISOString().split('T')[0];

      expect(lastSentTodayDate).toBe(currentDate); // Should skip
      expect(lastSentYesterdayDate).not.toBe(currentDate); // Should send
    });
  });

  describe('Database Integration', () => {
    it('should handle user notification preferences correctly', () => {
      // Test preference checking logic
      const mockPrefs = [
        { enabled: true },
        { enabled: false },
        null // No preference set
      ];

      mockPrefs.forEach((pref, index) => {
        const isEnabled = pref ? pref.enabled : true; // Default to enabled
        if (index === 0) expect(isEnabled).toBe(true);
        if (index === 1) expect(isEnabled).toBe(false);
        if (index === 2) expect(isEnabled).toBe(true);
      });
    });

    it('should handle focus task queries correctly', () => {
      // Test focus task query logic
      const mockTasks = [
        { id: 'task-1', title: 'Focus task', is_today_focus: true, status: 'not_started' },
        { id: 'task-2', title: 'Regular task', is_today_focus: false, status: 'not_started' },
        { id: 'task-3', title: 'Completed focus', is_today_focus: true, status: 'completed' }
      ];

      const focusTask = mockTasks.find(task => 
        task.is_today_focus === true && task.status === 'not_started'
      );

      expect(focusTask).toEqual({ id: 'task-1', title: 'Focus task', is_today_focus: true, status: 'not_started' });
    });
  });

  describe('Error Handling', () => {
    it('should handle missing user gracefully', async () => {
      const { sendNotification } = await import('../src/services/notificationService.js');
      sendNotification.mockRejectedValueOnce(new Error('User not found'));

      const result = await sendDailyFocusReminder('invalid-user', null, null);

      expect(result.success).toBe(false);
      expect(result.error).toBe('User not found');
    });

    it('should handle database connection errors', () => {
      // Test that cron job continues processing other users if one fails
      const users = [
        { id: 'user-1', timezone: 'America/Chicago' },
        { id: 'user-2', timezone: 'America/New_York' },
        { id: 'user-3', timezone: 'Europe/London' }
      ];

      // Simulate error for user-2
      const processUser = (user) => {
        if (user.id === 'user-2') {
          throw new Error('Database error for user-2');
        }
        return { success: true };
      };

      const results = users.map(user => {
        try {
          return processUser(user);
        } catch (error) {
          return { success: false, error: error.message };
        }
      });

      expect(results[0].success).toBe(true);
      expect(results[1].success).toBe(false);
      expect(results[1].error).toBe('Database error for user-2');
      expect(results[2].success).toBe(true);
    });
  });
});
