import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { AppState } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import secureConfigService from './secureConfig';

let supabase: SupabaseClient | null = null;

const getSupabaseClient = (): SupabaseClient => {
  if (supabase) {
    return supabase;
  }

  let supabaseUrl;
  let supabaseAnonKey;

  try {
    // Get the Supabase URL and Anon Key securely from our config service
    supabaseUrl = secureConfigService.getSupabaseUrl();
    supabaseAnonKey = secureConfigService.getSupabaseAnonKey();
  } catch (error) {
    const originalError = error instanceof Error ? error.message : String(error);
    throw new Error(`Failed to load Supabase config from secureConfigService. Original error: ${originalError}`);
  }


  if (!supabaseUrl || !supabaseAnonKey) {
    throw new Error('Supabase URL or Anon Key is not available. Check secureConfigService.');
  }

  supabase = createClient(supabaseUrl, supabaseAnonKey, {
    auth: {
      storage: AsyncStorage,
      autoRefreshToken: true,
      persistSession: true,
      detectSessionInUrl: false,
    },    // Supabase Realtime client options
    realtime: {
      params: {
        eventsPerSecond: 10,
      },
    },
    // AppState handler for pausing Realtime connections when app is in background
    global: {
      headers: {
        'X-Client-Info': 'MindClear-Mobile-App/1.0.0',
      },
    },
  });

  return supabase;
};

export default getSupabaseClient;
