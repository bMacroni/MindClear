module.exports = {
  presets: ['module:@react-native/babel-preset'],
  plugins: [
    ['module:react-native-dotenv', {
      "moduleName": "@env",
      "path": ".env",
      "blacklist": null,
      "whitelist": null,
      "safe": false,
      "allowUndefined": true
    }],
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
