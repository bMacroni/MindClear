import { createClient } from '@supabase/supabase-js';
import { checkWeatherConditions } from '../utils/weatherService.js';
import { getTravelTime } from '../utils/travelTimeService.js';
import { sendAutoSchedulingNotification } from '../services/notificationService.js';

// Auto-scheduling service functions

export async function calculateTravelTime(origin, destination, mode = 'driving') {
  return await getTravelTime(origin, destination, mode);
}

export async function findAvailableTimeSlots(userId, taskDuration, preferredWindows, workDays, token, additionalCommitments = []) {
  const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_ANON_KEY, {
    global: {
      headers: {
        Authorization: `Bearer ${token}`
      }
    }
  });

  // Get user preferences for buffer time and work hours
  const { data: userPrefs } = await supabase
    .from('user_scheduling_preferences')
    .select('preferred_start_time, preferred_end_time, buffer_time_minutes')
    .eq('user_id', userId)
    .single();

  const bufferTimeMinutes = userPrefs?.buffer_time_minutes || 15;
  const workStartTime = userPrefs?.preferred_start_time || '09:00:00';
  const workEndTime = userPrefs?.preferred_end_time || '17:00:00';

  // Parse work hours
  const [workStartHour, workStartMinute] = workStartTime.split(':').map(Number);
  const [workEndHour, workEndMinute] = workEndTime.split(':').map(Number);

  // Get user's calendar events for the next 7 days
  const startDate = new Date();
  const endDate = new Date();
  endDate.setDate(endDate.getDate() + 7);

  let calendarEvents = [];
  try {
    const { data: events, error } = await supabase
      .from('calendar_events')
      .select('start_time, end_time')
      .eq('user_id', userId)
      .gte('start_time', startDate.toISOString())
      .lte('start_time', endDate.toISOString())
      .order('start_time');

    if (error) {
      // Continue with empty calendar events
    } else {
      calendarEvents = events || [];
    }
  } catch (err) {
    // Continue with empty calendar events
  }

  // Get already scheduled tasks (tasks with due dates in the next 7 days)
  let scheduledTasks = [];
  try {
    const { data: tasks, error } = await supabase
      .from('tasks')
      .select('due_date, estimated_duration_minutes')
      .eq('user_id', userId)
      .not('due_date', 'is', null)
      .gte('due_date', startDate.toISOString())
      .lte('due_date', endDate.toISOString())
      .order('due_date');

    if (error) {
      // Continue with empty scheduled tasks
    } else {
      scheduledTasks = tasks || [];
    }
  } catch (err) {
    // Continue with empty scheduled tasks
  }

  // Combine all existing commitments including additional ones from current run
  const existingCommitments = [
    ...calendarEvents.map(event => ({
      start: new Date(event.start_time),
      end: new Date(event.end_time),
      type: 'calendar'
    })),
    ...scheduledTasks.map(task => ({
      start: new Date(task.due_date),
      end: new Date(new Date(task.due_date).getTime() + (task.estimated_duration_minutes || 60) * 60 * 1000),
      type: 'task'
    })),
    ...additionalCommitments
  ].sort((a, b) => a.start.getTime() - b.start.getTime());

  // Generate available time slots
  const availableSlots = [];
  const now = new Date();

  // Look for slots in the next 7 days
  for (let day = 0; day < 7; day++) {
    const checkDate = new Date();
    checkDate.setDate(checkDate.getDate() + day);

    // Check if it's a work day (1=Monday, 7=Sunday)
    const dayOfWeek = checkDate.getDay();
    const adjustedDayOfWeek = dayOfWeek === 0 ? 7 : dayOfWeek; // Convert Sunday=0 to Sunday=7
    if (!workDays.includes(adjustedDayOfWeek)) {
      continue; // Skip non-work days
    }

    // Set work hours for this day
    const dayStart = new Date(checkDate);
    dayStart.setHours(workStartHour, workStartMinute, 0, 0);

    const dayEnd = new Date(checkDate);
    dayEnd.setHours(workEndHour, workEndMinute, 0, 0);

    // Find commitments for this day
    const dayCommitments = existingCommitments.filter(commitment => {
      const commitmentDate = new Date(commitment.start);
      return commitmentDate.toDateString() === checkDate.toDateString();
    });

    // Start with the beginning of the work day, but not before now
    let currentTime = new Date(Math.max(dayStart.getTime(), now.getTime()));

    // If current time is after work hours for today, skip to next day
    if (day === 0 && currentTime.getTime() >= dayEnd.getTime()) {
      continue;
    }

    // Check each commitment and find gaps
    for (const commitment of dayCommitments) {
      // If there's enough time before this commitment
      const timeBeforeCommitment = commitment.start.getTime() - currentTime.getTime();
      const requiredTime = (taskDuration + bufferTimeMinutes) * 60 * 1000;

      if (timeBeforeCommitment >= requiredTime) {
        const slotEnd = new Date(currentTime.getTime() + taskDuration * 60 * 1000);
        const slot = {
          start_time: new Date(currentTime),
          end_time: slotEnd,
          duration_minutes: taskDuration
        };
        availableSlots.push(slot);
        return availableSlots; // Return first available slot
      }

      // Move current time to after this commitment (plus buffer)
      currentTime = new Date(commitment.end.getTime() + bufferTimeMinutes * 60 * 1000);
    }

    // Check if there's time after the last commitment
    const timeAfterLastCommitment = dayEnd.getTime() - currentTime.getTime();
    const requiredTime = (taskDuration + bufferTimeMinutes) * 60 * 1000;

    if (timeAfterLastCommitment >= requiredTime) {
      const slotEnd = new Date(currentTime.getTime() + taskDuration * 60 * 1000);
      const slot = {
        start_time: new Date(currentTime),
        end_time: slotEnd,
        duration_minutes: taskDuration
      };
      availableSlots.push(slot);
      return availableSlots; // Return first available slot
    }
  }

  // If no slots found in the next 7 days, return a fallback slot (next work day at start time)
  const fallbackDate = new Date();
  let daysToAdd = 1;
  while (daysToAdd <= 7) {
    fallbackDate.setDate(fallbackDate.getDate() + daysToAdd);
    const dayOfWeek = fallbackDate.getDay();
    const adjustedDayOfWeek = dayOfWeek === 0 ? 7 : dayOfWeek;

    if (workDays.includes(adjustedDayOfWeek)) {
      fallbackDate.setHours(workStartHour, workStartMinute, 0, 0);
      const fallbackEnd = new Date(fallbackDate.getTime() + taskDuration * 60 * 1000);

      const fallbackSlot = {
        start_time: new Date(fallbackDate),
        end_time: fallbackEnd,
        duration_minutes: taskDuration
      };

      return [fallbackSlot];
    }
    daysToAdd++;
  }

  // Ultimate fallback - tomorrow at 9 AM
  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  tomorrow.setHours(9, 0, 0, 0);

  const ultimateFallbackSlot = {
    start_time: tomorrow,
    end_time: new Date(tomorrow.getTime() + taskDuration * 60 * 1000),
    duration_minutes: taskDuration
  };

  return [ultimateFallbackSlot];
}

