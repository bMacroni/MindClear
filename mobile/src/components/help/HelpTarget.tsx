import React, { useCallback, useEffect, useRef, useState } from 'react';
import { View, StyleSheet } from 'react-native';
import { Popable } from 'react-native-popable';
import { useHelp, useHelpLocalScope } from '../../contexts/HelpContext';
import { colors } from '../../themes/colors';

interface HelpTargetProps {
  helpId: string;
  children: React.ReactNode;
  style?: any;
}

export const HelpTarget: React.FC<HelpTargetProps> = ({ helpId, children, style }) => {
  const { isHelpOverlayActive, helpContent, registerTargetLayout, unregisterTargetLayout, currentScope } = useHelp();
  const localScope = useHelpLocalScope();
  const ref = useRef<View>(null);
  const lastLayoutRef = useRef<{ x: number; y: number; width: number; height: number; pageX: number; pageY: number } | null>(null);
  const [lastRegisteredScope, setLastRegisteredScope] = useState<string | null>(null);
  const measureTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const isMeasuringRef = useRef<boolean>(false);

  // Debounced measure function to prevent excessive callbacks
  const measure = useCallback(() => {
    // Ensure we don’t stomp on an in-flight measure; if one’s running, queue up a retry
    const isMeasuringRef   = useRef<boolean>(false);
    const pendingMeasureRef = useRef<boolean>(false);

    // …

    // Debounced measurement entrypoint
    if (!ref.current) {
      return;
    }

    if (isMeasuringRef.current) {
      // A measure is in flight – mark that we need to run again when it finishes
      pendingMeasureRef.current = true;
      return;
    }

    // Clear any pending measure calls
    if (measureTimeoutRef.current) {
      clearTimeout(measureTimeoutRef.current);
    }

    // Debounce measure calls by 16ms (roughly 60fps)
    measureTimeoutRef.current = setTimeout(() => {
      if (!ref.current) { return; }

      isMeasuringRef.current = true;

      ref.current.measure((x, y, width, height, pageX, pageY) => {
        // Mark the timeout cleared and the in-flight flag reset
        measureTimeoutRef.current = null;
        isMeasuringRef.current = false;

        // Capture whether we should immediately re-run
        const shouldRetry = pendingMeasureRef.current;
        pendingMeasureRef.current = false;

        const next = { x: pageX, y: pageY, width, height, pageX, pageY };
        const prev = lastLayoutRef.current;
        const changed = !prev
          || Math.abs(prev.x - next.x) > 0.5
          || Math.abs(prev.y - next.y) > 0.5
          || Math.abs(prev.width - next.width) > 0.5
          || Math.abs(prev.height - next.height) > 0.5;

        if (changed) {
          lastLayoutRef.current = next;
          const targetScope = localScope || 'default';

          // Unregister from previous scope if it exists and is different
          if (lastRegisteredScope && lastRegisteredScope !== targetScope) {
            unregisterTargetLayout(helpId, lastRegisteredScope);
          }

          if (!localScope || localScope === (currentScope || 'default')) {
            registerTargetLayout(helpId, next, targetScope);
            setLastRegisteredScope(targetScope);
          }
        }

        // If any layout events fired while we were measuring, run again
        if (shouldRetry) {
          measure();
        }
      });
    }, 16);
  }, [helpId, registerTargetLayout, unregisterTargetLayout, currentScope, localScope, lastRegisteredScope]);

  // Cleanup function
  const cleanup = useCallback(() => {
    if (measureTimeoutRef.current) {
      clearTimeout(measureTimeoutRef.current);
      measureTimeoutRef.current = null;
    }
    if (lastRegisteredScope) {
      unregisterTargetLayout(helpId, lastRegisteredScope);
    }
  }, [helpId, unregisterTargetLayout, lastRegisteredScope]);

  // Initial measure and cleanup on mount/unmount
  useEffect(() => {
    measure();
    return cleanup;
  }, []);

  // Re-measure when help mode toggles (debounced)
  useEffect(() => {
    if (isHelpOverlayActive) {
      measure();
    }
  }, [isHelpOverlayActive, measure]);

  // Re-measure when the help scope changes (debounced)
  useEffect(() => {
    // Clean up from previous scope before changing
    if (lastRegisteredScope) {
      unregisterTargetLayout(helpId, lastRegisteredScope);
      setLastRegisteredScope(null);
    }
    lastLayoutRef.current = null;
    measure();
  }, [currentScope, localScope, helpId, unregisterTargetLayout, measure]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      cleanup();
    };
  }, [cleanup]);

  const baseId = React.useMemo(() => {
    const idx = helpId.indexOf(':');
    return idx > -1 ? helpId.slice(0, idx) : helpId;
  }, [helpId]);
  const content = helpContent?.[helpId] || helpContent?.[baseId] || '';

  // Optimized onLayout handler
  const handleLayout = useCallback(() => {
    measure();
  }, [measure]);

  // Do not alter layout when help mode is inactive
  if (!isHelpOverlayActive) {
    return (
      <View ref={ref} onLayout={handleLayout} style={style}>
        {children}
      </View>
    );
  }

  return (
    <View ref={ref} onLayout={handleLayout} style={style}>
      <Popable content={content} position="bottom" visible={isHelpOverlayActive ? undefined : false}>
        {/* Disable child interactions while help is active so only tooltip opens */}
        <View pointerEvents={isHelpOverlayActive ? 'none' : 'auto'}>
          {children}
        </View>
      </Popable>
    </View>
  );
};

const styles = StyleSheet.create({
  highlight: {
    borderWidth: 0,
    backgroundColor: 'transparent',
  },
});

export default HelpTarget;