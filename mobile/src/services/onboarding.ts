import AsyncStorage from '@react-native-async-storage/async-storage';
import { OnboardingState } from '../types/onboarding';

const ONBOARDING_KEY = 'foci_onboarding_state';
const FIRST_SESSION_KEY = 'firstSession';

export class OnboardingService {
  static async getOnboardingState(): Promise<OnboardingState> {
    try {
      const stored = await AsyncStorage.getItem(ONBOARDING_KEY);
      const firstSessionFlag = await this.getFirstSessionFlag();
      const state = stored ? JSON.parse(stored) : { isCompleted: false };
      return {
        ...state,
        firstSession: firstSessionFlag ?? undefined,
      };
    } catch {
      return { isCompleted: false };
    }
  }

  static async setOnboardingCompleted(): Promise<void> {
    const state: OnboardingState = {
      isCompleted: true,
      lastCompletedAt: new Date(),
      currentStep: 'completed'
    };
    await AsyncStorage.setItem(ONBOARDING_KEY, JSON.stringify(state));
    // Also mark first session as complete when onboarding is completed
    await this.markFirstSessionComplete();
  }

  static async resetOnboarding(): Promise<void> {
    await AsyncStorage.removeItem(ONBOARDING_KEY);
    await AsyncStorage.removeItem(FIRST_SESSION_KEY);
  }

  /**
   * Checks if this is the user's first session
   * Returns true if firstSession key doesn't exist in AsyncStorage
   */
  static async isFirstSession(): Promise<boolean> {
    try {
      const firstSession = await AsyncStorage.getItem(FIRST_SESSION_KEY);
      return firstSession === null;
    } catch {
      // Default to false (safer fallback - treat as returning user)
      return false;
    }
  }

  /**
   * Marks the first session as complete
   * Sets firstSession flag to 'false' in AsyncStorage
   */
  static async markFirstSessionComplete(): Promise<void> {
    try {
      await AsyncStorage.setItem(FIRST_SESSION_KEY, 'false');
    } catch (error) {
      console.warn('Failed to mark first session complete:', error);
    }
  }

  /**
   * Gets the current firstSession flag
   * Returns true if 'true', false if 'false', null if not set
   */
  static async getFirstSessionFlag(): Promise<boolean | null> {
    try {
      const firstSession = await AsyncStorage.getItem(FIRST_SESSION_KEY);
      if (firstSession === null) {
        return null;
      }
      return firstSession === 'true';
    } catch {
      return null;
    }
  }
} 