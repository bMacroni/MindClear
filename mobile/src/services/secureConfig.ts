/**
 * Secure Configuration Service
 * 
 * Manages application configuration securely, preventing exposure
 * of sensitive information in client-side code.
 */

import { configService } from './config';
import logger from '../utils/logger';

interface SecureConfig {
  apiBaseUrl: string;
  environment: 'development' | 'staging' | 'production';
  enableDebugLogs: boolean;
  enableCertificatePinning: boolean;
  maxRetryAttempts: number;
  requestTimeout: number;
  enableOfflineMode: boolean;
}

class SecureConfigService {
  private static instance: SecureConfigService;
  private config: SecureConfig;

  private constructor() {
    this.config = this.loadSecureConfig();
  }

  public static getInstance(): SecureConfigService {
    if (!SecureConfigService.instance) {
      SecureConfigService.instance = new SecureConfigService();
    }
    return SecureConfigService.instance;
  }

  private loadSecureConfig(): SecureConfig {
    const environment = this.getEnvironment();
    
    return {
      apiBaseUrl: this.getSecureApiUrl(environment),
      environment,
      enableDebugLogs: environment === 'development',
      enableCertificatePinning: environment === 'production',
      maxRetryAttempts: environment === 'production' ? 3 : 1,
      requestTimeout: environment === 'production' ? 10000 : 5000,
      enableOfflineMode: this.getBooleanFlag('ENABLE_OFFLINE_MODE', environment !== 'production')
    };
  }

  private getEnvironment(): 'development' | 'staging' | 'production' {
    // Check for environment variables first, with __DEV__ fallback for React Native
    const env = process.env?.NODE_ENV ?? (__DEV__ ? 'development' : 'production');
    
    if (env === 'production') {
      return 'production';
    } else if (env === 'staging') {
      return 'staging';
    } else {
      return 'development';
    }
  }

  private getSecureApiUrl(environment: 'development' | 'staging' | 'production'): string {
    // Use environment variables for API URLs
    const envApiUrl = process.env.API_BASE_URL;
    
    if (envApiUrl) {
      return envApiUrl;
    }

    // Fallback to config service
    const configApiUrl = configService.getBaseUrl();
    
    // Validate URL format
    if (!this.isValidUrl(configApiUrl)) {
      logger.warn('Invalid API URL in configuration, using default');
      return this.getDefaultApiUrl(environment);
    }

    return configApiUrl;
  }

  private getDefaultApiUrl(environment: 'development' | 'staging' | 'production'): string {
    try {
      // Use configService as the primary source of truth
      const configUrl = configService.getBaseUrl();
      if (configUrl && this.isValidUrl(configUrl)) {
        return configUrl;
      }
    } catch (error) {
      logger.warn('ConfigService unavailable, falling back to local URL:', String((error as Error)?.message ?? error));
    }
    
    // Only fall back to localhost if configService is unavailable
    return 'http://localhost:5000/api';
  }

  private getBooleanFlag(name: string, defaultValue: boolean): boolean {
    const raw = process.env?.[name];
    if (raw == null) return defaultValue;
    return raw === '1' || raw.toLowerCase() === 'true';
  }

  private isValidUrl(url: string): boolean {
    try {
      new URL(url);
      return true;
    } catch {
      return false;
    }
  }

  public getConfig(): SecureConfig {
    return { ...this.config };
  }

  public getApiBaseUrl(): string {
    return this.config.apiBaseUrl;
  }

  public isProduction(): boolean {
    return this.config.environment === 'production';
  }

  public isDevelopment(): boolean {
    return this.config.environment === 'development';
  }

  public shouldEnableCertificatePinning(): boolean {
    return this.config.enableCertificatePinning;
  }

  public shouldEnableDebugLogs(): boolean {
    return this.config.enableDebugLogs;
  }

  public getMaxRetryAttempts(): number {
    return this.config.maxRetryAttempts;
  }

  public getRequestTimeout(): number {
    return this.config.requestTimeout;
  }

  public shouldEnableOfflineMode(): boolean {
    return this.config.enableOfflineMode;
  }

  /**
   * Validates that all required configuration is present
   */
  public validateConfiguration(): { isValid: boolean; errors: string[] } {
    const errors: string[] = [];

    if (!this.config.apiBaseUrl) {
      errors.push('API base URL is required');
    }

    if (!this.isValidUrl(this.config.apiBaseUrl)) {
      errors.push('API base URL must be a valid URL');
    }

    if (this.config.maxRetryAttempts < 0 || this.config.maxRetryAttempts > 10) {
      errors.push('Max retry attempts must be between 0 and 10');
    }

    if (this.config.requestTimeout < 1000 || this.config.requestTimeout > 60000) {
      errors.push('Request timeout must be between 1000ms and 60000ms');
    }

    return {
      isValid: errors.length === 0,
      errors
    };
  }

  /**
   * Gets configuration summary for logging (without sensitive data)
   */
  public getConfigurationSummary(): Record<string, any> {
    return {
      environment: this.config.environment,
      hasApiUrl: !!this.config.apiBaseUrl,
      enableDebugLogs: this.config.enableDebugLogs,
      enableCertificatePinning: this.config.enableCertificatePinning,
      maxRetryAttempts: this.config.maxRetryAttempts,
      requestTimeout: this.config.requestTimeout,
      enableOfflineMode: this.config.enableOfflineMode,
      timestamp: new Date().toISOString()
    };
  }
}

export const secureConfigService = SecureConfigService.getInstance();

