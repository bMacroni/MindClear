const { getDefaultConfig, mergeConfig } = require('@react-native/metro-config');
const path = require('path');

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
  extraNodeModules: new Proxy({}, {
    get: (target, name) => {
      if (name === 'react-native/Libraries/Image/resolveAssetSource') {
        return path.resolve(__dirname, 'src/utils/resolveAssetSourceShim.js');
      }
      return path.resolve(__dirname, 'node_modules', name);
    },
  }),
};

module.exports = defaultConfig;