// New function for one-off task scheduling that properly handles conflicts
export async function scheduleSingleTask(userId, taskId, token) {
  const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_ANON_KEY, {
    global: {
      headers: {
        Authorization: `Bearer ${token}`
      }
    }
  });

  // Get the task details
  const { data: task, error: taskError } = await supabase
    .from('tasks')
    .select('*')
    .eq('id', taskId)
    .eq('user_id', userId)
    .single();

  if (taskError) {
    throw new Error('Task not found');
  }

  if (!task) {
    throw new Error('Task not found');
  }

  // Check if task is completed - don't schedule completed tasks
  if (task.status === 'completed') {
    throw new Error('Cannot schedule completed tasks');
  }

  // Get user scheduling preferences
  const { data: preferences, error: prefsError } = await supabase
    .from('user_scheduling_preferences')
    .select('*')
    .eq('user_id', userId)
    .single();

  if (prefsError) {
    // Use default preferences if none exist
    const defaultPreferences = {
      preferred_start_time: '09:00:00',
      preferred_end_time: '17:00:00',
      work_days: [1, 2, 3, 4, 5],
      buffer_time_minutes: 15
    };
    preferences = defaultPreferences;
  }

  // Calculate task duration including travel time
  let totalDuration = task.estimated_duration_minutes || 30;

  // Add travel time if location is specified
  if (task.location) {
    try {
      const travelData = await calculateTravelTime('current_location', task.location);
      totalDuration += travelData.duration_minutes || 0;
    } catch (error) {
      // Continue without travel time
    }
  }

  // Get existing calendar events and scheduled tasks
  const startDate = new Date();
  const endDate = new Date();
  endDate.setDate(endDate.getDate() + 7);

  let existingCommitments = [];

  // Get calendar events
  try {
    const { data: events } = await supabase
      .from('calendar_events')
      .select('start_time, end_time')
      .eq('user_id', userId)
      .gte('start_time', startDate.toISOString())
      .lte('start_time', endDate.toISOString())
      .order('start_time');

    if (events) {
      existingCommitments.push(...events.map(event => ({
        start: new Date(event.start_time),
        end: new Date(event.end_time),
        type: 'calendar'
      })));
    }
  } catch (err) {
    // Continue without calendar events
  }

  // Get scheduled tasks (tasks with due dates)
  try {
    const { data: scheduledTasks } = await supabase
      .from('tasks')
      .select('due_date, estimated_duration_minutes')
      .eq('user_id', userId)
      .not('due_date', 'is', null)
      .gte('due_date', startDate.toISOString())
      .lte('due_date', endDate.toISOString())
      .order('due_date');

    if (scheduledTasks) {
      existingCommitments.push(...scheduledTasks.map(task => ({
        start: new Date(task.due_date),
        end: new Date(new Date(task.due_date).getTime() + (task.estimated_duration_minutes || 30) * 60 * 1000),
        type: 'task'
      })));
    }
  } catch (err) {
    // Continue without scheduled tasks
  }

  // Sort commitments by start time
  existingCommitments.sort((a, b) => a.start.getTime() - b.start.getTime());

  // Parse work hours
  const [workStartHour, workStartMinute] = preferences.preferred_start_time.split(':').map(Number);
  const [workEndHour, workEndMinute] = preferences.preferred_end_time.split(':').map(Number);
  const bufferTimeMinutes = preferences.buffer_time_minutes || 15;

  // Find the next available slot
  const now = new Date();
  let scheduledTime = null;

  // Look for slots in the next 7 days
  for (let day = 0; day < 7; day++) {
    const checkDate = new Date();
    checkDate.setDate(checkDate.getDate() + day);

    // Check if it's a work day
    const dayOfWeek = checkDate.getDay();
    const adjustedDayOfWeek = dayOfWeek === 0 ? 7 : dayOfWeek;
    if (!preferences.work_days.includes(adjustedDayOfWeek)) {
      continue;
    }

    // Set work hours for this day
    const dayStart = new Date(checkDate);
    dayStart.setHours(workStartHour, workStartMinute, 0, 0);

    const dayEnd = new Date(checkDate);
    dayEnd.setHours(workEndHour, workEndMinute, 0, 0);

    // Find commitments for this day
    const dayCommitments = existingCommitments.filter(commitment => {
      const commitmentDate = new Date(commitment.start);
      return commitmentDate.toDateString() === checkDate.toDateString();
    });

    // Start with the beginning of the work day, but not before now
    let currentTime = new Date(Math.max(dayStart.getTime(), now.getTime()));

    // If current time is after work hours for today, skip to next day
    if (day === 0 && currentTime.getTime() >= dayEnd.getTime()) {
      continue;
    }

    // Check each commitment and find gaps
    for (const commitment of dayCommitments) {
      // If there's enough time before this commitment
      const timeBeforeCommitment = commitment.start.getTime() - currentTime.getTime();
      const requiredTime = (totalDuration + bufferTimeMinutes) * 60 * 1000;

      if (timeBeforeCommitment >= requiredTime) {
        scheduledTime = new Date(currentTime);
        break;
      }

      // Move current time to after this commitment (plus buffer)
      currentTime = new Date(commitment.end.getTime() + bufferTimeMinutes * 60 * 1000);
    }

    // If we found a slot, break
    if (scheduledTime) {
      break;
    }

    // Check if there's time after the last commitment
    const timeAfterLastCommitment = dayEnd.getTime() - currentTime.getTime();
    const requiredTime = (totalDuration + bufferTimeMinutes) * 60 * 1000;

    if (timeAfterLastCommitment >= requiredTime) {
      scheduledTime = new Date(currentTime);
      break;
    }
  }

  // If no slot found, use fallback (next work day at start time)
  if (!scheduledTime) {
    let daysToAdd = 1;
    while (daysToAdd <= 7) {
      const fallbackDate = new Date();
      fallbackDate.setDate(fallbackDate.getDate() + daysToAdd);
      const dayOfWeek = fallbackDate.getDay();
      const adjustedDayOfWeek = dayOfWeek === 0 ? 7 : dayOfWeek;

      if (preferences.work_days.includes(adjustedDayOfWeek)) {
        fallbackDate.setHours(workStartHour, workStartMinute, 0, 0);
        scheduledTime = fallbackDate;
        break;
      }
      daysToAdd++;
    }
  }

  // Ultimate fallback - tomorrow at 9 AM
  if (!scheduledTime) {
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    tomorrow.setHours(9, 0, 0, 0);
    scheduledTime = tomorrow;
  }

  // Update the task with the scheduled time
  const { error: updateError } = await supabase
    .from('tasks')
    .update({
      due_date: scheduledTime.toISOString(),
      status: 'in_progress'
    })
    .eq('id', taskId);

  if (updateError) {
    throw new Error('Failed to update task with scheduled time');
  }

  // Create calendar event
  let calendarEvent = null;
  try {
    calendarEvent = await createCalendarEvent(userId, task, scheduledTime, token);
  } catch (error) {
    // Continue without calendar event
  }

  return {
    task_id: taskId,
    scheduled_time: scheduledTime,
    calendar_event_id: calendarEvent?.id || null,
    duration_minutes: totalDuration
  };
}

