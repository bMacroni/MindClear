import React, { useState } from 'react';
import { View, TouchableOpacity, StyleSheet } from 'react-native';
import { HugeiconsIcon as Icon } from '@hugeicons/react-native';
import { ViewIcon, ViewOffIcon } from '@hugeicons/core-free-icons';
import { Input } from './Input';
import { colors } from '../../themes/colors';
import { spacing } from '../../themes/spacing';

interface PasswordInputProps {
  value: string;
  onChangeText: (text: string) => void;
  placeholder?: string;
  error?: boolean;
  style?: any;
  [key: string]: any; // Allow other TextInput props
}

export const PasswordInput: React.FC<PasswordInputProps> = ({
  value,
  onChangeText,
  placeholder = 'Password',
  error,
  style,
  ...props
}) => {
  const [showPassword, setShowPassword] = useState(false);

  const togglePasswordVisibility = () => {
    setShowPassword(!showPassword);
  };

  return (
    <View style={styles.container}>
      <Input
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        secureTextEntry={!showPassword}
        error={error}
        style={[styles.input, style]}
        {...props}
      />
      <TouchableOpacity
        style={styles.eyeIcon}
        onPress={togglePasswordVisibility}
        activeOpacity={0.7}
      >
        <Icon
          icon={showPassword ? ViewOffIcon : ViewIcon}
          size={20}
          color={colors.text.secondary}
        />
      </TouchableOpacity>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    position: 'relative',
    width: '100%',
    maxWidth: 320,
    alignSelf: 'center',
  },
  input: {
    paddingRight: 50, // Make room for the eye icon
  },
  eyeIcon: {
    position: 'absolute',
    right: spacing.md,
    height: 48,
    width: 48,
    alignItems: 'center',
    justifyContent: 'center',
  },
}); 