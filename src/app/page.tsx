import Link from 'next/link';
import { ArrowRight, ArrowUpRight, BookOpen, Check, ChartNoAxesCombined, CircleHelp, LineChart, ShieldCheck, UsersRound } from 'lucide-react';
import { MembershipOptions } from '@/components/membership-options';
import { OfferPopup } from '@/components/offer-popup';
import { createClient } from '@/lib/supabase/server';
import type { PlanRecord } from '@/lib/plans';

const benefits = [
  ['Clear market context', 'Understand the setup, invalidation level and thinking behind each idea.'],
  ['Defined risk first', 'Every setup includes a clear risk framework. Position sizing stays your decision.'],
  ['A focused community', 'Discuss markets with people who value patience, preparation and respectful debate.'],
];

export default async function Home() {
  const db = await createClient();
  const { data: { user } } = db ? await db.auth.getUser() : { data: { user: null } };
  const { data: planRows } = db
    ? await db.from('plans').select('id,name,price_inr,original_price_inr,duration_days,active').eq('active', true).order('price_inr', { ascending: true })
    : { data: [] };
  const plans = (planRows || []) as PlanRecord[];
  const annualPlan = plans.find(plan => plan.id === 'annual') || { price_inr: 24990, original_price_inr: null, duration_days: 365 };
  const accountHref = user ? '/dashboard' : '/signup';

  return <main>
    {!user && <OfferPopup priceInr={annualPlan.price_inr} originalPriceInr={annualPlan.original_price_inr} durationDays={annualPlan.duration_days}/>}
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
        <div className="visual-top"><span>MARKET NOTE <b>· NIFTY 50</b></span><span className="live-dot">● &nbsp;ILLUSTRATIVE</span></div>
        <div className="chart-heading"><div><small>STRUCTURE REVIEW</small><h3>Index futures</h3></div><span className="chart-period">Daily <span>⌄</span></span></div>
        <div className="chart">
          <div className="chart-grid"><span>24,900</span><span>24,700</span><span>24,500</span><span>24,300</span></div>
          <svg viewBox="0 0 520 220" preserveAspectRatio="none" aria-label="Illustrative market structure chart">
            <defs><linearGradient id="area" x1="0" x2="0" y1="0" y2="1"><stop offset="0" stopColor="#577960" stopOpacity=".17"/><stop offset="1" stopColor="#577960" stopOpacity="0"/></linearGradient></defs>
            <path d="M0,180 C32,168 38,147 65,155 S105,193 127,165 S167,144 184,151 S210,137 231,120 S263,154 282,134 S304,109 328,122 S361,87 380,102 S402,118 424,80 S460,83 481,55 S500,72 520,30 V220 H0 Z" fill="url(#area)"/>
            <path d="M0,180 C32,168 38,147 65,155 S105,193 127,165 S167,144 184,151 S210,137 231,120 S263,154 282,134 S304,109 328,122 S361,87 380,102 S402,118 424,80 S460,83 481,55 S500,72 520,30" fill="none" stroke="#42634a" strokeWidth="2.5"/>
            <line x1="0" y1="105" x2="520" y2="105" stroke="#c9a66e" strokeDasharray="5 5"/>
            <circle cx="424" cy="80" r="5" fill="#42634a" stroke="white" strokeWidth="2"/>
          </svg>
          <div className="axis-labels"><span>09:20</span><span>11:00</span><span>12:40</span><span>14:20</span><span>15:20</span></div>
        </div>
        <div className="chart-note"><span className="note-mark"><LineChart size={16}/></span><div><b>Context before conviction</b><small>Levels, scenarios and what would change the view.</small></div><span className="note-arrow">↗</span></div>
        <div className="visual-foot"><span>For education. Not a recommendation.</span><span>Illustrative example</span></div>
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
