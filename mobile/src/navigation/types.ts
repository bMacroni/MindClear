export type RootStackParamList = {
  Login: { email?: string } | undefined;
  Signup: undefined;
  Main: undefined;
  BetaThankYou: undefined;
  GoalForm: { goalId?: string; category?: string } | undefined;
  GoalDetail: { goalId: string };
  TaskForm: { taskId?: string } | undefined;
  TaskDetail: { taskId: string };
  Notifications: undefined;
  AnalyticsDashboard: undefined;
  ForgotPassword: undefined;
  ResetPassword: { access_token?: string } | undefined;
  EmailConfirmation: { 
    code?: string;
    error?: string;
    error_description?: string;
  } | undefined;
};

export type MainTabParamList = {
  BrainDump: undefined;
  AIChat: { initialMessage?: string; threadId?: string; taskTitle?: string } | undefined;
  Goals: undefined;
  Tasks: undefined;
  Profile: undefined;
};
