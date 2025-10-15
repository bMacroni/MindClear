import { Type } from '@google/genai';

// Task Functions
export const createTaskFunctionDeclaration = {
  name: 'create_task',
  description: 'Creates a new task for the user. Use this ONLY when the user explicitly asks to add, create, or set up a new task. Do NOT use this for requests like "What are my tasks?" or "Show me my tasks". Example user prompts: "Add a task to buy groceries", "Create a new task for tomorrow", "Remind me to call mom". IMPORTANT: When creating tasks, always try to gather additional details from the user through conversation. Ask about description, priority, due date, and category. If the user doesn\'t provide specific information, use your best judgment to set appropriate default values.',
  parameters: {
    type: Type.OBJECT,
    properties: {
      title: { type: Type.STRING, description: 'Task title' },
      description: { type: Type.STRING, description: 'Task details and notes' },
      due_date: { type: Type.STRING, description: 'Due date (YYYY-MM-DD or natural language like "tomorrow", "next week")' },
      priority: { type: Type.STRING, enum: ['high', 'medium', 'low'], description: 'Task priority - use "medium" as default if not specified' },
      related_goal: { type: Type.STRING, description: 'Associated goal title' },
      preferred_time_of_day: { type: Type.STRING, description: 'Preferred time of day for the task (morning, afternoon, evening, any)' },
      deadline_type: { type: Type.STRING, enum: ['hard', 'soft'], description: 'Deadline type: hard (must be done by due date) or soft (flexible) - default to "soft"' },
      travel_time_minutes: { type: Type.NUMBER, description: 'Estimated travel time in minutes to the task location' },
      category: { type: Type.STRING, description: 'Task category (e.g., work, personal, health, home, errands, etc.) - use your best judgment to assign appropriate category' },
      status: { type: Type.STRING, enum: ['not_started', 'in_progress', 'completed'], description: 'Task status - default to "not_started"' },
      recurrence: { type: Type.STRING, description: 'Recurrence rule for repeating tasks (e.g., daily, weekly, custom RRULE)' }
    },
    required: ['title']
  }
};

export const updateTaskFunctionDeclaration = {
  name: 'update_task',
  description: `Updates an existing task for the user. If the user provides only the task title, first call 'read_task' to retrieve all tasks, find the task with the matching title, and then call this function with the correct ID. Use this when the user wants to change details of a task. Example user prompts: "Change the due date for my homework task", "Mark the laundry task as complete".`,
  parameters: {
    type: Type.OBJECT,
    properties: {
      id: { type: Type.STRING, description: 'The unique ID of the task to update (required if known)' },
      title: { type: Type.STRING, description: 'The title of the task to update (optional, use to look up the ID if not provided)' },
      description: { type: Type.STRING, description: 'Task details' },
      due_date: { type: Type.STRING, description: 'Due date (YYYY-MM-DD)' },
      priority: { type: Type.STRING, enum: ['high', 'medium', 'low'], description: 'Task priority' },
      related_goal: { type: Type.STRING, description: 'Associated goal title' },
      completed: { type: Type.BOOLEAN, description: 'Task completion status. If provided, mirror to status as completed/not_started.' },
      preferred_time_of_day: { type: Type.STRING, description: 'Preferred time of day for the task (morning, afternoon, evening, any)' },
      deadline_type: { type: Type.STRING, enum: ['hard', 'soft'], description: 'Deadline type: hard (must be done by due date) or soft (flexible)' },
      travel_time_minutes: { type: Type.NUMBER, description: 'Estimated travel time in minutes to the task location' },
      category: { type: Type.STRING, description: 'Task category (e.g., work, personal, health, etc.)' },
      status: { type: Type.STRING, enum: ['not_started', 'in_progress', 'completed'], description: 'Task status. If provided, mirror to completed boolean.' },
      recurrence: { type: Type.STRING, description: 'Recurrence rule for repeating tasks (e.g., daily, weekly, custom RRULE)' }
    },
    required: [] // id is required if known, but not always present
  }
};

