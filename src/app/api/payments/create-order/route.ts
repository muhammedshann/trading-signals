import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { razorpayClient } from '@/lib/payments';
import { AGREEMENT_VERSIONS } from '@/lib/legal/agreement-copy';
import { isSameOriginRequest } from '@/lib/auth/otp';

export const runtime = 'nodejs';

export async function POST(request: Request) {
  if (!isSameOriginRequest(request)) return NextResponse.json({ error: 'Invalid request origin.' }, { status: 403 });
  try {
    const db = await createClient();
    if (!db) return NextResponse.json({ error: 'Database is not configured.' }, { status: 503 });
    const { data: { user } } = await db.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Sign in before joining a plan.' }, { status: 401 });

    const body = await request.json() as { planId?: string; agreementId?: string };
    if (!body.planId || !body.agreementId) return NextResponse.json({ error: 'Accept the pre-payment agreement before checkout.' }, { status: 400 });
    const admin = createAdminClient();
    const { data: agreement, error: agreementError } = await admin.from('agreement_acceptances')
      .select('id,user_id,email,terms_version,risk_disclosure_version,privacy_policy_version,refund_policy_version,payment_id,subscription_id')
      .eq('id', body.agreementId)
      .eq('user_id', user.id)
      .maybeSingle();
    if (agreementError) throw agreementError;
    if (!agreement || agreement.email !== user.email || agreement.payment_id || agreement.subscription_id ||
      agreement.terms_version !== AGREEMENT_VERSIONS.terms ||
      agreement.risk_disclosure_version !== AGREEMENT_VERSIONS.riskDisclosure ||
      agreement.privacy_policy_version !== AGREEMENT_VERSIONS.privacy ||
      agreement.refund_policy_version !== AGREEMENT_VERSIONS.refund) {
      return NextResponse.json({ error: 'A current agreement acceptance is required before checkout.' }, { status: 400 });
    }

    const { data: plan, error: planError } = await admin.from('plans').select('id,name,price_inr,duration_days,active').eq('id', body.planId).eq('active', true).single();
    if (planError || !plan) return NextResponse.json({ error: 'That plan is not available.' }, { status: 404 });
    const order = await razorpayClient().orders.create({
      amount: plan.price_inr * 100,
      currency: 'INR',
      receipt: `${user.id.slice(0, 8)}-${Date.now()}`.slice(0, 40),
      notes: { user_id: user.id, plan_id: plan.id },
    });
    const { error: insertError } = await admin.from('payments').insert({
      user_id: user.id,
      plan_id: plan.id,
      razorpay_order_id: order.id,
      amount_inr: plan.price_inr,
      status: 'created',
      agreement_id: agreement.id,
    });
    if (insertError) throw insertError;
    return NextResponse.json({ orderId: order.id, amount: order.amount, currency: order.currency, keyId: process.env.RAZORPAY_KEY_ID, email: user.email, planName: plan.name });
  } catch (error) {
    console.error('Could not create Razorpay order:', error);
    return NextResponse.json({ error: 'Could not create payment order. Please try again.' }, { status: 500 });
  }
}
