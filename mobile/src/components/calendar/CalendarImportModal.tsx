import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Modal,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
} from 'react-native';
import { colors } from '../../themes/colors';
import { typography } from '../../themes/typography';
import { spacing } from '../../themes/spacing';
import { Button } from '../common/Button';
import { HugeiconsIcon as Icon } from '@hugeicons/react-native';
import { CheckmarkCircle01Icon, Alert01Icon, Calendar01Icon, Cancel01Icon } from '@hugeicons/core-free-icons';
import { enhancedAPI } from '../../services/enhancedApi';
import { googleAuthService } from '../../services/googleAuth';

interface CalendarImportModalProps {
  visible: boolean;
  onClose: () => void;
  onImportComplete?: () => void;
}

export function CalendarImportModal({
  visible,
  onClose,
  onImportComplete
}: CalendarImportModalProps) {
  const [importing, setImporting] = useState(false);
  const [importStatus, setImportStatus] = useState<'idle' | 'checking' | 'importing' | 'success' | 'error'>('idle');
  const [statusMessage, setStatusMessage] = useState('');
  const [importedCount, setImportedCount] = useState(0);
  const [signingOut, setSigningOut] = useState(false);

  const checkCalendarStatus = async () => {
    try {
      setImportStatus('checking');
      setStatusMessage('Checking Google Calendar connection...');

      // Checking calendar status...
      const status = await enhancedAPI.getCalendarStatus();
      // Calendar status response received

      if (!status.connected) {
        // Calendar not connected
        setImportStatus('error');
        setStatusMessage(`Calendar not connected: ${status.details || status.error || 'Unknown error'}`);
        return false;
      }

      // Calendar is connected successfully
      setStatusMessage('Google Calendar is connected and ready for import.');
      return true;
    } catch (error) {
      console.error('[CalendarImportModal] Error checking calendar status:', error);
      setImportStatus('error');
      setStatusMessage('Failed to check calendar status. Please try again.');
      return false;
    }
  };

  const handleImport = async () => {
    try {
      setImporting(true);
      setImportStatus('checking');
      setStatusMessage('Checking Google Calendar connection...');

      // First check if Google Calendar is connected
      const isConnected = await checkCalendarStatus();
      if (!isConnected) {
        return;
      }

      setImportStatus('importing');
      setStatusMessage('Importing calendar events...');

      // Trigger the calendar import
      const result = await enhancedAPI.importCalendarFirstRun();

      setImportedCount(result.count || 0);
      setImportStatus('success');
      setStatusMessage(`Successfully imported ${result.count || 0} events from Google Calendar!`);

      // Call the completion callback after a short delay
      setTimeout(() => {
        onImportComplete?.();
        onClose();
      }, 2000);

    } catch (error: any) {
      console.error('Calendar import error:', error);
      setImportStatus('error');

      if (error?.message?.includes('not connected')) {
        setStatusMessage('Google Calendar is not connected. Please sign in with Google first.');
      } else if (error?.message?.includes('permission')) {
        setStatusMessage('Calendar permission denied. Please check your Google Calendar settings.');
      } else {
        setStatusMessage('Failed to import calendar events. Please try again.');
      }
    } finally {
      setImporting(false);
    }
  };

  const handleSignOutAndBackIn = async () => {
    try {
      setSigningOut(true);
      setStatusMessage('Signing out to get fresh calendar permissions...');

      // Sign out from Google
      await googleAuthService.signOut();
      // Signed out from Google

      setStatusMessage('Please sign back in with Google to get calendar permissions...');

      Alert.alert(
        'Sign In Required',
        'Please sign back in with Google to get calendar permissions. After signing in, try the import again.',
        [
          {
            text: 'OK',
            onPress: () => {
              setSigningOut(false);
              setImportStatus('idle');
              setStatusMessage('');
              onClose();
            }
          }
        ]
      );
    } catch (error) {
      console.error('[CalendarImportModal] Error signing out:', error);
      setSigningOut(false);
      setStatusMessage('Failed to sign out. Please try again.');
    }
  };

  const handleClose = () => {
    if (importing || signingOut) {
      Alert.alert(
        'Operation in Progress',
        'An operation is still running. Are you sure you want to cancel?',
        [
          { text: 'Cancel', style: 'cancel' },
          {
            text: 'Close',
            style: 'destructive',
            onPress: () => {
              setImporting(false);
              setSigningOut(false);
              setImportStatus('idle');
              setStatusMessage('');
              setImportedCount(0);
              onClose();
            }
          }
        ]
      );
    } else {
      setImportStatus('idle');
      setStatusMessage('');
      setImportedCount(0);
      onClose();
    }
  };

  const getStatusIcon = () => {
    switch (importStatus) {
      case 'checking':
        return <ActivityIndicator size="small" color={colors.primary} />;
      case 'importing':
        return <ActivityIndicator size="small" color={colors.primary} />;
      case 'success':
        return <Icon icon={CheckmarkCircle01Icon} size={24} color={colors.success} />;
      case 'error':
        return <Icon icon={Alert01Icon} size={24} color={colors.error} />;
      default:
        return <Icon icon={Calendar01Icon} size={24} color={colors.primary} />;
    }
  };

  const getStatusColor = () => {
    switch (importStatus) {
      case 'success':
        return colors.success;
      case 'error':
        return colors.error;
      default:
        return colors.text.primary;
    }
  };

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={handleClose}
    >
      <View style={styles.overlay}>
        <View style={styles.modalContainer}>
          <View style={styles.header}>
            <Text style={styles.title}>Import Google Calendar</Text>
            <TouchableOpacity onPress={handleClose} style={styles.closeButton}>
              <Icon icon={Cancel01Icon} size={20} color={colors.text.secondary} />
            </TouchableOpacity>
          </View>

          <View style={styles.content}>
            <View style={styles.iconContainer}>
              {getStatusIcon()}
            </View>

            <Text style={styles.description}>
              Import your Google Calendar events into Mind Clear to see them alongside your tasks and goals.
            </Text>

            {statusMessage ? (
              <View style={styles.statusContainer}>
                <Text style={[styles.statusMessage, { color: getStatusColor() }]}>
                  {statusMessage}
                </Text>
                {importedCount > 0 && (
                  <Text style={styles.importCount}>
                    {importedCount} events imported
                  </Text>
                )}
              </View>
            ) : null}

            {importStatus === 'error' && (
              <View style={styles.errorContainer}>
                <Text style={styles.errorText}>
                  Make sure you're signed in with Google and have granted calendar permissions.
                </Text>
              </View>
            )}
          </View>

          <View style={styles.actions}>
            {importStatus === 'idle' && (
              <Button
                title="Import Calendar Events"
                onPress={handleImport}
                style={styles.importButton}
                disabled={importing}
              />
            )}

            {importStatus === 'error' && (
              <View style={styles.errorActions}>
                <Button
                  title="Try Again"
                  onPress={handleImport}
                  style={styles.importButton}
                  disabled={importing}
                />
                <Button
                  title="Sign Out & Sign Back In"
                  onPress={handleSignOutAndBackIn}
                  variant="outline"
                  style={styles.signOutButton}
                  disabled={signingOut}
                />
              </View>
            )}

            {importStatus !== 'success' && (
              <Button
                title="Cancel"
                onPress={handleClose}
                variant="outline"
                style={styles.cancelButton}
                disabled={importing || signingOut}
              />
            )}
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: spacing.lg,
  },
  modalContainer: {
    backgroundColor: colors.background.primary,
    borderRadius: spacing.lg,
    padding: spacing.lg,
    width: '100%',
    maxWidth: 400,
    shadowColor: colors.text.primary,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.25,
    shadowRadius: 8,
    elevation: 8,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: spacing.lg,
  },
  title: {
    fontSize: typography.fontSize.lg,
    fontWeight: typography.fontWeight.bold as any,
    color: colors.text.primary,
  },
  closeButton: {
    padding: spacing.xs,
  },
  content: {
    alignItems: 'center',
    marginBottom: spacing.lg,
  },
  iconContainer: {
    marginBottom: spacing.md,
  },
  description: {
    fontSize: typography.fontSize.base,
    color: colors.text.secondary,
    textAlign: 'center',
    lineHeight: 22,
    marginBottom: spacing.md,
  },
  statusContainer: {
    alignItems: 'center',
    marginTop: spacing.sm,
  },
  statusMessage: {
    fontSize: typography.fontSize.sm,
    fontWeight: typography.fontWeight.medium as any,
    textAlign: 'center',
    marginBottom: spacing.xs,
  },
  importCount: {
    fontSize: typography.fontSize.sm,
    color: colors.success,
    fontWeight: typography.fontWeight.medium as any,
  },
  errorContainer: {
    backgroundColor: colors.error + '10',
    padding: spacing.md,
    borderRadius: spacing.sm,
    marginTop: spacing.md,
  },
  errorText: {
    fontSize: typography.fontSize.sm,
    color: colors.error,
    textAlign: 'center',
    lineHeight: 18,
  },
  actions: {
    gap: spacing.sm,
  },
  importButton: {
    marginBottom: spacing.xs,
  },
  errorActions: {
    gap: spacing.sm,
  },
  signOutButton: {
    marginBottom: spacing.xs,
  },
  cancelButton: {
    marginTop: spacing.xs,
  },
});
