/**
 * Utility functions for action processing
 */

/**
 * Constructs a method name from an action object
 * @param {Object} action - The action object
 * @param {string} action.entity_type - The entity type (e.g., 'task', 'goal')
 * @param {string} action.action_type - The action type (e.g., 'create', 'update')
 * @returns {string} The constructed method name (e.g., 'task.create')
 */
export function constructMethodName(action) {
  if (!action || !action.entity_type || !action.action_type) {
    return 'unknown';
  }
  return `${action.entity_type}.${action.action_type}`;
}
