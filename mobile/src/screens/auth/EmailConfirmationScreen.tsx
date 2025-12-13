import React, { useState, useEffect } from 'react';
import { View, StyleSheet, Text, ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { RouteProp } from '@react-navigation/native';
import { colors } from '../../themes/colors';
import { typography } from '../../themes/typography';
import { spacing } from '../../themes/spacing';
import { Button } from '../../components/common';
import Icon from 'react-native-vector-icons/Octicons';
import getSupabaseClient from '../../services/supabaseClient';
import { RootStackParamList } from '../../navigation/types';

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

      // Extract token from route params
      const token = params.access_token || params.token;
      const refreshToken = params.refresh_token;

      if (!token) {
        setError('Invalid confirmation link. Missing token. Please try again or request a new confirmation email.');
        setLoading(false);
        return;
      }

      // Verify the token with Supabase
      const supabase = getSupabaseClient();

      let userData = null;
      let verifyError = null;

      // If we have both tokens, try to set the session directly (persists login)
      if (token && refreshToken) {
        // Try setting session
        const { data, error } = await supabase.auth.setSession({
          access_token: token,
          refresh_token: refreshToken,
        });
        
        if (error) {
           console.log('SetSession error:', error);
           setError('Failed to verify your email. Please try logging in manually.');
           setLoading(false);
           return;
        } else if (data?.user?.email) {
           setEmail(data.user.email);
        }
      } else {
        // Just access_token? Try getUser to validate
        const res = await supabase.auth.getUser(token);
        if (res.error) {
           console.log('GetUser error:', res.error);
           setError('Failed to verify your email. The confirmation link may be invalid or expired.');
           setLoading(false);
           return;
        } else if (res.data?.user?.email) {
           setEmail(res.data.user.email);
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

  const handleContinue = () => {
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
              <Icon name="check-circle" size={80} color={colors.success || colors.primary} />
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
              <Icon name="alert" size={80} color={colors.error || '#E53935'} />
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
