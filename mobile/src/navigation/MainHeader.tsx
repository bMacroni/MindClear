import React from 'react';
import { View, Text, StyleSheet } from 'react-native'; import { getHeaderTitle } from '@react-navigation/elements';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors } from '../themes/colors';
import { spacing, borderRadius } from '../themes/spacing';
import { typography } from '../themes/typography';
import { ProfileHeaderButton } from '../components/common/ProfileHeaderButton';
import { BottomTabHeaderProps } from '@react-navigation/bottom-tabs';
import { NativeStackHeaderProps } from '@react-navigation/native-stack';

type SetupHeaderProps = BottomTabHeaderProps | NativeStackHeaderProps;

export const MainHeader = (props: SetupHeaderProps) => {
    const { navigation, route, options } = props;
    const insets = useSafeAreaInsets();
    const title = getHeaderTitle(options, route.name);

    return (
        <View
            style={[styles.container, { paddingTop: insets.top }]}
            accessible={true}
            accessibilityRole="header"
            accessibilityLabel={`${title} header`}
        >
            <View style={styles.content}>
                <View style={styles.leftGroup}>
                    {options.headerLeft ? (
                        <View style={styles.action}>
                            {options.headerLeft({ canGoBack: navigation.canGoBack() })}
                        </View>
                    ) : null}
                    <Text
                        style={styles.title}
                        numberOfLines={1}
                        ellipsizeMode="tail"
                        accessibilityRole="header"
                    >
                        {title}
                    </Text>
                </View>

                <View style={styles.rightGroup}>
                    {options.headerRight ? (
                        <View style={styles.customActions}>
                            {options.headerRight({ canGoBack: navigation.canGoBack() })}
                        </View>
                    ) : null}
                    <ProfileHeaderButton />
                </View>
            </View>
            <View style={styles.divider} />
        </View>
    );
};

const styles = StyleSheet.create({
    container: {
        backgroundColor: colors.secondary,
    },
    content: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingHorizontal: spacing.md,
        paddingVertical: spacing.sm,
        height: 60, // Consistent height for content area
    },
    leftGroup: {
        flexDirection: 'row',
        alignItems: 'center',
        flex: 1,
    },
    rightGroup: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: spacing.sm,
    },
    action: {
        marginRight: spacing.sm,
        borderRadius: borderRadius.sm,
    },
    customActions: {
        flexDirection: 'row',
        alignItems: 'center',
        marginRight: spacing.sm,
    },
    title: {
        fontSize: typography.fontSize.xl,
        fontWeight: typography.fontWeight.bold as any,
        color: colors.text.primary,
    },
    divider: {
        height: 1,
        backgroundColor: colors.border.light,
        width: '100%',
    },
});
