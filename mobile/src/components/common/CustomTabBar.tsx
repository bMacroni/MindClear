import React, { useEffect, useRef } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Platform, Animated } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import {
  PencilEdit01Icon,
  Comment01Icon,
  Flag01Icon,
  Task01Icon,
  Calendar01Icon,
  RepeatIcon,
  ArrowDown01Icon,
  AiBrain02Icon
} from '@hugeicons/core-free-icons';
import { HugeiconsIcon as Icon } from '@hugeicons/react-native';
import { colors } from '../../themes/colors';
import { typography } from '../../themes/typography';

interface CustomTabBarProps {
  state: any;
  descriptors: any;
  navigation: any;
}

export const CustomTabBar: React.FC<CustomTabBarProps> = ({ state, descriptors, navigation }) => {
  const insets = useSafeAreaInsets();
  const pulseAnim = useRef(new Animated.Value(0)).current;

  const brainDumpRouteIndex = state.routes.findIndex((r: any) => r.name === 'BrainDump');
  const isBrainDumpFocused = state.index === brainDumpRouteIndex;

  useEffect(() => {
    // Reset pulse animation when focus changes
    pulseAnim.setValue(0);
    pulseAnim.stopAnimation();
  }, [isBrainDumpFocused, pulseAnim]);

  const getIconComponent = (routeName: string) => {
    switch (routeName) {
      case 'BrainDump':
        return AiBrain02Icon;
      case 'AIChat':
        return Comment01Icon;
      case 'Goals':
        return Flag01Icon;
      case 'Tasks':
        return Task01Icon;
      case 'Routines':
        return RepeatIcon;
      case 'Calendar':
        return Calendar01Icon;
      default:
        return Comment01Icon;
    }
  };

  // Reorder: Routines, Goals, BrainDump (center), Tasks, Calendar
  // OR Logic: Left tabs: Routines, Goals. Right tabs: Tasks, Calendar.
  // Original was: Goals, Tasks, [Center], AIChat, Calendar
  // New desired: Routines, Goals, [Center], Tasks, Calendar (replacing AIChat with Routines effectively)
  // Let's check user request: "replace the AI Chat in the nav with routines"
  // Assuming 4 tabs + center: 
  // Left: Routines, Goals 
  // Center: BrainDump
  // Right: Tasks, Calendar 
  // Wait, original Right was AIChat, Calendar.
  // So replacing AIChat means: RightSide: Routines, Calendar? 
  // Let's stick to a logical flow. 
  // Let's put Routines on the Left or Right? 
  // User said "replace AI Chat", AI Chat was on Right (index 3).
  // So: Goals, Tasks, [Center], Routines, Calendar.

  const orderedRoutes = state.routes;
  const reorderedRoutes = [
    orderedRoutes.find((r: any) => r.name === 'Goals'),
    orderedRoutes.find((r: any) => r.name === 'Tasks'),
    orderedRoutes.find((r: any) => r.name === 'BrainDump'),
    orderedRoutes.find((r: any) => r.name === 'Routines'),
    orderedRoutes.find((r: any) => r.name === 'Calendar'),
  ].filter(Boolean);

  // Separate Brain Dump from other routes
  const brainDumpRoute = reorderedRoutes.find((r: any) => r.name === 'BrainDump');
  const otherRoutes = reorderedRoutes.filter((r: any) => r.name !== 'BrainDump');

  return (
    <View style={[
      styles.container,
      {
        paddingBottom: Platform.OS === 'android' ? Math.max(insets.bottom, 12) : 12,
      }
    ]}>
      {/* Left side tabs: Goals, Tasks */}
      <View style={styles.leftTabs}>
        {otherRoutes.slice(0, 2).map((route: any) => {
          const routeIndex = state.routes.findIndex((r: any) => r.key === route.key);
          const { options } = descriptors[route.key];
          const label = options.tabBarLabel !== undefined ? options.tabBarLabel : options.title !== undefined ? options.title : route.name;
          const isFocused = state.index === routeIndex;

          const onPress = () => {
            const event = navigation.emit({
              type: 'tabPress',
              target: route.key,
              canPreventDefault: true,
            });

            if (!isFocused && !event.defaultPrevented) {
              navigation.navigate(route.name);
            }
          };

          return (
            <TouchableOpacity
              key={route.key}
              style={styles.tab}
              onPress={onPress}
              activeOpacity={0.7}
            >
              <View style={[
                styles.tabIcon,
                {
                  backgroundColor: isFocused ? colors.primary : 'transparent',
                  borderColor: isFocused ? colors.primary : colors.text.disabled,
                  borderWidth: 1,
                }
              ]}>
                {(() => {
                  const IconData = getIconComponent(route.name);
                  return (
                    <Icon
                      icon={IconData}
                      size={18}
                      color={isFocused ? colors.secondary : colors.text.disabled}
                    />
                  );
                })()}
              </View>
              <Text
                style={[
                  styles.tabLabel,
                  { color: isFocused ? colors.primary : colors.text.disabled }
                ]}
                numberOfLines={1}
              >
                {label}
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>

      {/* Center Brain Dump button */}
      {brainDumpRoute && (() => {
        const routeIndex = state.routes.findIndex((r: any) => r.key === brainDumpRoute.key);
        const { options } = descriptors[brainDumpRoute.key];
        const label = options.tabBarLabel !== undefined ? options.tabBarLabel : options.title !== undefined ? options.title : brainDumpRoute.name;
        const isFocused = state.index === routeIndex;

        const onPress = () => {
          if (!isFocused) {
            Animated.sequence([
              Animated.timing(pulseAnim, { toValue: 1, duration: 400, useNativeDriver: true }),
              Animated.timing(pulseAnim, { toValue: 0, duration: 200, useNativeDriver: true }),
            ]).start();
          }

          const event = navigation.emit({
            type: 'tabPress',
            target: brainDumpRoute.key,
            canPreventDefault: true,
          });

          if (!isFocused && !event.defaultPrevented) {
            navigation.navigate(brainDumpRoute.name);
          }
        };

        return (
          <View key={brainDumpRoute.key} style={styles.centerButtonContainer}>
            <TouchableOpacity
              style={styles.brainDumpButton}
              onPress={onPress}
              activeOpacity={0.8}
            >
              <View style={[
                styles.brainDumpIconContainer,
                {
                  backgroundColor: colors.primary,
                  shadowColor: colors.shadow,
                  elevation: isFocused ? 12 : 8,
                  borderWidth: isFocused ? 2 : 0,
                  borderColor: colors.accent.gold,
                }
              ]}>
                <Animated.View
                  style={[
                    styles.glow,
                    {
                      opacity: pulseAnim.interpolate({
                        inputRange: [0, 1],
                        outputRange: [0, 0.5],
                      }),
                      transform: [
                        {
                          scale: pulseAnim.interpolate({
                            inputRange: [0, 1],
                            outputRange: [1, 1.3],
                          }),
                        },
                      ],
                    },
                  ]}
                />
                <Icon
                  icon={AiBrain02Icon}
                  size={32}
                  color={colors.secondary}
                />
              </View>
              <Text
                style={[
                  styles.brainDumpLabel,
                  { color: isFocused ? colors.primary : colors.text.primary }
                ]}
                numberOfLines={1}
              >
                {label}
              </Text>
            </TouchableOpacity>
          </View>
        );
      })()}

      {/* Right side tabs: AIChat, Profile */}
      <View style={styles.rightTabs}>
        {otherRoutes.slice(2).map((route: any) => {
          const routeIndex = state.routes.findIndex((r: any) => r.key === route.key);
          const { options } = descriptors[route.key];
          const label = options.tabBarLabel !== undefined ? options.tabBarLabel : options.title !== undefined ? options.title : route.name;
          const isFocused = state.index === routeIndex;

          const onPress = () => {
            const event = navigation.emit({
              type: 'tabPress',
              target: route.key,
              canPreventDefault: true,
            });

            if (!isFocused && !event.defaultPrevented) {
              navigation.navigate(route.name);
            }
          };

          return (
            <TouchableOpacity
              key={route.key}
              style={styles.tab}
              onPress={onPress}
              activeOpacity={0.7}
            >
              <View style={[
                styles.tabIcon,
                {
                  backgroundColor: isFocused ? colors.primary : 'transparent',
                  borderColor: isFocused ? colors.primary : colors.text.disabled,
                  borderWidth: 1,
                }
              ]}>
                {(() => {
                  const IconData = getIconComponent(route.name);
                  return (
                    <Icon
                      icon={IconData}
                      size={18}
                      color={isFocused ? colors.secondary : colors.text.disabled}
                    />
                  );
                })()}
              </View>
              <Text
                style={[
                  styles.tabLabel,
                  { color: isFocused ? colors.primary : colors.text.disabled }
                ]}
                numberOfLines={1}
              >
                {label}
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    backgroundColor: colors.secondary,
    borderTopWidth: 1,
    borderTopColor: colors.border.light,
    elevation: 8,
    shadowColor: colors.primary,
    shadowOffset: { width: 0, height: -2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    alignItems: 'flex-end',
    justifyContent: 'space-between',
    position: 'relative',
    paddingTop: 4, // Minimal padding to lower the nav bar
    overflow: 'visible', // Allow button to extend outside
  },
  leftTabs: {
    flex: 1,
    flexDirection: 'row',
    justifyContent: 'flex-start',
    alignItems: 'flex-end',
  },
  rightTabs: {
    flex: 1,
    flexDirection: 'row',
    justifyContent: 'flex-end',
    alignItems: 'flex-end',
  },
  centerButtonContainer: {
    alignItems: 'center',
    justifyContent: 'flex-start',
    zIndex: 10,
    overflow: 'visible',
  },
  tab: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 8,
    minWidth: 60,
  },
  tabIcon: {
    width: 32,
    height: 32,
    borderRadius: 16,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 6,
  },
  tabLabel: {
    fontSize: typography.fontSize.sm,
    fontWeight: typography.fontWeight.medium as any,
    textAlign: 'center',
  },
  brainDumpButton: {
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: -40, // Pulls button up to extend well above the nav bar
    marginBottom: 8,
  },
  brainDumpIconContainer: {
    width: 64,
    height: 64,
    borderRadius: 32,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 6,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
  },
  glow: {
    position: 'absolute',
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: colors.accent.gold,
    zIndex: -1,
  },
  brainDumpLabel: {
    fontSize: typography.fontSize.sm,
    fontWeight: typography.fontWeight.semibold as any,
    textAlign: 'center',
  },
}); 