import {getDatabase} from '../db';
import {Q} from '@nozbe/watermelondb';
import {of, combineLatest, Observable} from 'rxjs';
import {map} from 'rxjs/operators';
import Goal from '../db/models/Goal';
import Milestone from '../db/models/Milestone';
import MilestoneStep from '../db/models/MilestoneStep';
import Task from '../db/models/Task';
import {authService} from '../services/auth';

// Custom error classes for domain-specific errors
export class NotFoundError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'NotFoundError';
  }
}

export class AuthorizationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'AuthorizationError';
  }
}

export class GoalRepository {
  private getCurrentUserId(): string {
    const user = authService.getCurrentUser();
    if (!user?.id) {
      throw new Error('User not authenticated');
    }
    return user.id;
  }

  async getAllGoals(): Promise<Goal[]> {
    const database = getDatabase();
    const userId = this.getCurrentUserId();
    return await database.get<Goal>('goals')
      .query(
        Q.where('user_id', userId),
        Q.where('status', Q.notEq('pending_delete'))
      )
      .fetch();
  }

  async getGoalById(id: string): Promise<Goal | null> {
    const database = getDatabase();
    const userId = this.getCurrentUserId();
    
    try {
      const goal = await database.get<Goal>('goals').find(id);
      
      // Verify ownership - if goal doesn't exist or doesn't belong to user, return null
      if (!goal || goal.userId !== userId) {
        return null;
      }
      
      return goal;
    } catch {
      return null;
    }
  }

  async createGoal(data: {
    title: string;
    description?: string;
    targetCompletionDate?: Date;
    progressPercentage?: number;
    category?: string;
    isActive?: boolean;
  }): Promise<Goal> {
    const database = getDatabase();
    const userId = this.getCurrentUserId();
    
    return await database.write(async () => {
      return await database.get<Goal>('goals').create(goal => {
        goal.title = data.title;
        goal.description = data.description;
        goal.targetCompletionDate = data.targetCompletionDate;
        goal.progressPercentage = data.progressPercentage || 0;
        goal.category = data.category;
        goal.isActive = data.isActive !== false; // Default to true
        goal.userId = userId;
        goal.status = 'pending_create';
        goal.createdAt = new Date();
        goal.updatedAt = new Date();
      });
    });
  }

  async updateGoal(id: string, data: {
    title?: string;
    description?: string;
    targetCompletionDate?: Date;
    progressPercentage?: number;
    category?: string;
    isActive?: boolean;
  }): Promise<Goal> {
    const database = getDatabase();
    const goal = await this.getGoalById(id);
    if (!goal) throw new Error('Goal not found');
    
    return await database.write(async () => {
      return await goal.update(g => {
        if (data.title !== undefined) g.title = data.title;
        if (data.description !== undefined) g.description = data.description;
        if (data.targetCompletionDate !== undefined) g.targetCompletionDate = data.targetCompletionDate;
        if (data.progressPercentage !== undefined) g.progressPercentage = data.progressPercentage;
        if (data.category !== undefined) g.category = data.category;
        if (data.isActive !== undefined) g.isActive = data.isActive;
        g.status = 'pending_update';
        g.updatedAt = new Date();
      });
    });
  }

  async deleteGoal(id: string): Promise<void> {
    const database = getDatabase();
    const goal = await this.getGoalById(id);
    if (!goal) return;
    
    await database.write(async () => {
      await goal.update(g => {
        g.status = 'pending_delete';
        g.updatedAt = new Date();
      });
    });
  }

  // Milestone management methods
  async createMilestone(goalId: string, data: {
    title: string;
    description?: string;
    order: number;
  }): Promise<Milestone> {
    const database = getDatabase();
    
    // Verify ownership - ensure the goal belongs to the current user
    const goal = await this.getGoalById(goalId);
    if (!goal) {
      throw new AuthorizationError('You do not have permission to create a milestone for this goal');
    }
    
    return await database.write(async () => {
      return await database.get<Milestone>('milestones').create(milestone => {
        milestone.goalId = goalId;
        milestone.title = data.title;
        milestone.description = data.description;
        milestone.completed = false;
        milestone.order = data.order;
        milestone.status = 'pending_create';
        milestone.createdAt = new Date();
        milestone.updatedAt = new Date();
      });
    });
  }

