import { createClient } from '@supabase/supabase-js';
import { secureConfigService } from './secureConfig';

let cached: ReturnType<typeof createClient> | null = null;

export function getSupabaseClient() {
  if (cached) return cached;
  // For mobile, reuse the backend Supabase URL and anon key from environment if provided via secure config
  const url = process.env.SUPABASE_URL || '';
  const key = process.env.SUPABASE_ANON_KEY || '';
  // In this project, password update is routed through backend; keep client optional
  cached = createClient(url, key);
  return cached;
}


