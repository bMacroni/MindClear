import React, { useState } from 'react';
import { View, StyleSheet, Text, TouchableOpacity } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { colors } from '../../themes/colors';
import { typography } from '../../themes/typography';
import { spacing, borderRadius } from '../../themes/spacing';
import { Input, Button } from '../../components/common';
import { apiService } from '../../services/apiService';
import { SuccessToast } from '../../components/common/SuccessToast';
import Icon from 'react-native-vector-icons/Octicons';

export default function ForgotPasswordScreen({ navigation }: any) {
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [toastVisible, setToastVisible] = useState(false);

  const handleSubmit = async () => {
    setLoading(true);
    try {
      await apiService.post('/auth/request-password-reset', { email });
      setToastVisible(true);
    } catch (_err) {
      // Even on errors the backend returns a generic 200 in most cases; show toast to keep UX consistent
      setToastVisible(true);
    } finally {
      setLoading(false);
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      {/* Header with back arrow and title */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backButton}>
          <Icon name="arrow-left" size={24} color="#000000" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Forgot</Text>
      </View>

      {/* Main content */}
      <View style={styles.content}>
        <Text style={styles.mainTitle}>Forgot your Password</Text>
        <Text style={styles.instructionText}>Enter your email and we'll send a reset link</Text>

        <Input
          value={email}
          onChangeText={setEmail}
          keyboardType="email-address"
          autoCapitalize="none"
          placeholder="you@example.com"
          style={styles.emailInput}
        />

        <TouchableOpacity
          style={[styles.sendButton, (loading || !email) && styles.sendButtonDisabled]}
          onPress={handleSubmit}
          disabled={loading || !email}
        >
          <Text style={styles.sendButtonText}>
            {loading ? 'Sending…' : 'Send Reset Link'}
          </Text>
        </TouchableOpacity>

        <SuccessToast
          visible={toastVisible}
          message="If an account exists, a reset link has been sent."
          onClose={() => setToastVisible(false)}
        />
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#FFFFFF',
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
    color: '#000000',
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
    color: '#000000',
    fontWeight: typography.fontWeight.bold as any,
    marginBottom: spacing.sm,
    textAlign: 'center',
  },
  instructionText: {
    fontSize: typography.fontSize.base,
    color: '#666666',
    marginBottom: spacing.xl,
    textAlign: 'center',
  },
  emailInput: {
    marginBottom: spacing.lg,
    alignSelf: 'center',
    width: '100%',
    maxWidth: 320,
  },
  sendButton: {
    backgroundColor: '#FFD700', // Gold color
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.lg,
    borderRadius: 8,
    alignItems: 'center',
  },
  sendButtonDisabled: {
    backgroundColor: '#CCCCCC',
  },
  sendButtonText: {
    color: '#000000',
    fontSize: typography.fontSize.base,
    fontWeight: typography.fontWeight.semibold as any,
  },
});