export async function createCalendarEvent(userId, task, scheduledTime, token) {
  const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_ANON_KEY, {
    global: {
      headers: {
        Authorization: `Bearer ${token}`
      }
    }
  });

  const endTime = new Date(scheduledTime);
  endTime.setMinutes(endTime.getMinutes() + (task.estimated_duration_minutes || 60));

  const { data, error } = await supabase
    .from('calendar_events')
    .insert([{
      user_id: userId,
      task_id: task.id,
      title: task.title,
      description: task.description,
      start_time: scheduledTime.toISOString(),
      end_time: endTime.toISOString(),
      location: task.location
    }])
    .select()
    .single();

  if (error) {
    return null;
  }

  return data;
}

export async function updateTaskSchedulingHistory(userId, taskId, scheduledTime, weatherData, travelTime, calendarEventId, reason, token) {
  const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_ANON_KEY, {
    global: {
      headers: {
        Authorization: `Bearer ${token}`
      }
    }
  });

  const { data, error } = await supabase
    .from('task_scheduling_history')
    .insert([{
      user_id: userId,
      task_id: taskId,
      scheduled_date: scheduledTime.toISOString(),
      weather_conditions: weatherData,
      travel_time_minutes: travelTime,
      calendar_event_id: calendarEventId,
      scheduling_reason: reason
    }])
    .select()
    .single();

  if (error) {
    return null;
  }

  return data;
}

