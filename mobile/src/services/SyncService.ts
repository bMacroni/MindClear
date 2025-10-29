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
import { ErrorCategory } from './errorHandling';

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
          recordData = {
            title: record.title,
            description: record.description,
            completed: record.completed,
            order: record.order,
            // Note: client_updated_at is reserved for future conflict resolution
            // Backend currently sets updated_at automatically
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

  async pullData(forceFullSync = false) {
    const database = getDatabase();
    const lastSyncedAt = await AsyncStorage.getItem(LAST_SYNCED_AT_KEY);
    
    // Check if this is the first sync or if we should force a full sync
    const isFirstSync = !lastSyncedAt;
    let shouldDoFullSync = forceFullSync || isFirstSync;
    
    // If not forcing full sync, check if we have goals but no milestones - suggests incomplete sync
    if (!shouldDoFullSync && lastSyncedAt) {
      try {
        const localGoals = await database.get<Goal>('goals').query().fetch();
        const localMilestones = await database.get<Milestone>('milestones').query().fetch();
        
        // If we have goals but no milestones, it's likely an incomplete sync
        if (localGoals.length > 0 && localMilestones.length === 0) {
          if (__DEV__) {
            console.log('Pull: Detected goals without milestones - performing full sync to get complete data');
          }
          shouldDoFullSync = true;
        }
      } catch (error) {
        // If check fails, continue with delta sync
        if (__DEV__) {
          console.warn('Pull: Could not check for incomplete sync, proceeding with delta sync:', error);
        }
      }
    }
    
    const syncSince = shouldDoFullSync ? undefined : lastSyncedAt || undefined;
    console.log(`Pull: ${shouldDoFullSync ? 'Full sync' : 'Delta sync'}${lastSyncedAt ? ` (last synced: ${lastSyncedAt})` : ' (first sync)'}`);

    const serverTimeBeforePull = new Date().toISOString();

    try {
      // Fetch changes from the server since the last sync (or all if full sync)
      const syncResponse = await enhancedAPI.getEvents(2500, syncSince);
      const tasksResponse = await enhancedAPI.getTasks(syncSince);
      
      // Fetch goals with error handling - if API returns validation error, log but continue
      let goalsResponse: any = null;
      try {
        goalsResponse = await enhancedAPI.getGoals(syncSince);
      } catch (goalsError: any) {
        // Check if it's a validation error that should be handled gracefully
        const isGoalsValidationError = 
          (goalsError && typeof goalsError === 'object' && 'isUserFriendlyError' in goalsError &&
           (goalsError as any).category === ErrorCategory.GOALS && 
           (goalsError as any).severity === 'LOW') ||
          goalsError?.response?.status === 400 ||
          (goalsError instanceof Error && (
            goalsError.message.includes('missing required field') ||
            goalsError.message.includes('Invalid') ||
            goalsError.message.includes('validation')
          ));
        
        if (isGoalsValidationError) {
          // Validation error - log but continue with empty goals array
          if (__DEV__) {
            const errorMsg = goalsError?.message || (goalsError && typeof goalsError === 'object' && 'isUserFriendlyError' in goalsError 
              ? (goalsError as any).message : String(goalsError));
            console.warn('Pull: Goals API returned validation error, but continuing sync with empty goals array:', errorMsg);
          }
          goalsResponse = null; // Use null to trigger empty array handling below
        } else {
          // Re-throw other errors (network, auth, etc.)
          throw goalsError;
        }
      }
      
      // Note: Milestones and steps come nested within goals, not from separate endpoints
      // The backend returns goals with nested milestones and steps via Supabase joins
      // We'll extract them when processing goals below

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
      if (goalsResponse === null || goalsResponse === undefined) {
        // API error or no response - use empty arrays
        if (__DEV__) {
          console.warn('Pull: Goals response is null/undefined - no goals to process');
        }
        changedGoals = [];
        deletedGoalIds = [];
      } else if (Array.isArray(goalsResponse)) {
        // Full sync response - filter out null/undefined values
        changedGoals = goalsResponse.filter((goal: any) => goal != null && typeof goal === 'object');
        if (__DEV__) {
          console.log(`Pull: Full sync - received ${goalsResponse.length} goals, filtered to ${changedGoals.length}`);
        }
      } else if (goalsResponse && typeof goalsResponse === 'object') {
        // Incremental sync response - filter out null/undefined values
        const originalChanged = goalsResponse.changed || [];
        changedGoals = originalChanged.filter((goal: any) => goal != null && typeof goal === 'object');
        deletedGoalIds = goalsResponse.deleted || [];
        if (__DEV__) {
          console.log(`Pull: Incremental sync - received ${originalChanged.length} changed goals, filtered to ${changedGoals.length}, ${deletedGoalIds.length} deleted`);
          if (originalChanged.length === 0 && lastSyncedAt) {
            console.warn(`Pull: No goals changed since ${lastSyncedAt} - this might mean goals with milestones aren't being synced if the goal itself hasn't been updated`);
          }
        }
      }
      
      // Log filtered goals for debugging
      if (goalsResponse && __DEV__) {
        const originalCount = Array.isArray(goalsResponse) ? goalsResponse.length : (goalsResponse.changed?.length || 0);
        if (originalCount !== changedGoals.length) {
          console.warn(`Pull: Filtered out ${originalCount - changedGoals.length} null/undefined/invalid goal(s) from response`);
        }
      }

      // Extract milestones and steps from nested goal data
      // Goals come with nested milestones, and milestones come with nested steps
      let changedMilestones: any[] = [];
      let changedSteps: any[] = [];
      let deletedMilestoneIds: string[] = [];
      let deletedStepIds: string[] = [];
      
      // Log goals structure for debugging
      if (__DEV__ && changedGoals.length > 0) {
        console.log(`Pull: Processing ${changedGoals.length} goals`);
        const firstGoal = changedGoals[0];
        console.log(`Pull: Sample goal structure:`, {
          id: firstGoal?.id,
          title: firstGoal?.title,
          hasMilestones: !!firstGoal?.milestones,
          milestonesType: typeof firstGoal?.milestones,
          milestonesIsArray: Array.isArray(firstGoal?.milestones),
          milestonesLength: Array.isArray(firstGoal?.milestones) ? firstGoal.milestones.length : 'N/A',
        });
        if (firstGoal?.milestones && Array.isArray(firstGoal.milestones) && firstGoal.milestones.length > 0) {
          const firstMilestone = firstGoal.milestones[0];
          console.log(`Pull: Sample milestone structure:`, {
            id: firstMilestone?.id,
            title: firstMilestone?.title,
            goal_id: firstMilestone?.goal_id,
            hasSteps: !!firstMilestone?.steps,
            stepsType: typeof firstMilestone?.steps,
            stepsIsArray: Array.isArray(firstMilestone?.steps),
            stepsLength: Array.isArray(firstMilestone?.steps) ? firstMilestone.steps.length : 'N/A',
          });
        }
      }
      
      // Extract milestones and steps from goals, and clean goal data
      for (const goal of changedGoals) {
        if (goal && goal.milestones && Array.isArray(goal.milestones)) {
          if (__DEV__) {
            console.log(`Pull: Goal ${goal.id} has ${goal.milestones.length} milestones`);
          }
          for (const milestone of goal.milestones) {
            if (milestone && typeof milestone === 'object') {
              // Ensure milestone has goal_id set
              milestone.goal_id = milestone.goal_id || goal.id;
              changedMilestones.push(milestone);
              
              if (__DEV__) {
                console.log(`Pull: Extracted milestone ${milestone.id} (${milestone.title}) from goal ${goal.id}`);
              }
              
              // Extract steps from milestone
              if (milestone.steps && Array.isArray(milestone.steps)) {
                if (__DEV__) {
                  console.log(`Pull: Milestone ${milestone.id} has ${milestone.steps.length} steps`);
                }
                for (const step of milestone.steps) {
                  if (step && typeof step === 'object') {
                    // Ensure step has milestone_id set
                    step.milestone_id = step.milestone_id || milestone.id;
                    changedSteps.push(step);
                    if (__DEV__) {
                      console.log(`Pull: Extracted step ${step.id} (${step.text?.substring(0, 30)}...) from milestone ${milestone.id}`);
                    }
                  }
                }
              }
              // Remove nested steps from milestone to keep milestone data clean
              delete milestone.steps;
            }
          }
        } else if (__DEV__ && goal) {
          console.log(`Pull: Goal ${goal.id} has no milestones or milestones is not an array`);
        }
        // Remove nested milestones from goal to keep goal data clean
        if (goal.milestones) {
          delete goal.milestones;
        }
      }
      
      if (__DEV__) {
        console.log(`Pull: Extracted ${changedMilestones.length} milestones and ${changedSteps.length} steps from ${changedGoals.length} goals`);
      }

      const allChanges = [...changedEvents, ...changedTasks, ...changedGoals, ...changedMilestones, ...changedSteps];
      const allDeletedIds = [...(deletedEventIds || []), ...deletedTaskIds, ...deletedGoalIds, ...deletedMilestoneIds, ...deletedStepIds];

      if (__DEV__) {
        console.log(`Pull: Breakdown of changes:`, {
          events: changedEvents.length,
          tasks: changedTasks.length,
          goals: changedGoals.length,
          milestones: changedMilestones.length,
          steps: changedSteps.length,
          total: allChanges.length,
        });
      }

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
          if (deletedStepIds && deletedStepIds.length > 0) {
            const stepCollection = database.get<MilestoneStep>('milestone_steps');
            const recordsToDelete = await stepCollection.query(Q.where('id', Q.oneOf(deletedStepIds))).fetch();
            for (const record of recordsToDelete) {
              await record.destroyPermanently();
            }
            console.log(`Pull: Deleted ${recordsToDelete.length} milestone steps`);
          }
        }

        // Process changed records
        // Wrap each record processing in try-catch so invalid records don't break the entire sync
        const processingErrors: Array<{ id: string; type: string; error: any }> = [];
        
        for (const changeData of allChanges) {
          try {
            // Skip null/undefined entries
            if (!changeData || typeof changeData !== 'object') {
              if (__DEV__) {
                console.warn('Pull: Skipping null/undefined/invalid change data:', changeData);
              }
              continue;
            }
            
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
            } else if (changeData.goal_id !== undefined && changeData.text === undefined && !changeData.target_completion_date && !changeData.priority) {
              // This is a milestone (has goal_id, no text field, and doesn't match goal/task patterns)
              // More lenient check: just needs goal_id and shouldn't be a task/goal/step
              if (__DEV__) {
                console.log(`Pull: Processing milestone ${changeData.id} (goal_id: ${changeData.goal_id})`, {
                  hasCompleted: changeData.completed !== undefined,
                  completedType: typeof changeData.completed,
                  hasOrder: changeData.order !== undefined,
                  orderType: typeof changeData.order,
                  hasTitle: !!changeData.title,
                });
              }
              await this.processMilestoneChange(changeData, database);
            } else if (changeData.milestone_id !== undefined && changeData.text !== undefined) {
              // This is a milestone step (has milestone_id and text string)
              if (__DEV__) {
                console.log(`Pull: Processing step ${changeData.id} (milestone_id: ${changeData.milestone_id})`, {
                  text: changeData.text?.substring(0, 30),
                  hasCompleted: changeData.completed !== undefined,
                });
              }
              await this.processStepChange(changeData, database);
            } else {
              if (__DEV__) {
                console.warn(`Pull: Unknown record type for change data:`, {
                  id: changeData?.id,
                  hasGoalId: changeData?.goal_id !== undefined,
                  hasMilestoneId: changeData?.milestone_id !== undefined,
                  hasTargetDate: changeData?.target_completion_date !== undefined,
                  hasProgress: changeData?.progress_percentage !== undefined,
                  hasPriority: changeData?.priority !== undefined,
                  hasText: changeData?.text !== undefined,
                  completed: changeData?.completed,
                  order: changeData?.order,
                });
              }
            }
          } catch (recordError: any) {
            // Log the error but continue processing other records
            const recordId = changeData?.id || 'unknown';
            const recordType = changeData?.start?.dateTime ? 'event' :
                              changeData?.priority !== undefined ? 'task' :
                              changeData?.target_completion_date !== undefined ? 'goal' :
                              changeData?.goal_id !== undefined ? 'milestone' :
                              changeData?.milestone_id !== undefined ? 'milestone_step' : 'unknown';
            
            processingErrors.push({ id: recordId, type: recordType, error: recordError });
            
            // Log detailed error in development with goal-specific details
            if (__DEV__) {
              console.warn(`Pull: Failed to process ${recordType} ${recordId}:`, recordError.message || recordError);
              if (recordType === 'goal') {
                console.warn(`Pull: Invalid goal data:`, JSON.stringify(changeData, null, 2));
                console.warn(`Pull: Goal validation details:`, {
                  hasId: !!changeData?.id,
                  idType: typeof changeData?.id,
                  hasTitle: changeData?.title !== undefined && changeData?.title !== null && changeData?.title !== '',
                  titleValue: changeData?.title,
                  isObject: changeData && typeof changeData === 'object',
                });
              }
              console.warn(`Pull: Skipping invalid ${recordType} and continuing sync`);
            }
          }
        }
        
        // Log summary of processing errors if any
        if (processingErrors.length > 0) {
          console.warn(`Pull: Skipped ${processingErrors.length} invalid record(s) during sync. Sync completed successfully.`);
          if (__DEV__) {
            console.warn('Processing errors:', processingErrors.map(e => `${e.type}:${e.id}`).join(', '));
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
        } else if (status === 404) {
          // 404 errors are already handled gracefully, but if we reach here, it's unexpected
          userMessage = 'Some data could not be found on the server. Sync partially completed.';
          shouldRetry = false;
        } else { // Other 4xx errors e.g. data/validation
          // Validation errors from server - some records may have been skipped
          userMessage = 'Some data from the server was invalid and was skipped. Sync completed successfully.';
          shouldRetry = false;
        }
      } else if (error.message && (error.message.toLowerCase().includes('network') || error.message.toLowerCase().includes('timeout'))) {
        userMessage = 'A network error occurred. Please check your connection and try again.';
        shouldRetry = true;
      } else if (error instanceof Error) {
        // Check if it's a validation error from record processing
        if (error.message.includes('missing required field') || error.message.includes('Invalid')) {
          userMessage = 'Some data from the server was invalid and was skipped. Sync completed successfully.';
        } else {
          userMessage = `An unexpected error occurred: ${error.message}`;
        }
      }

      // Check if this is a validation error that should be handled gracefully
      const isValidationError = 
        error?.response?.status === 400 ||
        (error instanceof Error && (
          error.message.includes('missing required field') ||
          error.message.includes('Invalid') ||
          error.message.includes('validation')
        )) ||
        (error && typeof error === 'object' && 'isUserFriendlyError' in error && 
         (error as any).category === ErrorCategory.GOALS && 
         (error as any).severity === 'LOW');

      // Only show notification and throw if it's not a handled validation error
      // Validation errors from record processing are already handled above
      if (!isValidationError) {
        console.error('Pull: Failed to fetch or process changes from server.', {
          errorMessage: error.message,
          statusCode: error?.response?.status,
          responseData: error?.response?.data,
          shouldRetry,
          originalError: error,
        });

        notificationService.showInAppNotification('Data Pull Failed', userMessage);
        // Re-throw non-validation errors
        throw error;
      } else {
        // Log validation errors but don't treat as sync failure
        // Save sync timestamp even with validation errors since sync technically completed
        // (we just skipped invalid records)
        if (__DEV__) {
          console.warn('Pull: Validation error detected but handled gracefully:', error.message || error);
        }
        // Update sync timestamp since we processed what we could
        await AsyncStorage.setItem(LAST_SYNCED_AT_KEY, serverTimeBeforePull);
        console.log(`Pull: Sync completed with validation errors. New sync time: ${serverTimeBeforePull}`);
        // Don't re-throw validation errors - sync completed successfully (with skipped records)
        return;
      }
    }
  }

  async sync(silent = false, forceFullSync = false) {
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
        notificationService.showInAppNotification('Sync Started', forceFullSync ? 'Performing full sync...' : 'Syncing your data...');
      }
      await this.pushData();
      await this.pullData(forceFullSync);
      if (!silent) {
        notificationService.showInAppNotification('Sync Successful', 'Your data is up to date.');
      }
    } catch (error) {
      // Check if this is a validation error that shouldn't be treated as a failure
      const isValidationError = 
        error && typeof error === 'object' && 'isUserFriendlyError' in error &&
        (error as any).category === ErrorCategory.GOALS && 
        (error as any).severity === 'LOW';
      
      if (isValidationError) {
        // Validation errors are already handled gracefully in pullData()
        // Don't log as sync failure
        if (__DEV__) {
          console.warn('Sync: Validation error handled gracefully, sync completed successfully');
        }
      } else {
        // Real sync failure
        console.error('Sync failed:', error);
        const errorMessage = error instanceof Error ? error.message : 'An unknown error occurred.';
        if (!silent) {
          notificationService.showInAppNotification('Sync Failed', `Could not sync data: ${errorMessage}`);
        }
      }
    } finally {
      this.isSyncing = false;
    }
  }

  async silentSync() {
    return this.sync(true);
  }

  /**
   * Force a full sync - fetches all data from the server regardless of last sync time
   * Useful for ensuring complete data, especially after schema changes or if sync appears incomplete
   */
  async fullSync(silent = false) {
    return this.sync(silent, true);
  }

  /**
   * Debug utility to check database contents
   * Logs all goals, milestones, and steps for the current user
   */
  async debugDatabaseContents() {
    const database = getDatabase();
    const user = authService.getCurrentUser();
    
    if (!user) {
      console.log('Debug: No authenticated user');
      return;
    }
    
    try {
      // Get all goals
      const allGoals = await database.get<Goal>('goals').query().fetch();
      console.log(`\n=== Database Debug for ${user.email} ===`);
      console.log(`Total Goals: ${allGoals.length}`);
      
      // Get all milestones
      const allMilestones = await database.get<Milestone>('milestones').query().fetch();
      console.log(`Total Milestones: ${allMilestones.length}`);
      
      // Get all steps
      const allSteps = await database.get<MilestoneStep>('milestone_steps').query().fetch();
      console.log(`Total Steps: ${allSteps.length}`);
      
      // Show goals with their milestones
      for (const goal of allGoals) {
        const goalMilestones = await database.get<Milestone>('milestones')
          .query(Q.where('goal_id', goal.id))
          .fetch();
        
        console.log(`\nGoal: ${goal.title} (${goal.id})`);
        console.log(`  User ID: ${goal.userId}`);
        console.log(`  Status: ${goal.status}`);
        console.log(`  Milestones: ${goalMilestones.length}`);
        
        for (const milestone of goalMilestones) {
          const milestoneSteps = await database.get<MilestoneStep>('milestone_steps')
            .query(Q.where('milestone_id', milestone.id))
            .fetch();
          
          console.log(`    - ${milestone.title} (${milestone.id})`);
          console.log(`      Steps: ${milestoneSteps.length}`);
          console.log(`      Completed: ${milestone.completed}`);
          console.log(`      Status: ${milestone.status}`);
          
          for (const step of milestoneSteps) {
            console.log(`        • ${step.text?.substring(0, 50)}... (${step.id})`);
            console.log(`          Completed: ${step.completed}, Status: ${step.status}`);
          }
        }
      }
      
      console.log(`\n=== End Database Debug ===\n`);
    } catch (error) {
      console.error('Debug: Error checking database:', error);
    }
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

  private async processTaskChange(taskData: TaskPayload, database: Database) {
    const taskCollection = database.get<Task>('tasks');
    const existingTasks = await taskCollection.query(Q.where('id', taskData.id)).fetch();
    const localTask = existingTasks.length > 0 ? existingTasks[0] : null;

    // Parse due_date once and validate
    const parsedDueDate = taskData.due_date ? safeParseDate(taskData.due_date) : undefined;
    if (taskData.due_date && !parsedDueDate) {
      console.error(`Pull: Failed to parse due_date for task ${taskData.id}:`, taskData.due_date);
    }

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
        record.status = 'synced';
      });
    }
  }

  private async processGoalChange(goalData: any, database: Database) {
    // Validate required fields with detailed error messages
    if (!goalData || typeof goalData !== 'object') {
      const errorMsg = `Invalid goal data: data is not an object. Received: ${typeof goalData}, value: ${JSON.stringify(goalData)}`;
      console.error('Pull: Goal validation failed:', errorMsg);
      throw new Error(errorMsg);
    }
    if (!goalData.id || typeof goalData.id !== 'string') {
      const errorMsg = `Goal data missing required field: id. Received id: ${goalData.id} (type: ${typeof goalData.id})`;
      console.error('Pull: Goal validation failed:', errorMsg);
      console.error('Pull: Full goal data:', JSON.stringify(goalData, null, 2));
      throw new Error(errorMsg);
    }
    if (goalData.title === undefined || goalData.title === null || goalData.title === '') {
      const errorMsg = `Goal ${goalData.id} missing required field: title. Received title: ${goalData.title} (type: ${typeof goalData.title})`;
      console.error('Pull: Goal validation failed:', errorMsg);
      console.error('Pull: Full goal data:', JSON.stringify(goalData, null, 2));
      throw new Error(errorMsg);
    }

    const parsedTargetDate = goalData.target_completion_date ? safeParseDate(goalData.target_completion_date) : undefined;
    if (goalData.target_completion_date && !parsedTargetDate) {
      console.warn(`Pull: Failed to parse target_completion_date for goal ${goalData.id}:`, goalData.target_completion_date);
      // Don't throw - continue without the date
    }

    const goalCollection = database.get<Goal>('goals');
    const existingGoals = await goalCollection.query(Q.where('id', goalData.id)).fetch();
    const localGoal = existingGoals.length > 0 ? existingGoals[0] : null;

    if (localGoal) {
      // Update existing goal
      await localGoal.update((record: Goal) => {
        record.title = goalData.title;
        record.description = goalData.description;
        // Only set targetCompletionDate if parsing succeeded, otherwise preserve existing value
        if (parsedTargetDate) {
          record.targetCompletionDate = parsedTargetDate;
        } else if (goalData.target_completion_date) {
          // Log error but don't overwrite existing targetCompletionDate
          console.error(`Pull: Skipping target_completion_date update for goal ${goalData.id} due to parsing failure, preserving existing value`);
        }
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
    
    // Note: Nested milestones and steps are processed separately in the main loop
    // They are extracted before processing (see extraction logic above)
  }

  private async processMilestoneChange(milestoneData: any, database: Database) {
    const milestoneCollection = database.get<Milestone>('milestones');
    const existingMilestones = await milestoneCollection.query(Q.where('id', milestoneData.id)).fetch();
    const localMilestone = existingMilestones.length > 0 ? existingMilestones[0] : null;

    if (localMilestone) {
      // Update existing milestone
      await localMilestone.update((record: Milestone) => {
        record.title = milestoneData.title;
        record.description = milestoneData.description;
        record.completed = milestoneData.completed ?? false;
        record.order = milestoneData.order ?? 0;
        record.status = 'synced';
      });
    } else {
      // Create new milestone
      if (!milestoneData.goal_id) {
        console.warn(`Pull: Skipping milestone creation for ID ${milestoneData.id} due to missing goal_id.`);
        return;
      }
      await milestoneCollection.create((record: Milestone) => {
        record._raw.id = milestoneData.id;
        record.goalId = milestoneData.goal_id;
        record.title = milestoneData.title;
        record.description = milestoneData.description;
        record.completed = milestoneData.completed ?? false;
        record.order = milestoneData.order ?? 0;
        record.status = 'synced';
      });
    }
  }

  private async processStepChange(stepData: any, database: Database) {
    const stepCollection = database.get<MilestoneStep>('milestone_steps');
    const existingSteps = await stepCollection.query(Q.where('id', stepData.id)).fetch();
    const localStep = existingSteps.length > 0 ? existingSteps[0] : null;

    if (localStep) {
      // Update existing step
      await localStep.update((record: MilestoneStep) => {
        record.text = stepData.text;
        record.completed = stepData.completed ?? false;
        record.order = stepData.order ?? 0;
        record.status = 'synced';
      });
    } else {
      // Create new step
      if (!stepData.milestone_id) {
        console.warn(`Pull: Skipping step creation for ID ${stepData.id} due to missing milestone_id.`);
        return;
      }
      await stepCollection.create((record: MilestoneStep) => {
        record._raw.id = stepData.id;
        record.milestoneId = stepData.milestone_id;
        record.text = stepData.text;
        record.completed = stepData.completed ?? false;
        record.order = stepData.order ?? 0;
        record.status = 'synced';
      });
    }
  }
}

export const syncService = new SyncService();
