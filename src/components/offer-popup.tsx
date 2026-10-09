'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { ArrowUpRight, BarChart3, MessagesSquare, ShieldCheck, X } from 'lucide-react';
import { formatInr, planDiscountPercent, planDuration } from '@/lib/plans';

export function OfferPopup({ priceInr, originalPriceInr, durationDays }: { priceInr: number; originalPriceInr: number | null; durationDays: number }) {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const timer = window.setTimeout(() => setOpen(true), 950);
    return () => window.clearTimeout(timer);
  }, []);

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (event: KeyboardEvent) => { if (event.key === 'Escape') close(); };
    document.addEventListener('keydown', onKeyDown);
    document.body.classList.add('offer-modal-open');
    return () => {
      document.removeEventListener('keydown', onKeyDown);
      document.body.classList.remove('offer-modal-open');
    };
  }, [open]);

  function close() {
    setOpen(false);
  }

  if (!open) return null;
  const discount = planDiscountPercent({ price_inr: priceInr, original_price_inr: originalPriceInr });

  return <div className="offer-backdrop" role="presentation" onClick={event => { if (event.target === event.currentTarget) close(); }}>
    <section className="offer-modal" role="dialog" aria-modal="true" aria-labelledby="offer-title" onClick={event => event.stopPropagation()}>
      <button type="button" className="offer-close" aria-label="Close offer" onClick={close}><X size={20}/></button>
      <div className="offer-copy">
        <span className="offer-kicker">SIGNALROOM · MEMBER OFFER</span>
        <h2 id="offer-title">Premium research<br/>and community access</h2>
        <p>Get market notes, risk-framed trade ideas and access to the private Telegram community.</p>
        <div className="offer-price">{discount > 0 && <s>{formatInr(originalPriceInr!)}</s>}<strong>{formatInr(priceInr)}</strong><span>/ {planDuration(durationDays)}</span>{discount > 0 && <b>{discount}% OFF</b>}</div>
        <small>One-time payment · no automatic renewal</small>
        <Link className="offer-claim" href="/plans">Claim now <ArrowUpRight size={17}/></Link>
        <span className="offer-footnote">Sign in or create an account to continue to checkout.</span>
      </div>
      <div className="offer-art" aria-hidden="true">
        <div className="offer-orbit offer-orbit-one"/><div className="offer-orbit offer-orbit-two"/>
        <div className="offer-market-card">
          <div className="offer-market-top"><span><i/> MEMBER RESEARCH</span><BarChart3 size={15}/></div>
          <div className="offer-market-title">Today’s market view</div>
          <div className="offer-mini-chart"><span/><span/><span/><span/><span/><span/><span/><span/><span/><span/><span/><span/></div>
          <div className="offer-market-meta"><span><ShieldCheck size={13}/> Risk context included</span><span>MEMBER NOTE</span></div>
        </div>
        <div className="offer-community-chip"><MessagesSquare size={16}/><span><b>Private Telegram</b><small>Premium community</small></span><i/></div>
        <div className="offer-glow"/>
      </div>
    </section>
  </div>;
}
