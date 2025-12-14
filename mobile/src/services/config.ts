import AsyncStorage from '@react-native-async-storage/async-storage';

export interface ApiConfig {
  baseUrl: string;
  name: string;
  description: string;
}

export const API_CONFIGS: Record<string, ApiConfig> = {
  local: {
    baseUrl: process.env.SECURE_API_BASE || process.env.API_BASE_URL || process.env.API_FALLBACK || '',
    name: 'Local Development',
    description: 'Local backend server'
  },
  hosted: {
    baseUrl: process.env.PRODUCTION_API_URL || '',
    name: 'Hosted (Railway)',
    description: 'Production backend on Railway'
  }
};
export class ConfigService {
  private static instance: ConfigService;
  private currentConfig: ApiConfig = __DEV__ ? API_CONFIGS.local : API_CONFIGS.hosted;
  private configKey = 'api_config';
  private googleWebClientId: string | undefined;
  private googleAndroidClientId: string | undefined;
  private googleIosClientId: string | undefined;
  private mindClearConfirmUri: string | undefined;
  private mindClearResetPasswordUri: string | undefined;

  // replace the public constructor with a private one…
  private constructor() {}

  // …and expose an async initializer that fully loads the config
  static async initialize(): Promise<ConfigService> {
    if (!ConfigService.instance) {
      ConfigService.instance = new ConfigService();
      await ConfigService.instance.loadConfig();
    }
    return ConfigService.instance;
  }

  static getInstance(): ConfigService {
    if (!ConfigService.instance) {
      ConfigService.instance = new ConfigService();
      // Load config immediately when creating the instance
      // This ensures the exported singleton has persisted settings loaded
      ConfigService.instance.loadConfig().catch(error => {
        console.warn('Failed to load config in getInstance:', error);
      });
    }
    return ConfigService.instance;
  }
  async loadConfig(): Promise<void> {
    try {
      // In development mode, always use local config regardless of saved settings
      if (__DEV__) {
        this.currentConfig = API_CONFIGS.local;
        return;
      }

      // In production, load saved config
      const savedConfig = await AsyncStorage.getItem(this.configKey);
      if (savedConfig) {
        const config = JSON.parse(savedConfig);
        this.currentConfig = config;
      }

      // Ensure we always have a valid base URL
      if (!this.currentConfig.baseUrl || this.currentConfig.baseUrl.trim() === '') {
        this.currentConfig = API_CONFIGS.hosted;
      }
    } catch (error) {
      console.warn('Failed to load API config, using default:', error);
      // Ensure fallback on error
      if (!this.currentConfig.baseUrl || this.currentConfig.baseUrl.trim() === '') {
        this.currentConfig = API_CONFIGS.hosted;
      }
    }
  }

  async setConfig(configKey: string): Promise<void> {
    try {
      if (API_CONFIGS[configKey]) {
        this.currentConfig = API_CONFIGS[configKey];
        await AsyncStorage.setItem(this.configKey, JSON.stringify(this.currentConfig));
      }
    } catch (error) {
      console.error('Failed to save API config:', error);
      throw error; // Re-throw to allow caller to handle
    }
  }
  getCurrentConfig(): ApiConfig {
    return this.currentConfig;
  }

  getBaseUrl(): string {
    return this.currentConfig.baseUrl;
  }

  getAvailableConfigs(): Record<string, ApiConfig> {
    return API_CONFIGS;
  }

  async   getCurrentConfigKey(): Promise<string> {
    const config = this.getCurrentConfig();
    for (const [key, value] of Object.entries(API_CONFIGS)) {
      if (value.baseUrl === config.baseUrl) {
        return key;
      }
    }
    return 'local'; // Default fallback
  }

  // Google Sign-In Configuration
  setGoogleClientIds(ids: { web?: string; android?: string; ios?: string }) {
    if (ids.web) {
      this.googleWebClientId = ids.web;
    }
    if (ids.android) {
      this.googleAndroidClientId = ids.android;
    }
    if (ids.ios) {
      this.googleIosClientId = ids.ios;
    }
  }

  // Deep Link Configuration
  setMindClearUris(uris: { confirm?: string; reset?: string }) {
    if (uris.confirm) {
      this.mindClearConfirmUri = uris.confirm;
    }
    if (uris.reset) {
      this.mindClearResetPasswordUri = uris.reset;
    }
  }

  getMindClearConfirmUri(): string {
    const uri = this.mindClearConfirmUri || process.env.MINDCLEAR_CONFIRM_URI;
    if (!uri) {
      if (__DEV__ && this.shouldWarnAboutMissingConfig()) {
        console.warn('MINDCLEAR_CONFIRM_URI is not set - using default mindclear://confirm');
      }
      return 'mindclear://confirm';
    }
    return uri;
  }

  getMindClearResetPasswordUri(): string {
    const uri = this.mindClearResetPasswordUri || process.env.MINDCLEAR_RESET_PASSWORD_URI;
    if (!uri) {
      if (__DEV__ && this.shouldWarnAboutMissingConfig()) {
        console.warn('MINDCLEAR_RESET_PASSWORD_URI is not set - using default mindclear://reset-password');
      }
      return 'mindclear://reset-password';
    }
    return uri;
  }

  getGoogleWebClientId(): string {
    const id = this.googleWebClientId || process.env.GOOGLE_WEB_CLIENT_ID;
    // Only warn in development mode, and only once per session
    if (!id && __DEV__ && this.shouldWarnAboutMissingConfig()) {
      console.warn('GOOGLE_WEB_CLIENT_ID is not set - Google Sign-In will not be available');
    }
    return id || '';
  }


  getGoogleAndroidClientId(): string {
    const id = this.googleAndroidClientId || process.env.GOOGLE_ANDROID_CLIENT_ID;
    // Only warn in development mode, and only once per session
    if (!id && __DEV__ && this.shouldWarnAboutMissingConfig()) {
      console.warn('GOOGLE_ANDROID_CLIENT_ID is not set - Android Google Sign-In may not work');
    }
    return id || '';
  }

  getGoogleIosClientId(): string {
    const id = this.googleIosClientId || process.env.GOOGLE_IOS_CLIENT_ID;
    // Only warn in development mode, and only once per session
    if (!id && __DEV__ && this.shouldWarnAboutMissingConfig()) {
      console.warn('GOOGLE_IOS_CLIENT_ID is not set - iOS Google Sign-In may not work');
    }
    return id || '';
  }

  private warnedAboutMissingConfig = false;
  private shouldWarnAboutMissingConfig(): boolean {
    if (!this.warnedAboutMissingConfig) {
      this.warnedAboutMissingConfig = true;
      return true;
    }
    return false;
  }
}

export const configService = ConfigService.getInstance();


