import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { isSameOriginRequest } from '@/lib/auth/otp';

export const runtime = 'nodejs';

export async function POST(request: Request) {
  if (!isSameOriginRequest(request)) return NextResponse.json({ error: 'Invalid request origin.' }, { status: 403 });
  try {
    const payload = await request.json() as { email?: string; password?: string; confirmPassword?: string };
    const email = payload.email?.trim().toLowerCase() || '';
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || !payload.password || payload.password.length < 8 || payload.password !== payload.confirmPassword) {
      return NextResponse.json({ error: 'Enter matching passwords with at least 8 characters.' }, { status: 400 });
    }
    const admin = createAdminClient();
    const { data: challenge } = await admin.from('email_otp_challenges').select('purpose,full_name,expires_at,link_verified_at').eq('email', email).maybeSingle();
    if (!challenge || challenge.purpose !== 'signup' || !challenge.link_verified_at || new Date(challenge.expires_at).getTime() < Date.now()) {
      return NextResponse.json({ error: 'The verified signup request expired. Request another code.' }, { status: 400 });
    }
    const { data: consumed, error: deleteError } = await admin.from('email_otp_challenges').delete().eq('email', email).eq('purpose', 'signup').not('link_verified_at', 'is', null).select('email').maybeSingle();
    if (deleteError) throw deleteError;
    if (!consumed) return NextResponse.json({ error: 'This verification link has already been used.' }, { status: 400 });
    const { error: createError } = await admin.auth.admin.createUser({
      email, password: payload.password, email_confirm: true,
      user_metadata: { full_name: challenge.full_name || '' },
    });
    if (createError) {
      console.error('Verified signup could not create its account:', createError.message);
      return NextResponse.json({ error: 'Could not create this account. If you already registered, sign in instead.' }, { status: 409 });
    }
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error('Verified signup completion failed:', error);
    return NextResponse.json({ error: 'Could not finish account creation.' }, { status: 500 });
  }
}
