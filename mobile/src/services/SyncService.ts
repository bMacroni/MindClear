import {getDatabase} from '../db';
import {Q, Database} from '@nozbe/watermelondb';
import {enhancedAPI} from './enhancedApi';
import AsyncStorage from '@react-native-async-storage/async-storage';
import CalendarEvent from '../db/models/CalendarEvent';
import Task from '../db/models/Task';
import Goal from '../db/models/Goal';
import Milestone from '../db/models/Milestone';
import MilestoneStep from '../db/models/MilestoneStep';
import { notificationService } from './notificationService';
import { authService } from './auth';
import { safeParseDate } from '../utils/dateUtils';

// Interface for task data received from server during sync
interface TaskPayload {
  id: string;
  title: string;
  description?: string;
  priority?: string;
  estimated_duration_minutes?: number;
  due_date?: string;
  goal_id?: string;
  is_today_focus?: boolean;
  user_id?: string;
  status?: string;
}

const LAST_SYNCED_AT_KEY = 'last_synced_at';

class SyncService {
  private isSyncing = false;
  private logger = console;

  async pushData() {
    const database = getDatabase();

    // Find records that need pushing
    const dirtyEvents = await database.get<CalendarEvent>('calendar_events').query(
      Q.where('status', Q.notEq('synced'))
    ).fetch();

    // Find tasks that need syncing: those with pending_* status or lifecycle status
    // Tasks with combined format (pending_update:*) or sync statuses need syncing
    // Query for status NOT 'synced' and NOT a pure lifecycle status (we want pending states)
    const allTasks = await database.get<Task>('tasks').query().fetch();
    const dirtyTasks = allTasks.filter(task => {
      const status = task.status;
      // Include tasks with sync statuses
      if (status === 'pending_create' || status === 'pending_update' || status === 'pending_delete') {
        return true;
      }
      // Include tasks with combined format (pending_update:* or pending_create:*)
      if (typeof status === 'string' && (status.startsWith('pending_update:') || status.startsWith('pending_create:'))) {
        return true;
      }
      // Exclude synced tasks
      if (status === 'synced') {
        return false;
      }
      // For legacy compatibility: if status is lifecycle-only, it still needs syncing check
      // Actually, pure lifecycle statuses ('not_started', 'in_progress', 'completed') should be synced,
      // so we don't include them here unless they're marked as needing sync
      return false;
    });

    const dirtyGoals = await database.get<Goal>('goals').query(
      Q.where('status', Q.notEq('synced'))
    ).fetch();

    const dirtyMilestones = await database.get<Milestone>('milestones').query(
      Q.where('status', Q.notEq('synced'))
    ).fetch();

    const dirtyMilestoneSteps = await database.get<MilestoneStep>('milestone_steps').query(
      Q.where('status', Q.notEq('synced'))
    ).fetch();

    const allDirtyRecords = [...dirtyEvents, ...dirtyTasks, ...dirtyGoals, ...dirtyMilestones, ...dirtyMilestoneSteps];

    if (allDirtyRecords.length === 0) {
      console.log('Push: No local changes to push.');
      return;
    }

    console.log(`Push: Found ${allDirtyRecords.length} local changes to push.`);

    const pushErrors: { recordId: string; error: any }[] = [];

    for (const record of allDirtyRecords) {
      try {
        let recordData: any;
        let serverResponse: any;

        // Handle different record types
        if (record instanceof CalendarEvent) {
          recordData = {
            summary: record.title, // Map title to summary for the API
            description: record.description,
            startTime: record.startTime.toISOString(),
            endTime: record.endTime.toISOString(),
            location: record.location,
            isAllDay: record.isAllDay,
            client_updated_at: record.updatedAt?.toISOString(), // For conflict resolution
          };

          switch (record.status) {
            case 'pending_create':
              serverResponse = await enhancedAPI.createEvent(recordData);
              break;
            case 'pending_update':
              serverResponse = await enhancedAPI.updateEvent(record.id, recordData);
              break;
            case 'pending_delete':
              await enhancedAPI.deleteEvent(record.id);
              break;
            default:
              console.warn(`Push: Unknown status ${record.status} for event ${record.id}`);
              continue;
          }
        } else if (record instanceof Task) {
          const { lifecycleStatus, syncStatus } = this.extractLifecycleStatus(record.status);

          recordData = {
            title: record.title,
            description: record.description,
            priority: record.priority,
            estimated_duration_minutes: record.estimatedDurationMinutes,
            due_date: record.dueDate?.toISOString(),
            // Only include optional fields if they have values (don't send null)
            ...(record.goalId ? { goal_id: record.goalId } : {}),
            ...(record.isTodayFocus !== undefined ? { is_today_focus: record.isTodayFocus } : {}),
            status: lifecycleStatus, // Include lifecycle status in sync
            client_updated_at: record.updatedAt?.toISOString(),
          };

          switch (syncStatus) {
            case 'pending_create':
              serverResponse = await enhancedAPI.createTask(recordData);
              break;
            case 'pending_update':
              serverResponse = await enhancedAPI.updateTask(record.id, recordData);
              break;
            case 'pending_delete':
              serverResponse = await enhancedAPI.deleteTask(record.id);
              break;
            default:
              console.warn(`Push: Unknown status ${record.status} for task ${record.id}`);
              continue;
          }
        } else if (record instanceof Goal) {
          recordData = {
            title: record.title,
            description: record.description,
            target_completion_date: record.targetCompletionDate?.toISOString(),
            progress_percentage: record.progressPercentage,
            category: record.category,
            is_active: record.isActive,
            client_updated_at: record.updatedAt?.toISOString(),
          };

          switch (record.status) {
            case 'pending_create':
              serverResponse = await enhancedAPI.createGoal(recordData);
              break;
            case 'pending_update':
              serverResponse = await enhancedAPI.updateGoal(record.id, recordData);
              break;
            case 'pending_delete':
              serverResponse = await enhancedAPI.deleteGoal(record.id);
              break;
            default:
              console.warn(`Push: Unknown status ${record.status} for goal ${record.id}`);
              continue;
          }
        } else if (record instanceof Milestone) {
          recordData = {
            title: record.title,
            description: record.description,
            completed: record.completed,
            order: record.order,
            client_updated_at: record.updatedAt?.toISOString(),
          };

          switch (record.status) {
            case 'pending_create':
              serverResponse = await enhancedAPI.createMilestone(record.goalId, recordData);
              break;
            case 'pending_update':
              serverResponse = await enhancedAPI.updateMilestone(record.id, recordData);
              break;
            case 'pending_delete':
              serverResponse = await enhancedAPI.deleteMilestone(record.id);
              break;
            default:
              console.warn(`Push: Unknown status ${record.status} for milestone ${record.id}`);
              continue;
          }
        } else if (record instanceof MilestoneStep) {
          recordData = {
            text: record.text,
            completed: record.completed,
            order: record.order,
            client_updated_at: record.updatedAt?.toISOString(),
          };

          switch (record.status) {
            case 'pending_create':
              serverResponse = await enhancedAPI.createStep(record.milestoneId, recordData);
              break;
            case 'pending_update':
              serverResponse = await enhancedAPI.updateStep(record.id, recordData);
              break;
            case 'pending_delete':
              serverResponse = await enhancedAPI.deleteStep(record.id);
              break;
            default:
              console.warn(`Push: Unknown status ${record.status} for step ${record.id}`);
              continue;
          }
        } else {
          console.warn(`Push: Unknown record type for record ${(record as any).id}`);
          continue;
        }

        // Update local record based on server action
        await database.write(async () => {
          if (record.status === 'pending_delete' || 
              (typeof record.status === 'string' && record.status.includes('pending_delete'))) {
            await record.destroyPermanently();
          } else {
            // For tasks, preserve lifecycle status from server response if provided
            let finalStatus: string;
            if (record instanceof Task) {
              // Extract lifecycle status from server response or preserve from current status
              const serverStatus = serverResponse?.status;
              const serverLifecycleStatus =
                serverStatus === 'not_started' || serverStatus === 'in_progress' || serverStatus === 'completed'
                  ? serverStatus
                  : null;

              const currentLifecycleStatus = this.extractLifecycleStatus(record.status as string | undefined | null);

              // Use server status if available, otherwise preserve current
              finalStatus = serverLifecycleStatus || currentLifecycleStatus || 'not_started';
            } else {
              // Non-task records use 'synced' status
              finalStatus = 'synced';
            }
            
            await record.update(r => {
              r.status = finalStatus;
              if (serverResponse && serverResponse.updated_at) {
                const parsedUpdatedAt = safeParseDate(serverResponse.updated_at);
                if (parsedUpdatedAt) {
                  r.updatedAt = parsedUpdatedAt;
                } else {
                  console.warn(`Push: Failed to parse updated_at for record ${record.id}:`, serverResponse.updated_at);
                }
              }
            });
          }
        });

      } catch (error: any) {
        // --- CONFLICT HANDLING ---
        if (error?.response?.status === 409) {
          console.warn(`Push: Conflict detected for record ${record.id}. Overwriting local with server version.`);
          const serverRecord = error.response.data?.server_record;
          if (serverRecord) {
            // Safely parse dates from server record
            const parsedStartTime = serverRecord.start_time ? safeParseDate(serverRecord.start_time) : undefined;
            const parsedEndTime = serverRecord.end_time ? safeParseDate(serverRecord.end_time) : undefined;
            const parsedUpdatedAt = serverRecord.updated_at ? safeParseDate(serverRecord.updated_at) : undefined;
            
            // Check if any critical dates failed to parse
            if (!parsedStartTime || !parsedEndTime || !parsedUpdatedAt) {
              console.error(`Push: Failed to parse dates for record ${record.id} during conflict resolution:`, {
                start_time: serverRecord.start_time,
                end_time: serverRecord.end_time,
                updated_at: serverRecord.updated_at,
                parsedStartTime: parsedStartTime?.toISOString() || 'FAILED',
                parsedEndTime: parsedEndTime?.toISOString() || 'FAILED',
                parsedUpdatedAt: parsedUpdatedAt?.toISOString() || 'FAILED'
              });
              
              // Add to pushErrors instead of corrupting the local record
              pushErrors.push({ 
                recordId: record.id, 
                error: new Error(`Date parsing failed during conflict resolution for record ${record.id}`) 
              });
              continue;
            }
            
            await database.write(async () => {
              await record.update(r => {
                // Only update fields that exist on the specific record type
                if ('title' in r) r.title = serverRecord.title;
                if ('description' in r) r.description = serverRecord.description;
                if ('startTime' in r) r.startTime = parsedStartTime;
                if ('endTime' in r) r.endTime = parsedEndTime;
                if ('location' in r) r.location = serverRecord.location;
                if ('isAllDay' in r) r.isAllDay = serverRecord.is_all_day;
                r.status = 'synced';
                r.updatedAt = parsedUpdatedAt;
              });
            });
            // Successfully handled conflict, so we don't add it to pushErrors
            continue;
          }
        }
        // --- END CONFLICT HANDLING ---

        console.error(`Push: Failed to sync record ${record.id}. Status: ${record.status}`, JSON.stringify(error, null, 2));
        pushErrors.push({ recordId: record.id, error });

        // In a real app, you would implement more robust error handling,
        // like a failed queue or marking the record as sync_failed.
        // For now, we'll just log the error and continue.
      }
    }

    // Check for auth errors after the loop and before other error handling
    const hasAuthError = pushErrors.some(
      e => e.error?.response?.status === 401 || e.error?.response?.status === 403,
    );

    if (hasAuthError) {
      notificationService.showInAppNotification(
        'Authentication Failed',
        'Please log in again to sync your data.',
      );
      throw new Error('Authentication failed');
    }

    if (pushErrors.length > 0) {
      const errorMessage = `Failed to push ${pushErrors.length} of ${allDirtyRecords.length} changes.`;
      notificationService.showInAppNotification(
        'Push Incomplete',
        errorMessage,
      );

      const failedRecordIds = pushErrors.map(e => e.recordId);
      const recordsToUpdate = allDirtyRecords.filter(r =>
        failedRecordIds.includes(r.id),
      );

      if (recordsToUpdate.length > 0) {
        const database = getDatabase();
        try {
          await database.write(async () => {
            for (const record of recordsToUpdate) {
              await record.update(r => {
                r.status = 'sync_failed';
              });
            }
          });
          console.log(
            `Push: Marked ${recordsToUpdate.length} records as sync_failed.`,
          );
        } catch (dbError) {
          console.error(
            'Push: Failed to mark records as sync_failed.',
            dbError,
          );
        }
      }
    }

    console.log('Push: Finished pushing local changes.');
  }

