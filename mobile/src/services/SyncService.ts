import {getDatabase} from '../db';
import {Q} from '@nozbe/watermelondb';
import {enhancedAPI} from './enhancedApi';
import AsyncStorage from '@react-native-async-storage/async-storage';
import CalendarEvent from '../db/models/CalendarEvent';
import Task from '../db/models/Task';
import Goal from '../db/models/Goal';
import { notificationService } from './notificationService';
import { authService } from './auth';

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
        let serverResponse;
        const recordData = {
          summary: record.title, // Map title to summary for the API
          description: record.description,
          startTime: record.startTime.toISOString(),
          endTime: record.endTime.toISOString(),
          location: record.location,
          isAllDay: record.isAllDay,
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
              // Optionally update `updated_at` from serverResponse if available
            });
          }
        });

      } catch (error: any) {
        console.error(`Push: Failed to sync record ${record.id}. Status: ${record.status}`, JSON.stringify(error, null, 2));
        pushErrors.push({ recordId: record.id, error });
        
        // Differentiate error types for better handling
        if (error?.response?.status === 401 || error?.response?.status === 403) {
          // Auth error - should probably stop sync entirely
          throw new Error('Authentication failed. Please log in again.');
        }
        // In a real app, you would implement more robust error handling,
        // like a failed queue or marking the record as sync_failed.
        // For now, we'll just log the error and continue.
      }    }

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
      const changedEvents = await enhancedAPI.getEvents(2500, lastSyncedAt || undefined);
      // TODO: Add similar fetches for Tasks and Goals

      const allChanges = [...changedEvents]; // Combine all fetched changes

      if (allChanges.length === 0) {
        console.log('Pull: No new data from server.');
        await AsyncStorage.setItem(LAST_SYNCED_AT_KEY, serverTimeBeforePull);
        return;
      }

      console.log(`Pull: Received ${allChanges.length} changes from the server.`);

      // TODO: Handle deleted records. The PRD says the API should return a list of deleted IDs.
      // We will need to implement that on the backend and handle it here.

      await database.write(async () => {
        for (const eventData of allChanges) {
          const eventCollection = database.get<CalendarEvent>('calendar_events');
          const existingEvents = await eventCollection.query(Q.where('id', eventData.id)).fetch();
          const localEvent = existingEvents.length > 0 ? existingEvents[0] : null;

          if (localEvent) {
            // If it exists, update it
            await localEvent.update(record => {
              record.title = eventData.summary;
              record.description = eventData.description;
              if (eventData.start?.dateTime) {
                record.startTime = new Date(eventData.start.dateTime);
              }
              if (eventData.end?.dateTime) {
                record.endTime = new Date(eventData.end.dateTime);
              }
              record.location = eventData.location;
              record.isAllDay = eventData.is_all_day;
              record.status = 'synced';
            });
          } else {
            // If it doesn't exist, create it
            if (eventData.start?.dateTime && eventData.end?.dateTime) {
              await eventCollection.create(record => {
                record._raw.id = eventData.id; // Correct way to set ID on creation
                record.title = eventData.summary;
                record.description = eventData.description;
                record.startTime = new Date(eventData.start.dateTime);
                record.endTime = new Date(eventData.end.dateTime);
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
      console.log(`Pull: Successfully processed ${allChanges.length} changes. New sync time: ${serverTimeBeforePull}`);

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
