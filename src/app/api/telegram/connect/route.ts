import { createHash, randomBytes } from 'node:crypto';
import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { telegramCall } from '@/lib/telegram/bot-api';

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
    const { data: member, error } = await admin.from('telegram_members').select('verified_at')
      .eq('user_id', auth.user.id).not('verified_at', 'is', null).maybeSingle();
    if (error) throw error;
    return NextResponse.json({ connected: Boolean(member) });
  } catch (error) {
    console.error('Telegram connection status failed:', error);
    return NextResponse.json({ error: 'Could not check Telegram connection.' }, { status: 500 });
  }
}

export async function POST() {
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
