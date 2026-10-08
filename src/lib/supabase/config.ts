export function getSupabaseConfig() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim();
  if (!url || !key) return null;

  try {
    const parsed = new URL(url);
    if (!['http:', 'https:'].includes(parsed.protocol) || !parsed.hostname || parsed.pathname !== '/' || parsed.search || parsed.hash) return null;
    if (process.env.NODE_ENV === 'production' && parsed.protocol !== 'https:') return null;
    return { url: parsed.origin, key };
  } catch {
    return null;
  }
}
