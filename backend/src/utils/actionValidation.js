/**
 * Action validation utilities for the action loop
 */

const VALID_ENTITY_TYPES = ['task', 'goal', 'milestone', 'calendar', 'user', 'notification'];
const VALID_ACTION_TYPES = ['create', 'update', 'delete', 'read'];

/**
 * Validates an action object for the action loop
 * @param {Object} action - The action object to validate
 * @returns {Object} - Validation result with valid boolean and optional error message
 */
export const validateAction = (action) => {
  if (!action || typeof action !== 'object') {
    return { valid: false, error: 'Action must be a valid object' };
  }
  if (!action.entity_type || typeof action.entity_type !== 'string') {
    return { valid: false, error: 'entity_type is required and must be a string' };
  }
  if (!action.action_type || typeof action.action_type !== 'string') {
    return { valid: false, error: 'action_type is required and must be a string' };
  }
  if (!VALID_ENTITY_TYPES.includes(action.entity_type)) {
    return { valid: false, error: `Invalid entity_type: ${action.entity_type}. Must be one of: ${VALID_ENTITY_TYPES.join(', ')}` };
  }
  if (!VALID_ACTION_TYPES.includes(action.action_type)) {
    return { valid: false, error: `Invalid action_type: ${action.action_type}. Must be one of: ${VALID_ACTION_TYPES.join(', ')}` };
  }
  return { valid: true };
};

/**
 * Get the list of valid entity types
 * @returns {string[]} - Array of valid entity types
 */
export const getValidEntityTypes = () => [...VALID_ENTITY_TYPES];

/**
 * Get the list of valid action types
 * @returns {string[]} - Array of valid action types
 */
export const getValidActionTypes = () => [...VALID_ACTION_TYPES];
