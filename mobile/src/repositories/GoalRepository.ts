import {getDatabase} from '../db';
import {Q} from '@nozbe/watermelondb';
import {of} from 'rxjs';
import Goal from '../db/models/Goal';
import Milestone from '../db/models/Milestone';
import MilestoneStep from '../db/models/MilestoneStep';
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
    const milestone = await database.get<Milestone>('milestones').find(id);
    
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
      // Handle WatermelonDB "not found" errors
      if (error instanceof Error && error.message.includes('not found')) {
        throw new NotFoundError(`Milestone with id ${id} not found`);
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
        throw new Error(`Failed to delete milestone step: ${error.message}`);
      }
      
      // Handle unknown error types
      throw new Error('An unexpected error occurred while deleting the milestone step');
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

  observeMilestonesByGoal(goalId: string) {
    const database = getDatabase();
    const userId = this.getCurrentUserId();
    
    // Create a custom observable that ensures security
    // We'll use a combination approach: observe goals first, then milestones
    const goalObservable = database.get<Goal>('goals')
      .query(
        Q.where('id', goalId),
        Q.where('user_id', userId),
        Q.where('status', Q.notEq('pending_delete'))
      )
      .observe();
    
    // Create milestones observable
    const milestonesObservable = database.get<Milestone>('milestones')
      .query(
        Q.where('goal_id', goalId),
        Q.where('status', Q.notEq('pending_delete'))
      )
      .observe();
    
    // Return a custom observable that combines both
    // This ensures milestones are only returned if the goal exists and belongs to the user
    return {
      subscribe: (observer: any) => {
        let goalExists = false;
        
        const goalSubscription = goalObservable.subscribe({
          next: (goals) => {
            goalExists = goals.length > 0;
            if (!goalExists) {
              // Goal doesn't exist or doesn't belong to user, emit empty array
              observer.next([]);
            }
          },
          error: observer.error,
          complete: observer.complete
        });
        
        const milestonesSubscription = milestonesObservable.subscribe({
          next: (milestones) => {
            if (goalExists) {
              observer.next(milestones);
            }
          },
          error: observer.error,
          complete: observer.complete
        });
        
        return () => {
          goalSubscription.unsubscribe();
          milestonesSubscription.unsubscribe();
        };
      }
    };
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
