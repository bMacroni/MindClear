/**
 * Motivational message generator for daily focus notifications
 * Creates personalized, stimulating morning messages to motivate users
 */

// Array of motivational message templates
const morningMessages = [
  "Good Morning! Time to focus on '{task}'.",
  "Good Morning! Your focus task today: '{task}'.",
  "Good Morning! Ready to tackle '{task}'?",
  "Good Morning! Let's get '{task}' done today.",
  "Good Morning! Your priority: '{task}'.",
  "Good Morning! Today's focus: '{task}'.",
  "Good Morning! Time to work on '{task}'.",
  "Good Morning! Ready for '{task}'?",
  "Good Morning! Let's focus on '{task}' today.",
  "Good Morning! Your task: '{task}'.",
  "Good Morning! Time to start '{task}'.",
  "Good Morning! Today's goal: '{task}'.",
  "Good Morning! Ready to begin '{task}'?",
  "Good Morning! Let's tackle '{task}'.",
  "Good Morning! Your focus today: '{task}'.",
  "Good Morning! Time for '{task}'.",
  "Good Morning! Ready to work on '{task}'?",
  "Good Morning! Today's priority: '{task}'.",
  "Good Morning! Let's focus on '{task}'.",
  "Good Morning! Time to get '{task}' done."
];

/**
 * Generate a personalized motivational message for daily focus notification
 * @param {string} userName - The user's full name
 * @param {string} taskTitle - The title of the focus task
 * @returns {string} Personalized motivational message
 */
export function generateFocusNotificationMessage(userName, taskTitle) {
  // Select a random message template
  const template = morningMessages[Math.floor(Math.random() * morningMessages.length)];
  
  // Replace placeholders with actual values
  return template.replace('{task}', taskTitle || 'your focus task');
}

/**
 * Generate a fallback message when no focus task is set
 * @returns {string} Motivational message encouraging task setting
 */
export function generateNoFocusTaskMessage() {
  const noTaskMessages = [
    "Good Morning! Ready to set your focus for today?",
    "Good Morning! Time to choose your daily task.",
    "Good Morning! Let's pick your focus task for today.",
    "Good Morning! Ready to set your priority?",
    "Good Morning! Time to choose what to focus on."
  ];
  
  const template = noTaskMessages[Math.floor(Math.random() * noTaskMessages.length)];
  return template;
}

/**
 * Get notification title for focus reminder
 * @param {boolean} hasFocusTask - Whether user has a focus task set
 * @returns {string} Notification title
 */
export function getFocusNotificationTitle(hasFocusTask) {
  if (hasFocusTask) {
    return "Daily Focus";
  }
  return "Set Your Focus";
}
