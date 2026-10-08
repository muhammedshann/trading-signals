import { timingSafeEqual } from 'node:crypto';
import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { kickTelegramMember } from '@/lib/telegram/bot-api';

export const runtime = 'nodejs';
export const maxDuration = 60;

function isAuthorized(header: string | null) {
  const secret = process.env.CRON_SECRET;
  if (!secret || !header?.startsWith('Bearer ')) return false;
  const received = Buffer.from(header.slice(7));
  const expected = Buffer.from(secret);
  return received.length === expected.length && timingSafeEqual(received, expected);
}

export async function GET(request: Request) {
  if (!isAuthorized(request.headers.get('authorization'))) return NextResponse.json({ error: 'Unauthorized.' }, { status: 401 });
  const chatId = process.env.TELEGRAM_CHAT_ID;
  if (!chatId || !process.env.TELEGRAM_BOT_TOKEN) return NextResponse.json({ error: 'Telegram is not configured.' }, { status: 503 });

  try {
    const admin = createAdminClient();
    const { data: members, error: membersError } = await admin.from('telegram_members')
      .select('telegram_user_id,user_id').not('verified_at', 'is', null).is('kicked_at', null).limit(1000);
    if (membersError) throw membersError;
    if (!members?.length) return NextResponse.json({ checked: 0, removed: 0, failed: 0 });

    const userIds = [...new Set(members.map((member) => member.user_id))];
    const now = new Date().toISOString();
    const { data: activeSubs, error: subsError } = await admin.from('subscriptions').select('user_id')
      .in('user_id', userIds).eq('status', 'active').gt('expires_at', now);
    if (subsError) throw subsError;
    const activeUsers = new Set((activeSubs ?? []).map((sub) => sub.user_id));
    let removed = 0;
    let failed = 0;

    for (const member of members) {
      if (activeUsers.has(member.user_id)) continue;
      try {
        await kickTelegramMember(chatId, member.telegram_user_id);
        const { error } = await admin.from('telegram_members').update({ kicked_at: now })
          .eq('telegram_user_id', member.telegram_user_id).is('kicked_at', null);
        if (error) throw error;
        removed += 1;
      } catch (error) {
        failed += 1;
        console.error('Could not remove expired Telegram member:', member.telegram_user_id, error);
      }
    }
    return NextResponse.json({ checked: members.length, removed, failed });
  } catch (error) {
    console.error('Telegram expiry job failed:', error);
    return NextResponse.json({ error: 'Expiry check failed.' }, { status: 500 });
  }
}
