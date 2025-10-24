import {getDatabase} from '../db';
import {Q} from '@nozbe/watermelondb';
import {enhancedAPI} from './enhancedApi';
import AsyncStorage from '@react-native-async-storage/async-storage';
import CalendarEvent from '../db/models/CalendarEvent';
import Task from '../db/models/Task';
import Goal from '../db/models/Goal';

const LAST_SYNCED_AT_KEY = 'last_synced_at';

class SyncService {
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

      } catch (error) {
        console.error(`Push: Failed to sync record ${record.id}. Status: ${record.status}`, JSON.stringify(error, null, 2));
        // In a real app, you would implement more robust error handling,
        // like a failed queue or marking the record as sync_failed.
        // For now, we'll just log the error and continue.
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
          
          try {
            // Check if the record already exists locally
            const localEvent = await eventCollection.find(eventData.id);

            // If it exists, update it
            await localEvent.update(record => {
              record.title = eventData.summary;
              record.description = eventData.description;
              record.startTime = new Date(eventData.start.dateTime);
              record.endTime = new Date(eventData.end.dateTime);
              record.location = eventData.location;
              record.isAllDay = eventData.is_all_day;
              // We keep status as 'synced' because this change comes from the server
            });
          } catch (error) {
            // If it doesn't exist, create it
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
          }
        }
      });

      // After a successful pull, save the server's timestamp
      await AsyncStorage.setItem(LAST_SYNCED_AT_KEY, serverTimeBeforePull);
      console.log(`Pull: Successfully processed ${allChanges.length} changes. New sync time: ${serverTimeBeforePull}`);

    } catch (error) {
      console.error('Pull: Failed to fetch or process changes from server.', error);
      throw error; // Re-throw to be caught by the main sync function
    }
  }

  async sync() {
    try {
      console.log('Sync started...');
      await this.pushData();
      await this.pullData();
      console.log('Sync completed successfully.');
    } catch (error) {
      console.error('Sync failed:', error);
      // In a real app, you might want to show a user-facing error
    }
  }
}

export const syncService = new SyncService();
