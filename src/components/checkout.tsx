'use client';
import Link from 'next/link';
import { useState } from 'react';
import Script from 'next/script';
import { AGREEMENT_TEXT, RISK_DISCLOSURE_TEXT } from '@/lib/legal/agreement-copy';

type RazorpayConstructor = new (options: Record<string, unknown>) => { open: () => void };
declare global { interface Window { Razorpay?: RazorpayConstructor } }

type PaymentReceipt = {
  planName: string;
  amountInr: number;
  paidAt: string;
  startsAt: string;
  expiresAt: string;
  paymentId: string;
  subscriptionId: string;
  email: string;
  acceptedAt: string | null;
  agreementVersions: { terms: string; riskDisclosure: string; privacy: string; refund: string } | null;
  receiptEmailStatus: 'sent' | 'sending' | 'pending' | 'failed';
  inviteUrl: string | null;
  connectUrl: string | null;
  pendingTelegram: { id: string; telegramUserId: string; username: string | null; displayName: string | null } | null;
  inviteError: string;
  inviteLoading: boolean;
};

function dateLabel(value: string) {
  return new Intl.DateTimeFormat('en-IN', { dateStyle: 'long', timeZone: 'Asia/Kolkata' }).format(new Date(value));
}

export function Checkout({ planId, label = 'Choose this plan' }: { planId: string; label?: string }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [accepted, setAccepted] = useState(false);
  const [receipt, setReceipt] = useState<PaymentReceipt | null>(null);

  async function start() {
    if (!accepted || busy) return;
    setBusy(true);
    setError('');
    try {
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
            setReceipt({ ...result, inviteUrl: null, connectUrl: null, pendingTelegram: null, inviteError: '', inviteLoading: true });
            setBusy(false);
            void (async () => {
              try {
                const connectResponse = await fetch('/api/telegram/connect', { method: 'POST' });
                const connection = await connectResponse.json();
                if (!connectResponse.ok) throw new Error(connection.error || 'Telegram connection could not be started.');
                if (connection.connected) {
                  const inviteResponse = await fetch('/api/telegram/invite', { method: 'POST' });
                  const invite = await inviteResponse.json();
                  setReceipt(current => current ? {
                    ...current,
                    inviteUrl: inviteResponse.ok ? invite.inviteUrl : null,
                    inviteError: inviteResponse.ok ? '' : invite.error || 'Your membership is active, but Telegram could not create an invite yet.',
                    inviteLoading: false,
                  } : current);
                  return;
                }
                setReceipt(current => current ? {
                  ...current,
                  connectUrl: connection.connectUrl,
                  inviteError: '',
                  inviteLoading: false,
                } : current);
              } catch (cause) {
                setReceipt(current => current ? {
                  ...current,
                  inviteError: cause instanceof Error ? cause.message : 'Telegram setup could not be started. You can continue from the dashboard.',
                  inviteLoading: false,
                } : current);
              }
            })();
          } catch (e) {
            setError(e instanceof Error ? e.message : 'Payment verification failed.');
            setBusy(false);
          }
        },
      });
      checkout.open();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Something went wrong.');
      setBusy(false);
    }
  }

  async function finishTelegramConnection() {
    if (!receipt) return;
    setReceipt(current => current ? { ...current, inviteLoading: true, inviteError: '' } : current);
    try {
      const statusResponse = await fetch('/api/telegram/connect');
      const status = await statusResponse.json();
      if (!statusResponse.ok) throw new Error(status.error || 'Could not check Telegram connection.');
      if (!status.connected) {
        if (status.pending) {
          setReceipt(current => current ? { ...current, pendingTelegram: status.pending, inviteError: '', inviteLoading: false } : current);
          return;
        }
        throw new Error('Telegram has not responded yet. Open the bot and press Start, then check again.');
      }
      const inviteResponse = await fetch('/api/telegram/invite', { method: 'POST' });
      const invite = await inviteResponse.json();
      if (!inviteResponse.ok) throw new Error(invite.error || 'Could not create your invite.');
      setReceipt(current => current ? { ...current, pendingTelegram: null, inviteUrl: invite.inviteUrl, inviteError: '', inviteLoading: false } : current);
    } catch (cause) {
      setReceipt(current => current ? { ...current, inviteError: cause instanceof Error ? cause.message : 'Could not finish Telegram setup.', inviteLoading: false } : current);
    }
  }

  async function confirmTelegramConnection() {
    if (!receipt?.pendingTelegram) return;
    setReceipt(current => current ? { ...current, inviteLoading: true, inviteError: '' } : current);
    try {
      const confirmResponse = await fetch('/api/telegram/connect/confirm', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ codeId: receipt.pendingTelegram.id }),
      });
      const confirmed = await confirmResponse.json();
      if (!confirmResponse.ok) throw new Error(confirmed.error || 'Could not confirm this Telegram account.');
      const inviteResponse = await fetch('/api/telegram/invite', { method: 'POST' });
      const invite = await inviteResponse.json();
      if (!inviteResponse.ok) throw new Error(invite.error || 'Could not create your invite.');
      setReceipt(current => current ? { ...current, pendingTelegram: null, inviteUrl: invite.inviteUrl, inviteError: '', inviteLoading: false } : current);
    } catch (cause) {
      setReceipt(current => current ? { ...current, inviteError: cause instanceof Error ? cause.message : 'Could not confirm this Telegram account.', inviteLoading: false } : current);
    }
  }

  return <>
    <section className="checkout-agreement" aria-labelledby="checkout-risk-heading">
      <h3 id="checkout-risk-heading">Important Risk Disclosure</h3>
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
    <button className="button button-dark checkout-button" disabled={busy || !accepted} onClick={start}>{busy ? 'Opening secure checkout…' : label}</button>
    {error && <small className="form-error">{error}</small>}
    <Script src="https://checkout.razorpay.com/v1/checkout.js" strategy="lazyOnload"/>
    {receipt && <div className="payment-success-backdrop" role="presentation">
      <section className="payment-success-modal" role="dialog" aria-modal="true" aria-labelledby="payment-success-title">
        <button className="payment-success-close" type="button" aria-label="Close receipt" onClick={() => { window.location.href = '/dashboard'; }}>×</button>
        <div className="eyebrow">PAYMENT CONFIRMED</div>
        <h2 id="payment-success-title">Your membership is active.</h2>
        <p className="payment-success-intro">{receipt.receiptEmailStatus === 'sent' ? `A receipt has been emailed to ${receipt.email}.` : receipt.receiptEmailStatus === 'failed' ? `Payment is confirmed, but we could not email the receipt to ${receipt.email}.` : `Your receipt is being sent to ${receipt.email}.`}</p>
        <div className="payment-receipt-grid">
          <div><small>PLAN</small><strong>{receipt.planName}</strong></div>
          <div><small>AMOUNT PAID</small><strong>₹{Number(receipt.amountInr).toLocaleString('en-IN')}</strong></div>
          <div><small>PAYMENT DATE</small><strong>{dateLabel(receipt.paidAt)}</strong></div>
          <div><small>ACCESS EXPIRES</small><strong>{dateLabel(receipt.expiresAt)}</strong></div>
          <div><small>PAYMENT REFERENCE</small><strong>{receipt.paymentId}</strong></div>
          <div><small>SUBSCRIPTION REFERENCE</small><strong>{receipt.subscriptionId}</strong></div>
          {receipt.acceptedAt && <div><small>AGREEMENT ACCEPTED</small><strong>{dateLabel(receipt.acceptedAt)}</strong></div>}
        </div>
        {receipt.agreementVersions && <div className="payment-policy-versions"><b>Accepted policy versions</b><span>Terms {receipt.agreementVersions.terms} · Risk {receipt.agreementVersions.riskDisclosure} · Privacy {receipt.agreementVersions.privacy} · Refund {receipt.agreementVersions.refund}</span></div>}
        <div className="payment-success-telegram">
          <h3>Your private Telegram access</h3>
          {receipt.inviteUrl ? <><p>Open the request link and tap <b>Request to join</b>. The bot will approve it for your confirmed Telegram account.</p><a className="button button-dark" href={receipt.inviteUrl} target="_blank" rel="noreferrer">Request group access</a></> : receipt.connectUrl ? <><p>First connect the Telegram account you’ll use to join. Open the bot and press <b>Start</b>. It will reply with the account it received. Return here to review and confirm that identity.</p><a className="button button-dark" href={receipt.connectUrl} target="_blank" rel="noreferrer">Open Telegram bot</a>{receipt.pendingTelegram ? <><p className="form-success">Telegram responded as <b>{receipt.pendingTelegram.displayName || 'Telegram user'}{receipt.pendingTelegram.username ? ` (@${receipt.pendingTelegram.username})` : ''}</b> · ID ending <b>{receipt.pendingTelegram.telegramUserId.slice(-4)}</b>. No group access has been granted yet.</p><button className="button button-outline" type="button" disabled={receipt.inviteLoading} onClick={confirmTelegramConnection}>{receipt.inviteLoading ? 'Confirming…' : 'Confirm this is my Telegram account'}</button></> : <button className="button button-outline" type="button" disabled={receipt.inviteLoading} onClick={finishTelegramConnection}>{receipt.inviteLoading ? 'Checking connection…' : 'I pressed Start — check identity'}</button>}</> : receipt.inviteLoading ? <p>Preparing your Telegram access…</p> : <p className="form-error">{receipt.inviteError || 'Telegram access could not be created. You can retry from your dashboard.'}</p>}
          {receipt.connectUrl && receipt.inviteError && <p className="form-error">{receipt.inviteError}</p>}
        </div>
        <div className="payment-success-policies"><span>Policies:</span> <Link href="/terms">Terms</Link><Link href="/risk-disclaimer">Risk disclosure</Link><Link href="/privacy">Privacy</Link><Link href="/refund-policy">Refunds</Link></div>
        <button className="button button-outline payment-success-dashboard" type="button" onClick={() => { window.location.href = '/dashboard'; }}>View dashboard</button>
      </section>
    </div>}
  </>;
}
