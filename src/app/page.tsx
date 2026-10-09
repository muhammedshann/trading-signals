import Link from 'next/link';
import { ArrowRight, ArrowUpRight, BookOpen, Check, ChartNoAxesCombined, CircleHelp, ShieldCheck, UsersRound } from 'lucide-react';
import { MembershipOptions } from '@/components/membership-options';
import { OfferPopup } from '@/components/offer-popup';
import { createClient } from '@/lib/supabase/server';
import type { PlanRecord } from '@/lib/plans';

const benefits = [
  ['Clear market context', 'Understand the setup, invalidation level and thinking behind each idea.'],
  ['Defined risk first', 'Every setup includes a clear risk framework. Position sizing stays your decision.'],
  ['A focused community', 'Discuss markets with people who value patience, preparation and respectful debate.'],
];

const membershipHighlights = [
  ['3–5 trade ideas', 'Shared on active market days'],
  ['Defined risk levels', 'Entry zones and invalidation context'],
  ['Market notes', 'Structure and scenario analysis'],
  ['Private Telegram', 'Member access while subscribed'],
  ['Your own decisions', 'No guaranteed outcomes or returns'],
];

export default async function Home() {
  const db = await createClient();
  const { data: { user } } = db ? await db.auth.getUser() : { data: { user: null } };
  const { data: planRows } = db
    ? await db.from('plans').select('id,name,price_inr,original_price_inr,duration_days,active').eq('active', true).order('price_inr', { ascending: true })
    : { data: [] };
  const plans = (planRows || []) as PlanRecord[];
  const offerPlan = plans.find(plan => plan.id === 'quarterly') || plans.find(plan => plan.duration_days === 90) || { price_inr: 3999, original_price_inr: 6999, duration_days: 90 };
  const accountHref = user ? '/dashboard' : '/signup';

  return <main>
    {!user && <OfferPopup priceInr={offerPlan.price_inr} originalPriceInr={offerPlan.original_price_inr} durationDays={offerPlan.duration_days}/>}
    <section className="hero wrap">
      <div className="hero-copy">
        <div className="eyebrow"><span className="eyebrow-dot"/> Independent market research · Member-first approach</div>
        <h1>Trade with a<br/><em>clearer process.</em></h1>
        <p className="hero-lede">A research-led trading community for people who want thoughtful setups, defined risk and a more disciplined way to approach the markets.</p>
        <div className="hero-actions">
          <Link className="button button-dark" href="#membership">See plans &amp; join <ArrowRight size={16}/></Link>
          <Link className="text-link" href={accountHref}>{user ? 'Go to dashboard' : 'Create an account'} <ArrowUpRight size={15}/></Link>
        </div>
        <div className="hero-proof">
          <span className="verified"><ShieldCheck size={16}/> Risk-first research</span>
          <span className="proof-separator"/>
          <span className="verified"><ChartNoAxesCombined size={16}/> No return promises</span>
        </div>
      </div>
      <div className="hero-visual">
        <div className="market-chart-panel">
          <div className="signal-chart" aria-label="Illustrative trading signal chart">
            <svg viewBox="0 0 420 230" preserveAspectRatio="none" role="img" aria-label="Sample price line with a marked research level">
              <path className="signal-line" d="M0 55 C8 52 7 20 17 25 C25 30 20 50 31 42 C39 37 36 58 45 62 C55 67 48 79 59 78 C71 77 67 104 79 104 C90 104 85 133 98 129 C110 125 105 155 116 147 C129 139 124 174 137 167 C149 160 145 151 157 153 C171 155 167 131 178 126 C190 121 185 147 198 142 C211 137 205 119 219 117 C232 115 227 75 240 72 C253 69 248 35 261 30 C275 25 270 55 282 47 C294 39 289 62 301 66 C314 70 307 103 321 104 C334 105 328 78 341 80 C354 82 349 104 362 101 C376 98 370 121 383 118 C397 115 392 139 406 135 C414 133 416 128 420 126"/>
              <line className="signal-crosshair" x1="230" y1="0" x2="230" y2="184"/>
              <line className="signal-level" x1="111" y1="91" x2="331" y2="91"/>
              <circle className="signal-point" cx="230" cy="91" r="5"/>
              <g className="signal-tag" transform="translate(184 58)"><rect width="67" height="25" rx="12"/><text x="11" y="16">SETUP</text><path d="M53 7l8 8m0-8v8h-8"/></g>
              <g className="signal-price-tag" transform="translate(331 82)"><rect width="75" height="20" rx="10"/><text x="9" y="13">LEVEL</text></g>
            </svg>
            <div className="signal-chart-controls"><span><small>MARKET</small><b>NIFTY 50</b></span><span><small>TIMEFRAME</small><b>5 min</b></span></div>
          </div>
        </div>
        <div className="hero-chart-copy">
          <h2>Review the setup.<br/>You decide <em>your risk.</em></h2>
          <p>Trade ideas include market context and key levels, so you can make your own informed decision.</p>
          <small>Trading involves risk. No outcomes are guaranteed.</small>
        </div>
      </div>
    </section>

    <section className="home-membership" id="membership">
      <div className="wrap">
        <div className="home-membership-heading">
          <div><div className="eyebrow">CHOOSE YOUR MEMBERSHIP</div><h2>Plans and checkout,<br/><em>right up front.</em></h2></div>
          <p>Choose a period, review the risk disclosure and policies, then continue to secure checkout. If you need an account, sign in first; your dashboard will have your plan ready.</p>
        </div>
        <MembershipOptions context="landing" plans={plans}/>
        <p className="home-membership-note">One-time payment for the selected period. No automatic renewal. Trading involves risk; no outcomes are promised.</p>
      </div>
    </section>

    <section className="trust-strip"><div className="wrap trust-inner"><span><ShieldCheck/> Clear risk levels</span><span><BookOpen/> Research with context</span><span><UsersRound/> Thoughtful community</span><span><ChartNoAxesCombined/> No return promises</span></div></section>

    <section className="membership-highlights" aria-label="Signalroom membership features"><div className="membership-highlights-heading"><div className="eyebrow">INSIDE THE MEMBERSHIP</div><h2>Research to support <em>your process.</em></h2></div><div className="membership-marquee"><div className="membership-marquee-track">{[...membershipHighlights, ...membershipHighlights].map(([title, description], index) => <article className="membership-highlight" key={`${title}-${index}`} aria-hidden={index >= membershipHighlights.length}><span className="highlight-dot"/><div><b>{title}</b><small>{description}</small></div></article>)}</div></div></section>

    <section className="section wrap" id="about">
      <div className="section-intro"><div className="eyebrow">THE SIGNALROOM APPROACH</div><h2>Markets move fast.<br/><em>Your process shouldn’t.</em></h2><p>Signalroom brings market research, trade planning and an engaged community into one focused membership. No noise. Just a clearer framework for doing your own work.</p><Link className="text-link" href="/about">Get to know us <ArrowRight size={15}/></Link></div>
      <div className="benefit-list">{benefits.map(([title, description], index) => <article className="benefit" key={title}><span className="benefit-num">0{index + 1}</span><div><h3>{title}</h3><p>{description}</p></div><ArrowUpRight size={17}/></article>)}</div>
    </section>

    <section className="process-section"><div className="wrap"><div className="section-center"><div className="eyebrow">A SIMPLE, TRANSPARENT FLOW</div><h2>From market view to <em>your own decision.</em></h2><p>Everything is designed to help you think clearly before you act.</p></div><div className="process-grid">{[['01','Choose a plan','Select a membership and complete secure checkout.'],['02','Review the research','Get market context, watchlists and clearly framed setups.'],['03','Make your own call','Use the framework as input. Your capital, sizing and decisions stay yours.']].map(([number, title, description]) => <article className="process-card" key={number}><span>{number}</span><h3>{title}</h3><p>{description}</p><ArrowUpRight size={17}/></article>)}</div><div className="process-foot"><ShieldCheck size={18}/> No automated trading, account access or trade execution.</div></div></section>

    <section className="included wrap"><div className="included-card"><div><div className="eyebrow">WHAT MEMBERS GET</div><h2>Research with<br/><em>room to think.</em></h2><p>Practical market insight and a measured community, organized around your learning and preparation.</p><Link className="button button-dark" href="#membership">Compare plans <ArrowRight size={16}/></Link></div><div className="included-items">{[['Daily market notes','What’s moving, what matters, and what we’re watching.'],['Structured trade ideas','Entry zones, invalidation levels and scenario context.'],['Member-only Telegram','A private space for timely notes and discussion.'],['Learning library','Practical explainers to strengthen your own process.']].map(([title, description]) => <div className="included-item" key={title}><span><Check size={15}/></span><div><b>{title}</b><small>{description}</small></div></div>)}</div></div></section>

    <section className="faq-preview wrap"><div><div className="eyebrow">GOOD QUESTIONS</div><h2>Know before<br/><em>you join.</em></h2><p>Clear answers on access, payments and the role of our research.</p><Link className="text-link" href="/faq">Visit the full FAQ <ArrowRight size={15}/></Link></div><div className="faq-mini">{[['Are signals guaranteed to be profitable?','No. Markets are uncertain, and losses are possible. We make no profit or outcome promises.'],['How do I get Telegram access?','After your payment is verified, connect and confirm your Telegram identity from the dashboard. The bot approves a matching request while your plan is active.'],['Can I cancel my plan?','Plans are one-time purchases and do not renew automatically. Your paid access continues to its expiry date.']].map(([question, answer]) => <details key={question}><summary>{question}<CircleHelp size={17}/></summary><p>{answer}</p></details>)}</div></section>

    <section className="closing-cta"><div className="wrap closing-inner"><div className="eyebrow">READY WHEN YOU ARE</div><h2>Choose your plan.<br/><em>Start with a clear process.</em></h2><p>Compare the options and review the terms before subscribing.</p><Link className="button button-light" href="#membership">View plans <ArrowRight size={16}/></Link><small>Trading involves risk. No strategy or signal can assure a profit.</small></div></section>
  </main>;
}
