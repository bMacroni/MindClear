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

// Type declarations for React Native environment variables
declare const process: {
  env: {
    [key: string]: string | undefined;
  };
};


interface RemoteConfig {
  supabaseUrl: string;
  supabaseAnonKey: string;
  googleWebClientId?: string;
  googleAndroidClientId?: string;
  googleIosClientId?: string;
  mindClearConfirmUri?: string;
  mindClearResetPasswordUri?: string;
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
    let timeoutId: ReturnType<typeof setTimeout> | undefined;
    try {
      if (!this.config) {
        throw new Error('Secure config is not initialized; cannot load remote config.');
      }
      
      // Check if cancelled before making network request
      if (signal?.aborted) {
        throw new Error('Remote config loading was cancelled');
      }
      
      // Add timeout to prevent hanging during app startup
      // Create AbortController for timeout
      const timeoutController = new AbortController();
      const combinedSignal = signal?.aborted ? signal : timeoutController.signal;
      
      // Add timeout to prevent hanging during app startup
      const timeoutPromise = new Promise<never>((_, reject) => {
        timeoutId = setTimeout(() => {
          timeoutController.abort();
          reject(new Error('Remote config request timeout'));
        }, 5000); // Reduced to 5 second timeout
      });
      
      const remoteConfigPromise = enhancedAPI.getUserConfig(combinedSignal);
      const remoteConfig: RemoteConfig = await Promise.race([remoteConfigPromise, timeoutPromise]);
      
      // Clear timeout on success
      if (timeoutId) {
        clearTimeout(timeoutId);
        timeoutId = undefined;
      }
      
      // Check if cancelled after getting remote config
      if (signal?.aborted) {
        throw new Error('Remote config loading was cancelled');
      }
      
      if (remoteConfig.supabaseUrl && remoteConfig.supabaseAnonKey) {
        this.config.remoteConfig = remoteConfig;
        logger.info('Secure remote config loaded from server');
        
        // Log Google client IDs availability (optional, so don't fail if missing)
        if (!remoteConfig.googleWebClientId) {
          logger.warn('Google Web Client ID not available in remote config');
        }
        if (!remoteConfig.googleAndroidClientId) {
          logger.warn('Google Android Client ID not available in remote config');
        }
        if (!remoteConfig.googleIosClientId) {
          logger.warn('Google iOS Client ID not available in remote config');
        }
        
        // If Google Client IDs are now available, update configService and trigger Google Auth reconfiguration
        if (remoteConfig.googleWebClientId || remoteConfig.googleAndroidClientId || remoteConfig.googleIosClientId) {
          try {
            // Update configService with the new IDs
            configService.setGoogleClientIds({
              web: remoteConfig.googleWebClientId,
              android: remoteConfig.googleAndroidClientId,
              ios: remoteConfig.googleIosClientId,
            });
            logger.info('Google Client IDs updated in configService from remote config');
            
            // Trigger Google Auth reconfiguration now that IDs are available
            if (remoteConfig.googleWebClientId) {
              // Dynamically import to avoid circular dependency
              const { googleAuthService } = await import('./googleAuth');
              googleAuthService.reconfigure();
              logger.info('Google Sign-In reconfigured with remote config');
            }
          } catch (reconfigError) {
            // Log but don't fail if reconfiguration fails
            logger.warn('Failed to update Google config after remote config load:', reconfigError);
          }
        }

        // Update MindClear URIs if available
        if (remoteConfig.mindClearConfirmUri || remoteConfig.mindClearResetPasswordUri) {
          configService.setMindClearUris({
            confirm: remoteConfig.mindClearConfirmUri,
            reset: remoteConfig.mindClearResetPasswordUri,
          });
          logger.info('MindClear URIs updated in configService from remote config');
        }
        
        // Persist the updated config to AsyncStorage for offline use
        try {
          await AsyncStorage.setItem(this.configKey, JSON.stringify(this.config));
          logger.info('Remote config persisted to AsyncStorage');
        } catch (persistError) {
          // Log but don't crash startup if persistence fails
          logger.warn('Failed to persist remote config to AsyncStorage:', persistError);
        }
      } else {
        logger.warn('Remote config from server is missing required keys (supabaseUrl/supabaseAnonKey).');
      }
    } catch (error) {
      // Clear timeout on error
      if (timeoutId) {
        clearTimeout(timeoutId);
        timeoutId = undefined;
      }
      
      // Only log if not cancelled
      if (!signal?.aborted) {
        // Distinguish between timeout and other errors
        if (error instanceof Error && error.message.includes('timeout')) {
          logger.warn('Remote config request timed out - continuing with fallback config. This is normal if the backend is unreachable.');
        } else {
          logger.error('Failed to load secure remote config:', error);
          logger.warn('Continuing with fallback config due to remote config failure');
        }
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

  /**
   * Gets the Supabase URL from runtime sources.
   * Priority: 1) Remote config 2) Environment variable 3) Dev-only placeholder or error
   * 
   * @returns Supabase URL string
   * @throws Error in production if no valid source is found
   */
  getSupabaseUrl(): string {
    // First priority: Remote config (most secure, fetched from backend)
    if (this.config?.remoteConfig?.supabaseUrl) {
      return this.config.remoteConfig.supabaseUrl;
    }

    // Second priority: Environment variable (for build-time configuration)
    const envUrl = process.env.SUPABASE_URL?.trim();
    if (envUrl && envUrl.length > 0) {
      logger.info('Using Supabase URL from environment variable');
      return envUrl;
    }

    // Runtime guard: Log warning but never embed values
    if (__DEV__) {
      logger.warn('Supabase URL missing from both remote config and environment variables. Using dev-only placeholder.');
      return ''; // Non-functional placeholder in development
    }

    // Production: Must have a valid source
    logger.error('Supabase URL unavailable: missing from remote config and environment variables (SUPABASE_URL).');
    throw new Error(
      'Supabase URL configuration missing. ' +
      'Required: Either remote config from backend or SUPABASE_URL environment variable. ' +
      'Check your environment configuration.'
    );
  }

  /**
   * Gets the Supabase anonymous key from runtime sources.
   * Priority: 1) Remote config 2) Environment variable 3) Dev-only placeholder or error
   * 
   * SECURITY: Never hardcode keys in source code. This method ensures keys are only
   * sourced from runtime configuration (remote config or environment variables).
   * 
   * @returns Supabase anonymous key string
   * @throws Error in production if no valid source is found
   */
  getSupabaseAnonKey(): string {
    // First priority: Remote config (most secure, fetched from backend)
    if (this.config?.remoteConfig?.supabaseAnonKey) {
      return this.config.remoteConfig.supabaseAnonKey;
    }

    // Second priority: Environment variable (for build-time configuration)
    const envKey = process.env.SUPABASE_ANON_KEY?.trim();
    if (envKey && envKey.length > 0) {
      logger.info('Using Supabase anon key from environment variable');
      // Runtime guard: Verify it looks like a JWT but never log the actual key
      if (envKey.startsWith('eyJ')) {
        return envKey;
      } else {
        logger.warn('SUPABASE_ANON_KEY environment variable format appears invalid (should start with eyJ)');
        // Still return it in case format is valid but non-standard
        return envKey;
      }
    }

    // Runtime guard: Log warning but never embed values
    if (__DEV__) {
      logger.warn('Supabase Anon Key missing from both remote config and environment variables. Using dev-only placeholder.');
      return ''; // Non-functional placeholder in development
    }

    // Production: Must have a valid source
    logger.error('Supabase Anon Key unavailable: missing from remote config and environment variables (SUPABASE_ANON_KEY).');
    throw new Error(
      'Supabase Anon Key configuration missing. ' +
      'Required: Either remote config from backend or SUPABASE_ANON_KEY environment variable. ' +
      'Check your environment configuration. ' +
      'SECURITY: Never hardcode keys in source code.'
    );
  }

  /**
   * Gets the Google Web Client ID from runtime sources.
   * Priority: 1) Remote config 2) Environment variable 3) Empty string (fallback)
   * 
   * @returns Google Web Client ID string (empty if not available)
   */
  getGoogleWebClientId(): string {
    // First priority: Remote config (most secure, fetched from backend)
    if (this.config?.remoteConfig?.googleWebClientId) {
      return this.config.remoteConfig.googleWebClientId;
    }

    // Second priority: Environment variable (for build-time configuration)
    const envId = process.env.GOOGLE_WEB_CLIENT_ID?.trim();
    if (envId && envId.length > 0) {
      logger.info('Using Google Web Client ID from environment variable');
      return envId;
    }

    // Return empty string if not available (caller should handle gracefully)
    return '';
  }

  /**
   * Gets the Google Android Client ID from runtime sources.
   * Priority: 1) Remote config 2) Environment variable 3) Empty string (fallback)
   * 
   * @returns Google Android Client ID string (empty if not available)
   */
  getGoogleAndroidClientId(): string {
    // First priority: Remote config (most secure, fetched from backend)
    if (this.config?.remoteConfig?.googleAndroidClientId) {
      return this.config.remoteConfig.googleAndroidClientId;
    }

    // Second priority: Environment variable (for build-time configuration)
    const envId = process.env.GOOGLE_ANDROID_CLIENT_ID?.trim();
    if (envId && envId.length > 0) {
      logger.info('Using Google Android Client ID from environment variable');
      return envId;
    }

    // Return empty string if not available (caller should handle gracefully)
    return '';
  }

  /**
   * Gets the Google iOS Client ID from runtime sources.
   * Priority: 1) Remote config 2) Environment variable 3) Empty string (fallback)
   * 
   * @returns Google iOS Client ID string (empty if not available)
   */
  getGoogleIosClientId(): string {
    // First priority: Remote config (most secure, fetched from backend)
    if (this.config?.remoteConfig?.googleIosClientId) {
      return this.config.remoteConfig.googleIosClientId;
    }

    // Second priority: Environment variable (for build-time configuration)
    const envId = process.env.GOOGLE_IOS_CLIENT_ID?.trim();
    if (envId && envId.length > 0) {
      logger.info('Using Google iOS Client ID from environment variable');
      return envId;
    }

    // Return empty string if not available (caller should handle gracefully)
    return '';
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