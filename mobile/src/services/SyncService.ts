import {getDatabase} from '../db';
import {Q, Database} from '@nozbe/watermelondb';
import {enhancedAPI} from './enhancedApi';
import AsyncStorage from '@react-native-async-storage/async-storage';
import CalendarEvent from '../db/models/CalendarEvent';
import Task from '../db/models/Task';
import Goal from '../db/models/Goal';
import Milestone from '../db/models/Milestone';
import MilestoneStep from '../db/models/MilestoneStep';
import ConversationThread from '../db/models/ConversationThread';
import ConversationMessage from '../db/models/ConversationMessage';
import { notificationService } from './notificationService';
import { authService } from './auth';
import { safeParseDate } from '../utils/dateUtils';
import { conversationRepository } from '../repositories/ConversationRepository';
import { goalRepository } from '../repositories/GoalRepository';
import { taskRepository } from '../repositories/TaskRepository';
import { conversationService } from './conversationService';

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

  // Simple UUID v4/v1 checker (relaxed to accept standard UUIDs)
  private isUUID(value: string | undefined | null): boolean {
    if (!value) return false;
    return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(String(value));
  }

  private async ensureServerGoalId(localGoalId: string, database: Database): Promise<string> {
    if (this.isUUID(localGoalId)) {
      return localGoalId;
    }
    // Attempt to find local goal
    let goal: Goal | null = null;
    try {
      goal = await database.get<Goal>('goals').find(localGoalId);
    } catch (error) {
      console.warn(`ensureServerGoalId: Failed to find local goal ${localGoalId}`, error);
    }
    if (!goal) {
      // If not found, just return original; downstream will fail and be retried
      return localGoalId;
    }

    // Create goal on server using local data
    const goalData = {
      title: goal.title,
      description: goal.description,
      target_completion_date: goal.targetCompletionDate?.toISOString(),
      progress_percentage: goal.progressPercentage,
      category: goal.category,
      is_active: goal.isActive,
      client_updated_at: goal.updatedAt?.toISOString(),
    } as any;

    const created = await enhancedAPI.createGoal(goalData);
    if (created && created.id && created.id !== localGoalId) {
      try {
        await goalRepository.updateGoalServerId(localGoalId, created.id);
        return created.id;
      } catch (e) {
        console.warn('ensureServerGoalId: Failed to migrate local goal id to server id', e);
        return created.id;
      }
    }
    return localGoalId;
  }

  private async ensureServerMilestoneId(localMilestoneId: string, database: Database): Promise<string> {
    if (this.isUUID(localMilestoneId)) {
      return localMilestoneId;
    }

    // Load local milestone
    let milestone: Milestone | null = null;
    try {
      milestone = await database.get<Milestone>('milestones').find(localMilestoneId);
    } catch {}
    if (!milestone) {
      return localMilestoneId;
    }

    // Ensure the parent goal has a server UUID
    const serverGoalId = await this.ensureServerGoalId(milestone.goalId, database);

    // Create milestone on server
    const milestoneData = {
      title: milestone.title,
      description: milestone.description,
      completed: milestone.completed,
      order: milestone.order,
      client_updated_at: milestone.updatedAt?.toISOString(),
    } as any;

    const created = await enhancedAPI.createMilestone(serverGoalId, milestoneData);
    if (created && created.id && created.id !== localMilestoneId) {
      try {
        await goalRepository.updateMilestoneServerId(localMilestoneId, created.id, created.goal_id || serverGoalId);
        return created.id;
      } catch (e) {
        console.warn('ensureServerMilestoneId: Failed to migrate local milestone id to server id', e);
        return created.id;
      }
    }
    return localMilestoneId;
  }

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
      // Include tasks with failed sync statuses (for retry)
      if (status === 'sync_failed_delete' || status === 'sync_failed_create' || status === 'sync_failed_update') {
        return true;
      }
      // Include tasks with combined format (pending_update:* or pending_create:*)
      if (typeof status === 'string' && (status.startsWith('pending_update:') || status.startsWith('pending_create:'))) {
        return true;
      }
      // Include tasks with sync_failed: combined format (for retry)
      if (typeof status === 'string' && status.startsWith('sync_failed:')) {
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

    const dirtyThreads = await database.get<ConversationThread>('conversation_threads').query(
      Q.where('status', Q.notEq('synced'))
    ).fetch();

    // Messages need special handling - only sync user messages, assistant messages are created by server
    const dirtyMessages = await database.get<ConversationMessage>('conversation_messages').query(
      Q.where('status', Q.notEq('synced')),
      Q.where('role', 'user') // Only sync user messages
    ).fetch();

    const allDirtyRecords = [...dirtyEvents, ...dirtyTasks, ...dirtyGoals, ...dirtyMilestones, ...dirtyMilestoneSteps, ...dirtyThreads];

    // Handle messages separately because they require special AI chat endpoint handling
    // Process messages after other records to ensure threads exist first
    const messagePushErrors: { recordId: string; error: any }[] = [];

    if (allDirtyRecords.length === 0 && dirtyMessages.length === 0) {
      return;
    }

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
            // Only include is_today_focus if it's explicitly a boolean (not null or undefined)
            // Backend validation requires boolean or absent, not null
            ...(typeof record.isTodayFocus === 'boolean' ? { is_today_focus: record.isTodayFocus } : {}),
            status: lifecycleStatus, // Include lifecycle status in sync
            client_updated_at: record.updatedAt?.toISOString(),
          };

          // Check if this is a delete operation (pending_delete or sync_failed_delete)
          const isDeleteOperation = syncStatus === 'pending_delete' || 
                                   syncStatus === 'sync_failed_delete' ||
                                   (typeof record.status === 'string' && record.status.includes('pending_delete')) ||
                                   (typeof record.status === 'string' && record.status === 'sync_failed_delete');
          
          if (isDeleteOperation) {
            // If task ID is not a UUID, it was never synced to server
            // Just delete it locally without attempting server deletion
            if (!this.isUUID(record.id)) {
              console.log(`Push: Deleting local-only task ${record.id} (never synced to server)`);
              await database.write(async () => {
                await record.destroyPermanently();
              });
              // Skip the normal update logic since we've already deleted locally
              continue;
            }
            // Delete task on server
            try {
              console.log(`Push: Deleting task ${record.id} from server`);
              await enhancedAPI.deleteTask(record.id);
              // Immediately delete local record after successful server deletion
              console.log(`Push: Task ${record.id} deleted from server, removing from local database`);
              await database.write(async () => {
                await record.destroyPermanently();
              });
              // Skip the normal update logic since we've already deleted locally
              continue;
            } catch (deleteError: any) {
              // Re-throw error to be handled by outer catch block
              // This allows idempotent delete handling (404/410) and proper error tracking
              console.error(`Push: Failed to delete task ${record.id} from server:`, deleteError);
              throw deleteError;
            }
          }
          
          switch (syncStatus) {
            case 'pending_create':
            case 'sync_failed_create':
              serverResponse = await enhancedAPI.createTask(recordData);
              // If server returned a different ID, we'll let the pull operation handle the ID migration
              // via duplicate detection. For now, just mark the task as synced with its current ID.
              // The pull operation will detect the duplicate and migrate it properly.
              // This avoids the _raw.id error that occurs when trying to migrate during push.
              break;
            case 'pending_update':
            case 'sync_failed_update':
              // If task ID is not a UUID, it was never synced to server
              // This shouldn't happen in normal flow, but treat it as a create if it does
              if (!this.isUUID(record.id)) {
                console.warn(`Push: Task ${record.id} has pending_update but non-UUID ID, treating as create`);
                serverResponse = await enhancedAPI.createTask(recordData);
                // If server returned a different ID, we'll let the pull operation handle the ID migration
                // via duplicate detection. For now, just mark the task as synced with its current ID.
                // The pull operation will detect the duplicate and migrate it properly.
                // This avoids the _raw.id error that occurs when trying to migrate during push.
              } else {
                serverResponse = await enhancedAPI.updateTask(record.id, recordData);
              }
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
            case 'sync_failed_create':
              serverResponse = await enhancedAPI.createGoal(recordData);
              break;
            case 'pending_update':
            case 'sync_failed_update':
            // Fallback for legacy sync_failed, assume update
            case 'sync_failed':
              // Check if the record exists on the server before attempting an update
              try {
                await enhancedAPI.getGoal(record.id);
                serverResponse = await enhancedAPI.updateGoal(record.id, recordData);
              } catch (error: any) {
                if (error.response && error.response.status === 404) {
                  // Not found, so it should be a create operation
                  serverResponse = await enhancedAPI.createGoal(recordData);
                } else {
                  // Re-throw other errors
                  throw error;
                }
              }
              break;
            case 'pending_delete':
            case 'sync_failed_delete':
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
            case 'sync_failed_create':
              // Ensure goal ID is a server UUID before creating milestone
              {
                const serverGoalId = await this.ensureServerGoalId(record.goalId, database);
                serverResponse = await enhancedAPI.createMilestone(serverGoalId, recordData);
              }
              // If server assigned a different ID, migrate local milestone and its steps
              if (serverResponse && serverResponse.id && serverResponse.id !== record.id) {
                try {
                  await goalRepository.updateMilestoneServerId(record.id, serverResponse.id, serverResponse.goal_id);
                  // After migration, skip normal update for this record and continue
                  continue;
                } catch (migrationError) {
                  console.warn('Push: Failed to migrate milestone ID to server ID, will proceed with normal update.', migrationError);
                }
              }
              break;
            case 'pending_update':
            case 'sync_failed_update':
            // Fallback for legacy sync_failed, assume update
            case 'sync_failed':
              // Check if the record exists on the server before attempting an update
              try {
                await enhancedAPI.getMilestone(record.id);
                serverResponse = await enhancedAPI.updateMilestone(record.id, recordData);
              } catch (error: any) {
                if (error.response && error.response.status === 404) {
                  // Not found, so it should be a create operation
                  {
                    const serverGoalId = await this.ensureServerGoalId(record.goalId, database);
                    serverResponse = await enhancedAPI.createMilestone(serverGoalId, recordData);
                  }
                  if (serverResponse && serverResponse.id && serverResponse.id !== record.id) {
                    try {
                      await goalRepository.updateMilestoneServerId(record.id, serverResponse.id, serverResponse.goal_id);
                      continue;
                    } catch (migrationError) {
                      console.warn('Push: Failed to migrate milestone ID after create fallback.', migrationError);
                    }
                  }
                } else {
                  // Re-throw other errors
                  throw error;
                }
              }
              break;
            case 'pending_delete':
            case 'sync_failed_delete':
              serverResponse = await enhancedAPI.deleteMilestone(record.id);
              break;
            default:
              console.warn(`Push: Unknown status ${record.status} for milestone ${record.id}`);
              continue;
          }
        } else if (record instanceof MilestoneStep) {
          // Re-fetch the latest step to get any migrated milestoneId
          let milestoneIdForPush = record.milestoneId;
          try {
            const freshStep = await database.get<MilestoneStep>('milestone_steps').find(record.id);
            milestoneIdForPush = freshStep.milestoneId;
          } catch (error) {
            this.logger.error(
              `Failed to re-fetch milestone step ${record.id} for milestoneId migration:`,
              error instanceof Error ? error.message : String(error),
              error
            );
          }

          // Ensure the milestone exists on server and we have a UUID
          const serverMilestoneId = await this.ensureServerMilestoneId(milestoneIdForPush, database);

          recordData = {
            text: record.text,
            completed: record.completed,
            order: record.order,
            client_updated_at: record.updatedAt?.toISOString(),
          };

          switch (record.status) {
            case 'pending_create':
            case 'sync_failed_create':
              serverResponse = await enhancedAPI.createStep(serverMilestoneId, recordData);
              break;
            case 'pending_update':
            case 'sync_failed_update':
              // Fallback for legacy sync_failed, assume update
            case 'sync_failed':
              // Check if the record exists on the server before attempting an update
              try {
                await enhancedAPI.getStep(record.id);
                serverResponse = await enhancedAPI.updateStep(record.id, recordData);
              } catch (error: any) {
                if (error.response && error.response.status === 404) {
                  // Not found, so it should be a create operation
                  serverResponse = await enhancedAPI.createStep(serverMilestoneId, recordData);
                } else {
                  // Re-throw other errors
                  throw error;
                }
              }
              break;
            case 'pending_delete':
            case 'sync_failed_delete':
              serverResponse = await enhancedAPI.deleteStep(record.id);
              break;
            default:
              console.warn(`Push: Unknown status ${record.status} for step ${record.id}`);
              continue;
          }
        } else if (record instanceof ConversationThread) {
          recordData = {
            title: record.title,
            summary: record.summary,
            client_updated_at: record.updatedAt?.toISOString(),
          };

          switch (record.status) {
            case 'pending_create':
              serverResponse = await conversationService.createThread(record.title, record.summary);
              // If server returned a different ID, we need to update (server generates UUID)
              // Note: This is handled by marking as synced - the server ID becomes the canonical ID
              // If local ID differs, updateThreadServerId will handle migration
              if (serverResponse && serverResponse.id !== record.id) {
                await conversationRepository.updateThreadServerId(record.id, serverResponse.id);
                // Skip the normal update logic since we've migrated to new ID
                continue;
              }
              break;
            case 'pending_update':
              serverResponse = await conversationService.updateThread(record.id, {
                title: record.title,
                summary: record.summary,
              });
              break;
            case 'pending_delete':
              await conversationService.deleteThread(record.id);
              break;
            case 'sync_failed':
              // For sync_failed records, try to determine the original operation and retry
              // Check if thread exists on server to determine if it's a create or update
              try {
                const existingThread = await conversationService.getThread(record.id);
                if (existingThread) {
                  // Thread exists, so this was likely a failed update - retry as update
                  serverResponse = await conversationService.updateThread(record.id, {
                    title: record.title,
                    summary: record.summary,
                  });
                } else {
                  // Thread doesn't exist, so this was likely a failed create - retry as create
                  serverResponse = await conversationService.createThread(record.title, record.summary);
                  if (serverResponse && serverResponse.id !== record.id) {
                    await conversationRepository.updateThreadServerId(record.id, serverResponse.id);
                    continue;
                  }
                }
              } catch (checkError: any) {
                // Only create thread if error indicates 404 (thread not found)
                // For other errors (network, auth, server errors), log and skip
                const is404 = checkError?.status === 404 || checkError?.response?.status === 404;
                if (is404) {
                  // Thread not found, so this was likely a failed create - retry as create
                  serverResponse = await conversationService.createThread(record.title, record.summary);
                  if (serverResponse && serverResponse.id !== record.id) {
                    await conversationRepository.updateThreadServerId(record.id, serverResponse.id);
                    continue;
                  }
                } else {
                  // For non-404 errors (network, auth, server errors), log and skip this record
                  console.warn(`Sync: Failed to check thread existence for ${record.id}:`, checkError);
                  // Continue to next record instead of retrying create
                  continue;
                }
              }
              break;
            default:
              console.warn(`Push: Unknown status ${record.status} for thread ${record.id}`);
              continue;
          }
        } else {
          console.warn(`Push: Unknown record type for record ${(record as any).id}`);
          continue;
        }

        // Update local record based on server action
        // Handle ConversationThread separately since it uses repository method
        if (record instanceof ConversationThread) {
          if (record.status === 'pending_delete') {
            // Delete handled by repository, just destroy locally
            await database.write(async () => {
              await record.destroyPermanently();
            });
          } else {
            await conversationRepository.markThreadAsSynced(record.id, {
              createdAt: serverResponse?.created_at ? safeParseDate(serverResponse.created_at) : undefined,
              updatedAt: serverResponse?.updated_at ? safeParseDate(serverResponse.updated_at) : undefined,
            });
          }
          // Skip the generic update logic below
        } else {
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

                const { lifecycleStatus: currentLifecycleStatus } = this.extractLifecycleStatus(record.status as string | undefined | null);

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
        }

      } catch (error: any) {
        // Handle idempotent deletes: if server says 404/410 on pending_delete, treat as success
        try {
          const isPendingDelete = (record as any).status === 'pending_delete' ||
            (typeof (record as any).status === 'string' && (record as any).status.includes('pending_delete'));
          const statusCode = error?.response?.status;
          const isTimeout = statusCode === 408 || error?.data?.code === 'TIMEOUT' || 
                           (error instanceof Error && error.message?.toLowerCase().includes('timeout'));
          
          if (isPendingDelete && (statusCode === 404 || statusCode === 410)) {
            await database.write(async () => {
              await (record as any).destroyPermanently();
            });
            // Skip error tracking for idempotent delete
            continue;
          }
          
          // Handle timeout errors for pending_delete: check if thread was already deleted
          if (isPendingDelete && isTimeout && record instanceof ConversationThread) {
            try {
              // Check if thread still exists on server
              await conversationService.getThread(record.id, { timeoutMs: 10000 });
              // Thread still exists - mark as failed for retry
              console.warn(`Push: Thread ${record.id} delete timed out but thread still exists, will retry`);
              // Will be marked as sync_failed_delete below
            } catch (checkError: any) {
              // If getThread returns 404, thread was already deleted - treat as success
              const is404 = checkError?.status === 404 || checkError?.response?.status === 404;
              if (is404) {
                console.log(`Push: Thread ${record.id} delete timed out but thread already deleted, cleaning up locally`);
                await database.write(async () => {
                  await (record as any).destroyPermanently();
                });
                // Skip error tracking for idempotent delete
                continue;
              }
              // Other errors (network, auth) - will be marked as failed for retry
              console.warn(`Push: Failed to verify thread ${record.id} deletion status after timeout:`, checkError);
            }
          }
        } catch (localDeleteErr) {
          console.warn('Push: Failed to finalize local delete after server 404/410', localDeleteErr);
        }

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

    // Handle messages separately - they require calling /ai/chat endpoint
    // First, ensure all threads are synced before processing messages
    for (const message of dirtyMessages) {
      try {
        const thread = await this.findOrMigrateThread(message, database);
        const finalThreadId = await this.ensureThreadSynced(thread, message, database);
        await this.sendMessageAndCreateResponse(message, finalThreadId, database);
      } catch (error: any) {
        console.error(`Push: Failed to sync message ${message.id}`, JSON.stringify(error, null, 2));
        messagePushErrors.push({ recordId: message.id, error });
      }
    }

    // Combine push errors with message push errors
    const allPushErrors = [...pushErrors, ...messagePushErrors];

    // Check for auth errors after the loop and before other error handling
    const hasAuthError = allPushErrors.some(
      e => e.error?.response?.status === 401 || e.error?.response?.status === 403,
    );

    if (hasAuthError) {
      notificationService.showInAppNotification(
        'Authentication Failed',
        'Please log in again to sync your data.',
      );
      throw new Error('Authentication failed');
    }

    if (allPushErrors.length > 0) {
      const totalRecords = allDirtyRecords.length + dirtyMessages.length;
      const errorMessage = `Failed to push ${allPushErrors.length} of ${totalRecords} changes.`;
      notificationService.showInAppNotification(
        'Push Incomplete',
        errorMessage,
      );

      const failedRecordIds = allPushErrors.map(e => e.recordId);
      const recordsToUpdate = [...allDirtyRecords, ...dirtyMessages].filter(r =>
        failedRecordIds.includes(r.id),
      );

      if (recordsToUpdate.length > 0) {
        const database = getDatabase();
        try {
          await database.write(async () => {
            for (const record of recordsToUpdate) {
              await record.update(r => {
                // For tasks, preserve lifecycle status using combined format
                if (record instanceof Task) {
                  const { lifecycleStatus, syncStatus } = this.extractLifecycleStatus(record.status);
                  // If it's a pending_delete that failed, mark as sync_failed_delete
                  if (syncStatus === 'pending_delete') {
                    r.status = 'sync_failed_delete';
                  } else {
                    // For other task sync failures, use combined format
                    r.status = `sync_failed:${lifecycleStatus}`;
                  }
                } else {
                  // For other records, transition pending states to failed states
                  if (r.status === 'pending_create') {
                    r.status = 'sync_failed_create';
                  } else if (r.status === 'pending_update') {
                    r.status = 'sync_failed_update';
                  } else if (r.status === 'pending_delete') {
                    r.status = 'sync_failed_delete';
                  }
                  // If it's already in a failed state, do nothing, it will be retried.
                }
              });
            }
          });
        } catch (dbError) {
          console.error(
            'Push: Failed to mark records as sync_failed.',
            dbError,
          );
        }
      }
    }
  }

  /**
   * Finds a thread by ID or migrates it if it was moved during sync.
   * Updates message.threadId inside database.write if migration is found.
   * @returns The resolved thread or throws an error if not found
   */
  private async findOrMigrateThread(
    message: ConversationMessage,
    database: Database
  ): Promise<ConversationThread> {
    // Ensure thread exists - try original threadId first
    let thread = await conversationRepository.getThreadById(message.threadId);
    
    // If thread not found, it might have been migrated to a new ID during sync
    // Try to find it by checking all synced threads and matching by userId and timestamp
    if (!thread) {
      const userId = authService.getCurrentUser()?.id;
      if (userId) {
        const allSyncedThreads = await database.get<ConversationThread>('conversation_threads')
          .query(
            Q.where('user_id', userId),
            Q.where('status', 'synced')
          )
          .fetch();
        
        // Try to find thread by checking messages in synced threads
        for (const candidateThread of allSyncedThreads) {
          const threadMessages = await conversationRepository.getMessagesByThreadId(candidateThread.id);
          const matchingMessage = threadMessages.find(m => m.id === message.id);
          if (matchingMessage) {
            thread = candidateThread;
            // Update message's threadId to correct one
            await database.write(async () => {
              await message.update(m => {
                m.threadId = candidateThread.id;
              });
            });
            break;
          }
        }
      }
      
      if (!thread) {
        console.warn(`Push: Thread ${message.threadId} not found for message ${message.id} after migration check`);
        throw new Error('Thread not found');
      }
    }

    return thread;
  }

  /**
   * Ensures a thread is synced, handling pending_create and pending_update flows.
   * Handles server ID migration by updating thread and message IDs inside database.write.
   * Marks thread as synced, re-fetches and throws on failure.
   * @returns The final thread ID after syncing
   */
  private async ensureThreadSynced(
    thread: ConversationThread,
    message: ConversationMessage,
    database: Database
  ): Promise<string> {
    // If thread is not synced yet, sync it first
    if (thread.status !== 'synced') {
      // Sync the thread
      const threadData = {
        title: thread.title,
        summary: thread.summary,
      };
      
      let serverResponse: any;
      if (thread.status === 'pending_create') {
        serverResponse = await conversationService.createThread(thread.title, thread.summary);
        // Handle ID migration if server returned different ID
        if (serverResponse && serverResponse.id !== thread.id) {
          await conversationRepository.updateThreadServerId(thread.id, serverResponse.id);
          // Update message's threadId to new ID
          await database.write(async () => {
            await message.update(m => {
              m.threadId = serverResponse.id;
            });
          });
          // Re-fetch thread with new ID
          const refetchedThread = await conversationRepository.getThreadById(serverResponse.id);
          if (!refetchedThread) {
            throw new Error(`Thread ${serverResponse.id} not found after ID migration`);
          }
          thread = refetchedThread;
        } else {
          await conversationRepository.markThreadAsSynced(thread.id, {
            createdAt: serverResponse?.created_at ? safeParseDate(serverResponse.created_at) : undefined,
            updatedAt: serverResponse?.updated_at ? safeParseDate(serverResponse.updated_at) : undefined,
          });
        }
      } else if (thread.status === 'pending_update') {
        serverResponse = await conversationService.updateThread(thread.id, threadData);
        await conversationRepository.markThreadAsSynced(thread.id, {
          updatedAt: serverResponse?.updated_at ? safeParseDate(serverResponse.updated_at) : undefined,
        });
      }
      
      // Re-fetch thread to get updated status (use server ID if it changed)
      const finalThreadId = serverResponse?.id || message.threadId;
      const refetchedThread = await conversationRepository.getThreadById(finalThreadId);
      if (!refetchedThread || refetchedThread.status !== 'synced') {
        throw new Error(`Thread ${finalThreadId} still not synced after sync attempt`);
      }
      thread = refetchedThread;
      
      // Update message's threadId if it changed
      if (serverResponse?.id && serverResponse.id !== message.threadId) {
        await database.write(async () => {
          await message.update(m => {
            m.threadId = serverResponse.id;
          });
        });
      }

      return finalThreadId;
    }

    // Thread is already synced, return its current ID
    return thread.id;
  }

  /**
   * Sends a message and creates the assistant response.
   * Calls conversationService.syncSendMessage, marks the user message as synced,
   * creates assistant message if missing and marks it synced.
   */
  private async sendMessageAndCreateResponse(
    message: ConversationMessage,
    finalThreadId: string,
    database: Database
  ): Promise<void> {
    // Check authentication before making API call
    const userId = authService.getCurrentUser()?.id;
    if (!userId) {
      throw new Error('User not authenticated');
    }

    // Call AI chat endpoint with the user message
    const chatResponse = await conversationService.syncSendMessage(finalThreadId, message.content);
    
    // Handle user message ID migration if server assigned a different ID
    let finalUserMessageId = message.id;
    if (chatResponse.userMessage.id !== message.id) {
      // Server assigned a different ID - migrate the local record to use server ID
      try {
        await database.write(async () => {
          // Check if message with server ID already exists (race condition)
          let existingServerMessage = null;
          try {
            existingServerMessage = await database.get<ConversationMessage>('conversation_messages')
              .find(chatResponse.userMessage.id);
          } catch (error: any) {
            // Only swallow true "not found" errors, rethrow others
            const errorMessage = error?.message || String(error || '');
            if (!errorMessage.toLowerCase().includes('not found')) {
              throw error;
            }
            // Message doesn't exist, will create it below
          }

          if (existingServerMessage) {
            // Race condition: message with server ID already exists (likely from pull)
            // Delete the local message with old ID first
            await message.destroyPermanently();
            finalUserMessageId = existingServerMessage.id;
          } else {
            // Create new message record with server ID, copying all fields
            const newMessage = await database.get<ConversationMessage>('conversation_messages').create(m => {
              m._raw.id = chatResponse.userMessage.id;
              m.threadId = message.threadId;
              m.userId = message.userId;
              m.role = message.role;
              m.content = message.content;
              m.metadata = message.metadata;
              m.status = 'synced';
              // Use server timestamps if provided, otherwise preserve original timestamps
              m.createdAt = safeParseDate(chatResponse.userMessage.created_at) || message.createdAt;
              m.updatedAt = safeParseDate(chatResponse.userMessage.updated_at) || message.updatedAt;
            });
            
            // Delete old message record
            await message.destroyPermanently();
            finalUserMessageId = newMessage.id;
          }
        });
        
        // After successful migration, call markMessageAsSynced with server ID for consistency
        // (even though status is already 'synced', this ensures timestamps are correct)
        await conversationRepository.markMessageAsSynced(finalUserMessageId, {
          createdAt: safeParseDate(chatResponse.userMessage.created_at),
          updatedAt: safeParseDate(chatResponse.userMessage.updated_at),
        });
      } catch (migrationError: any) {
        // Handle unique-constraint/duplicate-ID races
        const errorMessage = migrationError?.message || String(migrationError || '');
        const isDuplicateError = 
          errorMessage.toLowerCase().includes('duplicate') ||
          errorMessage.toLowerCase().includes('unique constraint') ||
          errorMessage.toLowerCase().includes('already exists');
        
        if (isDuplicateError) {
          // Race condition: message with server ID was created concurrently, fetch and mark synced
          try {
            const existingServerMessage = await database.get<ConversationMessage>('conversation_messages')
              .find(chatResponse.userMessage.id);
            
            if (existingServerMessage.status !== 'synced') {
              await conversationRepository.markMessageAsSynced(existingServerMessage.id, {
                createdAt: safeParseDate(chatResponse.userMessage.created_at) || existingServerMessage.createdAt,
                updatedAt: safeParseDate(chatResponse.userMessage.updated_at) || existingServerMessage.updatedAt,
              });
            }
            // Delete the local message with old ID
            await database.write(async () => {
              await message.destroyPermanently();
            });
            finalUserMessageId = existingServerMessage.id;
          } catch (fetchError: any) {
            // If we can't fetch the existing message, rethrow the original migration error
            throw migrationError;
          }
        } else {
          // Unexpected error, rethrow
          throw migrationError;
        }
      }
    } else {
      // Server ID matches local ID - just mark as synced
      await conversationRepository.markMessageAsSynced(message.id, {
        createdAt: safeParseDate(chatResponse.userMessage.created_at) || message.createdAt,
        updatedAt: safeParseDate(chatResponse.userMessage.updated_at) || new Date(),
      });
    }

    // Create assistant message locally if it doesn't exist
    if (chatResponse.assistantMessage) {
      // Check if message with this ID already exists
      let existingMessage = null;
      try {
        existingMessage = await database.get<ConversationMessage>('conversation_messages')
          .find(chatResponse.assistantMessage.id);
      } catch (error: any) {
        // Only swallow true "not found" errors, rethrow others
        const errorMessage = error?.message || String(error || '');
        if (!errorMessage.toLowerCase().includes('not found')) {
          throw error;
        }
        // Message doesn't exist, will create it below
      }
      
      if (!existingMessage) {
        // Create message with server ID - handle duplicate-ID race conditions
        try {
          const createdMessage = await database.write(async () => {
            return await database.get<ConversationMessage>('conversation_messages').create(message => {
              message._raw.id = chatResponse.assistantMessage.id;
              message.threadId = finalThreadId;
              message.userId = userId;
              message.role = 'assistant';
              message.content = chatResponse.assistantMessage.content;
              if (chatResponse.assistantMessage.metadata) {
                message.metadata = typeof chatResponse.assistantMessage.metadata === 'string' 
                  ? chatResponse.assistantMessage.metadata 
                  : JSON.stringify(chatResponse.assistantMessage.metadata);
              }
              message.status = 'synced'; // Already synced since it came from server
              message.createdAt = safeParseDate(chatResponse.assistantMessage.created_at) || new Date();
              message.updatedAt = safeParseDate(chatResponse.assistantMessage.updated_at) || new Date();
            });
          });
        } catch (createError: any) {
          // Handle duplicate-ID errors or unique constraint violations
          const errorMessage = createError?.message || String(createError || '');
          const isDuplicateError = 
            errorMessage.toLowerCase().includes('duplicate') ||
            errorMessage.toLowerCase().includes('unique constraint') ||
            errorMessage.toLowerCase().includes('already exists');
          
          if (isDuplicateError) {
            // Race condition: message was created by another operation, fetch and update it
            try {
              existingMessage = await database.get<ConversationMessage>('conversation_messages')
                .find(chatResponse.assistantMessage.id);
              
              // Mark existing message as synced and update timestamps
              if (existingMessage.status !== 'synced') {
                await conversationRepository.markMessageAsSynced(existingMessage.id, {
                  createdAt: safeParseDate(chatResponse.assistantMessage.created_at) || existingMessage.createdAt,
                  updatedAt: safeParseDate(chatResponse.assistantMessage.updated_at) || existingMessage.updatedAt,
                });
              }
            } catch (fetchError: any) {
              // If we can't fetch the existing message, rethrow the original create error
              throw createError;
            }
          } else {
            // Unexpected error, rethrow
            throw createError;
          }
        }
      } else {
        // Message already exists, ensure it's marked as synced
        if (existingMessage.status !== 'synced') {
          await conversationRepository.markMessageAsSynced(existingMessage.id, {
            createdAt: safeParseDate(chatResponse.assistantMessage.created_at) || existingMessage.createdAt,
            updatedAt: safeParseDate(chatResponse.assistantMessage.updated_at) || existingMessage.updatedAt,
          });
        }
      }
    }
  }

  async pullData() {
    const database = getDatabase();
    const lastSyncedAt = await AsyncStorage.getItem(LAST_SYNCED_AT_KEY);

    const serverTimeBeforePull = new Date().toISOString();

    try {
      // Fetch changes from the server since the last sync - PARALLELIZE for performance
      // All these calls are independent and can be made concurrently
      const [
        syncResponse,
        tasksResponse,
        goalsResponse,
        milestonesResult,
        milestoneStepsResult,
        threadsResult,
      ] = await Promise.allSettled([
        enhancedAPI.getEvents(2500, lastSyncedAt || undefined),
        enhancedAPI.getTasks(lastSyncedAt || undefined),
        enhancedAPI.getGoals(lastSyncedAt || undefined),
        enhancedAPI.getMilestones(lastSyncedAt || undefined).catch((msErr: any) => {
          console.warn('Pull: Failed to fetch milestones, continuing without them.', msErr);
          return { changed: [], deleted: [] };
        }),
        enhancedAPI.getMilestoneSteps(lastSyncedAt || undefined).catch((stepsErr: any) => {
          console.warn('Pull: Failed to fetch milestone steps, continuing without them.', stepsErr);
          return { changed: [], deleted: [] };
        }),
        conversationService.listThreads().catch((threadsErr: any) => {
          console.warn('Pull: Failed to fetch threads, continuing without them.', threadsErr);
          return [];
        }),
      ]);

      // Extract results from Promise.allSettled
      const syncResponseValue = syncResponse.status === 'fulfilled' ? syncResponse.value : { changed: [], deleted: [] };
      const tasksResponseValue = tasksResponse.status === 'fulfilled' ? tasksResponse.value : [];
      const goalsResponseValue = goalsResponse.status === 'fulfilled' ? goalsResponse.value : [];
      const milestonesResponse = milestonesResult.status === 'fulfilled' ? milestonesResult.value : { changed: [], deleted: [] };
      const milestoneStepsResponse = milestoneStepsResult.status === 'fulfilled' ? milestoneStepsResult.value : { changed: [], deleted: [] };
      const threadsResponse = threadsResult.status === 'fulfilled' ? threadsResult.value : [];

      const { changed: changedEvents, deleted: deletedEventIds } = syncResponseValue;
      
      // Handle tasks response - could be array (full sync) or object with changed/deleted (incremental sync)
      let changedTasks = [];
      let deletedTaskIds = [];
      if (Array.isArray(tasksResponseValue)) {
        // Full sync response
        changedTasks = tasksResponseValue;
      } else if (tasksResponseValue && typeof tasksResponseValue === 'object') {
        // Incremental sync response
        changedTasks = tasksResponseValue.changed || [];
        deletedTaskIds = tasksResponseValue.deleted || [];
      }
      
      // Handle goals response - could be array (full sync) or object with changed/deleted (incremental sync)
      let changedGoals = [];
      let deletedGoalIds = [];
      if (Array.isArray(goalsResponseValue)) {
        // Full sync response
        changedGoals = goalsResponseValue;
      } else if (goalsResponseValue && typeof goalsResponseValue === 'object') {
        // Incremental sync response
        changedGoals = goalsResponseValue.changed || [];
        deletedGoalIds = goalsResponseValue.deleted || [];
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

      // Handle threads response - convert to change format
      const changedThreads = Array.isArray(threadsResponse) ? threadsResponse : [];
      
      // Skip fetching thread messages during sync for performance
      // Messages are loaded on-demand when users open threads (AIChatScreen)
      // This significantly speeds up sync operations, especially during workflows like brain dump
      // Thread metadata (title, summary, etc.) is still synced above
      const changedMessages: any[] = [];
      // Note: Messages will be fetched on-demand when user opens a thread, not during sync

      const allChanges = [
        ...changedEvents,
        ...changedTasks,
        ...changedGoals,
        ...changedMilestones,
        ...changedMilestoneSteps,
        ...changedThreads,
        ...changedMessages,
      ];
      const allDeletedIds = [
        ...(deletedEventIds || []),
        ...deletedTaskIds,
        ...deletedGoalIds,
        ...deletedMilestoneIds,
        ...deletedMilestoneStepIds,
      ];

      if (allChanges.length === 0 && allDeletedIds.length === 0) {
        await AsyncStorage.setItem(LAST_SYNCED_AT_KEY, serverTimeBeforePull);
        return;
      }

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
          
          // Process task deletions
          if (deletedTaskIds && deletedTaskIds.length > 0) {
            const taskCollection = database.get<Task>('tasks');
            const recordsToDelete = await taskCollection.query(Q.where('id', Q.oneOf(deletedTaskIds))).fetch();
            for (const record of recordsToDelete) {
              await record.destroyPermanently();
            }
          }
          
          // Process goal deletions
          if (deletedGoalIds && deletedGoalIds.length > 0) {
            const goalCollection = database.get<Goal>('goals');
            const recordsToDelete = await goalCollection.query(Q.where('id', Q.oneOf(deletedGoalIds))).fetch();
            for (const record of recordsToDelete) {
              await record.destroyPermanently();
            }
          }

          // Process milestone deletions
          if (deletedMilestoneIds && deletedMilestoneIds.length > 0) {
            const milestoneCollection = database.get<Milestone>('milestones');
            const recordsToDelete = await milestoneCollection.query(Q.where('id', Q.oneOf(deletedMilestoneIds))).fetch();
            for (const record of recordsToDelete) {
              await record.destroyPermanently();
            }
          }

          // Process milestone step deletions
          if (deletedMilestoneStepIds && deletedMilestoneStepIds.length > 0) {
            const stepCollection = database.get<MilestoneStep>('milestone_steps');
            const recordsToDelete = await stepCollection.query(Q.where('id', Q.oneOf(deletedMilestoneStepIds))).fetch();
            for (const record of recordsToDelete) {
              await record.destroyPermanently();
            }
          }

          // Note: Thread deletions are handled via is_active flag, not hard deletes
          // Messages are cascade deleted when threads are deleted
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
          } else if (changeData.thread_id !== undefined && changeData.role !== undefined) {
            // This is a conversation message
            await this.processMessageChange(changeData, database);
          } else if (changeData.title !== undefined && (changeData.is_active !== undefined || changeData.is_pinned !== undefined)) {
            // This is a conversation thread (has title and thread-specific fields)
            await this.processThreadChange(changeData, database);
          } else {
            console.warn(`Pull: Unknown record type for change data:`, changeData);
          }
        }
      });

      // After a successful pull, save the server's timestamp
      await AsyncStorage.setItem(LAST_SYNCED_AT_KEY, serverTimeBeforePull);

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
      return;
    }

    if (this.isSyncing) {
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
    const syncStatuses = ['pending_create', 'pending_update', 'pending_delete', 'synced', 'sync_failed'];
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
    
    // First, try to find task by exact ID match
    const existingTasks = await taskCollection.query(Q.where('id', taskData.id)).fetch();
    let localTask = existingTasks.length > 0 ? existingTasks[0] : null;
    
    const localStatusInfo = localTask 
      ? this.extractLifecycleStatus(localTask.status as string)
      : null;
    const localLifecycleStatus = localStatusInfo?.lifecycleStatus ?? null;
    
    // Prefer server status if provided, otherwise preserve local lifecycle status, default to 'not_started'
    const lifecycleStatus = serverLifecycleStatus !== null
      ? serverLifecycleStatus
      : (localLifecycleStatus !== null ? localLifecycleStatus : 'not_started');
    
    // If no exact ID match, check for potential duplicate by title and content
    // This handles the case where a local task was created and synced, but the ID migration
    // hasn't completed yet, or there's a race condition between push and pull
    if (!localTask) {
      const allTasks = await taskCollection.query().fetch();
      // Look for a task with matching title and similar content that has pending_create status
      // This indicates it's the same task that was just created locally and is being synced
      const potentialDuplicate = allTasks.find(task => {
        const statusStr = task.status as string;
        // Check if task has pending_create status OR is a pure lifecycle status (was just synced)
        // Pure lifecycle statuses indicate the task was just pushed and is waiting for ID migration
        const hasPendingCreate = statusStr === 'pending_create' || 
                                 statusStr?.startsWith('pending_create:') ||
                                 statusStr === 'sync_failed_create' ||
                                 statusStr?.startsWith('sync_failed_create:');
        
        // Also check for pure lifecycle status (not_started, in_progress, completed)
        // These indicate the task was just synced but hasn't been migrated to server ID yet
        const isPureLifecycleStatus = statusStr === 'not_started' || 
                                      statusStr === 'in_progress' || 
                                      statusStr === 'completed';
        
        // Match by title (exact match)
        const titleMatch = task.title === taskData.title;
        
        // Also check if descriptions match (if both exist)
        const descriptionMatch = !taskData.description || !task.description || 
                                 task.description === taskData.description;
        
        // Match if it's a pending create OR a pure lifecycle status (recently synced)
        // AND the IDs don't match (local ID vs server ID)
        const idMismatch = task.id !== taskData.id;
        
        return idMismatch && (hasPendingCreate || isPureLifecycleStatus) && titleMatch && descriptionMatch;
      });
      
      if (potentialDuplicate) {
        // This is likely the same task - migrate it to use the server ID instead of creating a duplicate
        console.log(`Pull: Found potential duplicate task "${taskData.title}" with local ID ${potentialDuplicate.id}, migrating to server ID ${taskData.id}`);
        
        // Find any calendar events that reference the old task ID
        const calendarEvents = await database.get('calendar_events')
          .query(Q.where('task_id', potentialDuplicate.id))
          .fetch();
        
        // Migrate the task: create new task with server ID, update calendar events, delete old task
        await database.write(async () => {
          // Create new task with server ID and server data
          const newTask = await taskCollection.create((record: Task) => {
            record._raw.id = taskData.id;
            record.title = taskData.title;
            record.description = taskData.description;
            record.priority = taskData.priority;
            record.estimatedDurationMinutes = taskData.estimated_duration_minutes;
            if (parsedDueDate) {
              record.dueDate = parsedDueDate;
            }
            record.goalId = taskData.goal_id;
            record.isTodayFocus = taskData.is_today_focus;
            record.userId = taskData.user_id || '';
            record.status = lifecycleStatus;
            // Preserve original creation time from local task
            record.createdAt = potentialDuplicate.createdAt;
            record.updatedAt = new Date();
            // Preserve other fields from local task that might not be in server data
            record.autoScheduleEnabled = potentialDuplicate.autoScheduleEnabled;
            record.category = potentialDuplicate.category;
            record.location = potentialDuplicate.location;
            record.calendarEventId = potentialDuplicate.calendarEventId;
          });
          
          // Update all calendar events to point to new task ID
          for (const event of calendarEvents) {
            await event.update((e: any) => {
              e.taskId = taskData.id;
            });
          }
          
          // Delete old task record with local ID
          await potentialDuplicate.destroyPermanently();
        });
        
        // Return early since we've already processed this task
        return;
      }
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

  private async processThreadChange(threadData: any, database: Database) {
    const threadCollection = database.get<ConversationThread>('conversation_threads');
    const existing = await threadCollection.query(Q.where('id', threadData.id)).fetch();
    const local = existing.length > 0 ? existing[0] : null;

    const parsedCreatedAt = threadData.created_at ? safeParseDate(threadData.created_at) : undefined;
    const parsedUpdatedAt = threadData.updated_at ? safeParseDate(threadData.updated_at) : undefined;

    if (threadData.created_at && !parsedCreatedAt) {
      this.logger.error(
        `Pull: Failed to parse created_at for thread ${threadData.id}:`,
        threadData.created_at
      );
    }
    if (threadData.updated_at && !parsedUpdatedAt) {
      this.logger.error(
        `Pull: Failed to parse updated_at for thread ${threadData.id}:`,
        threadData.updated_at
      );
    }

    const userId = authService.getCurrentUser()?.id;
    if (!userId) {
      console.warn(`Pull: No user ID available, skipping thread ${threadData.id}`);
      return;
    }

    if (local) {
      await local.update((record: ConversationThread) => {
        record.title = threadData.title;
        record.summary = threadData.summary ?? null;
        record.isActive = threadData.is_active ?? true;
        record.isPinned = threadData.is_pinned ?? false;
        record.status = 'synced';
        if (parsedUpdatedAt) {
          record.updatedAt = parsedUpdatedAt;
        }
      });
    } else {
      await threadCollection.create((record: ConversationThread) => {
        record._raw.id = threadData.id;
        record.userId = userId;
        record.title = threadData.title;
        record.summary = threadData.summary ?? null;
        record.isActive = threadData.is_active ?? true;
        record.isPinned = threadData.is_pinned ?? false;
        record.status = 'synced';
        record.createdAt = parsedCreatedAt || new Date();
        record.updatedAt = parsedUpdatedAt || new Date();
      });
    }
  }

  private async processMessageChange(messageData: any, database: Database) {
    const messageCollection = database.get<ConversationMessage>('conversation_messages');
    const existing = await messageCollection.query(Q.where('id', messageData.id)).fetch();
    const local = existing.length > 0 ? existing[0] : null;

    const parsedCreatedAt = messageData.created_at ? safeParseDate(messageData.created_at) : undefined;
    const parsedUpdatedAt = messageData.updated_at ? safeParseDate(messageData.updated_at) : undefined;

    if (messageData.created_at && !parsedCreatedAt) {
      this.logger.error(
        `Pull: Failed to parse created_at for message ${messageData.id}:`,
        messageData.created_at
      );
    }
    if (messageData.updated_at && !parsedUpdatedAt) {
      this.logger.error(
        `Pull: Failed to parse updated_at for message ${messageData.id}:`,
        messageData.updated_at
      );
    }

    const userId = authService.getCurrentUser()?.id;
    if (!userId) {
      console.warn(`Pull: No user ID available, skipping message ${messageData.id}`);
      return;
    }

    if (local) {
      await local.update((record: ConversationMessage) => {
        record.content = messageData.content;
        record.role = messageData.role;
        if (messageData.metadata) {
          record.metadata = typeof messageData.metadata === 'string' 
            ? messageData.metadata 
            : JSON.stringify(messageData.metadata);
        }
        record.status = 'synced';
        if (parsedUpdatedAt) {
          record.updatedAt = parsedUpdatedAt;
        }
      });
    } else {
      await messageCollection.create((record: ConversationMessage) => {
        record._raw.id = messageData.id;
        record.threadId = messageData.thread_id;
        record.userId = userId;
        record.content = messageData.content;
        record.role = messageData.role;
        if (messageData.metadata) {
          record.metadata = typeof messageData.metadata === 'string' 
            ? messageData.metadata 
            : JSON.stringify(messageData.metadata);
        }
        record.status = 'synced';
        record.createdAt = parsedCreatedAt || new Date();
        record.updatedAt = parsedUpdatedAt || new Date();
      });
    }
  }
}

export const syncService = new SyncService();

