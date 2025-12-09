import React, { useEffect, useMemo, useRef, useCallback, useState } from 'react';
import { View, Text, StyleSheet, Dimensions } from 'react-native';
import Animated, {
  Easing,
  Layout as ReanimatedLayout,
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withTiming,
} from 'react-native-reanimated';
import Icon from 'react-native-vector-icons/Octicons';
import { colors } from '../../themes/colors';
import { spacing, borderRadius } from '../../themes/spacing';
import { typography } from '../../themes/typography';

type RenderControls = {
  trigger: () => void;
  animating: boolean;
};

interface CelebratoryDismissalProps {
  onComplete: () => void;
  messages?: string[];
  children: (controls: RenderControls) => React.ReactNode;
  testID?: string;
}

const defaultMessages = [
  'Great job!',
  'Nice!',
  'Crushing it!',
  'Done!',
  'On fire!',
];

/**
 * Wraps a list item to slide it off to the right, reveal praise beneath,
 * pause briefly, then invoke onComplete so the list can remove/collapse.
 */
export const CelebratoryDismissal: React.FC<CelebratoryDismissalProps> = ({
  children,
  onComplete,
  messages = defaultMessages,
  testID,
}) => {
  const width = useMemo(() => Dimensions.get('window').width, []);
  const message = useMemo(
    () => messages[Math.floor(Math.random() * messages.length)] || 'Nice!',
    [messages]
  );

  const translateX = useSharedValue(0);
  const opacity = useSharedValue(1);
  const [animating, setAnimating] = useState(false);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
    };
  }, []);

  const finish = useCallback(() => {
    setAnimating(false);
    onComplete?.();
  }, [onComplete]);

  const trigger = useCallback(() => {
    if (animating) {
      return;
    }
    setAnimating(true);
    translateX.value = 0;
    opacity.value = 1;

    // Phase 1: slide off to the right
    translateX.value = withTiming(
      width + spacing.lg,
      {
        duration: 300,
        easing: Easing.out(Easing.cubic),
      },
      () => {
        // Phase 2: brief bask, then call onComplete
        opacity.value = withDelay(
          500,
          withTiming(
            0,
            { duration: 50 },
            () => {
              runOnJS(finish)();
            }
          )
        );
      }
    );
  }, [animating, finish, opacity, translateX, width]);

  const cardStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: translateX.value }],
    opacity: opacity.value,
  }));

  return (
    <Animated.View
      layout={ReanimatedLayout.springify()}
      style={styles.wrapper}
      testID={testID}
    >
      {/* Celebration layer (behind) */}
      <View 
        style={styles.celebrationLayer} 
        pointerEvents="none"
        accessibilityLabel={`Success: ${message}`}
        accessibilityRole="text"
      >
        <Text style={styles.celebrationText}>{message}</Text>
      </View>
      {/* Content layer (front) */}
      <Animated.View
        style={[styles.frontLayer, cardStyle]}
        // Allow Reanimated layout to cooperate with Moti for gap-fill smoothness
        layout={ReanimatedLayout.springify()}
      >
        {children({ trigger, animating })}
      </Animated.View>
    </Animated.View>
  );
};

const styles = StyleSheet.create({
  wrapper: {
    marginBottom: spacing.sm,
    position: 'relative',
    width: '100%',
    borderRadius: borderRadius.md,
    overflow: 'hidden',
  },
  celebrationLayer: {
    ...StyleSheet.absoluteFillObject,
    borderRadius: borderRadius.md,
    backgroundColor: colors.success,
    alignItems: 'center',
    justifyContent: 'center',
    paddingTop: spacing.md + spacing.sm,
    paddingBottom: spacing.md,
    paddingHorizontal: spacing.lg,
    flexDirection: 'row',
    gap: spacing.sm,
  },
  celebrationText: {
    color: colors.background.surface,
    fontSize: typography.fontSize.base * 3,
    fontWeight: typography.fontWeight.semibold as any,
  },
  frontLayer: {
    position: 'relative',
    zIndex: 1,
  },
});

export default CelebratoryDismissal;

