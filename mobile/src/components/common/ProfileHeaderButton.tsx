import React from 'react';
import { TouchableOpacity, StyleSheet } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { HugeiconsIcon as Icon } from '@hugeicons/react-native';
import { UserIcon } from '@hugeicons/core-free-icons';
import { colors } from '../../themes/colors';
import { spacing } from '../../themes/spacing';

export const ProfileHeaderButton: React.FC = () => {
    const navigation = useNavigation<any>();

    const handlePress = () => {
        navigation.navigate('Profile');
    };

    return (
        <TouchableOpacity
            onPress={handlePress}
            style={styles.container}
            accessibilityRole="button"
            accessibilityLabel="Go to Profile"
        >
            <Icon
                icon={UserIcon}
                size={24}
                color={colors.primary}
            />
        </TouchableOpacity>
    );
};

const styles = StyleSheet.create({
    container: {
        padding: spacing.xs,
        justifyContent: 'center',
        alignItems: 'center',
    },
});