  async pullData() {
    const database = getDatabase();
    const lastSyncedAt = await AsyncStorage.getItem(LAST_SYNCED_AT_KEY);
    console.log(`Pull: Last synced at: ${lastSyncedAt}`);

    const serverTimeBeforePull = new Date().toISOString();

    try {
      // Fetch changes from the server since the last sync
      const syncResponse = await enhancedAPI.getEvents(2500, lastSyncedAt || undefined);
      const tasksResponse = await enhancedAPI.getTasks(lastSyncedAt || undefined);
      const goalsResponse = await enhancedAPI.getGoals(lastSyncedAt || undefined);
      // Fetch milestones and milestone steps as part of pull (resilient to errors)
      let milestonesResponse: any = [];
      let milestoneStepsResponse: any = [];
      try {
        milestonesResponse = await enhancedAPI.getMilestones(lastSyncedAt || undefined);
      } catch (msErr: any) {
        console.warn('Pull: Failed to fetch milestones, continuing without them.', msErr);
        milestonesResponse = { changed: [], deleted: [] };
      }
      try {
        milestoneStepsResponse = await enhancedAPI.getMilestoneSteps(lastSyncedAt || undefined);
      } catch (stepsErr: any) {
        console.warn('Pull: Failed to fetch milestone steps, continuing without them.', stepsErr);
        milestoneStepsResponse = { changed: [], deleted: [] };
      }

      const { changed: changedEvents, deleted: deletedEventIds } = syncResponse;
      
      // Handle tasks response - could be array (full sync) or object with changed/deleted (incremental sync)
      let changedTasks = [];
      let deletedTaskIds = [];
      if (Array.isArray(tasksResponse)) {
        // Full sync response
        changedTasks = tasksResponse;
      } else if (tasksResponse && typeof tasksResponse === 'object') {
        // Incremental sync response
        changedTasks = tasksResponse.changed || [];
        deletedTaskIds = tasksResponse.deleted || [];
      }
      
      // Handle goals response - could be array (full sync) or object with changed/deleted (incremental sync)
      let changedGoals = [];
      let deletedGoalIds = [];
      if (Array.isArray(goalsResponse)) {
        // Full sync response
        changedGoals = goalsResponse;
      } else if (goalsResponse && typeof goalsResponse === 'object') {
        // Incremental sync response
        changedGoals = goalsResponse.changed || [];
        deletedGoalIds = goalsResponse.deleted || [];
      }

      // Fallback: If incremental sync returned no goals, and local milestones are empty while local goals exist,
      // perform a one-time full goals fetch to hydrate milestones/steps
      try {
        if (lastSyncedAt && changedGoals.length === 0) {
          const goalsCount = (await database.get<Goal>('goals').query().fetch()).length;
          const milestonesCount = (await database.get<Milestone>('milestones').query().fetch()).length;
          if (goalsCount > 0 && milestonesCount === 0) {
            const fullGoals = await enhancedAPI.getGoals(undefined);
            if (Array.isArray(fullGoals)) {
              changedGoals = fullGoals;
            } else if (fullGoals && typeof fullGoals === 'object') {
              changedGoals = fullGoals.changed || [];
            }
            console.log('Pull: Applied fallback full goals fetch to hydrate milestones/steps.');
          }
        }
      } catch (fallbackErr) {
        console.warn('Pull: Fallback full goals fetch failed, continuing without it.', fallbackErr);
      }

      // Handle milestones response
      let changedMilestones = [];
      let deletedMilestoneIds = [];
      if (Array.isArray(milestonesResponse)) {
        changedMilestones = milestonesResponse;
      } else if (milestonesResponse && typeof milestonesResponse === 'object') {
        changedMilestones = milestonesResponse.changed || [];
        deletedMilestoneIds = milestonesResponse.deleted || [];
      }

      // Handle milestone steps response
      let changedMilestoneSteps = [];
      let deletedMilestoneStepIds = [];
      if (Array.isArray(milestoneStepsResponse)) {
        changedMilestoneSteps = milestoneStepsResponse;
      } else if (milestoneStepsResponse && typeof milestoneStepsResponse === 'object') {
        changedMilestoneSteps = milestoneStepsResponse.changed || [];
        deletedMilestoneStepIds = milestoneStepsResponse.deleted || [];
      }

      const allChanges = [
        ...changedEvents,
        ...changedTasks,
        ...changedGoals,
        ...changedMilestones,
        ...changedMilestoneSteps,
      ];
      const allDeletedIds = [
        ...(deletedEventIds || []),
        ...deletedTaskIds,
        ...deletedGoalIds,
        ...deletedMilestoneIds,
        ...deletedMilestoneStepIds,
      ];

      if (allChanges.length === 0 && allDeletedIds.length === 0) {
        console.log('Pull: No new data from server.');
        await AsyncStorage.setItem(LAST_SYNCED_AT_KEY, serverTimeBeforePull);
        return;
      }

      console.log(`Pull: Received ${allChanges.length} changed and ${allDeletedIds.length} deleted items from the server.`);

      await database.write(async () => {
        // Process deletions first
        if (allDeletedIds.length > 0) {
          // Process event deletions
          if (deletedEventIds && deletedEventIds.length > 0) {
            const eventCollection = database.get<CalendarEvent>('calendar_events');
            const recordsToDelete = await eventCollection.query(Q.where('id', Q.oneOf(deletedEventIds))).fetch();
            for (const record of recordsToDelete) {
              await record.destroyPermanently();
            }
            console.log(`Pull: Deleted ${recordsToDelete.length} events`);
          }
          
          // Process task deletions
          if (deletedTaskIds && deletedTaskIds.length > 0) {
            const taskCollection = database.get<Task>('tasks');
            const recordsToDelete = await taskCollection.query(Q.where('id', Q.oneOf(deletedTaskIds))).fetch();
            for (const record of recordsToDelete) {
              await record.destroyPermanently();
            }
            console.log(`Pull: Deleted ${recordsToDelete.length} tasks`);
          }
          
          // Process goal deletions
          if (deletedGoalIds && deletedGoalIds.length > 0) {
            const goalCollection = database.get<Goal>('goals');
            const recordsToDelete = await goalCollection.query(Q.where('id', Q.oneOf(deletedGoalIds))).fetch();
            for (const record of recordsToDelete) {
              await record.destroyPermanently();
            }
            console.log(`Pull: Deleted ${recordsToDelete.length} goals`);
          }

          // Process milestone deletions
          if (deletedMilestoneIds && deletedMilestoneIds.length > 0) {
            const milestoneCollection = database.get<Milestone>('milestones');
            const recordsToDelete = await milestoneCollection.query(Q.where('id', Q.oneOf(deletedMilestoneIds))).fetch();
            for (const record of recordsToDelete) {
              await record.destroyPermanently();
            }
            console.log(`Pull: Deleted ${recordsToDelete.length} milestones`);
          }

          // Process milestone step deletions
          if (deletedMilestoneStepIds && deletedMilestoneStepIds.length > 0) {
            const stepCollection = database.get<MilestoneStep>('milestone_steps');
            const recordsToDelete = await stepCollection.query(Q.where('id', Q.oneOf(deletedMilestoneStepIds))).fetch();
            for (const record of recordsToDelete) {
              await record.destroyPermanently();
            }
            console.log(`Pull: Deleted ${recordsToDelete.length} milestone steps`);
          }
        }

        // Process changed records
        for (const changeData of allChanges) {
          // Determine record type based on the data structure
          if (changeData.start?.dateTime || changeData.start_time) {
            // This is a calendar event
            await this.processEventChange(changeData, database);
          } else if (changeData.priority !== undefined || changeData.estimated_duration_minutes !== undefined) {
            // This is a task
            await this.processTaskChange(changeData, database);
          } else if (changeData.target_completion_date !== undefined || changeData.progress_percentage !== undefined) {
            // This is a goal
            await this.processGoalChange(changeData, database);
          } else if (changeData.goal_id !== undefined && changeData.title !== undefined) {
            // This is a milestone
            await this.processMilestoneChange(changeData, database);
          } else if (changeData.milestone_id !== undefined && changeData.text !== undefined) {
            // This is a milestone step
            await this.processMilestoneStepChange(changeData, database);
          } else {
            console.warn(`Pull: Unknown record type for change data:`, changeData);
          }
        }
      });

      // After a successful pull, save the server's timestamp
      await AsyncStorage.setItem(LAST_SYNCED_AT_KEY, serverTimeBeforePull);
      console.log(`Pull: Successfully processed changes. New sync time: ${serverTimeBeforePull}`);

    } catch (error: any) {
      let userMessage = 'An unknown error occurred while syncing.';
      let shouldRetry = false;

      if (error?.response?.status) {
        const status = error.response.status;
        if (status === 401 || status === 403) {
          userMessage = 'Authentication failed. Please log in again to sync your data.';
          shouldRetry = false;
        } else if (status >= 500) {
          userMessage = 'There was a problem with the server. Please try again later.';
          shouldRetry = true;
        } else { // Other 4xx errors e.g. data/validation
          userMessage = 'A data validation error occurred. Please check your inputs.';
          shouldRetry = false;
        }
      } else if (error.message && (error.message.toLowerCase().includes('network') || error.message.toLowerCase().includes('timeout'))) {
        userMessage = 'A network error occurred. Please check your connection and try again.';
        shouldRetry = true;
      } else if (error instanceof Error) {
        userMessage = `An unexpected error occurred: ${error.message}`;
      }

      console.error('Pull: Failed to fetch or process changes from server.', {
        errorMessage: error.message,
        statusCode: error?.response?.status,
        responseData: error?.response?.data,
        shouldRetry,
        originalError: error,
      });

      notificationService.showInAppNotification('Data Pull Failed', userMessage);

      // Re-throw the original error so the main sync logic can handle it
      throw error;
    }
  }

