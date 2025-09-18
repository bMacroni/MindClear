import React, { Suspense, ComponentType } from 'react';
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

// Higher-order component for lazy loading with error boundary
export function withLazyLoading<P extends object>(
  Component: ComponentType<P>,
  fallback?: React.ComponentType
) {
  const LazyComponent = React.lazy(() => Promise.resolve({ default: Component }));
  
  return function LazyWrapper(props: P) {
    const FallbackComponent = fallback;
    return (
      <Suspense fallback={FallbackComponent ? <FallbackComponent /> : <LoadingScreen />}>
        <LazyComponent {...props} />
      </Suspense>
    );
  };
}

// Utility for creating lazy screen components
export function createLazyScreen<P extends object>(
  importFn: () => Promise<{ default: ComponentType<P> }>,
  fallback?: React.ComponentType
) {
  const LazyComponent = React.lazy(importFn);
  
  return function LazyScreen(props: P) {
    const FallbackComponent = fallback;
    return (
      <Suspense fallback={FallbackComponent ? <FallbackComponent /> : <LoadingScreen />}>
        <LazyComponent {...props} />
      </Suspense>
    );
  };
}

// Preload function for critical screens
export function preloadScreen(importFn: () => Promise<any>) {
  return importFn();
}

// Batch preload function for multiple screens
export function preloadScreens(importFns: Array<() => Promise<any>>) {
  return Promise.all(importFns.map(fn => fn()));
}
