import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { isSameOriginRequest } from '@/lib/auth/otp';

export async function POST(request: Request) {
  if (!isSameOriginRequest(request)) return NextResponse.json({ error: 'Invalid request origin.' }, { status: 403 });
  const auth = await createClient();
  if (!auth) return NextResponse.json({ error: 'Database unavailable.' }, { status: 503 });
  const { data: { user } } = await auth.auth.getUser();
  if (!user || user.app_metadata.role !== 'admin') return NextResponse.json({ error: 'Forbidden.' }, { status: 403 });
  try {
    const body = await request.json() as { kind?: string; id?: string; value?: unknown };
    if (!body.id || typeof body.id !== 'string') {
      return NextResponse.json({ error: 'Invalid request.' }, { status: 400 });
    }
    const admin = createAdminClient();
    if (body.kind === 'plan') {
      if (typeof body.value !== 'boolean') return NextResponse.json({ error: 'Invalid request.' }, { status: 400 });
      const { error } = await admin.from('plans').update({ active: body.value }).eq('id', body.id);
      if (error) throw error;
    } else if (body.kind === 'subscription') {
      if (!['active', 'suspended', 'cancelled'].includes(String(body.value))) return NextResponse.json({ error: 'Invalid request.' }, { status: 400 });
      const { error } = await admin.from('subscriptions').update({ status: String(body.value) }).eq('id', body.id);
      if (error) throw error;
    } else if (body.kind === 'user') {
      if (typeof body.value !== 'boolean') return NextResponse.json({ error: 'Invalid request.' }, { status: 400 });
      const { error } = await admin.auth.admin.updateUserById(body.id, { ban_duration: body.value ? '876000h' : 'none' });
      if (error) throw error;
      const { error: profileError } = await admin.from('profiles').update({ is_suspended: body.value }).eq('id', body.id);
      if (profileError) throw profileError;
    } else {
      return NextResponse.json({ error: 'Invalid operation.' }, { status: 400 });
    }
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error('Admin operation failed:', error);
    return NextResponse.json({ error: 'Update failed.' }, { status: 500 });
  }
}
