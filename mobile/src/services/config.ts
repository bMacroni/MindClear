import AsyncStorage from '@react-native-async-storage/async-storage';

export interface ApiConfig {
  baseUrl: string;
  name: string;
  description: string;
}

export const API_CONFIGS: Record<string, ApiConfig> = {
  local: {
    baseUrl: process.env.SECURE_API_BASE || process.env.API_BASE_URL || process.env.API_FALLBACK || 'http://192.168.1.66:5000/api',
    name: 'Local Development',
    description: 'Local backend server'
  },
  hosted: {
    baseUrl: 'https://foci-production.up.railway.app/api', // Replace with your actual Railway URL
    name: 'Hosted (Railway)',
    description: 'Production backend on Railway'
  }
};

class ConfigService {
  private currentConfig: ApiConfig = __DEV__ ? API_CONFIGS.local : API_CONFIGS.hosted;
  private configKey = 'api_config';
  private googleWebClientId: string | undefined;
  private googleAndroidClientId: string | undefined;
  private googleIosClientId: string | undefined;

  constructor() {
    this.loadConfig();
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
    if (API_CONFIGS[configKey]) {
      this.currentConfig = API_CONFIGS[configKey];
      await AsyncStorage.setItem(this.configKey, JSON.stringify(this.currentConfig));
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
    if (ids.web) this.googleWebClientId = ids.web;
    if (ids.android) this.googleAndroidClientId = ids.android;
    if (ids.ios) this.googleIosClientId = ids.ios;
  }

  getGoogleWebClientId(): string {
    const id = this.googleWebClientId || process.env.GOOGLE_WEB_CLIENT_ID;
    if (!id) {
      console.warn('GOOGLE_WEB_CLIENT_ID is not set');
    }
    return id || '';
  }


  getGoogleAndroidClientId(): string {
    const id = this.googleAndroidClientId || process.env.GOOGLE_ANDROID_CLIENT_ID;
    if (!id) {
      console.warn('GOOGLE_ANDROID_CLIENT_ID is not set');
    }
    return id || '';
  }

  getGoogleIosClientId(): string {
    const id = this.googleIosClientId || process.env.GOOGLE_IOS_CLIENT_ID;
    if (!id) {
      console.warn('GOOGLE_IOS_CLIENT_ID is not set');
    }
    return id || '';
  }
}

export const configService = new ConfigService();