// Import enhanced processRecurringTask from dedicated service
// Re-exported here for backward compatibility with existing consumers
import {
  processRecurringTask as enhancedProcessRecurringTask,
  rolloverMissedRecurringTasks
} from '../services/recurringTaskService.js';

/**
 * Process a recurring task after completion
 * This is a re-export of the enhanced function from recurringTaskService.js
 * for backward compatibility with existing code that imports from this file.
 */
export const processRecurringTask = enhancedProcessRecurringTask;

/**
 * ADHD-friendly rollover for missed recurring tasks
 * Re-exported for convenience
 */
export { rolloverMissedRecurringTasks };

export async function autoScheduleTasks(userId, token) {
  const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_ANON_KEY, {
    global: {
      headers: {
        Authorization: `Bearer ${token}`
      }
    }
  });

  // Get user scheduling preferences
  let { data: preferences, error: prefsError } = await supabase
    .from('user_scheduling_preferences')
    .select('*')
    .eq('user_id', userId)
    .single();

  // If user preferences don't exist, create default ones
  if (prefsError && prefsError.code === 'PGRST116') {
    const { data: newPrefs, error: createError } = await supabase
      .from('user_scheduling_preferences')
      .insert([{
        user_id: userId,
        preferred_start_time: '09:00:00',
        preferred_end_time: '17:00:00',
        work_days: [1, 2, 3, 4, 5],
        max_tasks_per_day: 5,
        buffer_time_minutes: 15,
        weather_check_enabled: true,
        travel_time_enabled: true,
        auto_scheduling_enabled: true
      }])
      .select()
      .single();

    if (createError) {
      return { error: 'Failed to create user preferences' };
    }
    preferences = newPrefs;
  } else if (prefsError) {
    return { error: 'Failed to fetch user preferences' };
  }

  if (!preferences.auto_scheduling_enabled) {
    return { message: 'Auto-scheduling is disabled for this user' };
  }

  // Get total task count before auto-scheduling
  const { count: totalTasksBefore } = await supabase
    .from('tasks')
    .select('*', { count: 'exact', head: true })
    .eq('user_id', userId);

  // Get all tasks that need auto-scheduling
  const { data: tasks, error: tasksError } = await supabase
    .from('tasks')
    .select('*')
    .eq('user_id', userId)
    .eq('auto_schedule_enabled', true)
    .neq('status', 'completed')
    .order('priority', { ascending: false });

  if (tasksError) {
    return { error: 'Failed to fetch tasks' };
  }

  const results = [];
  const newlyScheduledTasks = []; // Track tasks scheduled in this run

  for (const task of tasks) {
    try {
      // Check if task is weather dependent
      let weatherData = null;
      if (task.weather_dependent && task.location) {
        weatherData = await checkWeatherConditions(task.location, new Date());

        // Skip scheduling if weather is not suitable
        if (!weatherData.suitable_for_outdoor) {
          results.push({
            task_id: task.id,
            task_title: task.title,
            status: 'skipped',
            reason: 'Weather not suitable for outdoor task'
          });
          continue;
        }
      }

      // Calculate travel time if location is specified
      let travelTime = 0;
      if (task.location) {
        const travelData = await calculateTravelTime('current_location', task.location);
        travelTime = travelData.duration_minutes;
      }

      // Find available time slots, considering newly scheduled tasks
      const timeSlots = await findAvailableTimeSlots(
        userId,
        (task.estimated_duration_minutes || 60) + travelTime,
        task.preferred_time_windows,
        preferences.work_days,
        token,
        newlyScheduledTasks
      );

      if (timeSlots.length === 0) {
        results.push({
          task_id: task.id,
          task_title: task.title,
          status: 'failed',
          reason: 'No available time slots found'
        });
        continue;
      }

      // Schedule the task in the first available slot
      const scheduledTime = timeSlots[0].start_time;

      // Create calendar event (optional - continue even if it fails)
      let calendarEvent = null;
      try {
        calendarEvent = await createCalendarEvent(userId, task, scheduledTime, token);
      } catch (calendarError) {
        // Continue without calendar event
      }

      // Update task with scheduled time
      const { error: updateError } = await supabase
        .from('tasks')
        .update({
          due_date: scheduledTime.toISOString(),
          status: 'in_progress',
          last_scheduled_date: new Date().toISOString(),
          travel_time_minutes: travelTime
        })
        .eq('id', task.id);

      if (updateError) {
        results.push({
          task_id: task.id,
          task_title: task.title,
          status: 'error',
          reason: 'Failed to update task with scheduled time'
        });
        continue;
      }

      // Add the newly scheduled task to our tracking array
      newlyScheduledTasks.push({
        start: scheduledTime,
        end: new Date(scheduledTime.getTime() + (task.estimated_duration_minutes || 60) * 60 * 1000),
        type: 'newly_scheduled_task'
      });

      // Update scheduling history (optional - continue even if it fails)
      try {
        await updateTaskSchedulingHistory(
          userId,
          task.id,
          scheduledTime,
          weatherData,
          travelTime,
          calendarEvent?.id,
          'Auto-scheduled based on availability and preferences',
          token
        );
      } catch (historyError) {
        // Continue without updating history
      }

      results.push({
        task_id: task.id,
        task_title: task.title,
        status: 'scheduled',
        scheduled_time: scheduledTime,
        calendar_event_id: calendarEvent?.id || null
      });

    } catch (error) {
      results.push({
        task_id: task.id,
        task_title: task.title,
        status: 'error',
        reason: error.message
      });
    }
  }

  // Get total task count after auto-scheduling
  const { count: totalTasksAfter } = await supabase
    .from('tasks')
    .select('*', { count: 'exact', head: true })
    .eq('user_id', userId);

  // Prepare notification data
  const successfulTasks = results.filter(r => r.status === 'scheduled');
  const failedTasks = results.filter(r => r.status === 'failed' || r.status === 'error');
  const skippedTasks = results.filter(r => r.status === 'skipped');

  // Send notification based on results
  try {
    if (successfulTasks.length > 0 || failedTasks.length > 0) {
      const notificationData = {
        type: failedTasks.length > 0 ? 'auto_scheduling_error' : 'auto_scheduling_completed',
        title: failedTasks.length > 0 ? 'Auto-Scheduling Issues Detected' : 'Auto-Scheduling Completed',
        message: failedTasks.length > 0
          ? `Auto-scheduling completed with ${successfulTasks.length} tasks scheduled and ${failedTasks.length} issues encountered.`
          : `Successfully scheduled ${successfulTasks.length} tasks automatically.`,
        details: failedTasks.length > 0
          ? `Some tasks couldn't be scheduled due to conflicts or missing information.`
          : `All eligible tasks have been scheduled according to your preferences.`,
        scheduledTasks: successfulTasks,
        failedTasks: failedTasks
      };

      await sendAutoSchedulingNotification(userId, notificationData);
    }
  } catch (notificationError) {
    // Don't fail the entire auto-scheduling process if notification fails
  }

  return {
    message: 'Auto-scheduling completed',
    results: results,
    total_tasks: tasks.length,
    successful: successfulTasks.length,
    failed: failedTasks.length,
    skipped: skippedTasks.length,
    task_count_change: totalTasksAfter - totalTasksBefore
  };
}

