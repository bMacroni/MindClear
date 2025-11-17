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
import type { TextStyle } from 'react-native';
import { colors } from '../../themes/colors';
import { spacing, borderRadius } from '../../themes/spacing';
import { typography } from '../../themes/typography';
import Icon from 'react-native-vector-icons/Octicons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

interface InfoToastProps {
  visible: boolean;
  message: string;
  onClose: () => void;
  duration?: number;
  actionLabel?: string;
  onActionPress?: () => void;
}

export const InfoToast: React.FC<InfoToastProps> = ({
  visible,
  message,
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

  if (!visible) {return null;}

  return (
    <Animated.View
      accessibilityLiveRegion="polite"
      accessible
      accessibilityLabel={`Info: ${message}`}
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
          <Icon name="info" size={24} color={colors.info} />
        </View>
        
        <View style={styles.content}>
          <Text style={styles.message}>{message}</Text>
          
          {actionLabel && onActionPress && (
            <TouchableOpacity 
              style={styles.actionBtn} 
              onPress={() => { onActionPress(); hideToast(); }}
              accessibilityRole="button"
              accessibilityLabel={`${actionLabel} button`}
              accessible={true}
              hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
            >
              <Text style={styles.actionText}>{actionLabel}</Text>
            </TouchableOpacity>
          )}
        </View>
        
        <TouchableOpacity 
          style={styles.closeButton} 
          onPress={hideToast}
          accessibilityRole="button"
          accessibilityLabel="Close info message"
          accessible={true}
          hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
        >
          <Icon name="x" size={16} color={colors.text.secondary} />
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
    backgroundColor: '#EFF6FF',
    borderRadius: borderRadius.md,
    borderWidth: 1,
    borderColor: '#BFDBFE',
    shadowColor: colors.shadow,
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
    fontWeight: typography.fontWeight.medium as TextStyle['fontWeight'],
    color: colors.text.primary,
    marginBottom: spacing.xs,
  },
  closeButton: {
    padding: spacing.xs,
    marginLeft: spacing.xs,
  },
  actionBtn: {
    alignSelf: 'flex-start',
    paddingVertical: 6,
    paddingHorizontal: 10,
    backgroundColor: colors.info,
    borderRadius: borderRadius.sm,
  },
  actionText: {
    color: colors.secondary,
    fontSize: typography.fontSize.sm,
    fontWeight: typography.fontWeight.bold as TextStyle['fontWeight'],
  },
});


