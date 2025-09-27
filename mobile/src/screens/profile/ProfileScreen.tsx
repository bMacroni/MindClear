import React, { useEffect, useState, useCallback } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView, TextInput, Switch, StatusBar, Linking, Alert } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Icon from 'react-native-vector-icons/Octicons';
import { colors } from '../../themes/colors';
import { spacing, borderRadius } from '../../themes/spacing';
import { typography } from '../../themes/typography';
import { usersAPI } from '../../services/api';
import { SuccessToast } from '../../components/common/SuccessToast';
import { LoadingSkeleton } from '../../components/common/LoadingSkeleton';
import { authService } from '../../services/auth';
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
        Alert.alert('Unable to open link');
        return;
      }
      await Linking.openURL(url);
    } catch (error) {
      console.error('Failed to open external link', error);
      Alert.alert('Unable to open link');
    }
  }, []);

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
        <TouchableOpacity 
          style={styles.row} 
          onPress={() => navigation.navigate('Notifications' as never)}
        >
          <Icon name="bell" size={18} color={colors.primary} />
          <Text style={styles.rowLabel}>Notifications</Text>
          <Icon name="chevron-right" size={16} color={colors.text.secondary} />
        </TouchableOpacity>
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
          onPress={() => handleExternalLink('https://your-privacy-policy-url.com')}
        >
          <Icon name="shield" size={18} color={colors.primary} />
          <Text style={styles.rowLabel}>Privacy Policy</Text>
          <Icon name="link-external" size={16} color={colors.text.secondary} />
        </TouchableOpacity>

        <TouchableOpacity 
          style={styles.row} 
          onPress={() => handleExternalLink('https://your-terms-of-service-url.com')}
        >
          <Icon name="file-text" size={18} color={colors.primary} />
          <Text style={styles.rowLabel}>Terms of Service</Text>
          <Icon name="link-external" size={16} color={colors.text.secondary} />
        </TouchableOpacity>

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
      </View>
      </ScrollView>
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
});


