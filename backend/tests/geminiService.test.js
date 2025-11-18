import { describe, it, expect, beforeEach, vi } from 'vitest';
import { GeminiService } from '../src/utils/geminiService.js';

// Mock the controllers
vi.mock('../src/controllers/tasksController.js', () => ({
  createTaskFromAI: vi.fn(),
  updateTaskFromAI: vi.fn(),
  deleteTaskFromAI: vi.fn(),
  readTaskFromAI: vi.fn(),
  lookupTaskbyTitle: vi.fn()
}));

vi.mock('../src/controllers/goalsController.js', () => ({
  createGoalFromAI: vi.fn(),
  updateGoalFromAI: vi.fn(),
  deleteGoalFromAI: vi.fn(),
  getGoalsForUser: vi.fn(),
  lookupGoalbyTitle: vi.fn()
}));

vi.mock('../src/utils/calendarService.js', () => ({
  createCalendarEventFromAI: vi.fn(),
  updateCalendarEventFromAI: vi.fn(),
  deleteCalendarEventFromAI: vi.fn(),
  readCalendarEventFromAI: vi.fn(),
  lookupCalendarEventbyTitle: vi.fn()
}));

describe('GeminiService - Duplication Issue', () => {
  let geminiService;
  let mockModel;

  beforeEach(() => {
    // Reset all mocks
    vi.clearAllMocks();
    
    // Create mock model
    mockModel = {
      generateContent: vi.fn()
    };
    
    geminiService = new GeminiService();
    geminiService.model = mockModel;
    geminiService.enabled = true;
  });

  it('should not execute the same function call twice', async () => {
    const userId = 'test-user-id';
    const userContext = { token: 'test-token' };
    const message = "Create a new task called 'Call mom' with high priority";

    // Mock the first response with function call
    const firstResponse = {
      functionCalls: vi.fn().mockResolvedValue([
        {
          name: 'create_task',
          args: { title: 'Call mom', priority: 'high' }
        }
      ]),
      text: vi.fn().mockResolvedValue('')
    };

    // Mock the final response with no additional function calls
    const finalResponse = {
      functionCalls: vi.fn().mockResolvedValue([]),
      text: vi.fn().mockResolvedValue('Task "Call mom" has been created successfully.')
    };

    // Mock the generateContent calls
    mockModel.generateContent
      .mockResolvedValueOnce({ response: firstResponse })
      .mockResolvedValueOnce({ response: finalResponse });

    // Mock the task creation to return a consistent result
    const { createTaskFromAI } = await import('../src/controllers/tasksController.js');
    createTaskFromAI.mockResolvedValue({
      id: 'test-task-id',
      title: 'Call mom',
      priority: 'high',
      status: 'not_started'
    });

    // Process the message
    const result = await geminiService.processMessage(message, userId, userContext);

    // Verify that createTaskFromAI was called exactly once
    expect(createTaskFromAI).toHaveBeenCalledTimes(1);
    expect(createTaskFromAI).toHaveBeenCalledWith(
      { title: 'Call mom', priority: 'high' },
      userId,
      userContext
    );

    // Verify the result contains only one action (ignore args field)
    expect(result.actions).toHaveLength(1);
    expect(result.actions[0]).toMatchObject({
      action_type: 'create',
      entity_type: 'task',
      details: {
        id: 'test-task-id',
        title: 'Call mom',
        priority: 'high',
        status: 'not_started'
      }
    });

    // Verify the final message
    expect(result.message).toBe('Task "Call mom" has been created successfully.');
  });

  it('should not duplicate function calls when final response contains the same function call', async () => {
    const userId = 'test-user-id';
    const userContext = { token: 'test-token' };
    const message = "Create a new task called 'Call mom' with high priority";

    // Mock the first response with function call
    const firstResponse = {
      functionCalls: vi.fn().mockResolvedValue([
        {
          name: 'create_task',
          args: { title: 'Call mom', priority: 'high' }
        }
      ]),
      text: vi.fn().mockResolvedValue('')
    };

    // Mock the final response with the SAME function call (this is the bug scenario)
    const finalResponse = {
      functionCalls: vi.fn().mockResolvedValue([
        {
          name: 'create_task',
          args: { title: 'Call mom', priority: 'high' }
        }
      ]),
      text: vi.fn().mockResolvedValue('Task "Call mom" has been created successfully.')
    };

    // Mock the generateContent calls
    mockModel.generateContent
      .mockResolvedValueOnce({ response: firstResponse })
      .mockResolvedValueOnce({ response: finalResponse });

    // Mock the task creation to return different IDs to simulate the duplication
    const { createTaskFromAI } = await import('../src/controllers/tasksController.js');
    createTaskFromAI
      .mockResolvedValueOnce({
        id: 'first-task-id',
        title: 'Call mom',
        priority: 'high',
        status: 'not_started'
      })
      .mockResolvedValueOnce({
        id: 'second-task-id',
        title: 'Call mom',
        priority: 'high',
        status: 'not_started'
      });

    // Process the message
    const result = await geminiService.processMessage(message, userId, userContext);

    // This test should fail because the current code will execute the function twice
    // The fix should prevent this duplication
    expect(createTaskFromAI).toHaveBeenCalledTimes(1);
    expect(result.actions).toHaveLength(1);
  });

  it('should handle multiple different function calls correctly', async () => {
    const userId = 'test-user-id';
    const userContext = { token: 'test-token' };
    const message = "Create a task called 'Call mom' and a goal called 'Learn React'";

    // Mock the first response with multiple function calls
    const firstResponse = {
      functionCalls: vi.fn().mockResolvedValue([
        {
          name: 'create_task',
          args: { title: 'Call mom', priority: 'medium' }
        },
        {
          name: 'create_goal',
          args: { title: 'Learn React', description: 'Master React framework' }
        }
      ]),
      text: vi.fn().mockResolvedValue('')
    };

    // Mock the final response with no additional function calls
    const finalResponse = {
      functionCalls: vi.fn().mockResolvedValue([]),
      text: vi.fn().mockResolvedValue('Created task "Call mom" and goal "Learn React".')
    };

    // Mock the generateContent calls
    mockModel.generateContent
      .mockResolvedValueOnce({ response: firstResponse })
      .mockResolvedValueOnce({ response: finalResponse });

    // Mock the controllers
    const { createTaskFromAI } = await import('../src/controllers/tasksController.js');
    const { createGoalFromAI } = await import('../src/controllers/goalsController.js');
    
    createTaskFromAI.mockResolvedValue({
      id: 'task-id',
      title: 'Call mom',
      priority: 'medium'
    });
    
    createGoalFromAI.mockResolvedValue({
      id: 'goal-id',
      title: 'Learn React',
      description: 'Master React framework'
    });

    // Process the message
    const result = await geminiService.processMessage(message, userId, userContext);

    // Verify that each function was called exactly once
    expect(createTaskFromAI).toHaveBeenCalledTimes(1);
    expect(createGoalFromAI).toHaveBeenCalledTimes(1);

    // Verify the result contains exactly two actions
    expect(result.actions).toHaveLength(2);
    
    const taskAction = result.actions.find(a => a.entity_type === 'task');
    const goalAction = result.actions.find(a => a.entity_type === 'goal');
    
    expect(taskAction).toBeDefined();
    expect(goalAction).toBeDefined();
    expect(taskAction.action_type).toBe('create');
    expect(goalAction.action_type).toBe('create');
  });
});