export const deleteTaskFunctionDeclaration = {
  name: 'delete_task',
  description: `Deletes a task by its unique ID. If the user provides only the task title, first call 'read_task' to retrieve all tasks, find the task with the matching title, and then call this function with the correct ID. Use this when the user wants to remove a task. Example user prompts: "Delete my laundry task", "Remove the call mom task".`,
  parameters: {
    type: Type.OBJECT,
    properties: {
      id: { type: Type.STRING, description: 'The unique ID of the task to delete (required if known)' },
      title: { type: Type.STRING, description: 'The title of the task to delete (optional, use to look up the ID if not provided)' }
    },
    required: [] // id is required if known, but not always present
  }
};

export const readTaskFunctionDeclaration = {
  name: 'read_task',
  description: 'Reads or lists tasks for the user. You can also use the search parameter to filter tasks by keyword in the title or description (case-insensitive, partial match allowed). When returning a JSON code block for a filtered task query, only include the tasks that match the filter. Use this for any request where the user wants to see, list, or review their tasks. Example user prompts: "Show me my tasks", "List my tasks for today", "What are my tasks?", "What tasks are related to my fitness goal?", "Show me all my high priority tasks", "List my completed tasks in the work category", "Do I have any cleaning tasks?". Do NOT use this for requests to add or create new tasks.',
  parameters: {
    type: Type.OBJECT,
    properties: {
      search: { type: Type.STRING, description: 'Keyword to search for in task title or description (case-insensitive, partial match allowed)' },
      due_date: { type: Type.STRING, description: 'Due date (YYYY-MM-DD)' },
      related_goal: { type: Type.STRING, description: 'Associated goal title' },
      priority: { type: Type.STRING, enum: ['high', 'medium', 'low'], description: 'Task priority' },
      status: { type: Type.STRING, enum: ['not_started', 'in_progress', 'completed'], description: 'Task status' },
      completed: { type: Type.BOOLEAN, description: 'Task completion status' },
      category: { type: Type.STRING, description: 'Task category (e.g., work, personal, health, etc.)' },
      preferred_time_of_day: { type: Type.STRING, description: 'Preferred time of day for the task (morning, afternoon, evening, any)' },
      deadline_type: { type: Type.STRING, enum: ['hard', 'soft'], description: 'Deadline type: hard (must be done by due date) or soft (flexible)' },
      recurrence: { type: Type.STRING, description: 'Recurrence rule for repeating tasks (e.g., daily, weekly, custom RRULE)' }
    },
    required: []
  }
};

export const lookupTaskbyTitleFunctionDeclaration = {
  name: 'lookup_task',
  description: 'This function is used as a precursor call to delete_task, update_task and read_task function calls. Returns all tasks for the user with their IDs and titles. The purpose of this function is to retrieve a list of current tasks that you must use to identify the requested task and obtain the ID. After getting the task list, use the ID from the most likely task to call update_task or delete_task.',
  parameters: {
    type: Type.OBJECT,
    properties: {},
    required: []
  }
};

// Goal Functions
export const createGoalFunctionDeclaration = {
  name: 'create_goal',
  description: 'Creates a new goal for the user with optional milestones and steps. Before calling this function, call "lookup_goal" to check if the goal already exists. Example user prompts: "Set a goal to run a marathon", "Create a new goal for reading more books", "I want to learn React Native".',
  parameters: {
    type: Type.OBJECT,
    properties: {
      title: { type: Type.STRING, description: 'Goal title' },
      description: { type: Type.STRING, description: 'Goal details' },
      due_date: { type: Type.STRING, description: 'Due date (YYYY-MM-DD)' },
      priority: { type: Type.STRING, enum: ['high', 'medium', 'low'], description: 'Goal priority' },
      category: { type: Type.STRING, description: 'Goal category (e.g., health, career, personal, etc.)' },
      status: { type: Type.STRING, enum: ['not_started', 'in_progress', 'completed'], description: 'Goal status' },
      milestones: { 
        type: Type.ARRAY, 
        description: 'Array of milestones for the goal. Each milestone should have a title and optional steps.',
        items: {
          type: Type.OBJECT,
          properties: {
            title: { type: Type.STRING, description: 'Milestone title' },
            order: { type: Type.NUMBER, description: 'Milestone order (optional, defaults to array index + 1)' },
            steps: {
              type: Type.ARRAY,
              description: 'Array of steps for this milestone',
              items: {
                type: Type.OBJECT,
                properties: {
                  text: { type: Type.STRING, description: 'Step description' },
                  order: { type: Type.NUMBER, description: 'Step order (optional, defaults to array index + 1)' },
                  completed: { type: Type.BOOLEAN, description: 'Step completion status (defaults to false)' }
                },
                required: ['text']
              }
            }
          },
          required: ['title']
        }
      }
    },
    required: ['title']
  }
};

