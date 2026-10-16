import { timingSafeEqual } from 'node:crypto';
import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { processSubscriptionExpiryEmails } from '@/lib/subscriptions/expiry-cron';

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
  if (!isAuthorized(request.headers.get('authorization'))) {
    return NextResponse.json({ error: 'Unauthorized.' }, { status: 401 });
  }

  try {
    const admin = createAdminClient();
    const result = await processSubscriptionExpiryEmails(admin);
    return NextResponse.json({ ok: true, ...result });
  } catch (error) {
    console.error('Subscription expiry cron failed:', error);
    return NextResponse.json({ error: 'Failed processing subscription expiry emails.' }, { status: 500 });
  }
}

export async function POST(request: Request) {
  return GET(request);
}
