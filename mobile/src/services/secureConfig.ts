/**
 * Secure Configuration Service
 * 
 * Manages application configuration securely, preventing exposure
 * of sensitive information in client-side code.
 */

import AsyncStorage from '@react-native-async-storage/async-storage';
import { configService } from './config';
import logger from '../utils/logger';
import { enhancedAPI } from './enhancedApi'; // Import enhancedAPI

interface RemoteConfig {
  supabaseUrl: string;
  supabaseAnonKey: string;
}

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
  remoteConfig?: RemoteConfig; // Add remoteConfig
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
   * @param signal Optional AbortSignal to cancel the initialization
   */
  async initialize(signal?: AbortSignal): Promise<void> {
    if (!this.isLoaded) {
      // Check if already cancelled before starting
      if (signal?.aborted) {
        throw new Error('Initialization was cancelled');
      }

      await this.loadSecureConfig(signal);
      
      // Check if cancelled after loading config
      if (signal?.aborted) {
        throw new Error('Initialization was cancelled');
      }

      // Load remote config in background - don't block app startup
      this.loadRemoteConfig(signal).catch(error => {
        // Only log if not cancelled
        if (!signal?.aborted) {
          logger.warn('Background remote config loading failed:', error);
        }
      });
    }
  }

  private async loadRemoteConfig(signal?: AbortSignal): Promise<void> {
    try {
      if (!this.config) {
        throw new Error('Secure config is not initialized; cannot load remote config.');
      }
      
      // Check if cancelled before making network request
      if (signal?.aborted) {
        throw new Error('Remote config loading was cancelled');
      }
      
      // Add timeout to prevent hanging during app startup
      const timeoutPromise = new Promise<never>((_, reject) => {
        setTimeout(() => reject(new Error('Remote config request timeout')), 5000); // Reduced to 5 second timeout
      });
      
      const remoteConfigPromise = enhancedAPI.getUserConfig();
      const remoteConfig = await Promise.race([remoteConfigPromise, timeoutPromise]);
      
      // Check if cancelled after getting remote config
      if (signal?.aborted) {
        throw new Error('Remote config loading was cancelled');
      }
      
      if (remoteConfig.supabaseUrl && remoteConfig.supabaseAnonKey) {
        this.config.remoteConfig = remoteConfig;
        logger.info('Secure remote config loaded from server');
      } else {
        logger.warn('Remote config from server is missing required keys.');
      }
    } catch (error) {
      // Only log if not cancelled
      if (!signal?.aborted) {
        logger.error('Failed to load secure remote config:', error);
        // Don't re-throw - allow app to continue with fallback config
        // This prevents the app from hanging on startup if the server is unreachable
        logger.warn('Continuing with fallback config due to remote config failure');
      }
    }
  }

  private async loadSecureConfig(signal?: AbortSignal): Promise<void> {
    try {
      // Check if cancelled before starting
      if (signal?.aborted) {
        throw new Error('Secure config loading was cancelled');
      }

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
      // Only log if not cancelled
      if (!signal?.aborted) {
        logger.warn('Failed to load secure config from storage:', error);
      }
    }

    // Check if cancelled before setting defaults
    if (signal?.aborted) {
      throw new Error('Secure config loading was cancelled');
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

  getSupabaseUrl(): string {
    if (!this.config?.remoteConfig?.supabaseUrl) {
      logger.warn('Supabase URL not available from remote config, using fallback.');
      // Return a fallback URL - using actual Supabase URL from backend
      return 'https://kwxbyovbvigvcdkzzpbk.supabase.co';
    }
    return this.config.remoteConfig.supabaseUrl;
  }

  getSupabaseAnonKey(): string {
    if (!this.config?.remoteConfig?.supabaseAnonKey) {
      logger.warn('Supabase Anon Key not available from remote config, using fallback.');
      // Return a fallback key - using actual Supabase anon key from backend
      return 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imt3eGJ5b3ZidmlndmNka3p6cGJrIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTU3MTQ0MDUsImV4cCI6MjA3MTI5MDQwNX0.cTmSlkt6CFXXFMNUjNuDtWRIY938tnCYO1xlBqhtJjw';
    }
    return this.config.remoteConfig.supabaseAnonKey;
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
  // Manually trigger remote config loading (useful after app is ready)
  async loadRemoteConfigIfNeeded(signal?: AbortSignal): Promise<void> {
    if (this.isLoaded && this.config && !this.config.remoteConfig) {
      await this.loadRemoteConfig(signal);
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
export default SecureConfigService.getInstance();