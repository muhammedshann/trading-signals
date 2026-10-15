import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { isSameOriginRequest } from '@/lib/auth/otp';
import { kickTelegramMember, unbanTelegramMember } from '@/lib/telegram/bot-api';

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
      if (body.id === user.id) return NextResponse.json({ error: 'You cannot suspend your own admin account.' }, { status: 400 });
      const { error } = await admin.auth.admin.updateUserById(body.id, { ban_duration: body.value ? '876000h' : 'none' });
      if (error) throw error;
      const { error: profileError } = await admin.from('profiles').update({ is_suspended: body.value }).eq('id', body.id);
      if (profileError) throw profileError;
    } else if (body.kind === 'remove_user') {
      if (body.id === user.id) return NextResponse.json({ error: 'You cannot remove your own admin account.' }, { status: 400 });
      const { data: profile, error: lookupError } = await admin.from('profiles').select('role,removed_at').eq('id', body.id).maybeSingle();
      if (lookupError) throw lookupError;
      if (!profile || profile.removed_at) return NextResponse.json({ error: 'Member was not found or has already been removed.' }, { status: 404 });
      if (profile.role === 'admin') return NextResponse.json({ error: 'Admin accounts cannot be removed here.' }, { status: 400 });
      const now = new Date().toISOString();
      const { error: profileError } = await admin.from('profiles').update({
        email: `removed+${body.id}@deleted.invalid`, full_name: 'Removed member', is_suspended: true, removed_at: now,
      }).eq('id', body.id);
      if (profileError) throw profileError;
      const { error: subscriptionError } = await admin.from('subscriptions').update({ status: 'suspended' }).eq('user_id', body.id).eq('status', 'active');
      if (subscriptionError) throw subscriptionError;
      const { error: authError } = await admin.auth.admin.updateUserById(body.id, {
        ban_duration: '876000h', email: `removed+${body.id}@deleted.invalid`, email_confirm: true, user_metadata: { full_name: 'Removed member' },
      });
      if (authError) throw authError;
    } else if (body.kind === 'bot_kick') {
      const chatId = process.env.TELEGRAM_CHAT_ID;
      if (!chatId) return NextResponse.json({ error: 'TELEGRAM_CHAT_ID is not configured in .env.local.' }, { status: 400 });
      try {
        await kickTelegramMember(chatId, body.id);
      } catch (tgError) {
        console.warn('Bot kick call failed (may not be in group):', tgError);
      }
      const { error } = await admin.from('telegram_members').update({ kicked_at: new Date().toISOString() }).eq('telegram_user_id', body.id);
      if (error) throw error;
    } else if (body.kind === 'bot_unban') {
      const chatId = process.env.TELEGRAM_CHAT_ID;
      if (!chatId) return NextResponse.json({ error: 'TELEGRAM_CHAT_ID is not configured in .env.local.' }, { status: 400 });
      try {
        await unbanTelegramMember(chatId, body.id);
      } catch (tgError) {
        console.warn('Bot unban call failed:', tgError);
      }
      const { error } = await admin.from('telegram_members').update({ kicked_at: null }).eq('telegram_user_id', body.id);
      if (error) throw error;
    } else {
      return NextResponse.json({ error: 'Invalid operation.' }, { status: 400 });
    }
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error('Admin operation failed:', error);
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Update failed.' }, { status: 500 });
  }
}

