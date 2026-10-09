import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
export async function requireUser(admin = false) {
  const db = await createClient();
  if (!db) redirect('/login?setup=database');
  const { data: { user } } = await db.auth.getUser();
  if (!user) redirect('/login');
  const { data: profile } = await db.from('profiles').select('is_suspended,removed_at').eq('id', user.id).maybeSingle();
  if (profile?.is_suspended || profile?.removed_at) {
    await db.auth.signOut();
    redirect('/login?account=unavailable');
  }
  if (admin && user.app_metadata.role !== 'admin') redirect('/dashboard');
  return { db, user };
}
