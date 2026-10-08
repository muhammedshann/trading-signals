import Link from 'next/link';
import { CalendarDays, CreditCard, ShieldCheck, UserRound } from 'lucide-react';
import { requireUser } from '@/lib/auth';
import { TelegramAccess } from '@/components/telegram-access';
import { SignOut } from '@/components/signout';

function date(value: string | null | undefined) {
  return value ? new Date(value).toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'Asia/Kolkata' }) : '—';
}

export default async function Dashboard() {
  const { db, user } = await requireUser();
  const now = new Date().toISOString();
  const [{ data: activeSubscription }, { data: latestSubscription }, { data: payments }] = await Promise.all([
    db.from('subscriptions').select('id,status,starts_at,expires_at,plan_id').eq('user_id', user.id).eq('status', 'active').gt('expires_at', now).order('expires_at', { ascending: false }).limit(1).maybeSingle(),
    db.from('subscriptions').select('id,status,starts_at,expires_at,plan_id').eq('user_id', user.id).order('created_at', { ascending: false }).limit(1).maybeSingle(),
    db.from('payments').select('status,amount_inr,paid_at,created_at').eq('user_id', user.id).order('created_at', { ascending: false }).limit(1).maybeSingle(),
  ]);
  const subscription = activeSubscription || latestSubscription;
  const active = !!activeSubscription;
  const { data: plan } = subscription
    ? await db.from('plans').select('name').eq('id', subscription.plan_id).maybeSingle()
    : { data: null };
  const payment = payments;

  return <main className="dashboard wrap">
    <div className="dash-head"><div><div className="eyebrow">MEMBER DASHBOARD</div><h1>Welcome back.</h1><p>Your membership and access, in one place.</p></div><SignOut/></div>
    <div className="dash-welcome"><div className="welcome-icon"><UserRound/></div><div><small>ACCOUNT</small><h2>{(user.user_metadata?.full_name as string) || user.email}</h2><small className="account-email">{user.email}</small><span>Member since {date(user.created_at)}</span></div><Link href="/plans" className="text-link">View plans →</Link></div>
    <div className="dash-cards">
      <article className="dash-card"><div className="dash-card-top"><span>MEMBERSHIP</span><span className={`status-pill ${active ? 'status-active' : 'status-muted'}`}>{active ? 'Active' : 'Inactive'}</span></div><h2>{plan?.name || 'No current plan'}</h2><p>{active ? `Active from ${date(subscription?.starts_at)} through ${date(subscription?.expires_at)}.` : 'Choose a plan to access member research.'}</p>{!active && <Link className="text-link" href="/plans">Explore membership →</Link>}</article>
      <article className="dash-card"><div className="dash-card-top"><span>PAYMENT STATUS</span><CreditCard size={17}/></div><h2 className="capitalize">{payment?.status || 'No payment yet'}</h2><p>{payment ? `₹${Number(payment.amount_inr).toLocaleString('en-IN')} · ${date(payment.paid_at || payment.created_at)}` : 'Payment details will appear here after checkout.'}</p></article>
      <article className="dash-card"><div className="dash-card-top"><span>ACCESS UNTIL</span><CalendarDays size={17}/></div><h2>{active ? date(subscription?.expires_at) : '—'}</h2><p>{active ? 'Renew before expiry to keep your access.' : 'Active membership required.'}</p></article>
    </div>
    <section className="telegram-card"><div className="telegram-icon"><ShieldCheck/></div><div className="telegram-copy"><div className="eyebrow">PRIVATE COMMUNITY</div><h2>Telegram access</h2><p>{active ? 'Connect your Telegram account first. The bot will verify it before approving your group entry.' : 'Telegram access is available only while your subscription is active.'}</p>{active && <TelegramAccess/>}</div><span className={`status-pill ${active ? 'status-active' : 'status-muted'}`}>{active ? 'Eligible' : 'Locked'}</span></section>
    <div className="dash-help">Questions about billing or access? Visit the <Link href="/faq">FAQ</Link> or review the <Link href="/refund-policy">refund policy</Link>.</div>
  </main>;
}