  async updateMilestone(id: string, data: {
    title?: string;
    description?: string;
    completed?: boolean;
    order?: number;
  }): Promise<Milestone> {
    const database = getDatabase();
    
    // Verify ownership using getMilestoneById which includes ownership checks
    const milestone = await this.getMilestoneById(id);
    if (!milestone) {
      throw new NotFoundError(`Milestone with id ${id} not found`);
    }
    
    return await database.write(async () => {
      return await milestone.update(m => {
        if (data.title !== undefined) m.title = data.title;
        if (data.description !== undefined) m.description = data.description;
        if (data.completed !== undefined) m.completed = data.completed;
        if (data.order !== undefined) m.order = data.order;
        m.status = 'pending_update';
        m.updatedAt = new Date();
      });
    });
  }

  async getMilestoneById(id: string): Promise<Milestone | null> {
    const database = getDatabase();
    const userId = this.getCurrentUserId();
    
    try {
      const milestone = await database.get<Milestone>('milestones').find(id);
      
      // Verify ownership by loading the milestone's goal
      const goal = await milestone.goal.fetch();
      
      // Check if the authenticated user owns the goal
      if (goal.userId !== userId) {
        return null;
      }
      
      return milestone;
    } catch (error) {
      // Handle WatermelonDB "not found" errors
      if (error instanceof Error && error.message.includes('not found')) {
        return null;
      }
      
      // Re-throw other errors (auth, DB connection, etc.)
      throw error;
    }
  }

  async getMilestoneStepById(id: string): Promise<MilestoneStep | null> {
    const database = getDatabase();
    const userId = this.getCurrentUserId();
    
    try {
      const step = await database.get<MilestoneStep>('milestone_steps').find(id);
      
      // Verify ownership by loading the step's milestone and its goal
      const milestone = await step.milestone.fetch();
      const goal = await milestone.goal.fetch();
      
      // Check if the authenticated user owns the goal
      if (goal.userId !== userId) {
        return null;
      }
      
      return step;
    } catch (error) {
      // Handle WatermelonDB "not found" errors
      if (error instanceof Error && error.message.includes('not found')) {
        return null;
      }
      
      // Re-throw other errors (auth, DB connection, etc.)
      throw error;
    }
  }

  async deleteMilestone(id: string): Promise<void> {
    const database = getDatabase();
    
    try {
      // Find the milestone with proper error handling
      const milestone = await database.get<Milestone>('milestones').find(id);
      
      // Verify ownership by loading the milestone's goal
      const goal = await milestone.goal.fetch();
      
      // Check if the authenticated user owns the goal
      const currentUserId = this.getCurrentUserId();
      if (goal.userId !== currentUserId) {
        throw new AuthorizationError('You do not have permission to delete this milestone');
      }
      
      // Perform the database write operation
      await database.write(async () => {
        await milestone.update(m => {
          m.status = 'pending_delete';
          m.updatedAt = new Date();
        });
      });
    } catch (error) {
      // Handle WatermelonDB "not found" errors - return gracefully (idempotent)
      if (error instanceof Error && error.message.includes('not found')) {
        return; // No-op for non-existent milestones
      }
      
      // Re-throw custom domain errors
      if (error instanceof NotFoundError || error instanceof AuthorizationError) {
        throw error;
      }
      
      // Convert other errors to domain errors
      if (error instanceof Error) {
        throw new Error(`Failed to delete milestone: ${error.message}`);
      }
      
      // Handle unknown error types
      throw new Error('An unexpected error occurred while deleting the milestone');
    }
  }

  async createMilestoneStep(milestoneId: string, data: {
    text: string;
    order: number;
  }): Promise<MilestoneStep> {
    const database = getDatabase();
    
    // Verify ownership - ensure the milestone belongs to a goal owned by the current user
    const milestone = await this.getMilestoneById(milestoneId);
    if (!milestone) {
      throw new AuthorizationError('You do not have permission to create a step for this milestone');
    }
    
    return await database.write(async () => {
      return await database.get<MilestoneStep>('milestone_steps').create(step => {
        step.milestoneId = milestoneId;
        step.text = data.text;
        step.completed = false;
        step.order = data.order;
        step.status = 'pending_create';
        step.createdAt = new Date();
        step.updatedAt = new Date();
      });
    });
  }