// Get user scheduling preferences
export async function getSchedulingPreferences(userId, token) {
  const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_ANON_KEY, {
    global: {
      headers: {
        Authorization: `Bearer ${token}`
      }
    }
  });

  const { data: preferences, error } = await supabase
    .from('user_scheduling_preferences')
    .select('*')
    .eq('user_id', userId)
    .single();

  if (error) {
    if (error.code === 'PGRST116') {
      // Return default preferences if none exist
      return {
        user_id: userId,
        preferred_start_time: '09:00:00',
        preferred_end_time: '17:00:00',
        work_days: [1, 2, 3, 4, 5],
        max_tasks_per_day: 5,
        buffer_time_minutes: 15,
        weather_check_enabled: true,
        travel_time_enabled: true,
        auto_scheduling_enabled: true
      };
    }
    throw new Error('Failed to fetch scheduling preferences');
  }

  return preferences;
}

// Update user scheduling preferences
export async function updateSchedulingPreferences(userId, preferences, token) {
  const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_ANON_KEY, {
    global: {
      headers: {
        Authorization: `Bearer ${token}`
      }
    }
  });

  // Check if preferences exist
  const { data: existingPrefs, error: checkError } = await supabase
    .from('user_scheduling_preferences')
    .select('user_id')
    .eq('user_id', userId)
    .single();

  let result;
  if (checkError && checkError.code === 'PGRST116') {
    // Create new preferences
    const { data, error } = await supabase
      .from('user_scheduling_preferences')
      .insert([{
        user_id: userId,
        ...preferences
      }])
      .select()
      .single();

    if (error) {
      throw new Error('Failed to create scheduling preferences');
    }
    result = data;
  } else {
    // Update existing preferences
    const { data, error } = await supabase
      .from('user_scheduling_preferences')
      .update(preferences)
      .eq('user_id', userId)
      .select()
      .single();

    if (error) {
      throw new Error('Failed to update scheduling preferences');
    }
    result = data;
  }

  return result;
}

