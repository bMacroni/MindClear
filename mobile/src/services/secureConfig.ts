/**
 * Secure Configuration Service
 * 
 * Manages application configuration securely, preventing exposure
 * of sensitive information in client-side code.
 */

import AsyncStorage from '@react-native-async-storage/async-storage';
import { configService } from './config';
import logger from '../utils/logger';

interface SecureConfig {
  apiBaseUrl: string;
  environment: 'development' | 'staging' | 'production';
  features: {
    analytics: boolean;
    crashReporting: boolean;
    remoteConfig: boolean;
  };
  security: {
    certificatePinning: boolean;
    requestSigning: boolean;
    encryption: boolean;
  };
}

class SecureConfigService {
  private static instance: SecureConfigService;
  private config: SecureConfig | null = null;
  private configKey = 'secure_config';
  private isLoaded = false;

  private constructor() {
    // Constructor stays synchronous; call loadSecureConfig in initialize()
  }

  static getInstance(): SecureConfigService {
    if (!SecureConfigService.instance) {
      SecureConfigService.instance = new SecureConfigService();
    }
    return SecureConfigService.instance;
  }

  /**
   * Asynchronously initialize the singleton by loading secure config.
   * Must be awaited at app startup before using the service.
   */
  static async initialize(): Promise<SecureConfigService> {
    const instance = SecureConfigService.getInstance();
    if (!instance.isLoaded) {
      await instance.loadSecureConfig();
    }
    return instance;
  }

  private async loadSecureConfig(): Promise<void> {
    try {
      const savedConfig = await AsyncStorage.getItem(this.configKey);
      if (savedConfig) {
        try {
          this.config = JSON.parse(savedConfig);
          this.isLoaded = true;
          logger.info('Secure config loaded from storage');
          return;
        } catch (parseError) {
          logger.error('Failed to parse secure config, resetting to defaults:', parseError);
          await AsyncStorage.removeItem(this.configKey);
        }
      }
    } catch (error) {
      logger.warn('Failed to load secure config from storage:', error);
    }

    // Initialize with default config
    this.config = {
      apiBaseUrl: this.getDefaultApiUrl('development'),
      environment: 'development',
      features: {
        analytics: true,
        crashReporting: true,
        remoteConfig: true,
      },
      security: {
        certificatePinning: false,
        requestSigning: false,
        encryption: true,
      },
    };
    this.isLoaded = true;
    logger.info('Secure config initialized with defaults');
  }

  getApiBaseUrl(): string {
    if (!this.isLoaded) {
      // Synchronous fallback
      return this.getDefaultApiUrl('development');
    }
    return this.config?.apiBaseUrl || this.getDefaultApiUrl('development');
  }

  async updateApiBaseUrl(url: string): Promise<void> {
    if (!this.isLoaded) {
      await this.loadSecureConfig();
    }
    
    if (!this.config) {
      const error = new Error('Config not initialized');
      logger.error('Failed to update API base URL: config not initialized', { url });
      throw error;
    }

    // Preserve original value for rollback
    const previousUrl = this.config.apiBaseUrl;
    
    try {
      // Create updated config
      const updatedConfig = {
        ...this.config,
        apiBaseUrl: url,
      };
      
      // Persist to storage first
      await AsyncStorage.setItem(this.configKey, JSON.stringify(updatedConfig));
      
      // Only update in-memory config after successful persistence
      this.config = updatedConfig;
      logger.info('API base URL updated successfully', { previousUrl, newUrl: url });
    } catch (error) {
      // Log the error with context
      logger.error('Failed to persist API base URL update to storage', {
        url,
        previousUrl,
        error: error instanceof Error ? error.message : String(error),
        errorType: error instanceof Error ? error.constructor.name : typeof error,
      });
      
      // Rethrow to propagate to caller
      throw new Error(`Failed to update API base URL: ${error instanceof Error ? error.message : 'Storage error'}`);
    }
  }

