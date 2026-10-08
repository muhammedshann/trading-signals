import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
export async function requireUser(admin = false) {
  const db = await createClient();
  if (!db) redirect('/login?setup=database');
  const { data: { user } } = await db.auth.getUser();
  if (!user) redirect('/login');
  if (admin && user.app_metadata.role !== 'admin') redirect('/dashboard');
  return { db, user };
}