  async sync(silent = false) {
    const user = authService.getCurrentUser();
    if (!user) {
      console.log('Sync skipped: No authenticated user.');
      return;
    }

    if (this.isSyncing) {
      console.log('Sync already in progress. Skipping.');
      if (!silent) {
        notificationService.showInAppNotification('Sync in Progress', 'A sync is already running.');
      }
      return;
    }

    this.isSyncing = true;
    try {
      if (!silent) {
        notificationService.showInAppNotification('Sync Started', 'Syncing your data...');
      }
      await this.pushData();
      await this.pullData();
      if (!silent) {
        notificationService.showInAppNotification('Sync Successful', 'Your data is up to date.');
      }
    } catch (error) {
      console.error('Sync failed:', error);
      const errorMessage = error instanceof Error ? error.message : 'An unknown error occurred.';
      if (!silent) {
        notificationService.showInAppNotification('Sync Failed', `Could not sync data: ${errorMessage}`);
      }
    } finally {
      this.isSyncing = false;
    }
  }

  async silentSync() {
    return this.sync(true);
  }

  // Convenience alias expected by some screens
  async fullSync() {
    await this.pushData();
    await this.pullData();
  }

  // Debug helper to inspect current DB state safely
  async debugDatabaseContents() {
    const database = getDatabase();
    const events = await database.get<CalendarEvent>('calendar_events').query().fetch();
    const tasks = await database.get<Task>('tasks').query().fetch();
    const goals = await database.get<Goal>('goals').query().fetch();
    const milestones = await database.get<Milestone>('milestones').query().fetch();
    const steps = await database.get<MilestoneStep>('milestone_steps').query().fetch();

    console.log('Debug DB Contents:', {
      events: events.length,
      tasks: tasks.length,
      goals: goals.length,
      milestones: milestones.length,
      steps: steps.length,
    });

    return { events, tasks, goals, milestones, steps };
  }

