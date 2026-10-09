import Link from 'next/link';
import { CalendarDays, CreditCard, ShieldCheck, UserRound } from 'lucide-react';
import { requireUser } from '@/lib/auth';
import { TelegramAccess } from '@/components/telegram-access';
import { SignOut } from '@/components/signout';
import { MembershipOptions } from '@/components/membership-options';

function date(value: string | null | undefined) {
  return value ? new Date(value).toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'Asia/Kolkata' }) : '—';
}

export default async function Dashboard({ searchParams }: { searchParams: Promise<{ payment?: string }> }) {
  const { payment: paymentResult } = await searchParams;
  const { db, user } = await requireUser();
  const now = new Date().toISOString();
  const [{ data: activeSubscription }, { data: latestSubscription }, { data: payments }, { data: availablePlans }] = await Promise.all([
    db.from('subscriptions').select('id,status,starts_at,expires_at,plan_id').eq('user_id', user.id).eq('status', 'active').gt('expires_at', now).order('expires_at', { ascending: false }).limit(1).maybeSingle(),
    db.from('subscriptions').select('id,status,starts_at,expires_at,plan_id').eq('user_id', user.id).order('created_at', { ascending: false }).limit(1).maybeSingle(),
    db.from('payments').select('status,amount_inr,paid_at,created_at').eq('user_id', user.id).order('created_at', { ascending: false }).limit(1).maybeSingle(),
    db.from('plans').select('id,name,price_inr,original_price_inr,duration_days,active').eq('active', true).order('price_inr', { ascending: true }),
  ]);
  const subscription = activeSubscription || latestSubscription;
  const active = !!activeSubscription;
  const daysUntilExpiry = active && subscription?.expires_at
    ? Math.max(0, Math.ceil((new Date(subscription.expires_at).getTime() - Date.now()) / 86_400_000))
    : null;
  const membershipExpired = !active && Boolean(latestSubscription?.expires_at && new Date(latestSubscription.expires_at).getTime() <= Date.now());
  const { data: plan } = subscription
    ? await db.from('plans').select('name').eq('id', subscription.plan_id).maybeSingle()
    : { data: null };
  const payment = payments;

  return <main className="dashboard wrap">
    <div className="dash-head"><div><div className="eyebrow">MEMBER DASHBOARD</div><h1>Welcome back.</h1><p>Your membership and access, in one place.</p></div><SignOut/></div>
    {paymentResult === 'success' && active && payment?.status === 'paid' && <div className="dashboard-payment-notice" role="status"><ShieldCheck size={18}/><div><b>Payment verified</b><span>Your subscription and Telegram access are shown below.</span></div></div>}
    {active && daysUntilExpiry !== null && daysUntilExpiry <= 3 && <div className="member-alert member-alert-closing" role="status"><span className="member-alert-icon"><CalendarDays size={18}/></span><div><b>{daysUntilExpiry === 0 ? 'Membership access closes today' : `Membership access closes in ${daysUntilExpiry} ${daysUntilExpiry === 1 ? 'day' : 'days'}`}</b><span>Your current plan ends {date(subscription?.expires_at)}. Renew if you want uninterrupted access.</span></div><Link className="button button-dark button-small" href="/plans">Renew plan <ArrowRightIcon/></Link></div>}
    {membershipExpired && <div className="member-alert member-alert-expired" role="status"><span className="member-alert-icon"><CalendarDays size={18}/></span><div><b>Your membership has expired</b><span>Telegram access is no longer available. Choose a plan to restore member access.</span></div><Link className="button button-dark button-small" href="/plans">View plans <ArrowRightIcon/></Link></div>}
    <div className="dash-welcome"><div className="welcome-icon"><UserRound/></div><div><small>ACCOUNT</small><h2>{(user.user_metadata?.full_name as string) || user.email}</h2><small className="account-email">{user.email}</small><span>Member since {date(user.created_at)}</span></div>{active && <Link href="/plans" className="text-link">Compare plans →</Link>}</div>
    {!active && <section className="dashboard-membership"><div className="dashboard-membership-heading"><div><div className="eyebrow">MEMBERSHIP OPTIONS</div><h2>Choose a plan to get started.</h2></div><p>Pick a period, accept the risk disclosure and continue to secure checkout.</p></div><MembershipOptions context="dashboard" plans={availablePlans || []}/></section>}
    <div className="dash-cards">
      <article className="dash-card"><div className="dash-card-top"><span>MEMBERSHIP</span><span className={`status-pill ${active ? 'status-active' : 'status-muted'}`}>{active ? 'Active' : 'Inactive'}</span></div><h2>{plan?.name || 'No current plan'}</h2><p>{active ? `Active from ${date(subscription?.starts_at)} through ${date(subscription?.expires_at)}.` : 'Choose a plan above to access member research.'}</p></article>
      <article className="dash-card"><div className="dash-card-top"><span>PAYMENT STATUS</span><CreditCard size={17}/></div><h2 className="capitalize">{payment?.status || 'No payment yet'}</h2><p>{payment ? `₹${Number(payment.amount_inr).toLocaleString('en-IN')} · ${date(payment.paid_at || payment.created_at)}` : 'Payment details will appear here after checkout.'}</p></article>
      <article className="dash-card"><div className="dash-card-top"><span>ACCESS UNTIL</span><CalendarDays size={17}/></div><h2>{active ? date(subscription?.expires_at) : '—'}</h2><p>{active ? 'Renew before expiry to keep your access.' : 'Active membership required.'}</p></article>
    </div>
    <section className="telegram-card dashboard-telegram"><div className="telegram-icon"><ShieldCheck/></div><div className="telegram-copy"><div className="eyebrow">PRIVATE COMMUNITY</div><h2>Telegram access</h2><p>{active ? 'Connect and confirm your Telegram account, then request your private group invite. The bot approves your join request after checking your active plan.' : 'Your Telegram request area will unlock after your subscription is active.'}</p>{active && <TelegramAccess/>}</div><span className={`status-pill ${active ? 'status-active' : 'status-muted'}`}>{active ? 'Eligible' : 'Locked'}</span></section>
    <div className="dash-help">Questions about billing or access? Visit the <Link href="/faq">FAQ</Link> or review the <Link href="/refund-policy">refund policy</Link>.</div>
  </main>;
}

function ArrowRightIcon() {
  return <span aria-hidden="true">→</span>;
}