describe('GeminiService - _normalizeTaskCategory', () => {
  let geminiService;

  beforeEach(() => {
    geminiService = new GeminiService();
    geminiService.enabled = true;
  });

  describe('exact matches', () => {
    it('should return valid categories as-is', () => {
      expect(geminiService._normalizeTaskCategory('career')).toBe('career');
      expect(geminiService._normalizeTaskCategory('health')).toBe('health');
      expect(geminiService._normalizeTaskCategory('personal')).toBe('personal');
      expect(geminiService._normalizeTaskCategory('education')).toBe('education');
      expect(geminiService._normalizeTaskCategory('finance')).toBe('finance');
      expect(geminiService._normalizeTaskCategory('relationships')).toBe('relationships');
      expect(geminiService._normalizeTaskCategory('other')).toBe('other');
    });

    it('should handle case-insensitive exact matches', () => {
      expect(geminiService._normalizeTaskCategory('CAREER')).toBe('career');
      expect(geminiService._normalizeTaskCategory('Health')).toBe('health');
      expect(geminiService._normalizeTaskCategory('PERSONAL')).toBe('personal');
    });

    it('should return exact matches from categoryMap', () => {
      expect(geminiService._normalizeTaskCategory('work')).toBe('career');
      expect(geminiService._normalizeTaskCategory('workout')).toBe('health');
      expect(geminiService._normalizeTaskCategory('homework')).toBe('education');
      expect(geminiService._normalizeTaskCategory('home')).toBe('personal');
    });
  });

  describe('partial matches with longest-first ordering', () => {
    it('should match "workout" to health, not career (work)', () => {
      // "workout" contains "work" but should match "workout" first (longer key)
      expect(geminiService._normalizeTaskCategory('workout')).toBe('health');
      expect(geminiService._normalizeTaskCategory('my workout routine')).toBe('health');
      expect(geminiService._normalizeTaskCategory('workout session')).toBe('health');
    });

    it('should match "homework" to education, not personal (home)', () => {
      // "homework" contains "home" but should match "homework" first (longer key)
      expect(geminiService._normalizeTaskCategory('homework')).toBe('education');
      expect(geminiService._normalizeTaskCategory('do homework')).toBe('education');
      expect(geminiService._normalizeTaskCategory('homework assignment')).toBe('education');
    });

    it('should match "work" to career when it is just "work"', () => {
      expect(geminiService._normalizeTaskCategory('work')).toBe('career');
      expect(geminiService._normalizeTaskCategory('work meeting')).toBe('career');
      expect(geminiService._normalizeTaskCategory('work project')).toBe('career');
    });

    it('should match "home" to personal when it is just "home"', () => {
      expect(geminiService._normalizeTaskCategory('home')).toBe('personal');
      expect(geminiService._normalizeTaskCategory('home maintenance')).toBe('personal');
      expect(geminiService._normalizeTaskCategory('home chores')).toBe('personal');
    });

    it('should handle "digital hygiene" matching "hygiene" (personal)', () => {
      // "digital hygiene" should match "hygiene" (longer than "digital")
      expect(geminiService._normalizeTaskCategory('digital hygiene')).toBe('personal');
    });

    it('should prioritize longer specific matches over shorter generic ones', () => {
      // "professional" (11 chars) should match before "work" (4 chars)
      expect(geminiService._normalizeTaskCategory('professional development')).toBe('career');
      // "organization" (12 chars) should match before "home" (4 chars)
      expect(geminiService._normalizeTaskCategory('home organization')).toBe('personal');
      // "wellbeing" (9 chars) should match before "well" (if it existed)
      expect(geminiService._normalizeTaskCategory('wellbeing check')).toBe('health');
    });
  });

  describe('edge cases', () => {
    it('should return null for invalid input', () => {
      expect(geminiService._normalizeTaskCategory(null)).toBe(null);
      expect(geminiService._normalizeTaskCategory(undefined)).toBe(null);
      expect(geminiService._normalizeTaskCategory('')).toBe(null);
      expect(geminiService._normalizeTaskCategory(123)).toBe(null);
      expect(geminiService._normalizeTaskCategory({})).toBe(null);
    });

    it('should handle whitespace', () => {
      expect(geminiService._normalizeTaskCategory('  career  ')).toBe('career');
      expect(geminiService._normalizeTaskCategory('  workout  ')).toBe('health');
    });

    it('should return null for unmatched categories', () => {
      expect(geminiService._normalizeTaskCategory('unknown category')).toBe(null);
      expect(geminiService._normalizeTaskCategory('xyzabc')).toBe(null);
    });
  });
}); 