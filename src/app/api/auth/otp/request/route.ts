import { NextResponse } from 'next/server';
import { createOtp, createEmailLinkToken, getLocalOrPublicOrigin, hashOtpValue, isSameOriginRequest } from '@/lib/auth/otp';
import { sendOtpEmail } from '@/lib/email/gmail';
import { createAdminClient } from '@/lib/supabase/admin';

export const runtime = 'nodejs';

export async function POST(request: Request) {
  if (!isSameOriginRequest(request)) return NextResponse.json({ error: 'Invalid request origin.' }, { status: 403 });
  try {
    const payload = await request.json() as { email?: string; purpose?: string; fullName?: string };
    const email = payload.email?.trim().toLowerCase() || '';
    const purpose = payload.purpose === 'signup' ? 'signup' : payload.purpose === 'login' ? 'login' : payload.purpose === 'reset' ? 'reset' : null;
    const fullName = payload.fullName?.trim().slice(0, 120) || null;
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || !purpose) {
      return NextResponse.json({ error: 'Enter a valid email address.' }, { status: 400 });
    }
    if (purpose === 'signup' && (!fullName || fullName.length < 2)) return NextResponse.json({ error: 'Enter your name.' }, { status: 400 });

    const admin = createAdminClient();
    // Keep reset responses indistinguishable for known and unknown addresses.
    // A reset code is only issued to an address attached to an existing profile.
    if (purpose === 'reset') {
      const { data: profile, error: profileError } = await admin.from('profiles').select('id').ilike('email', email).maybeSingle();
      if (profileError) throw profileError;
      if (!profile) return NextResponse.json({ ok: true });
    }
    const { data: previous } = await admin.from('email_otp_challenges').select('sent_count,sent_window_started_at,updated_at').eq('email', email).maybeSingle();
    const now = Date.now();
    if (previous?.updated_at && now - new Date(previous.updated_at).getTime() < 45_000) {
      return NextResponse.json({ error: 'Wait 45 seconds before requesting another code.' }, { status: 429 });
    }
    const windowStart = previous?.sent_window_started_at ? new Date(previous.sent_window_started_at).getTime() : 0;
    const inWindow = windowStart > now - 60 * 60 * 1000;
    if (inWindow && (previous?.sent_count || 0) >= 5) {
      return NextResponse.json({ error: 'Too many codes requested for this address. Try again later.' }, { status: 429 });
    }

    const code = createOtp();
    const linkToken = createEmailLinkToken();
    const expiresAt = new Date(now + 10 * 60 * 1000).toISOString();
    const updatedAt = new Date(now).toISOString();
    const challenge = {
      email, purpose, full_name: purpose === 'signup' ? fullName : null,
      code_hash: hashOtpValue(email, purpose, code), link_hash: hashOtpValue(email, purpose, linkToken),
      expires_at: expiresAt, sent_window_started_at: inWindow ? previous!.sent_window_started_at : updatedAt,
      sent_count: inWindow ? (previous?.sent_count || 0) + 1 : 1,
      failed_attempts: 0, link_verified_at: null, updated_at: updatedAt,
    };
    const { error: saveError } = await admin.from('email_otp_challenges').upsert(challenge, { onConflict: 'email' });
    if (saveError) throw saveError;

    const url = new URL(`/api/auth/otp/verify-link`, getLocalOrPublicOrigin(request));
    url.searchParams.set('email', email);
    url.searchParams.set('purpose', purpose);
    url.searchParams.set('token', linkToken);
    await sendOtpEmail({ to: email, code, purpose, verificationUrl: purpose === 'reset' ? null : url.toString() });
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error('OTP request failed:', error);
    const message = error instanceof Error ? error.message : 'Could not send the email code.';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