  async updateMilestoneStep(id: string, data: {
    text?: string;
    completed?: boolean;
    order?: number;
  }): Promise<MilestoneStep> {
    const database = getDatabase();
    
    try {
      // Find the milestone step with proper error handling
      const step = await database.get<MilestoneStep>('milestone_steps').find(id);
      
      // Verify ownership by loading the step's milestone and its goal
      const milestone = await step.milestone.fetch();
      const goal = await milestone.goal.fetch();
      
      // Check if the authenticated user owns the goal
      const currentUserId = this.getCurrentUserId();
      if (goal.userId !== currentUserId) {
        throw new AuthorizationError('You do not have permission to update this milestone step');
      }
      
      // Perform the database write operation
      return await database.write(async () => {
        return await step.update(s => {
          if (data.text !== undefined) s.text = data.text;
          if (data.completed !== undefined) s.completed = data.completed;
          if (data.order !== undefined) s.order = data.order;
          s.status = 'pending_update';
          s.updatedAt = new Date();
        });
      });
    } catch (error) {
      // Handle WatermelonDB "not found" errors
      if (error instanceof Error && error.message.includes('not found')) {
        throw new NotFoundError(`Milestone step with id ${id} not found`);
      }
      
      // Re-throw custom domain errors
      if (error instanceof NotFoundError || error instanceof AuthorizationError) {
        throw error;
      }
      
      // Convert other errors to domain errors
      if (error instanceof Error) {
        throw new Error(`Failed to update milestone step: ${error.message}`);
      }
      
      throw new Error('Failed to update milestone step: Unknown error');
    }
  }

  async deleteMilestoneStep(id: string): Promise<void> {
    const database = getDatabase();
    
    try {
      // Find the step with proper error handling
      const step = await database.get<MilestoneStep>('milestone_steps').find(id);
      
      // Verify ownership by loading the step's milestone and its goal
      const milestone = await step.milestone.fetch();
      const goal = await milestone.goal.fetch();
      
      // Check if the authenticated user owns the goal
      const currentUserId = this.getCurrentUserId();
      if (goal.userId !== currentUserId) {
        throw new AuthorizationError('You do not have permission to delete this milestone step');
      }
      
      // Perform the database write operation
      await database.write(async () => {
        await step.update(s => {
          s.status = 'pending_delete';
          s.updatedAt = new Date();
        });
      });
    } catch (error) {
      // Handle WatermelonDB "not found" errors - return gracefully (idempotent)
      if (error instanceof Error && error.message.includes('not found')) {
        return; // No-op for non-existent milestone steps
      }
      
      // Re-throw custom domain errors
      if (error instanceof NotFoundError || error instanceof AuthorizationError) {
        throw error;
      }
      
      // Convert other errors to domain errors
      if (error instanceof Error) {
        throw new Error(`Failed to delete milestone step: ${error.message}`);
      }
      
      // Handle unknown error types
      throw new Error('An unexpected error occurred while deleting the milestone step');
    }
  }

