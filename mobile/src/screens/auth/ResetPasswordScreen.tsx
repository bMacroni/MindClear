import React, { useMemo, useState } from 'react';
import { View, StyleSheet, Text, TouchableOpacity } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { colors } from '../../themes/colors';
import { typography } from '../../themes/typography';
import { spacing } from '../../themes/spacing';
import { PasswordInput, Button } from '../../components/common';
import Icon from 'react-native-vector-icons/Octicons';

type Props = {
  route: { params?: { access_token?: string } };
  navigation: any;
};

export default function ResetPasswordScreen({ route, navigation }: Props) {
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const accessToken = route?.params?.access_token;

  const meetsComplexity = useMemo(() => {
    // Mirror backend: at least 8 chars, lower, upper, number, special
    const re = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&]).{8,128}$/;
    return re.test(password);
  }, [password]);

  const handleSubmit = async () => {
    setError('');
    if (!accessToken) {
      setError('Invalid or missing reset token. Please request a new link.');
      return;
    }
    if (!meetsComplexity) {
      setError('Password does not meet complexity requirements.');
      return;
    }
    if (password !== confirm) {
      setError('Passwords do not match.');
      return;
    }

    setLoading(true);
    try {
      // Use backend to perform password update via Supabase Admin RPC
      // For now, redirect user to Forgot screen on success with confirmation
      // NOTE: Alternatively, implement a backend endpoint if needed.
      const { apiService } = await import('../../services/apiService');
      const res = await apiService.post('/auth/reset-password', { access_token: accessToken, password });
      if (res.ok) {
        navigation.reset({ index: 0, routes: [{ name: 'Login' }] });
      } else {
        setError((res.data as any)?.error || 'Failed to reset password.');
      }
    } catch (_err) {
      setError('Failed to reset password.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      {/* Header with back arrow and title */}
      <View style={styles.header}>
        <TouchableOpacity 
          onPress={() => navigation.goBack()} 
          style={styles.backButton}
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
          accessibilityRole="button"
          accessibilityLabel="Go back"
        >
          <Icon name="arrow-left" size={24} color={colors.text.primary} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Reset</Text>
      </View>

      {/* Main content */}
      <View style={styles.content}>
        <Text style={styles.mainTitle}>Reset your Password</Text>
        <Text style={styles.instructionText}>Please enter your new password</Text>

        <PasswordInput
          placeholder="Password"
          value={password}
          onChangeText={setPassword}
          style={styles.passwordInput}
        />
        <PasswordInput
          placeholder="Confirm Password"
          value={confirm}
          onChangeText={setConfirm}
          style={styles.passwordInput}
        />

        {password.length > 0 && (
          <Text style={[styles.complexityText, meetsComplexity ? styles.complexitySuccess : styles.complexityError]}>
            {meetsComplexity ? 'Meets complexity requirements' : 'Must have upper, lower, number, special (min 8)'}
          </Text>
        )}

        {error ? <Text style={styles.error}>{error}</Text> : null}

        <TouchableOpacity
          style={[styles.resetButton, (!accessToken || loading) && styles.resetButtonDisabled]}
          onPress={handleSubmit}
          disabled={!accessToken || loading}
        >
          <Text style={styles.resetButtonText}>
            {loading ? 'Updating…' : 'Reset Password'}
          </Text>
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background.primary,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.md,
    paddingTop: spacing.sm,
    paddingBottom: spacing.md,
  },
  backButton: {
    padding: spacing.xs,
  },
  headerTitle: {
    fontSize: typography.fontSize.lg,
    color: colors.text.primary,
    fontWeight: typography.fontWeight.semibold as any,
    marginLeft: spacing.md,
  },
  content: {
    flex: 1,
    paddingHorizontal: spacing.md,
    paddingTop: spacing.lg,
  },
  mainTitle: {
    fontSize: typography.fontSize['2xl'],
    color: colors.text.primary,
    fontWeight: typography.fontWeight.bold as any,
    marginBottom: spacing.sm,
    textAlign: 'center',
  },
  instructionText: {
    fontSize: typography.fontSize.base,
    color: colors.text.secondary,
    marginBottom: spacing.xl,
    textAlign: 'center',
  },
  passwordInput: {
    marginBottom: spacing.md,
  },
  complexityText: {
    fontSize: typography.fontSize.sm,
    marginTop: spacing.xs,
    marginBottom: spacing.sm,
  },
  complexitySuccess: {
    color: colors.success,
  },
  complexityError: {
    color: colors.error,
  },
  error: {
    color: colors.error,
    fontSize: typography.fontSize.sm,
    marginTop: spacing.xs,
    marginBottom: spacing.sm,
    textAlign: 'center',
  },
  resetButton: {
    backgroundColor: colors.accent.gold,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.lg,
    borderRadius: 8,
    marginTop: spacing.lg,
    alignItems: 'center',
  },
  resetButtonDisabled: {
    backgroundColor: colors.border.dark,
  },
  resetButtonText: {
    color: colors.text.primary,
    fontSize: typography.fontSize.base,
    fontWeight: typography.fontWeight.semibold as any,
  },
});