export const updateGoalFunctionDeclaration = {
  name: 'update_goal',
  description: `Updates an existing goal for the user. First call 'lookup_goal' to get all goals, then use the appropriate goal ID from the list. Use this when the user wants to change details of a goal. If you find duplicates of a goal, you can delete one with the user's permission. Example user prompts: "Change the due date for my marathon goal", "Update the description of my reading goal".`,
  parameters: {
    type: Type.OBJECT,
    properties: {
      id: { type: Type.STRING, description: 'The unique ID of the goal to update (required)' },
      title: { type: Type.STRING, description: 'Goal title (optional, for renaming)' },
      description: { type: Type.STRING, description: 'Goal details' },
      due_date: { type: Type.STRING, description: 'Due date (YYYY-MM-DD)' },
      priority: { type: Type.STRING, enum: ['high', 'medium', 'low'], description: 'Goal priority' },
      category: { type: Type.STRING, description: 'Goal category (e.g., health, career, personal, etc.)' },
      status: { type: Type.STRING, enum: ['not_started', 'in_progress', 'completed'], description: 'Goal status' },
      milestones: { 
        type: Type.ARRAY, 
        description: 'Array of milestones for the goal. Each milestone should have a title and optional steps.',
        items: {
          type: Type.OBJECT,
          properties: {
            title: { type: Type.STRING, description: 'Milestone title' },
            order: { type: Type.NUMBER, description: 'Milestone order (optional, defaults to array index + 1)' },
            steps: {
              type: Type.ARRAY,
              description: 'Array of steps for this milestone',
              items: {
                type: Type.OBJECT,
                properties: {
                  text: { type: Type.STRING, description: 'Step description' },
                  order: { type: Type.NUMBER, description: 'Step order (optional, defaults to array index + 1)' },
                  completed: { type: Type.BOOLEAN, description: 'Step completion status (defaults to false)' }
                },
                required: ['text']
              }
            }
          },
          required: ['title']
        }
      },
      milestone_behavior: { 
        type: Type.STRING, 
        enum: ['add', 'replace'], 
        description: 'How to handle milestones: "add" to add new milestones to existing ones, "replace" to replace all existing milestones with new ones. Defaults to "add" if not specified.' 
      }
    },
    required: ['id'] // id is now required since we get it from lookup_goal
  }
};

export const deleteGoalFunctionDeclaration = {
  name: 'delete_goal',
  description: `Deletes a goal by its unique ID. If the user provides only the goal title, first call 'lookup_goal' to retrieve the unique ID of goal, Example user prompts: "Delete the goal 'Test goal'", "Remove my goal called 'Get fit'".`,
  parameters: {
    type: Type.OBJECT,
    properties: {
      id: { type: Type.STRING, description: 'The unique ID of the goal to delete (required if known)' },
      title: { type: Type.STRING, description: 'The title of the goal to delete (optional, use to look up the ID if not provided)' }
    },
    required: [] // id is required if known, but not always present
  }
};