  // Force a full pull from the server by clearing the incremental cursor
  async forceFullPull() {
    await AsyncStorage.removeItem(LAST_SYNCED_AT_KEY);
    await this.pullData();
  }

  private async processEventChange(eventData: any, database: Database) {
    const eventCollection = database.get<CalendarEvent>('calendar_events');
    const existingEvents = await eventCollection.query(Q.where('id', eventData.id)).fetch();
    const localEvent = existingEvents.length > 0 ? existingEvents[0] : null;

    if (localEvent) {
      // Update existing event
      const parsedStartTime = eventData.start?.dateTime ? safeParseDate(eventData.start.dateTime) : undefined;
      const parsedEndTime = eventData.end?.dateTime ? safeParseDate(eventData.end.dateTime) : undefined;
      
      if (eventData.start?.dateTime && !parsedStartTime) {
        console.error(`Pull: Failed to parse start time for event ${eventData.id}:`, eventData.start.dateTime);
      }
      if (eventData.end?.dateTime && !parsedEndTime) {
        console.error(`Pull: Failed to parse end time for event ${eventData.id}:`, eventData.end.dateTime);
      }
      
      await localEvent.update((record: CalendarEvent) => {
        record.title = eventData.summary;
        record.description = eventData.description;
        if (parsedStartTime) {
          record.startTime = parsedStartTime;
        }
        if (parsedEndTime) {
          record.endTime = parsedEndTime;
        }
        record.location = eventData.location;
        record.isAllDay = eventData.is_all_day;
        record.status = 'synced';
      });
    } else {
      // Create new event
      if (eventData.start?.dateTime && eventData.end?.dateTime) {
        const parsedStartTime = safeParseDate(eventData.start.dateTime);
        const parsedEndTime = safeParseDate(eventData.end.dateTime);
        
        if (!parsedStartTime || !parsedEndTime) {
          console.error(`Pull: Failed to parse dates for new event ${eventData.id}:`, {
            start_time: eventData.start.dateTime,
            end_time: eventData.end.dateTime,
            parsedStartTime: parsedStartTime?.toISOString() || 'FAILED',
            parsedEndTime: parsedEndTime?.toISOString() || 'FAILED'
          });
          console.warn(`Pull: Skipping event creation for ID ${eventData.id} due to invalid date parsing.`);
          return;
        }
        
        await eventCollection.create((record: CalendarEvent) => {
          record._raw.id = eventData.id;
          record.title = eventData.summary;
          record.description = eventData.description;
          record.startTime = parsedStartTime;
          record.endTime = parsedEndTime;
          record.location = eventData.location;
          record.isAllDay = eventData.is_all_day;
          record.userId = eventData.user_id;
          record.status = 'synced';
        });
      } else {
        console.warn(`Pull: Skipping event creation for ID ${eventData.id} due to missing start or end dateTime.`);
      }
    }
  }

