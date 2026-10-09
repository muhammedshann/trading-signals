import Link from 'next/link';
import { ArrowRight } from 'lucide-react';
import { MembershipOptions } from '@/components/membership-options';
import { createClient } from '@/lib/supabase/server';
import type { PlanRecord } from '@/lib/plans';

export default async function Plans() {
  const db = await createClient();
  const { data } = db
    ? await db.from('plans').select('id,name,price_inr,original_price_inr,duration_days,active').eq('active', true).order('price_inr', { ascending: true })
    : { data: [] };
  const plans = (data || []) as PlanRecord[];
  return <main>
    <section className="page-hero wrap">
      <div className="eyebrow">MEMBERSHIP</div>
      <h1>One clear membership.<br/><em>Two ways to join.</em></h1>
      <p>Choose a plan and complete checkout securely. If you need an account, we’ll send you to sign in first and bring you back to your dashboard.</p>
    </section>
    <section className="wrap"><MembershipOptions context="plans" plans={plans}/></section>
    <div className="wrap plans-note"><span>◇</span><p><b>Payment verification is automatic.</b> After Razorpay verifies your payment, your plan, payment status and Telegram access appear on your dashboard.</p></div>
    <section className="section-center plans-bottom wrap">
      <h2>Have a question before joining?</h2>
      <p>Review the membership details or read through the policies.</p>
      <Link className="text-link" href="/faq">Read membership FAQ <ArrowRight size={16}/></Link>
    </section>
  </main>;
}
