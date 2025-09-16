import React from 'react';
import { TouchableOpacity, StyleSheet } from 'react-native';
import Icon from 'react-native-vector-icons/Octicons';
import { useHelp } from '../../contexts/HelpContext';
import { colors } from '../../themes/colors';

export const HelpIcon: React.FC = () => {
  const { isHelpOverlayActive, setIsHelpOverlayActive } = useHelp();
  return (
    <TouchableOpacity
      hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
      accessibilityLabel={isHelpOverlayActive ? 'Exit help' : 'Enter help'}
      accessibilityRole="button"
      accessibilityHint="Toggle help overlay"
      style={styles.button}
      onPress={() => setIsHelpOverlayActive(prev => !prev)}
      activeOpacity={0.7}
    >
      <Icon name="question" size={20} color={colors.text.secondary} />
    </TouchableOpacity>
  );
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


