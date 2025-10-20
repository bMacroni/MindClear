import { describe, it, expect, vi } from 'vitest';
import { validateAction } from '../src/utils/actionValidation.js';
import { constructMethodName } from '../src/utils/actionConstruction.js'; // Update path as needed
describe('Action Loop Validation Logic', () => {
  it('should validate entity_type and action_type correctly', () => {
    // Test the validation logic using the real validateAction function

    // Test valid action
    const validAction = {
      entity_type: 'task',
      action_type: 'create',
      details: { title: 'Test task' }
    };
    expect(validateAction(validAction)).toEqual({ valid: true });

    // Test invalid entity_type
    const invalidEntityAction = {
      entity_type: 'invalid_entity',
      action_type: 'create',
      details: { title: 'Test task' }
    };
    const result1 = validateAction(invalidEntityAction);
    expect(result1.valid).toBe(false);
    expect(result1.error).toContain('Invalid entity_type');

    // Test invalid action_type
    const invalidActionType = {
      entity_type: 'task',
      action_type: 'invalid_action',
      details: { title: 'Test task' }
    };
    const result2 = validateAction(invalidActionType);
    expect(result2.valid).toBe(false);
    expect(result2.error).toContain('Invalid action_type');

    // Test missing entity_type
    const missingEntityType = {
      action_type: 'create',
      details: { title: 'Test task' }
    };
    const result3 = validateAction(missingEntityType);
    expect(result3.valid).toBe(false);
    expect(result3.error).toContain('entity_type is required');

    // Test missing action_type
    const missingActionType = {
      entity_type: 'task',
      details: { title: 'Test task' }
    };
    const result4 = validateAction(missingActionType);
    expect(result4.valid).toBe(false);
    expect(result4.error).toContain('action_type is required');

    // Test null action
    const result5 = validateAction(null);
    expect(result5.valid).toBe(false);
    expect(result5.error).toContain('Action must be a valid object');
  });

  it('should construct method names correctly', () => {
    const action = {
      entity_type: 'task',
      action_type: 'create'
    };
    const method = constructMethodName(action);
    expect(method).toBe('task.create');
  });

  it('should handle timeout promise race logic', async () => {
    vi.useFakeTimers();
    const ACTION_TIMEOUT_MS = 30000;
    
    const timeoutPromise = new Promise((_, reject) => {
      setTimeout(() => reject(new Error(`Action timeout after ${ACTION_TIMEOUT_MS}ms`)), ACTION_TIMEOUT_MS);
    });
    
    // Verify the promise is created
    expect(timeoutPromise).toBeInstanceOf(Promise);
    
    // Fast-forward time and verify rejection
    vi.advanceTimersByTime(ACTION_TIMEOUT_MS);
    await expect(timeoutPromise).rejects.toThrow('Action timeout after 30000ms');
    
    vi.useRealTimers();
  });});
