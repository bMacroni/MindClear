import AsyncStorage from '@react-native-async-storage/async-storage';
import { OnboardingState } from '../types/onboarding';

const ONBOARDING_KEY = 'foci_onboarding_state';
const FIRST_SESSION_COMPLETED_KEY = 'firstSessionCompleted';

export class OnboardingService {
  static async getOnboardingState(): Promise<OnboardingState> {
    try {
      const stored = await AsyncStorage.getItem(ONBOARDING_KEY);
      const firstSession = await this.isFirstSession();
      const state = stored ? JSON.parse(stored) : { isCompleted: false };
      return {
        ...state,
        firstSession,
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
    await AsyncStorage.removeItem(FIRST_SESSION_COMPLETED_KEY);
  }

  /**
   * Checks if this is the user's first session
   * Returns true if FIRST_SESSION_COMPLETED_KEY doesn't exist in AsyncStorage
   */
  static async isFirstSession(): Promise<boolean> {
    try {
      const completedTimestamp = await AsyncStorage.getItem(FIRST_SESSION_COMPLETED_KEY);
      return completedTimestamp === null;
    } catch {
      // Default to false (safer fallback - treat as returning user)
      return false;
    }
  }

  /**
   * Marks the first session as complete
   * Stores an ISO timestamp when the first session is completed
   */
  static async markFirstSessionComplete(): Promise<void> {
    try {
      const timestamp = new Date().toISOString();
      await AsyncStorage.setItem(FIRST_SESSION_COMPLETED_KEY, timestamp);
    } catch (error) {
      console.warn('Failed to mark first session complete:', error);
    }
  }

  /**
   * Gets the current firstSession flag
   * Returns true if key is missing (first session), false if key exists with a timestamp (not first session)
   */
  static async getFirstSessionFlag(): Promise<boolean> {
    try {
      const completedTimestamp = await AsyncStorage.getItem(FIRST_SESSION_COMPLETED_KEY);
      // Missing key means first session (true)
      // Stored timestamp means not first session (false)
      return completedTimestamp === null;
    } catch {
      // Default to true (treat as first session if we can't read)
      return true;
    }
  }
} 