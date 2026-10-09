'use client';

import Link from 'next/link';
import { useState } from 'react';
import Script from 'next/script';
import { AGREEMENT_TEXT, RISK_DISCLOSURE_TEXT } from '@/lib/legal/agreement-copy';
import { createClient } from '@/lib/supabase/browser';

type RazorpayConstructor = new (options: Record<string, unknown>) => { open: () => void };
declare global { interface Window { Razorpay?: RazorpayConstructor } }

export function Checkout({ planId, label = 'Choose this plan' }: { planId: string; label?: string }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [accepted, setAccepted] = useState(false);
  const [agreementOpen, setAgreementOpen] = useState(false);

  async function start() {
    if (!accepted || busy) return;
    setBusy(true);
    setError('');
    try {
      const auth = createClient();
      if (!auth) throw new Error('Account sign-in is unavailable. Please try again shortly.');
      const { data: { user } } = await auth.auth.getUser();
      if (!user) {
        window.location.assign('/login');
        return;
      }

      const acceptance = await fetch('/api/agreements/accept', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ accepted }),
      });
      const acceptanceData = await acceptance.json();
      if (!acceptance.ok) throw new Error(acceptanceData.error || 'Please accept the agreement before checkout.');

      const res = await fetch('/api/payments/create-order', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ planId, agreementId: acceptanceData.agreementId }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Unable to start checkout.');
      if (!window.Razorpay) throw new Error('Checkout is still loading. Please try again.');

      const checkout = new window.Razorpay({
        key: data.keyId, amount: data.amount, currency: data.currency, name: 'Signalroom',
        description: data.planName, order_id: data.orderId, prefill: { email: data.email },
        theme: { color: '#1d392d' }, modal: { ondismiss: () => setBusy(false) },
        handler: async (response: Record<string, string>) => {
          try {
            const verify = await fetch('/api/payments/verify', {
              method: 'POST', headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ ...response, orderId: data.orderId }),
            });
            const result = await verify.json();
            if (!verify.ok) throw new Error(result.error || 'Payment verification failed.');
            window.location.assign('/dashboard?payment=success');
          } catch (cause) {
            setError(cause instanceof Error ? cause.message : 'Payment verification failed.');
            setBusy(false);
          }
        },
      });
      checkout.open();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Something went wrong.');
      setBusy(false);
    }
  }

  return <>
    {!agreementOpen ? <button type="button" className="button button-dark checkout-button checkout-review" onClick={() => setAgreementOpen(true)}>Continue</button> : <>
      <section className="checkout-agreement" aria-labelledby={`checkout-risk-${planId}`}>
        <h3 id={`checkout-risk-${planId}`}>Important Risk Disclosure</h3>
        <p>{RISK_DISCLOSURE_TEXT}</p>
        <div className="checkout-policy-links" aria-label="Policies">
          <Link href="/terms">Terms &amp; Conditions</Link>
          <Link href="/risk-disclaimer">Risk Disclosure</Link>
          <Link href="/privacy">Privacy Policy</Link>
          <Link href="/refund-policy">Refund/Cancellation Policy</Link>
        </div>
      </section>
      <label className="checkout-consent">
        <input type="checkbox" checked={accepted} onChange={event => setAccepted(event.target.checked)} />
        <span>{AGREEMENT_TEXT}</span>
      </label>
      <button className="button button-dark checkout-button" disabled={busy || !accepted} onClick={start}>
        {busy ? 'Opening secure checkout…' : label}
      </button>
      <button type="button" className="checkout-edit" disabled={busy} onClick={() => { setAgreementOpen(false); setAccepted(false); setError(''); }}>Back to plan details</button>
    </>}
    {error && <small className="form-error">{error}</small>}
    <Script src="https://checkout.razorpay.com/v1/checkout.js" strategy="lazyOnload"/>
  </>;
}