  /**
   * Extracts lifecycle and sync status information from a status string.
   * Handles direct lifecycle status, combined formats (pending_update:completed), and pure sync statuses.
   * @param status - The status string to extract information from
   * @returns An object containing lifecycleStatus and syncStatus values
   */
  private extractLifecycleStatus(status: string | undefined | null): {
    lifecycleStatus: 'not_started' | 'in_progress' | 'completed';
    syncStatus: string | undefined;
  } {
    const lifecycleStatuses: Array<'not_started' | 'in_progress' | 'completed'> = ['not_started', 'in_progress', 'completed'];
    const syncStatuses = ['pending_create', 'pending_update', 'pending_delete', 'synced'];
    const defaultLifecycleStatus: 'not_started' | 'in_progress' | 'completed' = 'not_started';
    const isLifecycleStatus = (value: string): value is 'not_started' | 'in_progress' | 'completed' =>
      (lifecycleStatuses as string[]).includes(value);

    if (!status) {
      return {
        lifecycleStatus: defaultLifecycleStatus,
        syncStatus: undefined,
      };
    }

    const statusStr = String(status);

    if (statusStr.includes(':')) {
      const [syncPart, lifecyclePart] = statusStr.split(':');
      if (lifecyclePart && isLifecycleStatus(lifecyclePart) && syncStatuses.includes(syncPart)) {
        return {
          lifecycleStatus: lifecyclePart,
          syncStatus: syncPart,
        };
      }
    }

    if (isLifecycleStatus(statusStr)) {
      return {
        lifecycleStatus: statusStr,
        syncStatus: 'pending_update',
      };
    }

    if (syncStatuses.includes(statusStr)) {
      return {
        lifecycleStatus: defaultLifecycleStatus,
        syncStatus: statusStr,
      };
    }

    return {
      lifecycleStatus: defaultLifecycleStatus,
      syncStatus: statusStr,
    };
  }

