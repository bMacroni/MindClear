#!/usr/bin/env node

const { execSync } = require('child_process');
const path = require('path');

console.log('🧪 Running WatermelonDB Integration Tests...\n');

try {
  // Run the integration tests
  execSync('npx jest src/__tests__/watermelondb-integration.test.ts --verbose', {
    stdio: 'inherit',
    cwd: path.join(__dirname, '..'),
    timeout: 300000,
  });

  console.log('\n✅ Integration tests completed successfully!');

  // Run the repository unit tests
  console.log('\n🧪 Running Repository Unit Tests...\n');
  
  execSync('npx jest src/__tests__/repository-unit.test.ts --verbose', {
    stdio: 'inherit',
    cwd: path.join(__dirname, '..'),
    timeout: 300000,
  });

  console.log('\n✅ Repository unit tests completed successfully!');

  // Run the sync service tests
  console.log('\n🧪 Running Sync Service Tests...\n');
  
  execSync('npx jest src/__tests__/sync-service.test.ts --verbose', {
    stdio: 'inherit',
    cwd: path.join(__dirname, '..'),
    timeout: 300000,
  });

  console.log('\n✅ Sync service tests completed successfully!');

  console.log('\n🎉 All WatermelonDB tests passed!');
  console.log('\n📋 Test Summary:');
  console.log('  - Integration tests: ✅');
  console.log('  - Repository unit tests: ✅');
  console.log('  - Sync service tests: ✅');
  console.log('\n🚀 WatermelonDB migration is ready for production!');

} catch (error) {
  console.error('\n❌ Tests failed:', error.message);
  process.exit(1);
}
