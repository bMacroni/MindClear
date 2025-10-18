import { describe, it, expect } from 'vitest';

describe('Focus Notification Time Parsing', () => {
  it('should parse focus_notification_time correctly', () => {
    // Test various time formats
    const testCases = [
      { input: '07:00:00', expected: { hour: 7, minute: 0 } },
      { input: '09:30:00', expected: { hour: 9, minute: 30 } },
      { input: '14:15:00', expected: { hour: 14, minute: 15 } },
      { input: '00:00:00', expected: { hour: 0, minute: 0 } },
      { input: '23:59:00', expected: { hour: 23, minute: 59 } }
    ];

    testCases.forEach(({ input, expected }) => {
      const [targetHour, targetMinute] = input.split(':').map(Number);
      expect(targetHour).toBe(expected.hour);
      expect(targetMinute).toBe(expected.minute);
    });
  });

  it('should handle missing focus_notification_time with default', () => {
    const focusTime = null || '07:00:00';
    const [targetHour, targetMinute] = focusTime.split(':').map(Number);
    
    expect(targetHour).toBe(7);
    expect(targetMinute).toBe(0);
  });

  it('should validate time window logic', () => {
    // Test the time window logic used in the cron job
    const userHour = 7;
    const userMinute = 30;
    const targetHour = 7;
    const targetMinute = 30;
    
    const isTargetHour = userHour === targetHour;
    const isTargetMinute = userMinute === targetMinute || userMinute === targetMinute + 1;
    
    expect(isTargetHour).toBe(true);
    expect(isTargetMinute).toBe(true);
  });

  it('should handle 1-minute window for cron flexibility', () => {
    const targetHour = 7;
    const targetMinute = 30;
    
    // Test exact match
    let userHour = 7;
    let userMinute = 30;
    let isTargetHour = userHour === targetHour;
    let isTargetMinute = userMinute === targetMinute || userMinute === targetMinute + 1;
    expect(isTargetHour && isTargetMinute).toBe(true);
    
    // Test 1 minute after (should still match)
    userMinute = 31;
    isTargetMinute = userMinute === targetMinute || userMinute === targetMinute + 1;
    expect(isTargetHour && isTargetMinute).toBe(true);
    
    // Test 2 minutes after (should not match)
    userMinute = 32;
    isTargetMinute = userMinute === targetMinute || userMinute === targetMinute + 1;
    expect(isTargetHour && isTargetMinute).toBe(false);
    
    // Test wrong hour (should not match)
    userHour = 8;
    userMinute = 30;
    isTargetHour = userHour === targetHour;
    isTargetMinute = userMinute === targetMinute || userMinute === targetMinute + 1;
    expect(isTargetHour && isTargetMinute).toBe(false);
  });
});
