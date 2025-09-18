import React, { Suspense, ComponentType, lazy } from 'react';
import { View, ActivityIndicator } from 'react-native';
import { colors } from '../themes/colors';

// Loading component for lazy-loaded screens
const LoadingScreen = () => (
  <View style={{ 
    flex: 1, 
    justifyContent: 'center', 
    alignItems: 'center', 
    backgroundColor: colors.background.primary 
  }}>
    <ActivityIndicator size="large" color={colors.primary} />
  </View>
);

// Error boundary for lazy loading
class LazyLoadingErrorBoundary extends React.Component<
  { children: React.ReactNode; fallback?: React.ComponentType },
  { hasError: boolean }
> {
  constructor(props: any) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError(error: any) {
    return { hasError: true };
  }

  componentDidCatch(error: any, errorInfo: any) {
    console.error('Lazy loading error:', error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      const FallbackComponent = this.props.fallback;
      return FallbackComponent ? <FallbackComponent /> : <LoadingScreen />;
    }

    return this.props.children;
  }
}

// Robust lazy loading function that handles errors gracefully
export function createRobustLazyScreen<P extends object>(
  importFn: () => Promise<{ default: ComponentType<P> }>,
  fallback?: React.ComponentType
) {
  const LazyComponent = lazy(importFn);
  
  return function RobustLazyScreen(props: P) {
    const FallbackComponent = fallback;
    
    return (
      <LazyLoadingErrorBoundary fallback={FallbackComponent}>
        <Suspense fallback={FallbackComponent ? <FallbackComponent /> : <LoadingScreen />}>
          <LazyComponent {...props} />
        </Suspense>
      </LazyLoadingErrorBoundary>
    );
  };
}

// Utility for creating lazy components with retry logic
export function createLazyComponentWithRetry<P extends object>(
  importFn: () => Promise<{ default: ComponentType<P> }>,
  maxRetries: number = 3,
  fallback?: React.ComponentType
) {
  let retryCount = 0;
  
  const retryImport = async (): Promise<{ default: ComponentType<P> }> => {
    try {
      return await importFn();
    } catch (error) {
      if (retryCount < maxRetries) {
        retryCount++;
        console.warn(`Lazy loading retry ${retryCount}/${maxRetries} for component`);
        // Wait a bit before retrying
        await new Promise(resolve => setTimeout(resolve, 1000 * retryCount));
        return retryImport();
      }
      throw error;
    }
  };
  
  return createRobustLazyScreen(retryImport, fallback);
}

// Preload function with error handling
export function preloadScreen(importFn: () => Promise<any>): Promise<void> {
  return importFn().catch(error => {
    console.warn('Failed to preload screen:', error);
    // Don't throw, just log the warning
  });
}

// Batch preload function with error handling
export function preloadScreens(importFns: Array<() => Promise<any>>): Promise<void[]> {
  return Promise.allSettled(importFns.map(fn => fn())).then(results => {
    results.forEach((result, index) => {
      if (result.status === 'rejected') {
        console.warn(`Failed to preload screen ${index}:`, result.reason);
      }
    });
    return results.map(result => 
      result.status === 'fulfilled' ? result.value : undefined
    ).filter(Boolean);
  });
}
