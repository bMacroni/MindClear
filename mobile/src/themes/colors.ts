export const colors = {
  // Primary colors
  primary: '#000000',
  secondary: '#FFFFFF',
  // Common surface shortcut (alias to background.surface for convenience)
  surface: '#F9F9F9',
  // Shadow color used in some components
  shadow: '#000000',

  // Background colors
  background: {
    primary: '#FFFFFF',
    secondary: '#F1F1F1',
    surface: '#F9F9F9',
  },
  // Text colors
  text: {
    primary: '#111111',
    secondary: '#444444',
    disabled: '#888888',
  },

  // Border colors
  border: {
    light: '#EEEEEE',
    medium: '#DDDDDD',
    dark: '#CCCCCC',
  },

  // Status colors
  success: '#10B981',
  warning: '#F59E0B',
  error: '#EF4444',
  info: '#3B82F6',

  // Feedback colors for UI states
  feedback: {
    errorBg: '#FEF2F2',
    errorBorder: '#FECACA',
  },

  // AI specific colors
  aiMessage: '#F1F1F1',

  // Accent colors
  accent: {
    gold: '#D4AF37',
    // Softer gold for subtle borders/icons
    secondary: '#E6CF8E',
  },

  // Overlay colors
  overlay: 'rgba(0, 0, 0, 0.5)',

  // Shades
  shades: {
    black: '#000000',
    white: '#FFFFFF',
  },

  // Helper for translucent colors
  rgba: (hex: string, alpha: number) => {
    const r = parseInt(hex.slice(1, 3), 16);
    const g = parseInt(hex.slice(3, 5), 16);
    const b = parseInt(hex.slice(5, 7), 16);
    return `rgba(${r}, ${g}, ${b}, ${alpha})`;
  },
};

export const useTheme = () => colors;
