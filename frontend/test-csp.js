/**
 * Test script to verify CSP generation in different environments
 */

// Test development environment
process.env.NODE_ENV = 'development';
const { generateCSP, getCSPConfig } = require('./dist/assets/index-DtzXw4e4.js');

console.log('=== DEVELOPMENT ENVIRONMENT ===');
console.log('CSP Config:', JSON.stringify(getCSPConfig(), null, 2));
console.log('Generated CSP:', generateCSP());
console.log('Contains unsafe-eval:', generateCSP().includes("'unsafe-eval'"));
console.log('');

// Test production environment
process.env.NODE_ENV = 'production';
console.log('=== PRODUCTION ENVIRONMENT ===');
console.log('CSP Config:', JSON.stringify(getCSPConfig(), null, 2));
console.log('Generated CSP:', generateCSP());
console.log('Contains unsafe-eval:', generateCSP().includes("'unsafe-eval'"));
console.log('');

// Test test environment
process.env.NODE_ENV = 'test';
console.log('=== TEST ENVIRONMENT ===');
console.log('CSP Config:', JSON.stringify(getCSPConfig(), null, 2));
console.log('Generated CSP:', generateCSP());
console.log('Contains unsafe-eval:', generateCSP().includes("'unsafe-eval'"));
