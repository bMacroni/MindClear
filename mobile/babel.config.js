module.exports = {
  presets: ['module:@react-native/babel-preset'],
  plugins: [
    ['@babel/plugin-proposal-decorators', { legacy: true }],
    [
      'module-resolver',
      {
        root: ['./'],
        alias: {
          '@assets': './assets',
          '@src': './src',
          'react-native/Libraries/Image/resolveAssetSource': './src/utils/resolveAssetSourceShim',
        },
      },
    ],
    // Keep this plugin last to enable Reanimated worklets
    'react-native-reanimated/plugin',
  ],
};
