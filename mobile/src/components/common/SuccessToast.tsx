import React, { useEffect, useRef, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Animated,
  TouchableOpacity,
  Platform,
  StatusBar,
} from 'react-native';
import { colors } from '../../themes/colors';
import { spacing, borderRadius } from '../../themes/spacing';
import { typography } from '../../themes/typography';
import { HugeiconsIcon as Icon } from '@hugeicons/react-native';
import { TickCircleIcon, Clock01Icon, Calendar01Icon, Cancel01Icon } from '@hugeicons/core-free-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

interface SuccessToastProps {
  visible: boolean;
  message: string;
  scheduledTime?: string;
  calendarEventCreated?: boolean;
  onClose: () => void;
  duration?: number;
  actionLabel?: string;
  onActionPress?: () => void;
}

export const SuccessToast: React.FC<SuccessToastProps> = ({
  visible,
  message,
  scheduledTime,
  calendarEventCreated = false,
  onClose,
  duration = 4000,
  actionLabel,
  onActionPress,
}) => {
  const insets = useSafeAreaInsets();
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const slideAnim = useRef(new Animated.Value(-100)).current;

  const hideToast = useCallback(() => {
    Animated.parallel([
      Animated.timing(fadeAnim, {
        toValue: 0,
        duration: 300,
        useNativeDriver: true,
      }),
      Animated.timing(slideAnim, {
        toValue: -100,
        duration: 300,
        useNativeDriver: true,
      }),
    ]).start(() => {
      onClose();
    });
  }, [fadeAnim, slideAnim, onClose]);

  useEffect(() => {
    if (visible) {
      // Slide in and fade in
      Animated.parallel([
        Animated.timing(fadeAnim, {
          toValue: 1,
          duration: 300,
          useNativeDriver: true,
        }),
        Animated.timing(slideAnim, {
          toValue: 0,
          duration: 300,
          useNativeDriver: true,
        }),
      ]).start();

      // Auto hide after duration
      const timer = setTimeout(() => {
        hideToast();
      }, duration);

      return () => clearTimeout(timer);
    }
  }, [visible, duration, hideToast, fadeAnim, slideAnim]);

  const formatScheduledTime = (timeString: string) => {
    const date = new Date(timeString);
    const now = new Date();
    const tomorrow = new Date(now);
    tomorrow.setDate(tomorrow.getDate() + 1);

    if (date.toDateString() === now.toDateString()) {
      return `today at ${date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;
    } else if (date.toDateString() === tomorrow.toDateString()) {
      return `tomorrow at ${date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;
    } else {
      return `${date.toLocaleDateString()} at ${date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;
    }
  };

  if (!visible) { return null; }

  return (
    <Animated.View
      style={[
        styles.container,
        {
          opacity: fadeAnim,
          transform: [{ translateY: slideAnim }],
          top: Platform.select({
            android: (StatusBar.currentHeight || 0) + spacing.sm,
            ios: Math.max(spacing.sm, insets.top) + spacing.sm,
            default: spacing.sm,
          }),
        },
      ]}
    >
      <View style={styles.toast}>
        <View style={styles.iconContainer}>
          <Icon icon={TickCircleIcon} size={24} color={colors.success} />
        </View>

        <View style={styles.content}>
          <Text style={styles.message}>{message}</Text>

          {scheduledTime && (
            <View style={styles.scheduledTimeContainer}>
              <Icon icon={Clock01Icon} size={14} color={colors.text.secondary} />
              <Text style={styles.scheduledTimeText}>
                Scheduled for {formatScheduledTime(scheduledTime)}
              </Text>
            </View>
          )}

          {calendarEventCreated && (
            <View style={styles.calendarContainer}>
              <Icon icon={Calendar01Icon} size={14} color={colors.text.secondary} />
              <Text style={styles.calendarText}>
                Added to calendar
              </Text>
            </View>
          )}
          {actionLabel && onActionPress && (
            <TouchableOpacity style={styles.actionBtn} onPress={() => { onActionPress(); hideToast(); }}>
              <Text style={styles.actionText}>{actionLabel}</Text>
            </TouchableOpacity>
          )}
        </View>

        <TouchableOpacity style={styles.closeButton} onPress={hideToast}>
          <Icon icon={Cancel01Icon} size={16} color={colors.text.secondary} />
        </TouchableOpacity>
      </View>
    </Animated.View>
  );
};

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    left: spacing.md,
    right: spacing.md,
    zIndex: 1000,
  },
  toast: {
    backgroundColor: '#F2F2F2',
    borderRadius: borderRadius.md,
    borderWidth: 1,
    borderColor: '#E5E5E5',
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: 2,
    },
    shadowOpacity: 0.2,
    shadowRadius: 4,
    elevation: 6,
    flexDirection: 'row',
    alignItems: 'flex-start',
    padding: spacing.sm,
  },
  iconContainer: {
    marginRight: spacing.sm,
    marginTop: 2,
  },
  content: {
    flex: 1,
  },
  message: {
    fontSize: typography.fontSize.base,
    fontWeight: typography.fontWeight.medium as any,
    color: colors.text.primary,
    marginBottom: spacing.xs,
  },
  scheduledTimeContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    marginBottom: spacing.xs,
  },
  scheduledTimeText: {
    fontSize: typography.fontSize.sm,
    color: colors.text.secondary,
  },
  calendarContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
  calendarText: {
    fontSize: typography.fontSize.sm,
    color: colors.text.secondary,
  },
  closeButton: {
    padding: spacing.xs,
    marginLeft: spacing.xs,
  },
  actionBtn: {
    alignSelf: 'flex-start',
    paddingVertical: 6,
    paddingHorizontal: 10,
    backgroundColor: colors.primary,
    borderRadius: borderRadius.sm,
  },
  actionText: {
    color: colors.secondary,
    fontSize: typography.fontSize.sm,
    fontWeight: typography.fontWeight.bold as any,
  },
});