const { getDefaultConfig, mergeConfig } = require('@react-native/metro-config');

// Start from the full default config and mutate, so we don't drop built-in asset settings
const defaultConfig = getDefaultConfig(__dirname);

// Enable SVG imports using react-native-svg-transformer
defaultConfig.transformer = {
  ...defaultConfig.transformer,
  babelTransformerPath: require.resolve('react-native-svg-transformer'),
};

const { assetExts, sourceExts } = defaultConfig.resolver;
defaultConfig.resolver = {
  ...defaultConfig.resolver,
  assetExts: assetExts.filter(ext => ext !== 'svg'),
  sourceExts: [...sourceExts, 'svg'],
  alias: {
    '@assets': './assets',
    '@src': './src',
  },
};

module.exports = mergeConfig(getDefaultConfig(__dirname), defaultConfig);
