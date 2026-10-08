import { createHash, randomBytes } from 'node:crypto';
import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { telegramCall } from '@/lib/telegram/bot-api';
import { isSameOriginRequest } from '@/lib/auth/otp';

export const runtime = 'nodejs';
type BotInfo = { username: string };

async function currentUser() {
  const db = await createClient();
  if (!db) return { response: NextResponse.json({ error: 'Database is not configured.' }, { status: 503 }) };
  const { data: { user } } = await db.auth.getUser();
  if (!user) return { response: NextResponse.json({ error: 'Please sign in first.' }, { status: 401 }) };
  return { db, user };
}

export async function GET() {
  try {
    const auth = await currentUser();
    if (auth.response) return auth.response;
    const admin = createAdminClient();
    const { data: member, error } = await admin.from('telegram_members').select('verified_at,username,display_name,telegram_user_id')
      .eq('user_id', auth.user.id).not('verified_at', 'is', null).maybeSingle();
    if (error) throw error;
    if (member) return NextResponse.json({ connected: true, identity: {
      telegramUserId: member.telegram_user_id,
      username: member.username,
      displayName: member.display_name,
    } });

    const { data: pending, error: pendingError } = await admin.from('telegram_link_codes')
      .select('id,claimed_telegram_user_id,claimed_username,claimed_display_name,expires_at')
      .eq('user_id', auth.user.id).not('claimed_at', 'is', null).is('used_at', null)
      .gt('expires_at', new Date().toISOString()).order('claimed_at', { ascending: false }).limit(1).maybeSingle();
    if (pendingError) throw pendingError;
    return NextResponse.json({
      connected: false,
      pending: pending ? {
        id: pending.id,
        telegramUserId: pending.claimed_telegram_user_id,
        username: pending.claimed_username,
        displayName: pending.claimed_display_name,
        expiresAt: pending.expires_at,
      } : null,
    });
  } catch (error) {
    console.error('Telegram connection status failed:', error);
    return NextResponse.json({ error: 'Could not check Telegram connection.' }, { status: 500 });
  }
}

export async function POST(request: Request) {
  if (!isSameOriginRequest(request)) return NextResponse.json({ error: 'Invalid request origin.' }, { status: 403 });
  try {
    const auth = await currentUser();
    if (auth.response) return auth.response;
    const { data: subscription, error: subscriptionError } = await auth.db.from('subscriptions').select('id')
      .eq('user_id', auth.user.id).eq('status', 'active').gt('expires_at', new Date().toISOString())
      .order('expires_at', { ascending: false }).limit(1).maybeSingle();
    if (subscriptionError) throw subscriptionError;
    if (!subscription) return NextResponse.json({ error: 'An active subscription is required.' }, { status: 403 });

    const admin = createAdminClient();
    const { data: member, error: memberError } = await admin.from('telegram_members').select('verified_at')
      .eq('user_id', auth.user.id).not('verified_at', 'is', null).maybeSingle();
    if (memberError) throw memberError;
    if (member) return NextResponse.json({ connected: true });

    // Reissuing a link invalidates older links, including a link claimed by the wrong Telegram account.
    const { error: clearError } = await admin.from('telegram_link_codes').delete()
      .eq('user_id', auth.user.id).is('used_at', null);
    if (clearError) throw clearError;

    const code = randomBytes(24).toString('base64url');
    const codeHash = createHash('sha256').update(code).digest('hex');
    const expiresAt = new Date(Date.now() + 15 * 60 * 1000).toISOString();
    const { error: insertError } = await admin.from('telegram_link_codes').insert({
      code_hash: codeHash, user_id: auth.user.id, expires_at: expiresAt,
    });
    if (insertError) throw insertError;
    const bot = await telegramCall<BotInfo>('getMe', {});
    return NextResponse.json({ connectUrl: `https://t.me/${bot.username}?start=${code}`, expiresInSeconds: 900 });
  } catch (error) {
    console.error('Telegram connect link creation failed:', error);
    return NextResponse.json({ error: 'Could not create a Telegram connection link.' }, { status: 500 });
  }
}
