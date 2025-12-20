import React, { useEffect, useState } from 'react';
import { View, Text, FlatList, StyleSheet, ActivityIndicator, TouchableOpacity } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { HugeiconsIcon as Icon } from '@hugeicons/react-native';
import { ArrowLeft01Icon, Alert01Icon } from '@hugeicons/core-free-icons';
import { notificationsAPI } from '../../services/api';
import { colors } from '../../themes/colors';
import { spacing } from '../../themes/spacing';
import { typography } from '../../themes/typography';

// Define the Notification type based on your data structure
interface Notification {
  id: string;
  title: string;
  message: string;
  created_at: string;
  read: boolean;
}

// Define error type with code property for machine-checkable auth errors
interface ErrorWithCode extends Error {
  code?: string;
}

const NotificationScreen = ({ navigation }: any) => {
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [debugInfo, setDebugInfo] = useState<string>('');

  useEffect(() => {
    const fetchNotifications = async () => {
      try {
        // Fetching notifications

        // Debug: Check if we have a token
        const { authService } = await import('../../services/auth');
        const token = await authService.getAuthToken();
        const tokenInfo = {
          hasToken: !!token,
          tokenLength: token?.length || 0,
          tokenStart: token?.substring(0, 20) + '...' || 'null'
        };
        // Auth token check
        setDebugInfo(`Token: ${tokenInfo.hasToken ? 'YES' : 'NO'} (${tokenInfo.tokenLength} chars)`);

        // Debug: Test if other API calls work
        try {
          const { tasksAPI } = await import('../../services/api');
          const tasks = await tasksAPI.getTasks();
          // Tasks API test successful
          setDebugInfo(prev => prev + ` | Tasks: ${tasks.length} found`);
        } catch (taskError) {
          console.error('🔔 Tasks API test failed:', taskError);
          setDebugInfo(prev => prev + ` | Tasks: FAILED`);
        }

        // The backend now supports fetching all notifications
        const response = await notificationsAPI.getNotifications('all');
        // Notifications fetched successfully
        setNotifications(response);
      } catch (e) {
        console.error('🔔 Notification fetch error:', e);
        // Show more detailed error information
        const errorMessage = e instanceof Error ? e.message : 'Unknown error occurred';
        console.error('🔔 Error details:', {
          message: errorMessage,
          stack: e instanceof Error ? e.stack : undefined,
          type: typeof e
        });

        // Handle specific error cases
        if (e instanceof Error && (e as ErrorWithCode).code === 'AUTH_REQUIRED') {
          setError('Please log in to view notifications');
        } else {
          setError(`Failed to load notifications: ${errorMessage}`);
        }

        setDebugInfo(prev => prev + ` | Error: ${errorMessage}`);

        // Set empty notifications array as fallback
        setNotifications([]);
      } finally {
        setLoading(false);
      }
    };

    fetchNotifications();
  }, []);

  const renderItem = ({ item }: { item: Notification }) => (
    <View style={[styles.notificationItem, item.read ? styles.read : styles.unread]}>
      <Text style={styles.title}>{item.title}</Text>
      <Text style={styles.message}>{item.message}</Text>
      <Text style={styles.date}>{new Date(item.created_at).toLocaleString()}</Text>
    </View>
  );

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" />
      </View>
    );
  }

  if (error) {
    return (
      <SafeAreaView style={styles.safeArea}>
        <View style={styles.header}>
          <TouchableOpacity
            style={styles.backButton}
            onPress={() => navigation.goBack()}
          >
            <Icon icon={ArrowLeft01Icon} size={24} color={colors.text.primary} />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Notifications</Text>
          <View style={styles.headerSpacer} />
        </View>
        <View style={styles.center}>
          <Icon icon={Alert01Icon} size={48} color={colors.error} style={{ marginBottom: spacing.md }} />
          <Text style={styles.errorText}>{error}</Text>
          {debugInfo ? (
            <Text style={styles.debugText}>Debug: {debugInfo}</Text>
          ) : null}
          reen
          {error.includes('log in') || error.includes('Authentication') ? (
            <TouchableOpacity
              style={styles.retryButton}
              onPress={() => {
                // Navigate to login screen
                navigation.reset({
                  index: 0,
                  routes: [{ name: 'Login' }],
                });
              }}
            >
              <Text style={styles.retryButtonText}>Go to Login</Text>
            </TouchableOpacity>
          ) : (
            <TouchableOpacity
              style={styles.retryButton}
              onPress={() => {
                setError(null);
                setLoading(true);
                // Retry the fetch
                const fetchNotifications = async () => {
                  try {
                    const response = await notificationsAPI.getNotifications('all');
                    setNotifications(response);
                  } catch (e) {
                    console.error('Notification fetch error:', e);
                    const errorMessage = e instanceof Error ? e.message : 'Unknown error occurred';
                    if (e instanceof Error && (e as ErrorWithCode).code === 'AUTH_REQUIRED') {
                      setError('Please log in to view notifications');
                    } else {
                      setError(`Failed to load notifications: ${errorMessage}`);
                    }
                    setNotifications([]);
                  } finally {
                    setLoading(false);
                  }
                };
                fetchNotifications();
              }}
            >
              <Text style={styles.retryButtonText}>Retry</Text>
            </TouchableOpacity>
          )}
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safeArea}>
      <View style={styles.header}>
        <TouchableOpacity
          style={styles.backButton}
          onPress={() => navigation.goBack()}
        >
          <Icon icon={ArrowLeft01Icon} size={24} color={colors.text.primary} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Notifications</Text>
        <View style={styles.headerSpacer} />
      </View>
      <FlatList
        data={notifications}
        renderItem={renderItem}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.container}
        ListEmptyComponent={
          <View style={styles.center}>
            <Text style={styles.emptyText}>No notifications yet.</Text>
          </View>
        }
      />
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: colors.background.primary,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: colors.border.light,
    backgroundColor: colors.background.primary,
  },
  backButton: {
    padding: spacing.xs,
  },
  headerTitle: {
    fontSize: typography.fontSize['2xl'],
    fontWeight: typography.fontWeight.semibold,
    color: colors.text.primary,
    flex: 1,
    textAlign: 'center',
  },
  headerSpacer: {
    width: 40, // Same width as back button to center the title
  },
  container: {
    padding: spacing.md,
  },
  center: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: spacing.xl,
  },
  notificationItem: {
    padding: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.border.light,
    marginBottom: spacing.sm,
    borderRadius: spacing.sm,
  },
  read: {
    backgroundColor: colors.background.secondary,
  },
  unread: {
    backgroundColor: colors.primary + '10', // 10% opacity
    borderColor: colors.primary,
    borderWidth: 1,
  },
  title: {
    fontSize: typography.fontSize.lg,
    fontWeight: typography.fontWeight.semibold,
    marginBottom: spacing.xs,
    color: colors.text.primary,
  },
  message: {
    fontSize: typography.fontSize.base,
    color: colors.text.secondary,
    marginBottom: spacing.xs,
  },
  date: {
    fontSize: typography.fontSize.sm,
    color: colors.text.disabled,
    textAlign: 'right',
  },
  emptyText: {
    fontSize: typography.fontSize.base,
    color: colors.text.secondary,
  },
  errorText: {
    fontSize: typography.fontSize.base,
    color: colors.error,
    textAlign: 'center',
    marginBottom: spacing.lg,
  },
  retryButton: {
    backgroundColor: colors.primary,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    borderRadius: spacing.sm,
  },
  retryButtonText: {
    fontSize: typography.fontSize.base,
    color: colors.secondary,
    fontWeight: typography.fontWeight.semibold,
  },
  debugText: {
    fontSize: typography.fontSize.sm,
    color: colors.text.disabled,
    textAlign: 'center',
    marginBottom: spacing.md,
    fontFamily: 'monospace',
  },
});

export default NotificationScreen;
