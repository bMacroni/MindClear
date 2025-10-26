import { createClient } from '@supabase/supabase-js';
import logger from './logger.js';

let supabaseClient = null;

/**
 * Initializes and returns a Supabase client instance.
 * It uses the service role key for admin-level access.
 * @returns {SupabaseClient}
 */
export function getSupabaseClient() {
  if (supabaseClient) {
    return supabaseClient;
  }

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
    throw error;
  }
}
