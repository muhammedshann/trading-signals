import { NextResponse } from 'next/server';
import { createHmac, timingSafeEqual } from 'node:crypto';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { razorpayClient } from '@/lib/payments';
import { sendReceiptOnce } from '@/lib/payments/receipt-email';
import { isSameOriginRequest } from '@/lib/auth/otp';

export const runtime = 'nodejs';

export async function POST(req: Request) {
  if (!isSameOriginRequest(req)) return NextResponse.json({ error: 'Invalid request origin.' }, { status: 403 });
  try {
    const db = await createClient();
    if (!db) return NextResponse.json({ error: 'Database is not configured.' }, { status: 503 });
    const { data: { user } } = await db.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized.' }, { status: 401 });
    const { razorpay_order_id, razorpay_payment_id, razorpay_signature, orderId } = await req.json();
    if (!razorpay_order_id || razorpay_order_id !== orderId || !razorpay_payment_id || !razorpay_signature) {
      return NextResponse.json({ error: 'Payment details are incomplete.' }, { status: 400 });
    }
    const secret = process.env.RAZORPAY_KEY_SECRET;
    if (!secret) return NextResponse.json({ error: 'Payments are not configured.' }, { status: 503 });
    const expected = createHmac('sha256', secret).update(`${razorpay_order_id}|${razorpay_payment_id}`).digest();
    const actual = Buffer.from(razorpay_signature, 'hex');
    if (actual.length !== expected.length || !timingSafeEqual(actual, expected)) {
      return NextResponse.json({ error: 'Payment signature could not be verified.' }, { status: 400 });
    }
    const admin = createAdminClient();
    const { data: payment, error: paymentError } = await admin.from('payments').select('id,user_id,plan_id,status,agreement_id,amount_inr').eq('razorpay_order_id', razorpay_order_id).single();
    if (paymentError) throw paymentError;
    if (!payment || payment.user_id !== user.id) return NextResponse.json({ error: 'Payment order was not found.' }, { status: 404 });
    const paymentDetails = await razorpayClient().payments.fetch(razorpay_payment_id);
    if (paymentDetails.order_id !== razorpay_order_id) return NextResponse.json({ error: 'Payment does not match this order.' }, { status: 400 });
    if (paymentDetails.amount !== payment.amount_inr * 100 || paymentDetails.currency !== 'INR') return NextResponse.json({ error: 'Payment amount does not match this order.' }, { status: 400 });
    if (paymentDetails.status !== 'captured') return NextResponse.json({ error: 'Payment is awaiting capture. Your dashboard will update once Razorpay confirms it.' }, { status: 409 });
    const { data: plan, error: planError } = await admin.from('plans').select('name,price_inr,duration_days').eq('id', payment.plan_id).single();
    if (planError) throw planError;
    if (!plan) throw new Error('Plan not found.');
    const paidAt = paymentDetails.created_at ? new Date(paymentDetails.created_at * 1000).toISOString() : new Date().toISOString();
    const subscription = await activate(admin, payment, razorpay_payment_id, plan.duration_days, paidAt);
    const { data: agreement, error: agreementError } = payment.agreement_id
      ? await admin.from('agreement_acceptances').select('email,accepted_at,terms_version,risk_disclosure_version,privacy_policy_version,refund_policy_version').eq('id', payment.agreement_id).maybeSingle()
      : { data: null, error: null };
    if (agreementError) throw agreementError;
    const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || new URL(req.url).origin;
    const receiptEmailStatus = agreement ? await sendReceiptOnce(admin, payment.agreement_id, {
      to: agreement.email,
      planName: plan.name,
      amountInr: plan.price_inr,
      paidAt: subscription.paidAt,
      startsAt: subscription.startsAt,
      expiresAt: subscription.expiresAt,
      acceptedAt: agreement.accepted_at,
      paymentId: razorpay_payment_id,
      subscriptionId: subscription.id,
      versions: {
        terms: agreement.terms_version,
        riskDisclosure: agreement.risk_disclosure_version,
        privacy: agreement.privacy_policy_version,
        refund: agreement.refund_policy_version,
      },
      siteUrl,
    }) : false;
    return NextResponse.json({
      ok: true,
      paymentId: razorpay_payment_id,
      subscriptionId: subscription.id,
      planName: plan.name,
      amountInr: plan.price_inr,
      paidAt: subscription.paidAt,
      startsAt: subscription.startsAt,
      expiresAt: subscription.expiresAt,
      email: agreement?.email || user.email,
      acceptedAt: agreement?.accepted_at || null,
      agreementVersions: agreement ? {
        terms: agreement.terms_version,
        riskDisclosure: agreement.risk_disclosure_version,
        privacy: agreement.privacy_policy_version,
        refund: agreement.refund_policy_version,
      } : null,
      receiptEmailStatus,
    });
  } catch (e) {
    console.error('Razorpay payment verification failed:', e);
    return NextResponse.json({ error: 'Payment verification could not be completed. Please contact support if you were charged.' }, { status: 500 });
  }
}

async function activate(admin: ReturnType<typeof createAdminClient>, payment: { id: string; user_id: string; plan_id: string; agreement_id: string | null }, paymentId: string, days: number, paidAt: string) {
  let subscriptionId: string;
  let startsAt: string;
  let expiresAt: string;
  const { data: existing, error: existingError } = await admin.from('subscriptions').select('id,starts_at,expires_at').eq('razorpay_payment_id', paymentId).maybeSingle();
  if (existingError) throw existingError;
  if (existing) {
    subscriptionId = existing.id;
    startsAt = existing.starts_at;
    expiresAt = existing.expires_at;
  } else {
    const now = new Date();
    const { data: current, error: currentError } = await admin.from('subscriptions').select('expires_at').eq('user_id', payment.user_id).eq('status', 'active').gt('expires_at', now.toISOString()).order('expires_at', { ascending: false }).limit(1).maybeSingle();
    if (currentError) throw currentError;
    const starts = current ? new Date(current.expires_at) : now;
    const expiresAtDate = new Date(starts.getTime() + days * 86400000);
    const { data: inserted, error } = await admin.from('subscriptions').insert({ user_id: payment.user_id, plan_id: payment.plan_id, status: 'active', starts_at: starts.toISOString(), expires_at: expiresAtDate.toISOString(), razorpay_payment_id: paymentId }).select('id').single();
    if (error) throw error;
    subscriptionId = inserted.id;
    startsAt = starts.toISOString();
    expiresAt = expiresAtDate.toISOString();
  }
  const { error: payErr } = await admin.from('payments').update({ status: 'paid', razorpay_payment_id: paymentId, paid_at: paidAt }).eq('id', payment.id);
  if (payErr) throw payErr;
  if (payment.agreement_id) {
    const { error: agreementError } = await admin.from('agreement_acceptances').update({ payment_id: paymentId, subscription_id: subscriptionId }).eq('id', payment.agreement_id);
    if (agreementError) throw agreementError;
  }
  return { id: subscriptionId, startsAt, expiresAt, paidAt };
}
