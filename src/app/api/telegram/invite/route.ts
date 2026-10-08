import { createHash } from 'node:crypto';
import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { telegramCall } from '@/lib/telegram/bot-api';
import { isSameOriginRequest } from '@/lib/auth/otp';

export const runtime = 'nodejs';

type InviteResult = { invite_link: string };

export async function POST(request: Request) {
  if (!isSameOriginRequest(request)) return NextResponse.json({ error: 'Invalid request origin.' }, { status: 403 });
  try {
    const db = await createClient();
    if (!db) return NextResponse.json({ error: 'Database is not configured.' }, { status: 503 });
    const { data: { user } } = await db.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized.' }, { status: 401 });

    const now = new Date();
    const { data: sub } = await db.from('subscriptions').select('id,expires_at')
      .eq('user_id', user.id).eq('status', 'active').gt('expires_at', now.toISOString())
      .order('expires_at', { ascending: false }).limit(1).maybeSingle();
    if (!sub) return NextResponse.json({ error: 'An active subscription is required.' }, { status: 403 });

    const chatId = process.env.TELEGRAM_CHAT_ID;
    if (!chatId || !process.env.TELEGRAM_BOT_TOKEN) {
      return NextResponse.json({ error: 'Telegram access is not configured yet.' }, { status: 503 });
    }

    const admin = createAdminClient();
    const { data: existingMember, error: memberError } = await admin.from('telegram_members')
      .select('telegram_user_id,kicked_at,verified_at').eq('user_id', user.id)
      .not('verified_at', 'is', null).maybeSingle();
    if (memberError) throw memberError;
    if (!existingMember?.verified_at) {
      return NextResponse.json({ error: 'Connect your Telegram account first.' }, { status: 409 });
    }
    if (existingMember?.kicked_at) {
      await telegramCall('unbanChatMember', { chat_id: chatId, user_id: existingMember.telegram_user_id, only_if_banned: true });
      const { error } = await admin.from('telegram_members').update({ kicked_at: null }).eq('telegram_user_id', existingMember.telegram_user_id);
      if (error) throw error;
    }

    const expiresAt = new Date(Date.now() + 15 * 60 * 1000);
    const invite = await telegramCall<InviteResult>('createChatInviteLink', {
      chat_id: chatId,
      expire_date: Math.floor(expiresAt.getTime() / 1000),
      creates_join_request: true,
      name: `member-${user.id.slice(0, 8)}`,
    });
    const inviteHash = createHash('sha256').update(invite.invite_link).digest('hex');
    const { error: insertError } = await admin.from('telegram_invites').insert({
      invite_hash: inviteHash, user_id: user.id, subscription_id: sub.id, expires_at: expiresAt.toISOString(),
    });
    if (insertError) throw insertError;
    return NextResponse.json({ inviteUrl: invite.invite_link, expiresInSeconds: 900 });
  } catch (error) {
    console.error('Telegram invite creation failed:', error);
    return NextResponse.json({ error: 'Could not create a Telegram invite. Please try again.' }, { status: 500 });
  }
}