export const lookupGoalbyTitleFunctionDeclaration = {
  name: 'lookup_goal',
  description: 'CRITICAL: Use this function when the user wants to UPDATE, MODIFY, CHANGE, ADD TO, IMPROVE, or REFINE a goal. Do NOT use read_goal for these requests. This function returns only minimal data (id and title) and MUST be followed immediately by update_goal, delete_goal, or another action function. Always pass the search text the user provided (partial match OK). Prefer limit: 1 to fetch a single best match. After getting the ID, immediately call the requested action. Example user prompts: "Update my fitness goal", "Add milestones to my app goal", "Modify my learning goal", "Refine my project goal".',
  parameters: {
    type: Type.OBJECT,
    properties: {
      search: { type: Type.STRING, description: 'Keyword to search for in goal title (case-insensitive, partial match allowed)' },
      category: { type: Type.STRING, description: 'Goal category to filter by (e.g., health, career, personal, etc.)' },
      priority: { type: Type.STRING, enum: ['high', 'medium', 'low'], description: 'Goal priority to filter by' },
      status: { type: Type.STRING, enum: ['not_started', 'in_progress', 'completed'], description: 'Goal status to filter by' },
      due_date: { type: Type.STRING, description: 'Due date to filter by (YYYY-MM-DD)' },
      limit: { type: Type.NUMBER, description: 'Maximum number of results to return. Use 1 when identifying a single goal (default behavior when search is provided).' }
    },
    required: ['search']
  }
};

export const readGoalFunctionDeclaration = {
  name: 'read_goal',
  description: `Reads goal details for the user. Use this ONLY when the user explicitly asks to "show", "display", "view", or "see" goal details without any modification intent. Do NOT use this for update, modify, change, add, improve, or refine requests - use lookup_goal instead. For a simple list of titles like "What are my current goals?", prefer the 'get_goal_titles' function which is optimized to return only titles.

When returning data to the frontend after a detailed read, use this format for compatibility:
{
  "action_type": "read",
  "entity_type": "goal",
  "details": {
    "goals": ["Goal Title 1", "Goal Title 2", ...]
  }
}

Only return full goal objects when the user requests details. Example user prompts for this function: "Show details for my fitness goal", "What is the due date for my marathon goal?", "List my in-progress goals with their descriptions." For a plain list of goal titles, use 'get_goal_titles'.`,
  parameters: {
    type: Type.OBJECT,
    properties: {
      search: { type: Type.STRING, description: 'Keyword to search for in goal title (case-insensitive, partial match allowed)' },
      category: { type: Type.STRING, description: 'Goal category to filter by (e.g., health, career, personal, etc.)' },
      priority: { type: Type.STRING, enum: ['high', 'medium', 'low'], description: 'Goal priority to filter by' },
      status: { type: Type.STRING, enum: ['not_started', 'in_progress', 'completed'], description: 'Goal status to filter by' },
      due_date: { type: Type.STRING, description: 'Due date to filter by (YYYY-MM-DD)' }
    },
    required: []
  }
};

export const getGoalTitlesFunctionDeclaration = {
  name: 'get_goal_titles',
  description: 'Returns only the titles of goals for the user, with optional filtering capabilities. This function is optimized for frontend use when only goal titles are needed (reduced payload). Use this for prompts like "What are my current goals?", "Show me my goals", "List my goal titles", or when filtering by category/status but only titles are needed. Example prompts: "Show me my goal titles", "List my fitness goals", "What are my high priority goal titles?", "Show me goals related to health".',
  parameters: {
    type: Type.OBJECT,
    properties: {
      search: { type: Type.STRING, description: 'Keyword to search for in goal title (case-insensitive, partial match allowed)' },
      category: { type: Type.STRING, description: 'Goal category to filter by (e.g., health, career, personal, etc.)' },
      priority: { type: Type.STRING, enum: ['high', 'medium', 'low'], description: 'Goal priority to filter by' },
      status: { type: Type.STRING, enum: ['not_started', 'in_progress', 'completed'], description: 'Goal status to filter by' },
      due_date: { type: Type.STRING, description: 'Due date to filter by (YYYY-MM-DD)' }
    },
    required: []
  }
};

