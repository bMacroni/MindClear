export type RootStackParamList = {
  Login: undefined;
  Signup: undefined;
  Main: undefined;
  GoalForm: { goalId?: string; category?: string } | undefined;
  GoalDetail: { goalId: string };
  TaskForm: { taskId?: string } | undefined;
  TaskDetail: { taskId: string };
  Notifications: undefined;
  AnalyticsDashboard: undefined;
};

export type MainTabParamList = {
  BrainDump: undefined;
  AIChat: { initialMessage?: string; threadId?: string; taskTitle?: string } | undefined;
  Goals: undefined;
  Tasks: undefined;
  Calendar: undefined;
  Profile: undefined;
};
