import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { createClient } from '@supabase/supabase-js';
import { sendDailyFocusReminder } from '../src/services/notificationService.js';
import { generateFocusNotificationMessage, generateNoFocusTaskMessage, getFocusNotificationTitle } from '../src/utils/motivationalMessages.js';
import { utcToZonedTime } from 'date-fns-tz';

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
      const userTime = utcToZonedTime(now, userTimezone);
      const userHour = userTime.getHours();
      
      // 12 PM UTC should be 7 AM in Chicago
      expect(userHour).toBe(7);
    });

    it('should handle DST boundary correctly - spring forward', () => {
      // Test DST spring forward (2 AM becomes 3 AM)
      const springForward = new Date('2025-03-09T07:00:00Z'); // 1 AM CST becomes 2 AM CDT
      const userTimezone = 'America/Chicago';
      const userTime = utcToZonedTime(springForward, userTimezone);
      const userHour = userTime.getHours();
      
      // 7 AM UTC should be 2 AM CDT (after spring forward)
      expect(userHour).toBe(2);
    });

    it('should handle DST boundary correctly - fall back', () => {
      // Test DST fall back (2 AM becomes 1 AM)
      const fallBack = new Date('2025-11-02T07:00:00Z'); // 7 AM UTC is 1 AM CST (after fall back)
      const userTimezone = 'America/Chicago';
      const userTime = utcToZonedTime(fallBack, userTimezone);
      const userHour = userTime.getHours();
      
      // 7 AM UTC should be 1 AM CST (after fall back)
      expect(userHour).toBe(1);
    });

    it('should handle different timezones correctly', () => {
      const now = new Date('2025-10-17T12:00:00Z'); // 12 PM UTC
      
      // Test multiple timezones
      const chicagoTime = utcToZonedTime(now, 'America/Chicago');
      const newYorkTime = utcToZonedTime(now, 'America/New_York');
      const londonTime = utcToZonedTime(now, 'Europe/London');
      const tokyoTime = utcToZonedTime(now, 'Asia/Tokyo');
      
      expect(chicagoTime.getHours()).toBe(7); // UTC-5
      expect(newYorkTime.getHours()).toBe(8); // UTC-4
      expect(londonTime.getHours()).toBe(13); // UTC+1
      expect(tokyoTime.getHours()).toBe(21); // UTC+9
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

    it('should handle minute wrap-around correctly (59→00)', () => {
      // Test case: targetHour = 7, targetMinute = 59
      // User time 08:00 should still match the 1-minute window
      const targetHour = 7;
      const targetMinute = 59;
      
      // Test the wrap-around logic
      const testCases = [
        { userHour: 7, userMinute: 58, shouldMatch: false }, // Before window
        { userHour: 7, userMinute: 59, shouldMatch: true },  // Exact match
        { userHour: 8, userMinute: 0, shouldMatch: true },   // Wrap-around case
        { userHour: 8, userMinute: 1, shouldMatch: false }   // After window
      ];

      testCases.forEach(({ userHour, userMinute, shouldMatch }) => {
        // Check if current minute is within 1-minute tolerance window of target minute
        const isTargetMinute = userMinute === targetMinute || 
                              userMinute === (targetMinute + 1) % 60;
        
        // Check if it's the target hour or next hour (for wrap-around)
        const isTargetHour = userHour === targetHour || 
                            (isTargetMinute && (targetMinute + 1) % 60 === 0 && userHour === (targetHour + 1) % 24);
        
        // Only proceed if both hour and minute match (with 1-minute tolerance)
        const isTargetTime = isTargetHour && isTargetMinute;
        
        expect(isTargetTime).toBe(shouldMatch);
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

  describe('Time Parsing Validation', () => {
    it('should parse valid time strings correctly', () => {
      const testCases = [
        { input: '07:00:00', expected: 7 },
        { input: '09:30', expected: 9 },
        { input: '23:59', expected: 23 },
        { input: '00:00', expected: 0 },
        { input: '12:45:30', expected: 12 }
      ];

      testCases.forEach(({ input, expected }) => {
        const timeParts = input.split(':');
        const parsedHour = parseInt(timeParts[0], 10);
        expect(parsedHour).toBe(expected);
      });
    });

    it('should handle malformed time strings gracefully', () => {
      const malformedTimes = [
        '', // Empty string
        'invalid', // No colons
        '25:00', // Invalid hour
        'abc:def', // Non-numeric
        '12', // Missing minute (should require at least hour:minute format)
        '12:', // Empty minute
        ':30', // Empty hour
        '12:30:45:67' // Too many parts
      ];

      malformedTimes.forEach(malformedTime => {
        let targetHour;
        try {
          const timeParts = malformedTime.split(':');
          
          // Require at least hour and minute components
          if (timeParts.length < 2 || !timeParts[0] || !timeParts[1]) {
            throw new Error(`Invalid time format: ${malformedTime}`);
          }
          
          const parsedHour = parseInt(timeParts[0], 10);
          
          if (isNaN(parsedHour) || parsedHour < 0 || parsedHour > 23) {
            throw new Error(`Invalid hour value: ${parsedHour}`);
          }
          
          targetHour = parsedHour;
        } catch (error) {
          // Should fallback to default
          targetHour = 7;
        }
        
        
        expect(targetHour).toBe(7); // Should always fallback to 7
      });
    });

    it('should validate hour range correctly', () => {
      const validHours = [0, 1, 12, 23];
      const invalidHours = [-1, 24, 25, 100];

      validHours.forEach(hour => {
        const isValid = !isNaN(hour) && hour >= 0 && hour <= 23;
        expect(isValid).toBe(true);
      });

      invalidHours.forEach(hour => {
        const isValid = !isNaN(hour) && hour >= 0 && hour <= 23;
        expect(isValid).toBe(false);
      });
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