// Create a task from the next unfinished step in a goal
export const createTaskFromNextGoalStepFunctionDeclaration = {
  name: 'create_task_from_next_goal_step',
  description: `Creates a new task using the next unfinished step from the specified goal. This function:
1) Looks up the goal by title for the current user
2) Finds the first milestone that has an unfinished step and selects the first unfinished step (falls back to the first step if none are marked)
3) Creates a task with the step text as the title and links it to the goal

Use this when the user says things like: "Add the next step from my <goal> as a task", "Turn my next step for <goal> into a task".
You may include optional due_date or priority if the user specifies them.`,
  parameters: {
    type: Type.OBJECT,
    properties: {
      goal_title: { type: Type.STRING, description: 'Exact or partial title of the goal' },
      due_date: { type: Type.STRING, description: 'Optional due date for the created task (YYYY-MM-DD or natural language)' },
      priority: { type: Type.STRING, enum: ['high', 'medium', 'low'], description: 'Optional task priority' }
    },
    required: ['goal_title']
  }
};

// Calendar Event Functions
export const createCalendarEventFunctionDeclaration = {
  name: 'create_calendar_event',
  description: 'Creates a new calendar event for the user. Use this when the user wants to schedule an event. The calendar is in Central Time Zone (CST). You can parse natural language date/time expressions like "tomorrow at 10:00 AM", "next Friday at 2:30 PM", or use specific ISO timestamps. IMPORTANT: Always ask the user for a specific event title if they only say "schedule a meeting" or similar generic terms. Do not use generic titles like "meeting" or "event" - ask for a descriptive title. Example user prompts: "Schedule a meeting for tomorrow at 10am", "Add a calendar event for my doctor appointment next Friday at 2:30 PM", "Create an event called team meeting today at 3pm".',
  parameters: {
    type: Type.OBJECT,
    properties: {
      title: { type: Type.STRING, description: 'Event title - MUST be descriptive and specific. Do not use generic titles like "meeting" or "event". Ask the user for a specific title if needed.' },
      description: { type: Type.STRING, description: 'Event details' },
      start_time: { type: Type.STRING, description: 'Event start time (ISO 8601) - use this if you have exact timestamps' },
      end_time: { type: Type.STRING, description: 'Event end time (ISO 8601) - use this if you have exact timestamps' },
      date: { type: Type.STRING, description: 'Natural language date (e.g., "tomorrow", "next Friday", "2024-01-15") - use this with time parameter' },
      time: { type: Type.STRING, description: 'Natural language time (e.g., "10:00 AM", "2:30 PM", "15:30") - use this with date parameter' },
      duration: { type: Type.NUMBER, description: 'Event duration in minutes (default: 60) - use this with date/time parameters' },
      location: { type: Type.STRING, description: 'Event location' },
      time_zone: { type: Type.STRING, description: 'Time zone (e.g., UTC, America/New_York)' },
      recurrence: { type: Type.STRING, description: 'Recurrence rule for repeating events (e.g., daily, weekly, custom RRULE)' },
      attendees: { type: Type.ARRAY, description: 'List of attendees (emails or names)', items: { type: Type.STRING } },
      reminder_minutes_before: { type: Type.NUMBER, description: 'Number of minutes before event to send a reminder' }
    },
    required: ['title']
  }
};

export const lookupCalendarEventbyTitleFunctionDeclaration = {
  name: 'lookup_calendar_event',
  description: 'STRICTLY use this to identify a calendar event ID before updating or deleting. Prefer using ONLY the search string for fuzzy title match. Include a date filter ONLY if the user clearly specifies a date. When the user does not specify a date, DO NOT include any date filter. Do not include words like "meeting" or "event" in the search term (e.g., search for "eggs" not "eggs meeting"). Returns minimal data (id, title, times). After getting the ID, immediately call update_calendar_event or delete_calendar_event as requested.',
  parameters: {
    type: Type.OBJECT,
    properties: {
      search: { type: Type.STRING, description: 'Search string for event title (e.g., "eggs" for "eggs meeting")' },
      date: { type: Type.STRING, description: 'OPTIONAL. Only include when the user explicitly states a date. Natural language like "today", "tomorrow", "next week", or specific date like "2025-07-21".' }
    },
    required: ['search']
  }
};

