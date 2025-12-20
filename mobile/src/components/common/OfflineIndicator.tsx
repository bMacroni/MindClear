import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Animated } from 'react-native';
import { HugeiconsIcon as Icon } from '@hugeicons/react-native';
import { WifiOffIcon, Wifi01Icon, RefreshIcon, Clock01Icon } from '@hugeicons/core-free-icons';
import { colors } from '../../themes/colors';
import { typography } from '../../themes/typography';
import { spacing } from '../../themes/spacing';
import { offlineService, OfflineState } from '../../services/offline';

interface OfflineIndicatorProps {
  onSyncPress?: () => void;
}

export const OfflineIndicator: React.FC<OfflineIndicatorProps> = ({ onSyncPress }) => {
  const [offlineState, setOfflineState] = useState<OfflineState>({
    isOnline: true,
    isSyncing: false,
    pendingActions: 0,
    lastSyncTime: null,
  });
  const [slideAnim] = useState(new Animated.Value(-50));

  useEffect(() => {
    // Get initial state
    const getInitialState = async () => {
      const state = await offlineService.getOfflineState();
      setOfflineState(state);
    };
    getInitialState();

    // Subscribe to state changes
    const unsubscribe = offlineService.subscribe((state) => {
      setOfflineState(state);

      // Animate in/out based on offline status
      if (!state.isOnline || state.pendingActions > 0) {
        Animated.spring(slideAnim, {
          toValue: 0,
          useNativeDriver: true,
        }).start();
      } else {
        Animated.spring(slideAnim, {
          toValue: -50,
          useNativeDriver: true,
        }).start();
      }
    });

    return () => {
      // Cleanup subscription
      unsubscribe();
    };
  }, [slideAnim]);

  const handleSyncPress = () => {
    if (onSyncPress) {
      onSyncPress();
    } else {
      offlineService.syncOfflineQueue();
    }
  };

  const getStatusText = () => {
    if (!offlineState.isOnline) {
      return 'Offline';
    }
    if (offlineState.isSyncing) {
      return 'Syncing...';
    }
    if (offlineState.pendingActions > 0) {
      return `${offlineState.pendingActions} pending`;
    }
    return 'Online';
  };

  const getStatusColor = () => {
    if (!offlineState.isOnline) {
      return colors.error;
    }
    if (offlineState.isSyncing) {
      return colors.warning;
    }
    if (offlineState.pendingActions > 0) {
      return colors.warning;
    }
    return colors.success;
  };

  const getStatusIcon = () => {
    if (!offlineState.isOnline) {
      return WifiOffIcon;
    }
    if (offlineState.isSyncing) {
      return RefreshIcon;
    }
    if (offlineState.pendingActions > 0) {
      return Clock01Icon;
    }
    return Wifi01Icon;
  };

  // Don't show indicator if online and no pending actions
  if (offlineState.isOnline && offlineState.pendingActions === 0 && !offlineState.isSyncing) {
    return null;
  }

  return (
    <Animated.View
      style={[
        styles.container,
        { transform: [{ translateY: slideAnim }] }
      ]}
    >
      <View style={[styles.indicator, { backgroundColor: getStatusColor() }]}>
        <Icon icon={getStatusIcon()} size={16} color={colors.secondary} />
        <Text style={styles.text}>{getStatusText()}</Text>

        {(offlineState.pendingActions > 0 || !offlineState.isOnline) && (
          <TouchableOpacity
            style={styles.syncButton}
            onPress={handleSyncPress}
            disabled={offlineState.isSyncing}
          >
            <Icon
              icon={RefreshIcon}
              size={14}
              color={colors.secondary}
              style={offlineState.isSyncing ? styles.spinning : undefined}
            />
          </TouchableOpacity>
        )}
      </View>
    </Animated.View>
  );
};

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    zIndex: 1000,
  },
  indicator: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    marginHorizontal: spacing.md,
    marginTop: spacing.sm,
    borderRadius: spacing.xs,
    shadowColor: colors.shadow,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  text: {
    marginLeft: spacing.xs,
    fontSize: typography.fontSize.sm,
    fontWeight: typography.fontWeight.medium as any,
    color: colors.secondary,
  },
  syncButton: {
    marginLeft: spacing.sm,
    padding: spacing.xs,
    borderRadius: spacing.xs,
  },
  spinning: {
    transform: [{ rotate: '360deg' }],
  },
}); 