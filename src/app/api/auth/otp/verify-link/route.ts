import { NextResponse } from 'next/server';
import { createEmailLinkToken, equalHash, hashOtpValue } from '@/lib/auth/otp';
import { createAdminClient } from '@/lib/supabase/admin';

export const runtime = 'nodejs';

export async function GET(request: Request) {
  const url = new URL(request.url);
  const email = url.searchParams.get('email')?.trim().toLowerCase() || '';
  const purpose = url.searchParams.get('purpose') || '';
  const token = url.searchParams.get('token') || '';
  const destination = purpose === 'signup' ? '/signup' : '/login';
  const redirect = (verified: boolean) => {
    const target = new URL(destination, url.origin);
    if (verified) {
      target.searchParams.set('verified', '1');
      target.searchParams.set('email', email);
    } else target.searchParams.set('error', 'link_expired');
    return NextResponse.redirect(target);
  };
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || !['signup', 'login'].includes(purpose) || !token) return redirect(false);
  try {
    const admin = createAdminClient();
    const { data: challenge } = await admin.from('email_otp_challenges').select('link_hash,expires_at,purpose').eq('email', email).maybeSingle();
    if (!challenge || challenge.purpose !== purpose || new Date(challenge.expires_at).getTime() < Date.now()) return redirect(false);
    if (!equalHash(hashOtpValue(email, purpose, token), challenge.link_hash)) return redirect(false);
    const now = new Date().toISOString();
    const replacementHash = hashOtpValue(email, purpose, createEmailLinkToken());
    const { data: updated, error } = await admin.from('email_otp_challenges').update({ link_hash: replacementHash, link_verified_at: now, updated_at: now }).eq('email', email).eq('link_hash', challenge.link_hash).select('email').maybeSingle();
    return redirect(!error && !!updated);
  } catch (error) {
    console.error('OTP email link verification failed:', error);
    return redirect(false);
  }
}