  private async processTaskChange(taskData: TaskPayload, database: Database) {
    const taskCollection = database.get<Task>('tasks');
    const existingTasks = await taskCollection.query(Q.where('id', taskData.id)).fetch();
    const localTask = existingTasks.length > 0 ? existingTasks[0] : null;

    // Parse due_date once and validate
    const parsedDueDate = taskData.due_date ? safeParseDate(taskData.due_date) : undefined;
    if (taskData.due_date && !parsedDueDate) {
      console.error(`Pull: Failed to parse due_date for task ${taskData.id}:`, taskData.due_date);
    }

    // Determine lifecycle status from server response (preserve if not provided)
    // Valid lifecycle statuses: 'not_started', 'in_progress', 'completed'
    // Sync statuses: 'pending_create', 'pending_update', 'pending_delete', 'synced'
    // Extract lifecycle status from combined format if needed
    const serverStatusInfo = taskData.status 
      ? this.extractLifecycleStatus(taskData.status)
      : null;
    const serverLifecycleStatus = serverStatusInfo?.lifecycleStatus ?? null;
    const localStatusInfo = localTask 
      ? this.extractLifecycleStatus(localTask.status as string)
      : null;
    const localLifecycleStatus = localStatusInfo?.lifecycleStatus ?? null;
    
    // Prefer server status if provided, otherwise preserve local lifecycle status, default to 'not_started'
    const lifecycleStatus = serverLifecycleStatus !== null
      ? serverLifecycleStatus
      : (localLifecycleStatus !== null ? localLifecycleStatus : 'not_started');

    if (localTask) {
      // Update existing task
      await localTask.update((record: Task) => {
        record.title = taskData.title;
        record.description = taskData.description;
        record.priority = taskData.priority;
        record.estimatedDurationMinutes = taskData.estimated_duration_minutes;
        // Only set dueDate if parsing succeeded, otherwise preserve existing value
        if (parsedDueDate) {
          record.dueDate = parsedDueDate;
        } else if (taskData.due_date) {
          // Log error but don't overwrite existing dueDate
          console.error(`Pull: Skipping due_date update for task ${taskData.id} due to parsing failure, preserving existing value`);
        }
        record.goalId = taskData.goal_id;
        record.isTodayFocus = taskData.is_today_focus;
        // Preserve lifecycle status from server, not sync status
        record.status = lifecycleStatus;
      });
    } else {
      // Create new task
      await taskCollection.create((record: Task) => {
        record._raw.id = taskData.id;
        record.title = taskData.title;
        record.description = taskData.description;
        record.priority = taskData.priority;
        record.estimatedDurationMinutes = taskData.estimated_duration_minutes;
        // Only set dueDate if parsing succeeded, skip if parsing failed
        if (parsedDueDate) {
          record.dueDate = parsedDueDate;
        } else if (taskData.due_date) {
          // Log error but don't set dueDate for new task
          console.error(`Pull: Skipping due_date for new task ${taskData.id} due to parsing failure`);
        }
        record.goalId = taskData.goal_id;
        record.isTodayFocus = taskData.is_today_focus;
        record.userId = taskData.user_id || '';
        // Use lifecycle status from server, not sync status
        record.status = lifecycleStatus;
      });
    }
  }

