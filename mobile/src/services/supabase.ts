import { createClient } from '@supabase/supabase-js';
import { secureConfigService } from './secureConfig';

let cached: ReturnType<typeof createClient> | null = null;

/**
 * Validates that required Supabase environment variables are present.
 * Throws a clear error at startup if any are missing.
 */
function validateSupabaseConfig(): { url: string; key: string } {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_ANON_KEY;
  
  const missing: string[] = [];
  if (!url) missing.push('SUPABASE_URL');
  if (!key) missing.push('SUPABASE_ANON_KEY');
  
  if (missing.length > 0) {
    throw new Error(
      `Supabase client initialization failed: Missing required environment variables: ${missing.join(', ')}. ` +
      'Please ensure these variables are properly configured in your environment.'
    );
  }
  
  return { url, key };
}

/**
 * Gets the Supabase client instance.
 * 
 * This function validates that both SUPABASE_URL and SUPABASE_ANON_KEY environment
 * variables are present before creating the client. If either is missing, it throws
 * a clear error at startup to prevent runtime issues with invalid credentials.
 * 
 * @returns The Supabase client instance
 * @throws Error if required environment variables are missing
 */
export function getSupabaseClient() {
  if (cached) return cached;
  
  const { url, key } = validateSupabaseConfig();
  cached = createClient(url, key);
  return cached;
}


