import {getDatabase} from '../db';
import {Q} from '@nozbe/watermelondb';
import {enhancedAPI} from './enhancedApi';
import AsyncStorage from '@react-native-async-storage/async-storage';
import CalendarEvent from '../db/models/CalendarEvent';
import Task from '../db/models/Task';
import Goal from '../db/models/Goal';
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

    // TODO: Add similar queries for Tasks and Goals

    const allDirtyRecords = [...dirtyEvents]; // Add tasks and goals here later

    if (allDirtyRecords.length === 0) {
      console.log('Push: No local changes to push.');
      return;
    }

    console.log(`Push: Found ${allDirtyRecords.length} local changes to push.`);

    const pushErrors: { recordId: string; error: any }[] = [];

    for (const record of allDirtyRecords) {
      try {
        let serverResponse: any;
        const recordData = {
          summary: record.title, // Map title to summary for the API
          description: record.description,
          startTime: record.startTime.toISOString(),
          endTime: record.endTime.toISOString(),
          location: record.location,
          isAllDay: record.isAllDay,
          client_updated_at: record.updatedAt?.toISOString(), // For conflict resolution
          // TODO: map other fields like taskId, goalId
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
            // No server response needed, proceed to delete locally
            break;
          default:
            console.warn(`Push: Unknown status ${record.status} for record ${record.id}`);
            continue; // Skip this record
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
            const parsedStartTime = safeParseDate(serverRecord.start_time);
            const parsedEndTime = safeParseDate(serverRecord.end_time);
            const parsedUpdatedAt = safeParseDate(serverRecord.updated_at);
            
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
                r.title = serverRecord.title;
                r.description = serverRecord.description;
                r.startTime = parsedStartTime;
                r.endTime = parsedEndTime;
                r.location = serverRecord.location;
                r.isAllDay = serverRecord.is_all_day;
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

      const { changed: changedEvents, deleted: deletedEventIds } = syncResponse;
      // TODO: Add similar fetches for Tasks and Goals

      const allChanges = [...changedEvents]; // Combine all fetched changes

      if (allChanges.length === 0 && (!deletedEventIds || deletedEventIds.length === 0)) {
        console.log('Pull: No new data from server.');
        await AsyncStorage.setItem(LAST_SYNCED_AT_KEY, serverTimeBeforePull);
        return;
      }

      console.log(`Pull: Received ${allChanges.length} changed and ${deletedEventIds?.length || 0} deleted items from the server.`);

      await database.write(async () => {
        // Process deletions first
        if (deletedEventIds && deletedEventIds.length > 0) {
          const eventCollection = database.get<CalendarEvent>('calendar_events');
          const recordsToDelete = await eventCollection.query(Q.where('id', Q.oneOf(deletedEventIds))).fetch();
          for (const record of recordsToDelete) {
            await record.destroyPermanently();
          }
        }

        // Process changed records
        for (const eventData of allChanges) {
          const eventCollection = database.get<CalendarEvent>('calendar_events');
          const existingEvents = await eventCollection.query(Q.where('id', eventData.id)).fetch();
          const localEvent = existingEvents.length > 0 ? existingEvents[0] : null;

          if (localEvent) {
            // If it exists, update it
            // Safely parse dates from server data
            const parsedStartTime = eventData.start?.dateTime ? safeParseDate(eventData.start.dateTime) : null;
            const parsedEndTime = eventData.end?.dateTime ? safeParseDate(eventData.end.dateTime) : null;
            
            // Check if any critical dates failed to parse
            if (eventData.start?.dateTime && !parsedStartTime) {
              console.error(`Pull: Failed to parse start time for event ${eventData.id}:`, eventData.start.dateTime);
            }
            if (eventData.end?.dateTime && !parsedEndTime) {
              console.error(`Pull: Failed to parse end time for event ${eventData.id}:`, eventData.end.dateTime);
            }
            
            await localEvent.update(record => {
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
            // If it doesn't exist, create it
            if (eventData.start?.dateTime && eventData.end?.dateTime) {
              // Safely parse dates from server data
              const parsedStartTime = safeParseDate(eventData.start.dateTime);
              const parsedEndTime = safeParseDate(eventData.end.dateTime);
              
              // Check if any critical dates failed to parse
              if (!parsedStartTime || !parsedEndTime) {
                console.error(`Pull: Failed to parse dates for new event ${eventData.id}:`, {
                  start_time: eventData.start.dateTime,
                  end_time: eventData.end.dateTime,
                  parsedStartTime: parsedStartTime?.toISOString() || 'FAILED',
                  parsedEndTime: parsedEndTime?.toISOString() || 'FAILED'
                });
                console.warn(`Pull: Skipping event creation for ID ${eventData.id} due to invalid date parsing.`);
                continue;
              }
              
              await eventCollection.create(record => {
                record._raw.id = eventData.id; // Correct way to set ID on creation
                record.title = eventData.summary;
                record.description = eventData.description;
                record.startTime = parsedStartTime;
                record.endTime = parsedEndTime;
                record.location = eventData.location;
                record.isAllDay = eventData.is_all_day;
                record.userId = eventData.user_id; // Assuming user_id is in the response
                record.status = 'synced';
              });
            } else {
              console.warn(`Pull: Skipping event creation for ID ${eventData.id} due to missing start or end dateTime.`);
            }
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

  async sync() {
    const user = authService.getCurrentUser();
    if (!user) {
      console.log('Sync skipped: No authenticated user.');
      return;
    }

    if (this.isSyncing) {
      console.log('Sync already in progress. Skipping.');
      notificationService.showInAppNotification('Sync in Progress', 'A sync is already running.');
      return;
    }

    this.isSyncing = true;
    try {
      notificationService.showInAppNotification('Sync Started', 'Syncing your data...');
      await this.pushData();
      await this.pullData();
      notificationService.showInAppNotification('Sync Successful', 'Your data is up to date.');
    } catch (error) {
      console.error('Sync failed:', error);
      const errorMessage = error instanceof Error ? error.message : 'An unknown error occurred.';
      notificationService.showInAppNotification('Sync Failed', `Could not sync data: ${errorMessage}`);
    } finally {
      this.isSyncing = false;
    }
  }
}

export const syncService = new SyncService();