  async getEnvironment(): Promise<'development' | 'staging' | 'production'> {
    if (!this.isLoaded) {
      await this.loadSecureConfig();
    }
    return this.config?.environment || 'development';
  }

  async getFeatureFlag(flag: keyof SecureConfig['features']): Promise<boolean> {
    if (!this.isLoaded) {
      await this.loadSecureConfig();
    }
    return this.config?.features[flag] ?? true;
  }

  async getSecuritySetting(setting: keyof SecureConfig['security']): Promise<boolean> {
    if (!this.isLoaded) {
      await this.loadSecureConfig();
    }
    return this.config?.security[setting] ?? false;
  }

  private getDefaultApiUrl(environment: 'development' | 'staging' | 'production'): string {
    try {
      // Use configService as the primary source of truth
      const configUrl = configService.getBaseUrl();
      if (configUrl && this.isValidUrl(configUrl)) {
        logger.info('Using API URL from configService:', configUrl);
        return configUrl;
      }
    } catch (error) {
      logger.warn('ConfigService unavailable, falling back to environment variables:', String((error as Error)?.message ?? error));
    }

    // Environment-based fallback (non-production only)
    const envFallback = (process.env.SECURE_API_BASE || process.env.API_BASE_URL || process.env.API_FALLBACK || '').trim();
    if (envFallback && this.isValidUrl(envFallback)) {
      const validatedUrl = this.validateAndSanitizeApiUrl(envFallback, environment);
      if (validatedUrl) {
        logger.info('Using API URL from environment variables:', validatedUrl);
        return validatedUrl;
      }
    }

    // Final fallback based on environment
    const finalFallback = __DEV__
      ? 'http://192.168.1.66:5000/api'  // Development: use computer IP address
      : 'https://foci-production.up.railway.app/api';  // Production: use Railway
    logger.warn('Using final fallback API base URL:', finalFallback, `(${__DEV__ ? 'development' : 'production'})`);
    return finalFallback;
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

  private validateAndSanitizeApiUrl(url: string, environment: 'development' | 'staging' | 'production'): string | null {
    if (!this.isValidUrl(url)) {
      return null;
    }

    // Ensure URL ends with /api for consistency
    if (!url.endsWith('/api')) {
      url = url.endsWith('/') ? url + 'api' : url + '/api';
    }

    // Additional validation based on environment
    if (environment === 'production') {
      // In production, only allow HTTPS URLs
      if (!url.startsWith('https://')) {
        logger.warn('Production environment requires HTTPS URL, rejecting:', url);
        return null;
      }
    }

    return url;
  }

  // Utility methods for debugging
  async getConfigSummary(): Promise<object> {
    if (!this.isLoaded) {
      await this.loadSecureConfig();
    }
    
    return {
      isLoaded: this.isLoaded,
      environment: this.config?.environment,
      apiBaseUrl: this.config?.apiBaseUrl,
      features: this.config?.features,
      security: this.config?.security,
    };
  }

  async resetToDefaults(): Promise<void> {
    try {
      await AsyncStorage.removeItem(this.configKey);
      this.config = null;
      this.isLoaded = false;
      await this.loadSecureConfig();
      logger.info('Secure config reset to defaults');
    } catch (error) {
      logger.error('Failed to reset config to defaults:', error);
      throw new Error('Failed to reset configuration');
    }
  }
  // Health check method
  async healthCheck(): Promise<{ status: 'healthy' | 'degraded' | 'unhealthy'; details: any }> {
    try {
      const apiUrl = this.getApiBaseUrl();
      const environment = await this.getEnvironment();
      
      return {
        status: 'healthy',
        details: {
          apiUrl,
          environment,
          isLoaded: this.isLoaded,
          hasConfig: !!this.config,
        },
      };
    } catch (error) {
      return {
        status: 'unhealthy',
        details: {
          error: error instanceof Error ? error.message : String(error),
          isLoaded: this.isLoaded,
          hasConfig: !!this.config,
        },
      };
    }
  }
}

// Export singleton instance
export const secureConfigService = SecureConfigService.getInstance();
export default secureConfigService;