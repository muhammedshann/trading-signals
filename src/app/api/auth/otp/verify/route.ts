import { NextResponse } from 'next/server';
import { equalHash, hashOtpValue, isSameOriginRequest } from '@/lib/auth/otp';
import { createAdminClient } from '@/lib/supabase/admin';

export const runtime = 'nodejs';

export async function POST(request: Request) {
  if (!isSameOriginRequest(request)) return NextResponse.json({ error: 'Invalid request origin.' }, { status: 403 });
  try {
    const payload = await request.json() as { email?: string; purpose?: string; code?: string; password?: string; confirmPassword?: string };
    const email = payload.email?.trim().toLowerCase() || '';
    const purpose = payload.purpose;
    const code = payload.code?.trim() || '';
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || !['signup', 'login', 'reset'].includes(purpose || '') || !/^\d{6}$/.test(code)) {
      return NextResponse.json({ error: 'Enter the six-digit code from the email.' }, { status: 400 });
    }
    if ((purpose === 'signup' || purpose === 'reset') && (!payload.password || payload.password.length < 8)) {
      return NextResponse.json({ error: 'Your password must be at least 8 characters.' }, { status: 400 });
    }
    if (purpose === 'reset' && payload.password !== payload.confirmPassword) {
      return NextResponse.json({ error: 'Passwords do not match.' }, { status: 400 });
    }

    const admin = createAdminClient();
    const { data: challenge, error: readError } = await admin.from('email_otp_challenges').select('*').eq('email', email).maybeSingle();
    if (readError) throw readError;
    if (!challenge || challenge.purpose !== purpose || new Date(challenge.expires_at).getTime() < Date.now() || challenge.failed_attempts >= 5) {
      return NextResponse.json({ error: 'That code expired or is invalid. Request a new one.' }, { status: 400 });
    }
    if (!equalHash(hashOtpValue(email, purpose!, code), challenge.code_hash)) {
      await admin.from('email_otp_challenges').update({ failed_attempts: challenge.failed_attempts + 1, updated_at: new Date().toISOString() }).eq('email', email).eq('code_hash', challenge.code_hash);
      return NextResponse.json({ error: 'That code is incorrect.' }, { status: 400 });
    }

    const { data: consumed, error: consumeError } = await admin.from('email_otp_challenges').delete().eq('email', email).eq('code_hash', challenge.code_hash).select('email').maybeSingle();
    if (consumeError) throw consumeError;
    if (!consumed) return NextResponse.json({ error: 'That code has already been used. Request a new one.' }, { status: 400 });

    if (purpose === 'signup') {
      const { error: createError } = await admin.auth.admin.createUser({
        email, password: payload.password!, email_confirm: true,
        user_metadata: { full_name: challenge.full_name || '' },
      });
      if (createError) {
        console.error('Verified signup could not create its account:', createError.message);
        return NextResponse.json({ error: 'Could not create this account. If you already registered, sign in instead.' }, { status: 409 });
      }
    } else if (purpose === 'login') {
      // The email OTP proves mailbox ownership. Confirm legacy accounts that were
      // created before this direct Gmail OTP flow replaced Supabase email OTP.
      const { data: profile, error: profileError } = await admin.from('profiles').select('id').ilike('email', email).maybeSingle();
      if (profileError) throw profileError;
      if (profile?.id) {
        const { error: confirmError } = await admin.auth.admin.updateUserById(profile.id, { email_confirm: true });
        if (confirmError) throw confirmError;
      }
    } else {
      const { data: profile, error: profileError } = await admin.from('profiles').select('id').ilike('email', email).maybeSingle();
      if (profileError) throw profileError;
      if (!profile?.id) return NextResponse.json({ error: 'That code expired or is invalid. Request a new one.' }, { status: 400 });
      const { error: updateError } = await admin.auth.admin.updateUserById(profile.id, { password: payload.password! });
      if (updateError) throw updateError;
    }
    return NextResponse.json({ ok: true, passwordReset: purpose === 'reset' });
  } catch (error) {
    console.error('OTP verification failed:', error);
    return NextResponse.json({ error: 'Could not verify the code. Check the server configuration.' }, { status: 500 });
  }
}
