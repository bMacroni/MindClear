import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, ActivityIndicator } from 'react-native';
import { AuthState, authService } from './src/services/auth';
import { GoogleAuthService } from './src/services/googleAuth';
import secureConfigService from './src/services/secureConfig';
import { configService } from './src/services/config';
import { logger } from './src/utils/logger';
import { colors } from './src/themes/colors';
import { typography } from './src/themes/typography';
import { spacing } from './src/themes/spacing';
import { Button } from './src/components/common';

const App: React.FC = () => {
  const [isReady, setIsReady] = useState(false);
  const [error, setError] = useState<Error | null>(null);
  const [authState, setAuthState] = useState<AuthState>(authService.getAuthState());

  // Subscribe to auth state changes
  useEffect(() => {
    const unsubscribe = authService.subscribe(setAuthState);
    return () => unsubscribe();
  }, []);

  // Initialize Google Sign-In only when authenticated and config is ready
  useEffect(() => {
    const initializeGoogleSignIn = async () => {
      if (authState.isAuthenticated) {
        try {
          // Wait for secure config to be ready
          await secureConfigService.onReady();
          
          const webClientId = secureConfigService.getGoogleWebClientId() || configService.getGoogleWebClientId();
          
          if (webClientId) {
            await GoogleAuthService.getInstance().configureGoogleSignIn(webClientId);
          } else {
            console.warn('Skipping Google Sign-In configuration - web client ID not available yet. Will retry when remote config loads.');
          }
        } catch (error) {
          logger.error('Failed to initialize Google Sign-In', error);
        }
      }
    };

    initializeGoogleSignIn();
  }, [authState.isAuthenticated]); // Re-run when authentication state changes

  const loadApp = async () => {
    try {
      setError(null);
      setIsReady(false);
      // Add your initialization logic here
      // e.g., await someInitialization();
      setIsReady(true);
    } catch (err) {
      const error = err instanceof Error ? err : new Error('Failed to load app');
      logger.error('Failed to load app', error);
      setError(error);
    }
  };

  useEffect(() => {
    loadApp();
  }, []);

  if (!isReady && !error) {
    return (
      <View style={styles.container}>
        <ActivityIndicator size="large" color={colors.primary} />
        <Text style={styles.loadingText}>Loading...</Text>
      </View>
    );
  }

  if (error) {
    return (
      <View style={styles.container}>
        <Text style={styles.errorTitle}>Error Loading App</Text>
        <Text style={styles.errorMessage}>{error.message}</Text>
        <Button
          title="Retry"
          onPress={loadApp}
          variant="primary"
          style={styles.retryButton}
        />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {/* Your app content goes here */}
      <Text style={styles.title}>Welcome to My App</Text>
      <Text style={styles.description}>This component is ready to use.</Text>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: colors.background.primary,
    padding: spacing.md,
  },
  loadingText: {
    marginTop: spacing.md,
    fontSize: typography.fontSize.base,
    fontFamily: typography.fontFamily.regular,
    color: colors.text.secondary,
  },
  errorTitle: {
    fontSize: typography.fontSize.xl,
    fontFamily: typography.fontFamily.bold,
    fontWeight: typography.fontWeight.bold as any,
    color: colors.error,
    marginBottom: spacing.sm,
    textAlign: 'center',
  },
  errorMessage: {
    fontSize: typography.fontSize.base,
    fontFamily: typography.fontFamily.regular,
    color: colors.text.secondary,
    marginBottom: spacing.lg,
    textAlign: 'center',
  },
  retryButton: {
    marginTop: spacing.md,
  },
  title: {
    fontSize: typography.fontSize['3xl'],
    fontFamily: typography.fontFamily.bold,
    fontWeight: typography.fontWeight.bold as any,
    color: colors.text.primary,
    marginBottom: spacing.md,
    textAlign: 'center',
  },
  description: {
    fontSize: typography.fontSize.base,
    fontFamily: typography.fontFamily.regular,
    color: colors.text.secondary,
    textAlign: 'center',
  },
});

export default App;
