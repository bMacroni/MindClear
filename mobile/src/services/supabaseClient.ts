import { createClient, SupabaseClient } from '@supabase/supabase-js';

import SecureStorageAdapter from '../utils/secureStorageAdapter';
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

  // Ensure SecureStorageAdapter has proper setItem/getItem behavior
  // Supabase expects setItem to return void, and getItem to return Promise<string | null>
  
  supabase = createClient(supabaseUrl, supabaseAnonKey, {
    auth: {
      storage: SecureStorageAdapter,
      autoRefreshToken: true,
      persistSession: true,
      detectSessionInUrl: false,
      flowType: 'pkce',
      debug: false,
    },
    // Supabase Realtime client options
    realtime: {
      params: {
        eventsPerSecond: 10,
      },
    },
     global: {
    global: {
      headers: {
        'X-Client-Info': 'MindClear-Mobile-App/1.0.0',
      },
    },
  });

  return supabase;
};

export default getSupabaseClient;
