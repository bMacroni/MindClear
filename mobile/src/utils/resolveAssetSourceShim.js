/**
 * Shim to fix resolveAssetSource in RN 0.80+ 
 * where it's exported as ESM but required by CommonJS libraries.
 */
const resolveAssetSource = require('../../node_modules/react-native/Libraries/Image/resolveAssetSource');
module.exports = resolveAssetSource.default || resolveAssetSource;
