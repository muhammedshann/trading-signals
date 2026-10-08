import { createServerClient, type CookieOptions } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { getSupabaseConfig } from '@/lib/supabase/config';

export async function createClient() {
  const cookieStore = await cookies();
  const config = getSupabaseConfig();
  if (!config) return null;
  return createServerClient(config.url, config.key, {
    cookies: {
      getAll: () => cookieStore.getAll(),
      setAll: (items: { name: string; value: string; options: CookieOptions }[]) => { try { items.forEach(({ name, value, options }) => cookieStore.set(name, value, options)); } catch { /* Server Components cannot persist refreshed cookies; the proxy handles them. */ } },
    },
  });
}
