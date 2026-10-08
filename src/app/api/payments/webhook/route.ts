import { NextResponse } from 'next/server';
import { createHmac, timingSafeEqual } from 'node:crypto';
import { createAdminClient } from '@/lib/supabase/admin';
import { sendReceiptOnce } from '@/lib/payments/receipt-email';

export const runtime = 'nodejs';

export async function POST(request: Request) {
  const secret = process.env.RAZORPAY_WEBHOOK_SECRET;
  if (!secret) return NextResponse.json({ error: 'Webhook is not configured.' }, { status: 503 });
  const raw = await request.text();
  const signature = request.headers.get('x-razorpay-signature') || '';
  const expected = createHmac('sha256', secret).update(raw).digest();
  const actual = Buffer.from(signature, 'hex');
  if (!signature || actual.length !== expected.length || !timingSafeEqual(actual, expected)) {
    return NextResponse.json({ error: 'Invalid webhook signature.' }, { status: 400 });
  }

  try {
    const event = JSON.parse(raw);
    const payment = event.payload?.payment?.entity;
    const order = event.payload?.order?.entity;
    const orderId = payment?.order_id || order?.id;
    if (!orderId) return NextResponse.json({ received: true });

    const admin = createAdminClient();
    if (event.event === 'payment.failed') {
      await admin.from('payments').update({ status: 'failed' }).eq('razorpay_order_id', orderId).neq('status', 'paid');
      return NextResponse.json({ received: true });
    }
    if (!['payment.captured', 'order.paid'].includes(event.event) || !payment?.id) {
      return NextResponse.json({ received: true });
    }

    const { data: row, error: paymentError } = await admin.from('payments')
      .select('id,user_id,plan_id,amount_inr,agreement_id')
      .eq('razorpay_order_id', orderId).single();
    if (paymentError) throw paymentError;
    if (!row) return NextResponse.json({ received: true });
    if (payment.amount !== row.amount_inr * 100 || payment.currency !== 'INR') throw new Error('Webhook amount or currency did not match the order.');

    const { data: plan, error: planError } = await admin.from('plans').select('name,price_inr,duration_days').eq('id', row.plan_id).single();
    if (planError) throw planError;
    if (!plan) throw new Error('Plan not found.');
    const { data: existing, error: existingError } = await admin.from('subscriptions').select('id,starts_at,expires_at').eq('razorpay_payment_id', payment.id).maybeSingle();
    if (existingError) throw existingError;
    let subscriptionId = existing?.id;
    let startsAt = existing?.starts_at;
    let expiresAt = existing?.expires_at;
    if (!subscriptionId) {
      const now = new Date();
      const { data: current, error: currentError } = await admin.from('subscriptions').select('expires_at').eq('user_id', row.user_id).eq('status', 'active').gt('expires_at', now.toISOString()).order('expires_at', { ascending: false }).limit(1).maybeSingle();
      if (currentError) throw currentError;
      const starts = current ? new Date(current.expires_at) : now;
      const expires = new Date(starts.getTime() + plan.duration_days * 86400000);
      const { data: created, error: subscriptionError } = await admin.from('subscriptions').insert({
        user_id: row.user_id, plan_id: row.plan_id, status: 'active',
        starts_at: starts.toISOString(), expires_at: expires.toISOString(), razorpay_payment_id: payment.id,
      }).select('id').single();
      if (subscriptionError) throw subscriptionError;
      subscriptionId = created.id;
      startsAt = starts.toISOString();
      expiresAt = expires.toISOString();
    }

    const paidAt = new Date().toISOString();
    const { error: updatePaymentError } = await admin.from('payments').update({ status: 'paid', razorpay_payment_id: payment.id, paid_at: paidAt }).eq('id', row.id);
    if (updatePaymentError) throw updatePaymentError;
    if (row.agreement_id) {
      const { error: agreementError } = await admin.from('agreement_acceptances').update({ payment_id: payment.id, subscription_id: subscriptionId }).eq('id', row.agreement_id);
      if (agreementError) throw agreementError;
      const { data: agreement, error: detailsError } = await admin.from('agreement_acceptances').select('email,accepted_at,terms_version,risk_disclosure_version,privacy_policy_version,refund_policy_version').eq('id', row.agreement_id).maybeSingle();
      if (detailsError) throw detailsError;
      if (agreement) {
        await sendReceiptOnce(admin, row.agreement_id, {
          to: agreement.email,
          planName: plan.name,
          amountInr: plan.price_inr,
          paidAt: payment.created_at ? new Date(payment.created_at * 1000).toISOString() : paidAt,
          startsAt: startsAt!,
          expiresAt: expiresAt!,
          acceptedAt: agreement.accepted_at,
          paymentId: payment.id,
          subscriptionId,
          versions: {
            terms: agreement.terms_version,
            riskDisclosure: agreement.risk_disclosure_version,
            privacy: agreement.privacy_policy_version,
            refund: agreement.refund_policy_version,
          },
          siteUrl: process.env.NEXT_PUBLIC_SITE_URL || new URL(request.url).origin,
        });
      }
    }
    return NextResponse.json({ received: true });
  } catch (error) {
    console.error('Razorpay webhook processing failed', error);
    return NextResponse.json({ error: 'Webhook processing failed.' }, { status: 500 });
  }
}
