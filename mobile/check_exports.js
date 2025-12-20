try {
    const hugeicons = require('./node_modules/@hugeicons/react-native');
    console.log('Exports:', Object.keys(hugeicons));
} catch (e) {
    console.error(e);
}
