import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { AppState } from 'react-native';
import secureConfigService from './secureConfig';

let supabase: SupabaseClient | null = null;

const getSupabaseClient = (): SupabaseClient => {
  if (supabase) {
    return supabase;
  }

  // Get the Supabase URL and Anon Key securely from our config service
  const supabaseUrl = secureConfigService.getSupabaseUrl();
  const supabaseAnonKey = secureConfigService.getSupabaseAnonKey();

  if (!supabaseUrl || !supabaseAnonKey) {
    throw new Error('Supabase URL or Anon Key is not available. Check secureConfigService.');
  }

  supabase = createClient(supabaseUrl, supabaseAnonKey, {
    auth: {
      storage: AppState,
      autoRefreshToken: true,
      persistSession: true,
      detectSessionInUrl: false,
    },
    // Supabase Realtime client options
    realtime: {
      params: {
        eventsPerSecond: 10,
      },
    },
    // AppState handler for pausing Realtime connections when app is in background
    global: {
      // @ts-ignore
      fetch: (...args) => fetch(...args),
      headers: {
        'X-Client-Info': 'MindClear-Mobile-App/1.0.0',
      },
    },
  });

  return supabase;
};

export default getSupabaseClient;
