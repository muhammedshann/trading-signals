import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { AGREEMENT_VERSIONS, createAgreementHash } from '@/lib/legal/agreement';
import { isSameOriginRequest } from '@/lib/auth/otp';

export const runtime = 'nodejs';

export async function POST(request: Request) {
  if (!isSameOriginRequest(request)) return NextResponse.json({ error: 'Invalid request origin.' }, { status: 403 });
  try {
    const db = await createClient();
    if (!db) return NextResponse.json({ error: 'Database is not configured.' }, { status: 503 });
    const { data: { user } } = await db.auth.getUser();
    if (!user?.email) return NextResponse.json({ error: 'Sign in before accepting the agreement.' }, { status: 401 });

    const body = await request.json().catch(() => null) as { accepted?: boolean } | null;
    if (body?.accepted !== true) return NextResponse.json({ error: 'You must accept the pre-payment agreement to continue.' }, { status: 400 });

    const headers = request.headers;
    const forwardedIp = headers.get('x-forwarded-for')?.split(',')[0]?.trim();
    const ipAddress = forwardedIp || headers.get('x-real-ip') || headers.get('x-vercel-forwarded-for') || null;
    const userAgent = headers.get('user-agent') || null;
    const admin = createAdminClient();
    const { data: agreement, error } = await admin.from('agreement_acceptances').insert({
      user_id: user.id,
      email: user.email,
      terms_version: AGREEMENT_VERSIONS.terms,
      risk_disclosure_version: AGREEMENT_VERSIONS.riskDisclosure,
      privacy_policy_version: AGREEMENT_VERSIONS.privacy,
      refund_policy_version: AGREEMENT_VERSIONS.refund,
      accepted_at: new Date().toISOString(),
      ip_address: ipAddress,
      user_agent: userAgent,
      agreement_hash: createAgreementHash(),
    }).select('id').single();
    if (error) throw error;
    return NextResponse.json({ agreementId: agreement.id });
  } catch (error) {
    console.error('Agreement acceptance could not be saved:', error);
    return NextResponse.json({ error: 'Could not save your agreement. Please try again.' }, { status: 500 });
  }
}
