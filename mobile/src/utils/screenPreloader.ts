import { preloadScreens } from './lazyLoading';

// Critical screens that should be preloaded for better UX
const criticalScreens = [
  () => import('../screens/auth/LoginScreen'),
  () => import('../screens/tasks/TasksScreen'),
  () => import('../screens/goals/GoalsScreen'),
];

// Secondary screens that can be preloaded after critical ones
const secondaryScreens = [
  () => import('../screens/ai/AIChatScreen'),
  () => import('../screens/calendar/CalendarScreen'),
  () => import('../screens/profile/ProfileScreen'),
];

// Brain dump screens (loaded on demand)
const brainDumpScreens = [
  () => import('../screens/brain/BrainDumpEntryScreen'),
  () => import('../screens/brain/BrainDumpInputScreen'),
  () => import('../screens/brain/BrainDumpRefinementScreen'),
];

// Form screens (loaded on demand)
const formScreens = [
  () => import('../screens/goals/GoalFormScreen'),
  () => import('../screens/tasks/TaskFormScreen'),
];

/**
 * Preload critical screens immediately after app initialization
 */
export function preloadCriticalScreens(): Promise<void> {
  return preloadScreens(criticalScreens).then(() => {
    console.log('✅ Critical screens preloaded');
  }).catch(error => {
    console.warn('⚠️ Failed to preload critical screens:', error);
  });
}

/**
 * Preload secondary screens after a delay
 */
export function preloadSecondaryScreens(): Promise<void> {
  return new Promise((resolve) => {
    // Wait 2 seconds after app start to preload secondary screens
    setTimeout(() => {
      preloadScreens(secondaryScreens).then(() => {
        console.log('✅ Secondary screens preloaded');
        resolve();
      }).catch(error => {
        console.warn('⚠️ Failed to preload secondary screens:', error);
        resolve();
      });
    }, 2000);
  });
}

/**
 * Preload brain dump screens when user navigates to brain dump tab
 */
export function preloadBrainDumpScreens(): Promise<void> {
  return preloadScreens(brainDumpScreens).then(() => {
    console.log('✅ Brain dump screens preloaded');
  }).catch(error => {
    console.warn('⚠️ Failed to preload brain dump screens:', error);
  });
}

/**
 * Preload form screens when user is likely to create content
 */
export function preloadFormScreens(): Promise<void> {
  return preloadScreens(formScreens).then(() => {
    console.log('✅ Form screens preloaded');
  }).catch(error => {
    console.warn('⚠️ Failed to preload form screens:', error);
  });
}

/**
 * Initialize all preloading strategies
 */
export function initializeScreenPreloading(): void {
  // Preload critical screens immediately
  preloadCriticalScreens();
  
  // Preload secondary screens after delay
  preloadSecondaryScreens();
}
