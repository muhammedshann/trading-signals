import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { isSameOriginRequest } from '@/lib/auth/otp';

export const runtime = 'nodejs';

export async function POST(request: Request) {
  if (!isSameOriginRequest(request)) return NextResponse.json({ error: 'Invalid request origin.' }, { status: 403 });
  try {
    const db = await createClient();
    if (!db) return NextResponse.json({ error: 'Database is not configured.' }, { status: 503 });
    const { data: { user } } = await db.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Please sign in first.' }, { status: 401 });

    const payload = await request.json() as { codeId?: string };
    if (!payload.codeId || !/^[0-9a-f-]{36}$/i.test(payload.codeId)) {
      return NextResponse.json({ error: 'Choose a pending Telegram connection to confirm.' }, { status: 400 });
    }

    const now = new Date().toISOString();
    const { data: subscription, error: subscriptionError } = await db.from('subscriptions').select('id')
      .eq('user_id', user.id).eq('status', 'active').gt('expires_at', now)
      .order('expires_at', { ascending: false }).limit(1).maybeSingle();
    if (subscriptionError) throw subscriptionError;
    if (!subscription) return NextResponse.json({ error: 'An active subscription is required.' }, { status: 403 });

    const admin = createAdminClient();
    const { data: code, error: codeError } = await admin.from('telegram_link_codes')
      .select('id,claimed_telegram_user_id,claimed_username,claimed_display_name,expires_at,used_at')
      .eq('id', payload.codeId).eq('user_id', user.id).not('claimed_at', 'is', null)
      .is('used_at', null).gt('expires_at', now).maybeSingle();
    if (codeError) throw codeError;
    if (!code?.claimed_telegram_user_id) {
      return NextResponse.json({ error: 'That Telegram confirmation expired. Create a fresh connection link.' }, { status: 410 });
    }

    const { data: existingForUser, error: userMappingError } = await admin.from('telegram_members')
      .select('telegram_user_id').eq('user_id', user.id).not('verified_at', 'is', null).maybeSingle();
    if (userMappingError) throw userMappingError;
    if (existingForUser && existingForUser.telegram_user_id !== code.claimed_telegram_user_id) {
      return NextResponse.json({ error: 'A different Telegram account is already connected. Contact support to change it.' }, { status: 409 });
    }

    const { data: existingForTelegram, error: telegramMappingError } = await admin.from('telegram_members')
      .select('user_id,verified_at').eq('telegram_user_id', code.claimed_telegram_user_id).maybeSingle();
    if (telegramMappingError) throw telegramMappingError;
    if (existingForTelegram && existingForTelegram.user_id !== user.id) {
      return NextResponse.json({ error: 'That Telegram account is already connected to another membership.' }, { status: 409 });
    }

    if (!existingForTelegram) {
      const { error: insertError } = await admin.from('telegram_members').insert({
        telegram_user_id: code.claimed_telegram_user_id,
        user_id: user.id,
        username: code.claimed_username,
        display_name: code.claimed_display_name,
        verified_at: now,
      });
      if (insertError?.code === '23505') {
        return NextResponse.json({ error: 'This Telegram account or membership is already connected. Refresh the page and check its status.' }, { status: 409 });
      }
      if (insertError) throw insertError;
    } else if (!existingForTelegram.verified_at) {
      const { error: updateError } = await admin.from('telegram_members').update({
        username: code.claimed_username,
        display_name: code.claimed_display_name,
        verified_at: now,
      }).eq('telegram_user_id', code.claimed_telegram_user_id).eq('user_id', user.id).is('verified_at', null);
      if (updateError) throw updateError;
    }

    const { error: consumeError } = await admin.from('telegram_link_codes').update({ used_at: now })
      .eq('id', code.id).eq('user_id', user.id).is('used_at', null);
    if (consumeError) throw consumeError;
    return NextResponse.json({ connected: true, identity: {
      telegramUserId: code.claimed_telegram_user_id,
      username: code.claimed_username,
      displayName: code.claimed_display_name,
    } });
  } catch (error) {
    console.error('Telegram connection confirmation failed:', error);
    return NextResponse.json({ error: 'Could not confirm this Telegram account. Please try again.' }, { status: 500 });
  }
}
