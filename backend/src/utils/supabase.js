import { createClient } from '@supabase/supabase-js';
import logger from './logger.js';

let supabaseClient = null;
let initPromise = null;

/**
 * Initializes and returns a Supabase client instance.
 * It uses the service role key for admin-level access.
 * Uses promise-based singleton pattern to prevent race conditions.
 * @returns {Promise<SupabaseClient>}
 */
export async function getSupabaseClient() {
  if (supabaseClient) {
    return supabaseClient;
  }

  if (!initPromise) {
    initPromise = (async () => {
      const supabaseUrl = process.env.SUPABASE_URL;
      const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

      if (!supabaseUrl || !supabaseServiceKey) {
        logger.error('Supabase URL or service role key is not defined in environment variables.');
        throw new Error('Supabase configuration is missing.');
      }

      try {
        supabaseClient = createClient(supabaseUrl, supabaseServiceKey);
        logger.info('Supabase client initialized successfully.');
        return supabaseClient;
      } catch (error) {
        logger.error('Failed to initialize Supabase client:', error);
        initPromise = null; // Clear promise on failure to allow retry
        throw error;
      }
    })();
  }

  return await initPromise;
}