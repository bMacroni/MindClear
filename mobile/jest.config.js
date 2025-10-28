module.exports = {
  preset: 'react-native',
  transformIgnorePatterns: [
    'node_modules/(?!(react-native|@react-native|react-native-gesture-handler|react-native-reanimated|react-native-safe-area-context|react-native-screens|@react-navigation|react-native-vector-icons|@react-native-community/datetimepicker|react-native-calendars|react-native-swipe-gestures|@react-native-firebase|react-native-popable)/)'
  ],
  setupFiles: [
    '<rootDir>/node_modules/react-native-gesture-handler/jestSetup.js'
  ],
  setupFilesAfterEnv: ['<rootDir>/jest.setup.js', '<rootDir>/src/__tests__/setup.ts'],
  moduleNameMapper: {
    '^react-native-draggable-flatlist$': '<rootDir>/test/__mocks__/react-native-draggable-flatlist.js',
    '^react-native-modal-datetime-picker$': '<rootDir>/test/__mocks__/react-native-modal-datetime-picker.js',
    '^@react-native-firebase/auth$': '<rootDir>/test/__mocks__/@react-native-firebase_auth.js',
  },
};
