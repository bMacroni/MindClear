/**
 * Verification script to check CSP in production build
 * This script simulates the production environment and tests CSP generation
 */

// Simulate production environment
process.env.NODE_ENV = 'production';

// Import the security utilities (we'll need to import from source since the built file is bundled)
import { generateCSP, getCSPConfig } from './src/utils/security.ts';

console.log('=== CSP PRODUCTION VERIFICATION ===');
console.log('Environment:', process.env.NODE_ENV);
console.log('');

const cspConfig = getCSPConfig();
console.log('CSP Configuration:');
console.log('- script-src:', cspConfig['script-src']);
console.log('- Contains unsafe-eval:', cspConfig['script-src'].includes("'unsafe-eval'"));
console.log('');

const generatedCSP = generateCSP();
console.log('Generated CSP String:');
console.log(generatedCSP);
console.log('');

console.log('=== VERIFICATION RESULTS ===');
const hasUnsafeEval = generatedCSP.includes("'unsafe-eval'");
console.log('✓ Production CSP excludes unsafe-eval:', !hasUnsafeEval);
console.log('✓ CSP string is properly formatted:', generatedCSP.includes(';'));
console.log('✓ CSP contains required directives:', 
  generatedCSP.includes('default-src') && 
  generatedCSP.includes('script-src') && 
  generatedCSP.includes('style-src')
);

if (!hasUnsafeEval) {
  console.log('\n🎉 SUCCESS: Production build correctly excludes unsafe-eval from CSP!');
} else {
  console.log('\n❌ FAILURE: Production build still contains unsafe-eval in CSP!');
  process.exit(1);
}
