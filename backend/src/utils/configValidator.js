import logger from './logger.js';

/**
 * Configuration Validation Utility
 * Validates environment variables and configuration security
 */

// Required environment variables by environment
const REQUIRED_VARS = {
  development: [
    'PORT',
    'NODE_ENV',
    'SUPABASE_URL',
    'SUPABASE_ANON_KEY',
    'SUPABASE_SERVICE_ROLE_KEY',
    'GOOGLE_CLIENT_ID',
    'GOOGLE_CLIENT_SECRET',
    'GOOGLE_AI_API_KEY',
    'FIREBASE_PROJECT_ID',
    'FIREBASE_PRIVATE_KEY',
    'FIREBASE_CLIENT_EMAIL',
    'ENCRYPTION_KEY'
  ],
  production: [
    'PORT',
    'NODE_ENV',
    'SUPABASE_URL',
    'SUPABASE_ANON_KEY',
    'SUPABASE_SERVICE_ROLE_KEY',
    'GOOGLE_CLIENT_ID',
    'GOOGLE_CLIENT_SECRET',
    'GOOGLE_AI_API_KEY',
    'FIREBASE_PROJECT_ID',
    'FIREBASE_PRIVATE_KEY',
    'FIREBASE_CLIENT_EMAIL',
    'ENCRYPTION_KEY',
    'FRONTEND_URL',
    'CORS_ORIGIN'
  ]
};

// Sensitive variables that should never be logged
const SENSITIVE_VARS = [
  'SUPABASE_SERVICE_ROLE_KEY',
  'SUPABASE_JWT_SECRET',
  'GOOGLE_CLIENT_SECRET',
  'GOOGLE_AI_API_KEY',
  'FIREBASE_PRIVATE_KEY',
  'ENCRYPTION_KEY',
  'SENDGRID_API_KEY',
  'FEEDBACK_EMAIL_PASS'
];

// Variables that should have specific formats
const FORMAT_VALIDATORS = {
  PORT: (value) => {
    const port = parseInt(value);
    return port > 0 && port < 65536;
  },
  NODE_ENV: (value) => ['development', 'production', 'test'].includes(value),
  SUPABASE_URL: (value) => value.startsWith('https://') && value.includes('supabase.co'),
  GOOGLE_CLIENT_ID: (value) => value.includes('.apps.googleusercontent.com'),
  FIREBASE_PROJECT_ID: (value) => /^[a-z0-9-]+$/.test(value),
  ENCRYPTION_KEY: (value) => value.length >= 32
};

/**
 * Validate environment configuration
 */
export function validateConfiguration() {
  const env = process.env.NODE_ENV || 'development';
  const errors = [];
  const warnings = [];

  logger.info(`🔍 Validating configuration for ${env} environment...`);

  // Check required variables
  const requiredVars = REQUIRED_VARS[env] || REQUIRED_VARS.development;
  
  for (const varName of requiredVars) {
    if (!process.env[varName]) {
      errors.push(`Missing required environment variable: ${varName}`);
    } else {
      // Validate format if validator exists
      if (FORMAT_VALIDATORS[varName]) {
        if (!FORMAT_VALIDATORS[varName](process.env[varName])) {
          errors.push(`Invalid format for ${varName}`);
        }
      }
    }
  }

  // Check for sensitive variables in logs
  for (const varName of SENSITIVE_VARS) {
    if (process.env[varName]) {
      // Check if it's a default/example value
      const value = process.env[varName];
      if (value.includes('your_') || value.includes('example') || value.includes('placeholder')) {
        errors.push(`Sensitive variable ${varName} appears to have a default/example value`);
      }
      
      // Check for weak encryption key
      if (varName === 'ENCRYPTION_KEY' && value.length < 32) {
        errors.push('ENCRYPTION_KEY must be at least 32 characters long');
      }
    }
  }

  // Production-specific checks
  if (env === 'production') {
    // Check for development URLs in production
    if (process.env.FRONTEND_URL?.includes('localhost')) {
      errors.push('FRONTEND_URL should not contain localhost in production');
    }
    
    if (process.env.SUPABASE_URL?.includes('localhost')) {
      errors.push('SUPABASE_URL should not contain localhost in production');
    }

    // Check for debug mode in production
    if (process.env.DEBUG_LOGS === 'true') {
      warnings.push('DEBUG_LOGS is enabled in production - consider disabling');
    }
  }

  // Log results
  if (errors.length > 0) {
    logger.error('❌ Configuration validation failed:', errors);
    throw new Error(`Configuration validation failed: ${errors.join(', ')}`);
  }

  if (warnings.length > 0) {
    logger.warn('⚠️ Configuration warnings:', warnings);
  }

  logger.info('✅ Configuration validation passed');
  return { valid: true, warnings };
}

/**
 * Sanitize environment variables for logging
 */
export function sanitizeForLogging(envVars) {
  const sanitized = { ...envVars };
  
  for (const varName of SENSITIVE_VARS) {
    if (sanitized[varName]) {
      sanitized[varName] = '***REDACTED***';
    }
  }
  
  return sanitized;
}

/**
 * Get configuration summary (safe for logging)
 */
export function getConfigurationSummary() {
  const env = process.env.NODE_ENV || 'development';
  const summary = {
    environment: env,
    port: process.env.PORT,
    nodeEnv: process.env.NODE_ENV,
    hasSupabase: !!process.env.SUPABASE_URL,
    hasGoogleAuth: !!process.env.GOOGLE_CLIENT_ID,
    hasFirebase: !!process.env.FIREBASE_PROJECT_ID,
    hasEncryption: !!process.env.ENCRYPTION_KEY,
    debugLogs: process.env.DEBUG_LOGS === 'true',
    timestamp: new Date().toISOString()
  };

  return summary;
}

/**
 * Check for security misconfigurations
 */
export function checkSecurityMisconfigurations() {
  const issues = [];

  // Check for weak encryption key
  if (process.env.ENCRYPTION_KEY && process.env.ENCRYPTION_KEY.length < 32) {
    issues.push('ENCRYPTION_KEY is too short (minimum 32 characters)');
  }

  // Check for development settings in production
  if (process.env.NODE_ENV === 'production') {
    if (process.env.DEBUG_LOGS === 'true') {
      issues.push('Debug logging enabled in production');
    }
    
    if (!process.env.CORS_ORIGIN) {
      issues.push('CORS_ORIGIN not set in production');
    }
  }

  // Check for missing HTTPS in production URLs
  if (process.env.NODE_ENV === 'production') {
    if (process.env.FRONTEND_URL && !process.env.FRONTEND_URL.startsWith('https://')) {
      issues.push('FRONTEND_URL should use HTTPS in production');
    }
  }

  return issues;
}

export default {
  validateConfiguration,
  sanitizeForLogging,
  getConfigurationSummary,
  checkSecurityMisconfigurations
};