export const updateCalendarEventFunctionDeclaration = {
  name: 'update_calendar_event',
  description: 'Updates an existing calendar event for the user. Use this when the user wants to change event details. Example user prompts: "Change the time of my meeting", "Update the location for my doctor appointment".',
  parameters: {
    type: Type.OBJECT,
    properties: {
      id: { type: Type.STRING, description: 'Event ID' },
      title: { type: Type.STRING, description: 'Event title' },
      description: { type: Type.STRING, description: 'Event details' },
      start_time: { type: Type.STRING, description: 'Event start time (ISO 8601)' },
      end_time: { type: Type.STRING, description: 'Event end time (ISO 8601)' },
      location: { type: Type.STRING, description: 'Event location' },
      time_zone: { type: Type.STRING, description: 'Time zone (e.g., UTC, America/New_York)' },
      recurrence: { type: Type.STRING, description: 'Recurrence rule for repeating events (e.g., daily, weekly, custom RRULE)' },
      attendees: { type: Type.ARRAY, description: 'List of attendees (emails or names)', items: { type: Type.STRING } },
      reminder_minutes_before: { type: Type.NUMBER, description: 'Number of minutes before event to send a reminder' }
    },
    required: ['id']
  }
};

export const deleteCalendarEventFunctionDeclaration = {
  name: 'delete_calendar_event',
  description: 'Deletes a calendar event for the user. Use this when the user wants to remove an event. Example user prompts: "Delete my meeting on Friday", "Remove the doctor appointment from my calendar".',
  parameters: {
    type: Type.OBJECT,
    properties: {
      id: { type: Type.STRING, description: 'Event ID' }
    },
    required: ['id']
  }
};

export const readCalendarEventFunctionDeclaration = {
  name: 'read_calendar_event',
  description: 'Reads or lists calendar events for the user. Use this when the user wants to see their events or filter by date. You can pass natural language dates like "tomorrow", "next week", "today", "next Friday", or specific dates like "2024-01-15". Example user prompts: "Show me my calendar events", "List my events for next week", "What events do I have on Friday?"',
  parameters: {
    type: Type.OBJECT,
    properties: {
      date: { type: Type.STRING, description: 'Date to filter events (natural language like "tomorrow", "next week", or specific date like "2024-01-15")' },
      time_range: { type: Type.OBJECT, description: 'Time range filter for events', properties: { start: { type: Type.STRING, description: 'Start time (ISO 8601 or natural language)' }, end: { type: Type.STRING, description: 'End time (ISO 8601 or natural language)' } } },
      location: { type: Type.STRING, description: 'Event location to filter' },
      attendee: { type: Type.STRING, description: 'Attendee to filter events by (email or name)' },
      recurrence: { type: Type.STRING, description: 'Recurrence rule to filter events' }
    },
    required: []
  }
};

// Export all as an array for easy import
export const allGeminiFunctionDeclarations = [
  createTaskFunctionDeclaration,
  updateTaskFunctionDeclaration,
  deleteTaskFunctionDeclaration,
  readTaskFunctionDeclaration,
  lookupTaskbyTitleFunctionDeclaration,
  createGoalFunctionDeclaration,
  updateGoalFunctionDeclaration,
  deleteGoalFunctionDeclaration,
  lookupGoalbyTitleFunctionDeclaration,
  readGoalFunctionDeclaration,
  getGoalTitlesFunctionDeclaration,
  createTaskFromNextGoalStepFunctionDeclaration,
  createCalendarEventFunctionDeclaration,
  updateCalendarEventFunctionDeclaration,
  deleteCalendarEventFunctionDeclaration,
  lookupCalendarEventbyTitleFunctionDeclaration,
  readCalendarEventFunctionDeclaration
]; 