export interface GoalStep {
  text: string;
}

export interface GoalMilestone {
  title: string;
  steps: GoalStep[];
}

export interface GoalData {
  title: string;
  description: string;
  dueDate?: string;
  category?: string;
  milestones: GoalMilestone[];
}
