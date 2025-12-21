import React, { useState, useEffect, useRef } from 'react';
import { View, StyleSheet, Text, ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { RouteProp } from '@react-navigation/native';
import { colors } from '../../themes/colors';
import { typography } from '../../themes/typography';
import { spacing } from '../../themes/spacing';
import { Button } from '../../components/common';
import { HugeiconsIcon as Icon } from '@hugeicons/react-native';
import { CheckmarkCircle01Icon, Alert01Icon } from '@hugeicons/core-free-icons';
import getSupabaseClient from '../../services/supabaseClient';
import { RootStackParamList } from '../../navigation/types';
import { authService, User } from '../../services/auth';

type EmailConfirmationScreenNavigationProp = NativeStackNavigationProp<RootStackParamList, 'EmailConfirmation'>;
type EmailConfirmationScreenRouteProp = RouteProp<RootStackParamList, 'EmailConfirmation'>;

type Props = {
  route: EmailConfirmationScreenRouteProp;
  navigation: EmailConfirmationScreenNavigationProp;
};

export default function EmailConfirmationScreen({ route, navigation }: Props) {
  const [loading, setLoading] = useState(true);
  const [confirmed, setConfirmed] = useState(false);
  const [error, setError] = useState('');
  const [email, setEmail] = useState('');
  const sessionRef = useRef<any>(null);

  useEffect(() => {
    verifyEmailConfirmation();
  }, []);

  const verifyEmailConfirmation = async () => {
    try {
      setLoading(true);
      setError('');

      const params = route?.params || {};

      // Check for explicit errors from Supabase
      if (params.error) {
        setError(params.error_description || params.error || 'Verification failed');
        setLoading(false);
        return;
      }

      // Extract auth code from route params
      const code = params.code;

      if (!code) {
        setError('Invalid confirmation link. Missing authorization code. Please try again or request a new confirmation email.');
        setLoading(false);
        return;
      }

      // Verify the code with Supabase by exchanging it for a session
      // The session will be automatically persisted by the secure storage adapter configured in supabaseClient
      const supabase = getSupabaseClient();

      const { data, error: exchangeError } = await supabase.auth.exchangeCodeForSession(code);

      if (exchangeError) {
        setError('Failed to verify your email. The link may be invalid or expired.');
        setLoading(false);
        return;
      } else if (data?.user?.email) {
        setEmail(data.user.email);
        if (data.session) {
          sessionRef.current = data.session;
        }
      }

      // Show success only after successful verification
      setConfirmed(true);

    } catch (err: any) {
      console.error('Email verification error:', err);

      if (err.message && err.message.includes('protocol')) {
        setError('Verification failed due to a protocol error. Please try requesting a new confirmation link.');
      } else {
        setError('An unexpected error occurred during email verification. Please try again or contact support.');
      }
    } finally {
      setLoading(false);
    }
  };

  const handleContinue = async () => {
    if (sessionRef.current) {
      // Auto-login using the session we got from verification
      try {
        setLoading(true);
        const session = sessionRef.current;

        const user: User = {
          id: session.user.id,
          email: session.user.email,
          email_confirmed_at: session.user.email_confirmed_at,
          created_at: session.user.created_at,
          updated_at: session.user.updated_at,
        };

        // This will update auth state and AppNavigator will automatically handle navigation
        await authService.setSession(session.access_token, user, session.refresh_token);
      } catch (e) {
        console.error('Auto-login failed', e);
        // Fallback to login screen
        navigation.reset({
          index: 0,
          routes: [
            {
              name: 'Login',
              params: { email: email }
            }
          ]
        });
      }
    } else {
      // Navigate to login screen with pre-filled email
      navigation.reset({
        index: 0,
        routes: [
          {
            name: 'Login',
            params: { email: email }
          }
        ]
      });
    }
  };

  const handleRequestNew = () => {
    navigation.navigate('Signup');
  };

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.content}>
        {loading ? (
          // Loading state
          <View style={styles.centerContent}>
            <ActivityIndicator size="large" color={colors.primary} />
            <Text style={styles.loadingText}>Verifying your email...</Text>
          </View>
        ) : confirmed ? (
          // Success state
          <View style={styles.centerContent}>
            <View style={styles.iconContainer}>
              <Icon icon={CheckmarkCircle01Icon} size={80} color={colors.success || colors.primary} />
            </View>
            <Text style={styles.successTitle}>Email Confirmed!</Text>
            <Text style={styles.successMessage}>
              Your email address has been successfully verified. You can now log in to your Mind Clear account.
            </Text>
            {email && (
              <Text style={styles.emailText}>
                Email: <Text style={styles.emailBold}>{email}</Text>
              </Text>
            )}
            <Button
              onPress={handleContinue}
              style={styles.continueButton}
              title="Continue to Login"
            />
          </View>
        ) : (
          // Error state
          <View style={styles.centerContent}>
            <View style={styles.iconContainer}>
              <Icon icon={Alert01Icon} size={80} color={colors.error || '#E53935'} />
            </View>
            <Text style={styles.errorTitle}>Verification Failed</Text>
            <Text style={styles.errorMessage}>{error}</Text>
            <View style={styles.buttonContainer}>
              <Button
                onPress={handleRequestNew}
                style={styles.primaryButton}
                title="Request New Confirmation"
              />
              <Button
                onPress={() => navigation.navigate('Login')}
                variant="outline"
                style={styles.secondaryButton}
                title="Back to Login"
              />
            </View>
          </View>
        )}
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background.primary,
  },
  content: {
    flex: 1,
    padding: spacing.lg,
  },
  centerContent: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: spacing.md,
  },
  iconContainer: {
    marginBottom: spacing.xl,
  },
  loadingText: {
    fontSize: typography.fontSize.base,
    color: colors.text.secondary,
    marginTop: spacing.md,
    textAlign: 'center',
  },
  successTitle: {
    fontSize: typography.fontSize['2xl'],
    fontWeight: typography.fontWeight.bold,
    color: colors.text.primary,
    marginBottom: spacing.md,
    textAlign: 'center',
  },
  successMessage: {
    fontSize: typography.fontSize.base,
    color: colors.text.secondary,
    marginBottom: spacing.lg,
    textAlign: 'center',
    lineHeight: 24,
  },
  emailText: {
    fontSize: typography.fontSize.base,
    color: colors.text.secondary,
    marginBottom: spacing.xl,
    textAlign: 'center',
  },
  emailBold: {
    fontWeight: '600',
    color: colors.text.primary,
  },
  errorTitle: {
    fontSize: typography.fontSize['2xl'],
    fontWeight: typography.fontWeight.bold,
    color: colors.error || '#E53935',
    marginBottom: spacing.md,
    textAlign: 'center',
  },
  errorMessage: {
    fontSize: typography.fontSize.base,
    color: colors.text.secondary,
    marginBottom: spacing.xl,
    textAlign: 'center',
    lineHeight: 24,
  },
  buttonContainer: {
    width: '100%',
    gap: spacing.md,
  },
  continueButton: {
    width: '100%',
    marginTop: spacing.md,
  },
  primaryButton: {
    width: '100%',
  },
  secondaryButton: {
    width: '100%',
  },
});
