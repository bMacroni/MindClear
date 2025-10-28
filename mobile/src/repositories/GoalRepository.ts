import {getDatabase} from '../db';
import {Q} from '@nozbe/watermelondb';
import Goal from '../db/models/Goal';
import Milestone from '../db/models/Milestone';
import MilestoneStep from '../db/models/MilestoneStep';
import {authService} from '../services/auth';

export class GoalRepository {
  private getCurrentUserId(): string {
    const user = authService.getCurrentUser();
    if (!user?.uid) {
      throw new Error('User not authenticated');
    }
    return user.uid;
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
    try {
      return await database.get<Goal>('goals').find(id);
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
    const milestone = await database.get<Milestone>('milestones').find(id);
    
    await database.write(async () => {
      await milestone.update(m => {
        m.status = 'pending_delete';
        m.updatedAt = new Date();
      });
    });
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
    const step = await database.get<MilestoneStep>('milestone_steps').find(id);
    
    return await database.write(async () => {
      return await step.update(s => {
        if (data.text !== undefined) s.text = data.text;
        if (data.completed !== undefined) s.completed = data.completed;
        if (data.order !== undefined) s.order = data.order;
        s.status = 'pending_update';
        s.updatedAt = new Date();
      });
    });
  }

  async deleteMilestoneStep(id: string): Promise<void> {
    const database = getDatabase();
    const step = await database.get<MilestoneStep>('milestone_steps').find(id);
    
    await database.write(async () => {
      await step.update(s => {
        s.status = 'pending_delete';
        s.updatedAt = new Date();
      });
    });
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
    return database.get<Goal>('goals').findAndObserve(id);
  }

  observeMilestonesByGoal(goalId: string) {
    const database = getDatabase();
    return database.get<Milestone>('milestones')
      .query(
        Q.where('goal_id', goalId),
        Q.where('status', Q.notEq('pending_delete'))
      )
      .observe();
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
    const userId = this.getCurrentUserId();
    return database.get<Goal>('goals')
      .query(
        Q.where('user_id', userId),
        Q.where('is_active', true),
        Q.where('status', Q.notEq('pending_delete'))
      )
      .observe();
  }
}

export const goalRepository = new GoalRepository();
