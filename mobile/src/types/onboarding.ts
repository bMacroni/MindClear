export interface OnboardingState {
  isCompleted: boolean;
  lastCompletedAt?: Date;
  currentStep?: 'welcome' | 'waiting' | 'completed';
  firstSession?: boolean;
}

export interface QuickAction {
  id: string;
  label: string;
  prefillText: string;
  icon: string;
}

export interface OnboardingMessage {
  id: string;
  text: string;
  type: 'welcome' | 'followup' | 'example';
  timestamp: Date;
} 