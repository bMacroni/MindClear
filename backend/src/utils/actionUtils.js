/**
 * Utility functions for action processing
 */

import { validateAction } from './actionValidation.js';

/**
 * Constructs a method name from an action object
 * @param {Object} action - The action object
 * @param {string} action.entity_type - The entity type (e.g., 'task', 'goal')
 * @param {string} action.action_type - The action type (e.g., 'create', 'update')
 * @returns {string} The constructed method name (e.g., 'task.create') or 'unknown' if invalid
 */
export function constructMethodName(action) {
  if (!action || !action.entity_type || !action.action_type) {
    return 'unknown';
  }
  
  // Validate the action object to ensure entity_type and action_type are valid
  const validation = validateAction(action);
  if (!validation.valid) {
    return 'unknown';
  }
  
  return `${action.entity_type}.${action.action_type}`;
}
