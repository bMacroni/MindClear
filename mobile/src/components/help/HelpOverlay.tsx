import React, { useMemo } from 'react';
import { View, StyleSheet, TouchableWithoutFeedback, Dimensions } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Icon from 'react-native-vector-icons/Octicons';
import { useHelp } from '../../contexts/HelpContext';
import { colors } from '../../themes/colors';

const { width: screenWidth, height: screenHeight } = Dimensions.get('window');

export const HelpOverlay: React.FC = () => {
  const { isHelpOverlayActive, setIsHelpOverlayActive, targetLayouts } = useHelp();
  const insets = useSafeAreaInsets();

  // Gather target rects
  const targets = Object.values(targetLayouts);

  // Compute non-overlapping dim rectangles that exclude all target areas
  const dimRects = useMemo(() => {
    if (!targets.length) {
      return [
        { left: 0, top: 0, width: screenWidth, height: screenHeight },
      ];
    }
    const yCuts: number[] = [0, screenHeight];
    targets.forEach(t => {
      yCuts.push(Math.max(0, t.pageY));
      yCuts.push(Math.min(screenHeight, t.pageY + t.height));
    });
    // sort and unique
    yCuts.sort((a, b) => a - b);
    const uniqYCuts: number[] = [];
    for (const y of yCuts) {
      if (uniqYCuts.length === 0 || Math.abs(uniqYCuts[uniqYCuts.length - 1] - y) > 0.5) {
        uniqYCuts.push(y);
      }
    }

    const rects: { left: number; top: number; width: number; height: number }[] = [];
    for (let i = 0; i < uniqYCuts.length - 1; i++) {
      const y1 = uniqYCuts[i];
      const y2 = uniqYCuts[i + 1];
      const slabHeight = y2 - y1;
      if (slabHeight <= 0) { continue; }

      // Determine x-intervals covered by holes in this horizontal slab
      const covered: Array<[number, number]> = [];
      targets.forEach(t => {
        const top = t.pageY;
        const bottom = t.pageY + t.height;
        if (bottom <= y1 || top >= y2) { return; }
        const x1 = Math.max(0, t.pageX);
        const x2 = Math.min(screenWidth, t.pageX + t.width);
        covered.push([x1, x2]);
      });
      // Merge covered intervals
      covered.sort((a, b) => a[0] - b[0]);
      const merged: Array<[number, number]> = [];
      for (const [a, b] of covered) {
        if (!merged.length || a > merged[merged.length - 1][1]) {
          merged.push([a, b]);
        } else {
          merged[merged.length - 1][1] = Math.max(merged[merged.length - 1][1], b);
        }
      }
      // Now compute gaps (dim regions) between 0..screenWidth minus merged
      let prev = 0;
      for (const [a, b] of merged) {
        if (a > prev) {
          rects.push({ left: prev, top: y1, width: a - prev, height: slabHeight });
        }
        prev = Math.max(prev, b);
      }
      if (prev < screenWidth) {
        rects.push({ left: prev, top: y1, width: screenWidth - prev, height: slabHeight });
      }
    }
    return rects;
  }, [targets]);

  if (!isHelpOverlayActive) {
    return null;
  }

  return (
    <View style={styles.container} pointerEvents="box-none">
      {/* Render clickable dim rectangles that avoid holes */}
      {dimRects.map((r, idx) => (
        <TouchableWithoutFeedback key={`dim-${idx}`} onPress={() => setIsHelpOverlayActive(false)}>
          <View style={[styles.mask, { top: r.top, left: r.left, width: r.width, height: r.height }]} />
        </TouchableWithoutFeedback>
      ))}

      {/* Close button in the top-right corner */}
      <View style={[styles.closeContainer, { top: insets.top + 16 }]} pointerEvents="box-none">
        <TouchableWithoutFeedback onPress={() => setIsHelpOverlayActive(false)}>
          <View style={styles.closeButton}>
            <Icon name="x" size={18} color={colors.secondary} />
          </View>
        </TouchableWithoutFeedback>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 9999,
  },
  dim: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: colors.overlay,
  },
  mask: {
    position: 'absolute',
    backgroundColor: colors.overlay,
  },
  closeContainer: {
    position: 'absolute',
    top: 16,
    right: 16,
  },
  closeButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: colors.border.light,
  },
});

export default HelpOverlay;


