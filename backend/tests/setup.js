// Test setup file for Vitest
import { vi } from 'vitest';

// Set NODE_ENV to test to prevent process.exit calls
process.env.NODE_ENV = 'test';

// Mock process.exit to prevent test failures
const originalExit = process.exit;
process.exit = vi.fn((code) => {
  if (code !== 0) {
    throw new Error(`process.exit called with code ${code}`);
  }
});

// Mock the configValidator to prevent process.exit calls
vi.mock('../src/utils/configValidator.js', () => ({
  validateConfiguration: vi.fn(() => {}),
  getConfigurationSummary: vi.fn(() => ({
    environment: 'test',
    port: '5000',
    nodeEnv: 'test',
    hasSupabase: true,
    hasGoogleAuth: true,
    hasFirebase: true,
    hasEncryption: true,
    debugLogs: true,
    timestamp: new Date().toISOString()
  }))
}));

// Mock environment variables
process.env.GOOGLE_AI_API_KEY = 'test-api-key';
process.env.SUPABASE_URL = 'https://test.supabase.co';
process.env.SUPABASE_ANON_KEY = 'test-anon-key';
process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-service-role-key';

// Mock Firebase environment variables
process.env.FIREBASE_PROJECT_ID = 'test-project-id';
process.env.FIREBASE_PRIVATE_KEY_ID = 'test-private-key-id';
process.env.FIREBASE_PRIVATE_KEY = '-----BEGIN PRIVATE KEY-----\\nMIIEvAIBADANBgkqhkiG9w0BAQEFAASCBKYwggSiAgEAAoIBAQC3/w8d+w8Y+\\nZ9g\\n-----END PRIVATE KEY-----\\n';
process.env.FIREBASE_CLIENT_EMAIL = 'test@test-project.iam.gserviceaccount.com';
process.env.FIREBASE_CLIENT_ID = 'test-client-id';
process.env.FIREBASE_AUTH_URI = 'https://accounts.google.com/o/oauth2/auth';
process.env.FIREBASE_TOKEN_URI = 'https://oauth2.googleapis.com/token';
process.env.FIREBASE_AUTH_PROVIDER_X509_CERT_URL = 'https://www.googleapis.com/oauth2/v1/certs';
process.env.FIREBASE_CLIENT_X509_CERT_URL = 'https://www.googleapis.com/robot/v1/metadata/x509/test%40test-project.iam.gserviceaccount.com';

// Global test setup
global.console = {
  ...console,
  // Uncomment to suppress console.log during tests
  // log: vi.fn(),
  // warn: vi.fn(),
  // error: vi.fn(),
}; 