  /**
   * Migrates a locally-created milestone to use the server-assigned ID.
   * Re-creates the milestone with the serverId and re-points all child steps
   * to the new milestone ID, then deletes the old milestone record.
   */
  async updateMilestoneServerId(localId: string, serverId: string, serverGoalId?: string): Promise<void> {
    const database = getDatabase();
    // Find the local milestone; if it doesn't exist, nothing to migrate
    let localMilestone: Milestone | null = null;
    try {
      localMilestone = await database.get<Milestone>('milestones').find(localId);
    } catch {
      return;
    }

    // Gather child steps tied to the local milestone
    let childSteps: MilestoneStep[] = [];
    try {
      const stepCollection = database.get<MilestoneStep>('milestone_steps');
      childSteps = await stepCollection.query(
        Q.where('milestone_id', localId)
      ).fetch();
    } catch (error) {
      throw new Error(`Failed to fetch milestone steps: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }

    try {
      await database.write(async () => {
        // Create a new milestone record with the server-assigned ID
        const newMilestone = await database.get<Milestone>('milestones').create(m => {
          m._raw.id = serverId;
          m._raw._status = 'synced';
          m._raw._changed = '';
          m.goalId = serverGoalId || localMilestone.goalId;
          m.title = localMilestone.title;
          m.description = localMilestone.description;
          m.completed = localMilestone.completed;
          m.order = localMilestone.order;
          m.status = 'synced';
          m.createdAt = localMilestone.createdAt;
          m.updatedAt = localMilestone.updatedAt;
        });

        // Re-point all child steps to the new milestone ID
        for (const step of childSteps) {
          await step.update(s => {
            s.milestoneId = newMilestone.id;
          });
        }

        // Remove the old milestone record
        await localMilestone.destroyPermanently();
      });
    } catch (error) {
      throw new Error(`Failed to migrate milestone server ID: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Migrates a locally-created goal to use the server-assigned ID.
   * Creates a new goal with the server ID, re-points all child milestones and tasks
   * to the new goal ID, then deletes the old goal record.
   */
  async updateGoalServerId(localId: string, serverId: string): Promise<void> {
    const database = getDatabase();
    // Find the local goal with ownership verification; if it doesn't exist, nothing to migrate
    let localGoal: Goal | null = null;
    try {
      localGoal = await database.get<Goal>('goals').find(localId);
    } catch {
      return;
    }

    // Gather child milestones and tasks tied to the local goal
    const milestoneCollection = database.get<Milestone>('milestones');
    const taskCollection = database.get<Task>('tasks');
    
    let childMilestones: Milestone[] = [];
    try {
      childMilestones = await milestoneCollection.query(
        Q.where('goal_id', localId)
      ).fetch();
    } catch (error) {
      throw new Error(`Failed to fetch child milestones: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
    
    let childTasks: Task[] = [];
    try {
      childTasks = await taskCollection.query(
        Q.where('goal_id', localId)
      ).fetch();
    } catch (error) {
      throw new Error(`Failed to fetch child tasks: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }

    try {
      await database.write(async () => {
        // Create a new goal record with the server-assigned ID
        const newGoal = await database.get<Goal>('goals').create(g => {
          g._raw.id = serverId;
          g._raw._status = 'synced';
          g._raw._changed = '';
          g.title = localGoal.title;
          g.description = localGoal.description;
          g.targetCompletionDate = localGoal.targetCompletionDate;
          g.progressPercentage = localGoal.progressPercentage;
          g.category = localGoal.category;
          g.isActive = localGoal.isActive;
          g.userId = localGoal.userId;
          g.status = 'synced';
          g.createdAt = localGoal.createdAt;
          g.updatedAt = localGoal.updatedAt;
        });

        // Re-point all child milestones to the new goal ID
        for (const ms of childMilestones) {
          await ms.update(m => {
            m.goalId = newGoal.id;
          });
        }

        // Re-point all child tasks to the new goal ID
        for (const task of childTasks) {
          await task.update(t => {
            t.goalId = newGoal.id;
          });
        }

        // Remove the old goal record
        await localGoal.destroyPermanently();
      });
    } catch (error) {
      throw new Error(`Failed to migrate goal server ID: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  // Observable query helpers for use with withObservables
  observeAllGoals() {
    const database = getDatabase();
    const userId = this.getCurrentUserId();
    return database.get<Goal>('goals')
      .query(
        Q.where('user_id', userId),
        Q.where('status', Q.notEq('pending_delete'))
      )
      .observe();
  }

  observeGoalById(id: string) {
    const database = getDatabase();
    const userId = this.getCurrentUserId();
    
    // Use query with both id and user_id to ensure ownership
    return database.get<Goal>('goals')
      .query(
        Q.where('id', id),
        Q.where('user_id', userId),
        Q.where('status', Q.notEq('pending_delete'))
      )
      .observe();
  }

  observeMilestonesByGoal(goalId: string): Observable<Milestone[]> {
    const database = getDatabase();
    const userId = this.getCurrentUserId();
    
    // Create observables for goals and milestones
    const goalObservable = database.get<Goal>('goals')
      .query(
        Q.where('id', goalId),
        Q.where('user_id', userId),
        Q.where('status', Q.notEq('pending_delete'))
      )
      .observe();
    
    const milestonesObservable = database.get<Milestone>('milestones')
      .query(
        Q.where('goal_id', goalId),
        Q.where('status', Q.notEq('pending_delete'))
      )
      .observe();
    
    // Use RxJS combineLatest to ensure both observables emit before processing
    // This eliminates the race condition and ensures milestones are only returned
    // if the goal exists and belongs to the user
    return combineLatest([goalObservable, milestonesObservable]).pipe(
      map(([goals, milestones]) => goals.length > 0 ? milestones : [])
    );
  }

  observeMilestoneStepsByMilestone(milestoneId: string) {
    const database = getDatabase();
    return database.get<MilestoneStep>('milestone_steps')
      .query(
        Q.where('milestone_id', milestoneId),
        Q.where('status', Q.notEq('pending_delete'))
      )
      .observe();
  }

  observeActiveGoals() {
    const database = getDatabase();
    try {
      const userId = this.getCurrentUserId();
      return database.get<Goal>('goals')
        .query(
          Q.where('user_id', userId),
          Q.where('is_active', true),
          Q.where('status', Q.notEq('pending_delete'))
        )
        .observe();
    } catch (error) {
      console.error('Error retrieving user ID in observeActiveGoals:', error);
      return of([]);
    }
  }
}

export const goalRepository = new GoalRepository();
