import React, { useEffect, useState, useCallback } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView, TextInput, Switch, StatusBar, Linking, Alert, Modal } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Icon from 'react-native-vector-icons/Octicons';
import { colors } from '../../themes/colors';
import { spacing, borderRadius } from '../../themes/spacing';
import { typography } from '../../themes/typography';
import { usersAPI } from '../../services/api';
import { SuccessToast } from '../../components/common/SuccessToast';
import { LoadingSkeleton } from '../../components/common/LoadingSkeleton';
import { authService } from '../../services/auth';
import { notificationService } from '../../services/notificationService';
import MobileAnalyticsDashboard from '../../components/analytics/MobileAnalyticsDashboard';

type Profile = {
  id: string;
  email: string;
  full_name?: string;
  avatar_url?: string;
  join_date?: string;
  last_login?: string;
  account_status?: 'active'|'suspended'|'deleted';
  theme_preference?: 'light'|'dark';
  notification_preferences?: any;
  geographic_location?: string;
  is_admin?: boolean;
};

type Prefs = {
  channels: { in_app: boolean; email: boolean };
  categories: { tasks: boolean; goals: boolean; scheduling: boolean };
  quiet_hours: { start: string; end: string };
};

const defaultPrefs: Prefs = {
  channels: { in_app: true, email: true },
  categories: { tasks: true, goals: true, scheduling: true },
  quiet_hours: { start: '22:00', end: '07:00' },
};