// Get auto-scheduling status for a specific task
export async function getTaskSchedulingStatus(userId, taskId, token) {
  const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_ANON_KEY, {
    global: {
      headers: {
        Authorization: `Bearer ${token}`
      }
    }
  });

  const { data: task, error } = await supabase
    .from('tasks')
    .select('*')
    .eq('id', taskId)
    .eq('user_id', userId)
    .single();

  if (error) {
    throw new Error('Task not found');
  }

  return {
    task_id: taskId,
    auto_schedule_enabled: task.auto_schedule_enabled || false,
    scheduled_time: task.due_date,
    scheduled_date: task.due_date ? new Date(task.due_date).toDateString() : null,
    calendar_event_id: task.calendar_event_id,
    weather_dependent: task.weather_dependent || false,
    location: task.location,
    travel_time_minutes: task.travel_time_minutes
  };
}

// Toggle auto-scheduling for a specific task
export async function toggleTaskAutoScheduling(userId, taskId, enabled, token) {
  const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_ANON_KEY, {
    global: {
      headers: {
        Authorization: `Bearer ${token}`
      }
    }
  });

  const { error } = await supabase
    .from('tasks')
    .update({ auto_schedule_enabled: enabled })
    .eq('id', taskId)
    .eq('user_id', userId);

  if (error) {
    throw new Error('Failed to update task auto-scheduling status');
  }
}

