import React from 'react';
import { TouchableOpacity, StyleSheet } from 'react-native';
import Icon from 'react-native-vector-icons/Octicons';
import { useHelp } from '../../contexts/HelpContext';
import { colors } from '../../themes/colors';

export const HelpIcon: React.FC = () => {
  // Temporarily disabled to avoid performance issues until reworked
  return null;
};

const styles = StyleSheet.create({
  button: {
    padding: 8,
    borderWidth: 1,
    borderColor: colors.border.light,
    borderRadius: 6,
    backgroundColor: colors.background.surface,
  },
});

export default HelpIcon;


