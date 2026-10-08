import 'server-only';
import { createClient } from '@supabase/supabase-js';
import { getSupabaseConfig } from '@/lib/supabase/config';
export function createAdminClient() {
  const config = getSupabaseConfig();
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!config || !key) throw new Error('Supabase is not configured. Check the URL and server keys in .env.local.');
  return createClient(config.url, key, { auth: { autoRefreshToken: false, persistSession: false } });
}