export default function ProfileScreen({ navigation }: any) {
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [savingProfile, setSavingProfile] = useState(false);
  const [savingPrefs, setSavingPrefs] = useState(false);
  const [toastVisible, setToastVisible] = useState(false);
  const [toastMessage, setToastMessage] = useState('');
  const [notificationPermission, setNotificationPermission] = useState<boolean>(false);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [deleteConfirmationText, setDeleteConfirmationText] = useState('');

  // Inline edit fields
  const [fullName, setFullName] = useState('');
  const [_avatarUrl, setAvatarUrl] = useState('');
  const [location, setLocation] = useState('');
  const [prefs, setPrefs] = useState<Prefs>(defaultPrefs);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const me = await usersAPI.getMe();
      setProfile(me);
      setFullName(me.full_name || '');
      setAvatarUrl(me.avatar_url || '');
      setLocation(me.geographic_location || '');
      setPrefs({ ...defaultPrefs, ...(me.notification_preferences || {}) });
      
      // Check notification permission status
      const hasPermission = await notificationService.checkNotificationPermission();
      setNotificationPermission(hasPermission);
    } catch (e) {
      console.error('Failed to load profile', e);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const toggleTheme = useCallback(async () => {
    if (!profile) {return;}
    setSaving(true);
    try {
      const next = profile.theme_preference === 'dark' ? 'light' : 'dark';
      const updated = await usersAPI.updateMe({ theme_preference: next });
      setProfile(updated);
    } catch (e) {
      console.error('Failed to update theme', e);
    } finally {
      setSaving(false);
    }
  }, [profile]);

  const saveProfile = useCallback(async () => {
    setSavingProfile(true);
    try {
      const updated = await usersAPI.updateMe({ full_name: fullName, geographic_location: location });
      setProfile(updated);
      setToastMessage('Profile updated');
      setToastVisible(true);
    } catch (e) {
      console.error('Failed to update profile fields', e);
    } finally {
      setSavingProfile(false);
    }
  }, [fullName, location]);

  const savePrefs = useCallback(async () => {
    setSavingPrefs(true);
    try {
      const updated = await usersAPI.updateMe({ notification_preferences: prefs });
      setProfile(updated);
      setToastMessage('Notification preferences updated');
      setToastVisible(true);
    } catch (e) {
      console.error('Failed to update notification preferences', e);
    } finally {
      setSavingPrefs(false);
    }
  }, [prefs]);

  const handleExternalLink = useCallback(async (url: string) => {
    try {
      const supported = await Linking.canOpenURL(url);
      if (!supported) {
        // Attempt to open anyway; some Android devices return false without queries
        await Linking.openURL(url);
        return;
      }
      await Linking.openURL(url);
    } catch (error) {
      console.error('Failed to open external link', error);
      Alert.alert('Unable to open link');
    }
  }, []);

  const handleDeleteAccount = useCallback(async () => {
    Alert.alert(
      'Delete Account',
      'Are you sure you want to permanently delete your account? This action cannot be undone and will remove all your data including goals, tasks, and conversations.',
      [
        {
          text: 'Cancel',
          style: 'cancel',
        },
        {
          text: 'Continue',
          style: 'destructive',
          onPress: () => {
            setDeleteConfirmationText('');
            setShowDeleteModal(true);
          },
        },
      ]
    );
  }, []);

  const handleConfirmDelete = useCallback(async () => {
    if (deleteConfirmationText !== 'DELETE') {
      Alert.alert('Invalid Confirmation', 'Please type "DELETE" exactly as shown to confirm account deletion.');
      return;
    }

    try {
      setSaving(true);
      await usersAPI.deleteAccount();
      
      // Account deletion successful - show success message briefly then navigate to sign-in
      setToastMessage('Account deleted successfully');
      setToastVisible(true);
      setShowDeleteModal(false);
      
      // Wait a moment for the toast to show, then navigate to sign-in
      setTimeout(async () => {
        try {
          // Clear any stored auth data
          await authService.logout();
          // Navigate to sign-in screen
          navigation.reset({
            index: 0,
            routes: [{ name: 'Login' }],
          });
        } catch (navError) {
          console.error('Error during post-deletion navigation:', navError);
          // Fallback: just logout and let the app handle navigation
          await authService.logout();
        }
      }, 2000); // 2 second delay to show success message
      
    } catch (error) {
      console.error('Failed to delete account', error);
      Alert.alert(
        'Error',
        'Failed to delete account. Please try again or contact support.'
      );
    } finally {
      setSaving(false);
    }
  }, [deleteConfirmationText, navigation]);

  const handleNotificationPermissionToggle = useCallback(async () => {
    try {
      if (notificationPermission) {
        // Permission is granted, show info about how to disable
        Alert.alert(
          'Notification Settings',
          'To disable notifications, go to your device Settings > Apps > Mind Clear > Notifications and turn off notifications.',
          [{ text: 'OK' }]
        );
      } else {
        // Request permission
        const granted = await notificationService.requestUserPermission();
        setNotificationPermission(granted);
        
        if (granted) {
          setToastMessage('Notifications enabled');
          setToastVisible(true);
        } else {
          Alert.alert(
            'Notifications Disabled',
            'You can enable notifications later in your device settings or by tapping this toggle again.',
            [{ text: 'OK' }]
          );
        }
      }
    } catch (error) {
      console.error('Error handling notification permission:', error);
      Alert.alert('Error', 'Failed to update notification settings');
    }
  }, [notificationPermission]);

  if (loading) {
    return (
      <SafeAreaView style={styles.safeArea} edges={['top']}>
        <ScrollView contentContainerStyle={styles.container}>
          <LoadingSkeleton type="profile" count={1} />
        </ScrollView>
      </SafeAreaView>
    );
  }

  if (!profile) {
    return (
      <View style={styles.centered}>
        <Icon name="alert" size={20} color={colors.text.primary} />
        <Text style={styles.loadingText}>Unable to load profile</Text>
      </View>
    );
  }

  // Avatar hidden for now

  return (
    <SafeAreaView style={styles.safeArea} edges={['top']}> 
      <StatusBar barStyle="dark-content" backgroundColor={colors.secondary} animated />
      <ScrollView contentContainerStyle={styles.container}>
      <SuccessToast visible={toastVisible} message={toastMessage} onClose={() => setToastVisible(false)} />
      <View style={styles.headerRow}>
        <View>
          <Text style={styles.name}>{profile.full_name || 'Your Name'}</Text>
          <Text style={styles.email}>{profile.email}</Text>
          {!!profile.join_date && (
            <Text style={styles.meta}>Joined: {new Date(profile.join_date).toLocaleDateString()}</Text>
          )}
        </View>
        {profile.account_status && profile.account_status !== 'active' && (
          <View style={styles.statusChip}>
            <Text style={styles.statusText}>{profile.account_status}</Text>
          </View>
        )}
        {profile.is_admin && (
          <View style={styles.adminBadge}>
            <Text style={styles.adminBadgeText}>ADMIN</Text>
          </View>
        )}
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Appearance</Text>
        <TouchableOpacity style={styles.row} onPress={toggleTheme} disabled={saving}>
          <Icon name={profile.theme_preference === 'dark' ? 'moon' : 'sun'} size={18} color={colors.primary} />
          <Text style={styles.rowLabel}>Theme</Text>
          <Text style={styles.rowValue}>{profile.theme_preference || 'light'}</Text>
        </TouchableOpacity>
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Notifications</Text>
        <TouchableOpacity style={styles.row} onPress={handleNotificationPermissionToggle}>
          <Icon name="bell" size={18} color={colors.primary} />
          <Text style={styles.rowLabel}>Push Notifications</Text>
          <View style={styles.permissionStatus}>
            <Text style={[styles.rowValue, { color: notificationPermission ? colors.success : colors.error }]}>
              {notificationPermission ? 'Enabled' : 'Disabled'}
            </Text>
            <Icon name="chevron-right" size={16} color={colors.text.secondary} />
          </View>
        </TouchableOpacity>
        <View style={styles.row}> 
          <Icon name="bell" size={18} color={colors.primary} />
          <Text style={styles.rowLabel}>In-App</Text>
          <Switch
            value={prefs.channels.in_app}
            onValueChange={v => setPrefs(p => ({ ...p, channels: { ...p.channels, in_app: v } }))}
          />
        </View>
        <View style={styles.row}> 
          <Icon name="mail" size={18} color={colors.primary} />
          <Text style={styles.rowLabel}>Email</Text>
          <Switch
            value={prefs.channels.email}
            onValueChange={v => setPrefs(p => ({ ...p, channels: { ...p.channels, email: v } }))}
          />
        </View>
        <View style={styles.row}> 
          <Icon name="checklist" size={18} color={colors.primary} />
          <Text style={styles.rowLabel}>Tasks</Text>
          <Switch
            value={prefs.categories.tasks}
            onValueChange={v => setPrefs(p => ({ ...p, categories: { ...p.categories, tasks: v } }))}
          />
        </View>
        <View style={styles.row}> 
          <Icon name="milestone" size={18} color={colors.primary} />
          <Text style={styles.rowLabel}>Goals</Text>
          <Switch
            value={prefs.categories.goals}
            onValueChange={v => setPrefs(p => ({ ...p, categories: { ...p.categories, goals: v } }))}
          />
        </View>
        <View style={styles.row}> 
          <Icon name="calendar" size={18} color={colors.primary} />
          <Text style={styles.rowLabel}>Scheduling</Text>
          <Switch
            value={prefs.categories.scheduling}
            onValueChange={v => setPrefs(p => ({ ...p, categories: { ...p.categories, scheduling: v } }))}
          />
        </View>
        <TouchableOpacity style={[styles.cta, savingPrefs && { opacity: 0.7 }]} onPress={savePrefs} disabled={savingPrefs}>
          <Icon name="check" size={18} color={colors.secondary} style={{ marginRight: spacing.xs }} />
          <Text style={styles.ctaText}>{savingPrefs ? 'Saving…' : 'Save Preferences'}</Text>
        </TouchableOpacity>
      </View>
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Profile</Text>
        {/* Notifications navigation hidden per request */}
        <Text style={styles.inputLabel}>Full Name</Text>
        <TextInput
          style={styles.input}
          value={fullName}
          onChangeText={setFullName}
          placeholder="Your name"
          placeholderTextColor={colors.text.disabled}
        />
        {/* Avatar URL hidden for now */}
        <Text style={styles.inputLabel}>Location</Text>
        <TextInput
          style={styles.input}
          value={location}
          onChangeText={setLocation}
          placeholder="City, ST"
          placeholderTextColor={colors.text.disabled}
        />
        <TouchableOpacity style={[styles.cta, savingProfile && { opacity: 0.7 }]} onPress={saveProfile} disabled={savingProfile}>
          <Icon name="check" size={18} color={colors.secondary} style={{ marginRight: spacing.xs }} />
          <Text style={styles.ctaText}>{savingProfile ? 'Saving…' : 'Save Changes'}</Text>
        </TouchableOpacity>
      </View>

      {/* Admin Section - Only visible to admin users */}
      {profile?.is_admin && (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Admin</Text>
          <View style={styles.rowStatic}>
            <Icon name="shield-check" size={18} color={colors.primary} />
            <Text style={styles.rowLabel}>Admin Access</Text>
            <Text style={styles.rowValue}>Enabled</Text>
          </View>
          <TouchableOpacity
            style={styles.row}
            onPress={() => navigation.navigate('AnalyticsDashboard' as never)}
          >
            <Icon name="graph" size={18} color={colors.primary} />
            <Text style={styles.rowLabel}>Analytics Dashboard</Text>
            <Icon name="chevron-right" size={16} color={colors.text.secondary} />
          </TouchableOpacity>
        </View>
      )}

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Security</Text>
        {!!profile.last_login && (
          <View style={styles.rowStatic}>
            <Icon name="clock" size={18} color={colors.text.secondary} />
            <Text style={styles.rowLabel}>Last Login</Text>
            <Text style={styles.rowValue}>{new Date(profile.last_login).toLocaleString()}</Text>
          </View>
        )}
        <TouchableOpacity 
          style={styles.row} 
          onPress={() => handleExternalLink('https://www.mind-clear.com/privacy.html')}
        >
          <Icon name="shield" size={18} color={colors.primary} />
          <Text style={styles.rowLabel}>Privacy Policy</Text>
          <Icon name="link-external" size={16} color={colors.text.secondary} />
        </TouchableOpacity>

        {/* Terms of Service link hidden per request */}

        <TouchableOpacity
          style={[styles.cta, { backgroundColor: colors.error, marginTop: spacing.md }]}
          onPress={async () => {
            try {
              await authService.logout();
              setToastMessage('Signed out');
              setToastVisible(true);
              // No need to manually navigate - AppNavigator will handle this automatically
            } catch {}
          }}
        >
          <Icon name="sign-out" size={18} color={colors.secondary} style={{ marginRight: spacing.xs }} />
          <Text style={styles.ctaText}>Sign Out</Text>
        </TouchableOpacity>

        {/* Delete Account Section */}
        <View style={[styles.section, { marginTop: spacing.xl }]}>
          <Text style={styles.sectionTitle}>Danger Zone</Text>
          <TouchableOpacity
            style={[styles.cta, { backgroundColor: '#dc2626', marginTop: spacing.sm }]}
            onPress={handleDeleteAccount}
          >
            <Icon name="trash" size={18} color={colors.secondary} style={{ marginRight: spacing.xs }} />
            <Text style={styles.ctaText}>Delete Account</Text>
          </TouchableOpacity>
        </View>
      </View>
      </ScrollView>

      {/* Delete Account Confirmation Modal */}
      <Modal
        visible={showDeleteModal}
        transparent={true}
        animationType="fade"
        onRequestClose={() => setShowDeleteModal(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContainer}>
            <View style={styles.modalHeader}>
              <Icon name="alert" size={24} color={colors.error} />
              <Text style={styles.modalTitle}>Final Confirmation</Text>
            </View>
            
            <Text style={styles.modalMessage}>
              This will permanently delete your account and all data. This action cannot be undone.
            </Text>
            
            <Text style={styles.modalInstruction}>
              Type <Text style={styles.deleteText}>DELETE</Text> to confirm:
            </Text>
            
            <TextInput
              style={styles.modalInput}
              value={deleteConfirmationText}
              onChangeText={setDeleteConfirmationText}
              placeholder="Type DELETE here"
              placeholderTextColor={colors.text.secondary}
              autoCapitalize="characters"
              autoCorrect={false}
            />
            
            <View style={styles.modalButtons}>
              <TouchableOpacity
                style={[styles.modalButton, styles.modalCancelButton]}
                onPress={() => setShowDeleteModal(false)}
              >
                <Text style={styles.modalCancelButtonText}>Cancel</Text>
              </TouchableOpacity>
              
              <TouchableOpacity
                style={[
                  styles.modalButton,
                  styles.modalDeleteButton,
                  deleteConfirmationText !== 'DELETE' && styles.modalDeleteButtonDisabled
                ]}
                onPress={handleConfirmDelete}
                disabled={deleteConfirmationText !== 'DELETE' || saving}
              >
                <Text style={styles.modalDeleteButtonText}>
                  {saving ? 'Deleting...' : 'Delete Account'}
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    padding: spacing.lg,
    backgroundColor: colors.secondary,
  },
  safeArea: {
    flex: 1,
    backgroundColor: colors.secondary,
  },
  centered: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.secondary,
  },
  loadingText: {
    marginTop: spacing.sm,
    color: colors.text.secondary,
    fontSize: typography.fontSize.sm,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: spacing.xl,
  },
  // avatar styles hidden for now
  name: {
    color: colors.text.primary,
    fontSize: typography.fontSize.lg,
    fontWeight: typography.fontWeight.semibold as any,
  },
  email: {
    color: colors.text.secondary,
    fontSize: typography.fontSize.sm,
    marginTop: 2,
  },
  meta: {
    color: colors.text.secondary,
    fontSize: typography.fontSize.xs,
    marginTop: 2,
  },
  statusChip: {
    marginLeft: 'auto',
    backgroundColor: colors.background.surface,
    borderRadius: borderRadius.full,
    paddingHorizontal: spacing.sm,
    paddingVertical: 4,
    borderWidth: 1,
    borderColor: colors.border.light,
  },
  statusText: {
    color: colors.text.secondary,
    fontSize: typography.fontSize.xs,
    textTransform: 'capitalize',
  },
  adminBadge: {
    backgroundColor: colors.primary,
    borderRadius: borderRadius.full,
    paddingHorizontal: spacing.sm,
    paddingVertical: 4,
    marginTop: spacing.xs,
    alignSelf: 'flex-start',
  },
  adminBadgeText: {
    color: colors.secondary,
    fontSize: typography.fontSize.xs,
    fontWeight: typography.fontWeight.semibold as any,
    textTransform: 'uppercase',
  },
  section: {
    marginBottom: spacing.lg,
    backgroundColor: colors.secondary,
  },
  sectionTitle: {
    color: colors.text.primary,
    fontSize: typography.fontSize.base,
    fontWeight: typography.fontWeight.semibold as any,
    marginBottom: spacing.sm,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: spacing.md,
    borderTopWidth: 1,
    borderColor: colors.border.light,
  },
  rowStatic: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: spacing.md,
    borderTopWidth: 1,
    borderColor: colors.border.light,
  },
  rowDisabled: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: spacing.md,
    borderTopWidth: 1,
    borderColor: colors.border.light,
    opacity: 0.8,
  },
  rowLabel: {
    marginLeft: spacing.sm,
    color: colors.text.primary,
    fontSize: typography.fontSize.base,
    flex: 1,
  },
  rowValue: {
    color: colors.text.secondary,
    fontSize: typography.fontSize.sm,
  },
  permissionStatus: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  rowHint: {
    color: colors.text.disabled,
    fontSize: typography.fontSize.sm,
  },
  inputLabel: {
    color: colors.text.secondary,
    fontSize: typography.fontSize.sm,
    marginBottom: spacing.xs,
    marginTop: spacing.sm,
  },
  input: {
    borderWidth: 1,
    borderColor: colors.border.light,
    borderRadius: borderRadius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    color: colors.text.primary,
  },
  cta: {
    marginTop: spacing.md,
    backgroundColor: colors.primary,
    borderRadius: borderRadius.md,
    paddingVertical: spacing.md,
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'center',
  },
  ctaText: {
    color: colors.secondary,
    fontSize: typography.fontSize.base,
    fontWeight: typography.fontWeight.medium as any,
  },
  // Modal styles
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: spacing.lg,
  },
  modalContainer: {
    backgroundColor: colors.background.surface,
    borderRadius: borderRadius.lg,
    padding: spacing.lg,
    width: '100%',
    maxWidth: 400,
  },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: spacing.md,
  },
  modalTitle: {
    fontSize: typography.fontSize.lg,
    fontWeight: typography.fontWeight.bold as any,
    color: colors.text.primary,
    marginLeft: spacing.sm,
  },
  modalMessage: {
    fontSize: typography.fontSize.base,
    color: colors.text.primary,
    marginBottom: spacing.md,
    lineHeight: 22,
  },
  modalInstruction: {
    fontSize: typography.fontSize.base,
    color: colors.text.primary,
    marginBottom: spacing.sm,
  },
  deleteText: {
    fontWeight: typography.fontWeight.bold as any,
    color: colors.error,
  },
  modalInput: {
    borderWidth: 1,
    borderColor: colors.border.light,
    borderRadius: borderRadius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    fontSize: typography.fontSize.base,
    color: colors.text.primary,
    backgroundColor: colors.background.primary,
    marginBottom: spacing.lg,
  },
  modalButtons: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: spacing.sm,
  },
  modalButton: {
    flex: 1,
    paddingVertical: spacing.md,
    borderRadius: borderRadius.md,
    alignItems: 'center',
  },
  modalCancelButton: {
    backgroundColor: colors.background.surface,
    borderWidth: 1,
    borderColor: colors.border.light,
  },
  modalCancelButtonText: {
    color: colors.text.primary,
    fontSize: typography.fontSize.base,
    fontWeight: typography.fontWeight.medium as any,
  },
  modalDeleteButton: {
    backgroundColor: colors.error,
  },
  modalDeleteButtonDisabled: {
    backgroundColor: colors.text.disabled,
  },
  modalDeleteButtonText: {
    color: colors.secondary,
    fontSize: typography.fontSize.base,
    fontWeight: typography.fontWeight.medium as any,
  },
});