// Get available time slots for a task
export async function getAvailableTimeSlots(userId, taskId, token) {
  const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_ANON_KEY, {
    global: {
      headers: {
        Authorization: `Bearer ${token}`
      }
    }
  });

  // Get the task details
  const { data: task, error: taskError } = await supabase
    .from('tasks')
    .select('*')
    .eq('id', taskId)
    .eq('user_id', userId)
    .single();

  if (taskError) {
    throw new Error('Task not found');
  }

  // Get user preferences
  const { data: preferences, error: prefsError } = await supabase
    .from('user_scheduling_preferences')
    .select('*')
    .eq('user_id', userId)
    .single();

  if (prefsError) {
    // Use default preferences
    preferences = {
      preferred_start_time: '09:00:00',
      preferred_end_time: '17:00:00',
      work_days: [1, 2, 3, 4, 5],
      buffer_time_minutes: 15
    };
  }

  // Calculate task duration including travel time
  let totalDuration = task.estimated_duration_minutes || 30;

  if (task.location) {
    try {
      const travelData = await calculateTravelTime('current_location', task.location);
      totalDuration += travelData.duration_minutes || 0;
    } catch (error) {
      // Continue without travel time
    }
  }

  // Find available time slots
  const timeSlots = await findAvailableTimeSlots(
    userId,
    totalDuration,
    task.preferred_time_windows,
    preferences.work_days,
    token
  );

  return timeSlots;
}

// Export the controller object
export const autoSchedulingController = {
  findAvailableTimeSlots,
  scheduleSingleTask,
  createCalendarEvent,
  updateTaskSchedulingHistory,
  processRecurringTask,
  autoScheduleTasks,
  getSchedulingPreferences,
  updateSchedulingPreferences,
  getTaskSchedulingStatus,
  toggleTaskAutoScheduling,
  getAvailableTimeSlots
}; 