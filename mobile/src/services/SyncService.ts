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

const LAST_SYNCED_AT_KEY = 'last_synced_at';

class SyncService {
  private isSyncing = false;

  async pushData() {
    const database = getDatabase();

    // Find records that need pushing
    const dirtyEvents = await database.get<CalendarEvent>('calendar_events').query(
      Q.where('status', Q.notEq('synced'))
    ).fetch();

    const dirtyTasks = await database.get<Task>('tasks').query(
      Q.where('status', Q.notEq('synced'))
    ).fetch();

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
          recordData = {
            title: record.title,
            description: record.description,
            priority: record.priority,
            estimated_duration_minutes: record.estimatedDurationMinutes,
            due_date: record.dueDate?.toISOString(),
            goal_id: record.goalId,
            is_today_focus: record.isTodayFocus,
            client_updated_at: record.updatedAt?.toISOString(),
          };

          switch (record.status) {
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
          // Skip milestone sync for now - API endpoints not implemented yet
          console.log(`Push: Skipping milestone ${record.id} - API not implemented yet`);
          continue;
        } else if (record instanceof MilestoneStep) {
          // Skip milestone step sync for now - API endpoints not implemented yet
          console.log(`Push: Skipping milestone step ${record.id} - API not implemented yet`);
          continue;
        } else {
          console.warn(`Push: Unknown record type for record ${(record as any).id}`);
          continue;
        }

        // Update local record based on server action
        await database.write(async () => {
          if (record.status === 'pending_delete') {
            await record.destroyPermanently();
          } else {
            await record.update(r => {
              r.status = 'synced';
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
      const tasksResponse = await enhancedAPI.getTasks();
      const goalsResponse = await enhancedAPI.getGoals();

      const { changed: changedEvents, deleted: deletedEventIds } = syncResponse;
      const changedTasks = tasksResponse || [];
      const changedGoals = goalsResponse || [];

      const allChanges = [...changedEvents, ...changedTasks, ...changedGoals];
      const allDeletedIds = [...(deletedEventIds || [])];

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

  private async processTaskChange(taskData: any, database: Database) {
    const taskCollection = database.get<Task>('tasks');
    const existingTasks = await taskCollection.query(Q.where('id', taskData.id)).fetch();
    const localTask = existingTasks.length > 0 ? existingTasks[0] : null;

    if (localTask) {
      // Update existing task
      await localTask.update((record: Task) => {
        record.title = taskData.title;
        record.description = taskData.description;
        record.priority = taskData.priority;
        record.estimatedDurationMinutes = taskData.estimated_duration_minutes;
        record.dueDate = taskData.due_date ? safeParseDate(taskData.due_date) : undefined;
        record.goalId = taskData.goal_id;
        record.isTodayFocus = taskData.is_today_focus;
        record.status = 'synced';
      });
    } else {
      // Create new task
      await taskCollection.create((record: Task) => {
        record._raw.id = taskData.id;
        record.title = taskData.title;
        record.description = taskData.description;
        record.priority = taskData.priority;
        record.estimatedDurationMinutes = taskData.estimated_duration_minutes;
        record.dueDate = taskData.due_date ? safeParseDate(taskData.due_date) : undefined;
        record.goalId = taskData.goal_id;
        record.isTodayFocus = taskData.is_today_focus;
        record.userId = taskData.user_id;
        record.status = 'synced';
      });
    }
  }

  private async processGoalChange(goalData: any, database: Database) {
    const goalCollection = database.get<Goal>('goals');
    const existingGoals = await goalCollection.query(Q.where('id', goalData.id)).fetch();
    const localGoal = existingGoals.length > 0 ? existingGoals[0] : null;

    if (localGoal) {
      // Update existing goal
      await localGoal.update((record: Goal) => {
        record.title = goalData.title;
        record.description = goalData.description;
        record.targetCompletionDate = goalData.target_completion_date ? safeParseDate(goalData.target_completion_date) : undefined;
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
        record.targetCompletionDate = goalData.target_completion_date ? safeParseDate(goalData.target_completion_date) : undefined;
        record.progressPercentage = goalData.progress_percentage;
        record.category = goalData.category;
        record.isActive = goalData.is_active;
        record.userId = goalData.user_id;
        record.status = 'synced';
      });
    }
  }
}

export const syncService = new SyncService();