  private async processGoalChange(goalData: any, database: Database) {
    const parsedTargetDate = goalData.target_completion_date ? safeParseDate(goalData.target_completion_date) : undefined;
    if (goalData.target_completion_date && !parsedTargetDate) {
      console.error(`Pull: Failed to parse target_completion_date for goal ${goalData.id}:`, goalData.target_completion_date);
    }

    const goalCollection = database.get<Goal>('goals');
    const existingGoals = await goalCollection.query(Q.where('id', goalData.id)).fetch();
    const localGoal = existingGoals.length > 0 ? existingGoals[0] : null;

    if (localGoal) {
      // Update existing goal
      await localGoal.update((record: Goal) => {
        record.title = goalData.title;
        record.description = goalData.description;
        record.targetCompletionDate = parsedTargetDate;
        record.progressPercentage = goalData.progress_percentage;
        record.category = goalData.category;
        record.isActive = goalData.is_active;
        record.status = 'synced';
      });
    } else {
      // Create new goal
      await goalCollection.create((record: Goal) => {
        record._raw.id = goalData.id;
        record.title = goalData.title;
        record.description = goalData.description;
        record.targetCompletionDate = parsedTargetDate;
        record.progressPercentage = goalData.progress_percentage;
        record.category = goalData.category;
        record.isActive = goalData.is_active;
        record.userId = goalData.user_id;
        record.status = 'synced';
      });
    }

    // Also upsert nested milestones and steps if present on the goal payload
    if (Array.isArray(goalData.milestones)) {
      for (const ms of goalData.milestones) {
        // Ensure the milestone has the required identifiers
        if (!ms || !ms.id) {continue;}

        const milestonePayload = {
          id: ms.id,
          goal_id: goalData.id,
          title: ms.title,
          description: ms.description,
          completed: !!ms.completed,
          order: ms.order ?? 0,
          created_at: ms.created_at,
          updated_at: ms.updated_at,
        };
        await this.processMilestoneChange(milestonePayload, database);

        if (Array.isArray(ms.steps)) {
          for (const st of ms.steps) {
            if (!st || !st.id) {continue;}
            const stepPayload = {
              id: st.id,
              milestone_id: ms.id,
              text: st.text,
              completed: !!st.completed,
              order: st.order ?? 0,
              created_at: st.created_at,
              updated_at: st.updated_at,
            };
            await this.processMilestoneStepChange(stepPayload, database);
          }
        }
      }
    }
  }

  private async processMilestoneChange(milestoneData: any, database: Database) {
    const milestoneCollection = database.get<Milestone>('milestones');
    const existing = await milestoneCollection.query(Q.where('id', milestoneData.id)).fetch();
    const local = existing.length > 0 ? existing[0] : null;

    const parsedCreatedAt = milestoneData.created_at ? safeParseDate(milestoneData.created_at) : undefined;
    const parsedUpdatedAt = milestoneData.updated_at ? safeParseDate(milestoneData.updated_at) : undefined;

    if (milestoneData.created_at && !parsedCreatedAt) {
      console.error(`Pull: Failed to parse created_at for milestone ${milestoneData.id}:`, milestoneData.created_at);
    }
    if (milestoneData.updated_at && !parsedUpdatedAt) {
      console.error(`Pull: Failed to parse updated_at for milestone ${milestoneData.id}:`, milestoneData.updated_at);
    }

    if (local) {
      await local.update((record: Milestone) => {
        record.title = milestoneData.title;
        record.description = milestoneData.description;
        record.goalId = milestoneData.goal_id;
        record.completed = !!milestoneData.completed;
        record.order = milestoneData.order ?? 0;
        record.status = 'synced';
        if (parsedUpdatedAt) {
          record.updatedAt = parsedUpdatedAt;
        }
      });
    } else {
      await milestoneCollection.create((record: Milestone) => {
        record._raw.id = milestoneData.id;
        record.title = milestoneData.title;
        record.description = milestoneData.description;
        record.goalId = milestoneData.goal_id;
        record.completed = !!milestoneData.completed;
        record.order = milestoneData.order ?? 0;
        record.status = 'synced';
        record.createdAt = parsedCreatedAt || new Date();
        record.updatedAt = parsedUpdatedAt || new Date();
      });
    }
  }

  private async processMilestoneStepChange(stepData: any, database: Database) {
    const stepCollection = database.get<MilestoneStep>('milestone_steps');
    const existing = await stepCollection.query(Q.where('id', stepData.id)).fetch();
    const local = existing.length > 0 ? existing[0] : null;

    const parsedCreatedAt = stepData.created_at ? safeParseDate(stepData.created_at) : undefined;
    const parsedUpdatedAt = stepData.updated_at ? safeParseDate(stepData.updated_at) : undefined;

    if (stepData.created_at && !parsedCreatedAt) {
      this.logger.error(
        `Pull: Failed to parse created_at for step ${stepData.id}:`,
        stepData.created_at
      );
    }
    if (stepData.updated_at && !parsedUpdatedAt) {
      this.logger.error(
        `Pull: Failed to parse updated_at for step ${stepData.id}:`,
        stepData.updated_at
      );
    }

    if (local) {
      await local.update((record: MilestoneStep) => {
        record.text = stepData.text;
        record.milestoneId = stepData.milestone_id;
        record.completed = !!stepData.completed;
        record.order = stepData.order ?? 0;
        record.status = 'synced';
        if (parsedUpdatedAt) {
          record.updatedAt = parsedUpdatedAt;
        }
      });
    } else {
      await stepCollection.create((record: MilestoneStep) => {
        record._raw.id = stepData.id;
        record.text = stepData.text;
        record.milestoneId = stepData.milestone_id;
        record.completed = !!stepData.completed;
        record.order = stepData.order ?? 0;
        record.status = 'synced';
        record.createdAt = parsedCreatedAt || new Date();
        record.updatedAt = parsedUpdatedAt || new Date();
      });
    }
  }
}

export const syncService = new SyncService();

