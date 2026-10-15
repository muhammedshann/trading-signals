import Link from 'next/link';
import {
  UsersRound,
  ShieldCheck,
  CreditCard,
  Layers3,
  Bot,
  Banknote,
  ArrowRight,
  TrendingUp,
  Percent,
  CheckCircle2,
} from 'lucide-react';
import { requireUser } from '@/lib/auth';
import { createAdminClient } from '@/lib/supabase/admin';
import { AdminNav } from '@/components/admin-nav';

function formatDate(value: string | null | undefined) {
  if (!value) return '—';
  return new Date(value).toLocaleDateString('en-IN', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
}

export default async function AdminDashboardPage() {
  await requireUser(true);
  const adminDb = createAdminClient();
  const nowIso = new Date().toISOString();

  const [
    { count: userCount },
    { count: activeSubsCount },
    { count: totalSubsCount },
    { data: plans },
    { count: paidCount },
    { count: failedCount },
    { count: activeBotMembersCount },
    { count: kickedBotCount },
    { data: recentPayments },
    { data: recentSubscriptions },
  ] = await Promise.all([
    adminDb.from('profiles').select('id', { count: 'exact', head: true }).is('removed_at', null),
    adminDb.from('subscriptions').select('id', { count: 'exact', head: true }).eq('status', 'active').gt('expires_at', nowIso),
    adminDb.from('subscriptions').select('id', { count: 'exact', head: true }),
    adminDb.from('plans').select('id,name,price_inr,active'),
    adminDb.from('payments').select('id', { count: 'exact', head: true }).eq('status', 'paid'),
    adminDb.from('payments').select('id', { count: 'exact', head: true }).eq('status', 'failed'),
    adminDb.from('telegram_members').select('telegram_user_id', { count: 'exact', head: true }).is('kicked_at', null),
    adminDb.from('telegram_members').select('telegram_user_id', { count: 'exact', head: true }).not('kicked_at', 'is', null),
    adminDb
      .from('payments')
      .select('id,user_id,plan_id,status,amount_inr,razorpay_payment_id,razorpay_order_id,paid_at,created_at,profiles(email),plans(name)')
      .neq('status', 'created')
      .order('created_at', { ascending: false })
      .limit(5),
    adminDb
      .from('subscriptions')
      .select('id,user_id,plan_id,status,starts_at,expires_at,profiles(email),plans(name)')
      .order('created_at', { ascending: false })
      .limit(5),
  ]);

  let grossRevenue = 0;
  let revenueOffset = 0;
  while (true) {
    const { data } = await adminDb
      .from('payments')
      .select('amount_inr')
      .eq('status', 'paid')
      .range(revenueOffset, revenueOffset + 999);
    grossRevenue += (data || []).reduce((sum, p) => sum + Number(p.amount_inr || 0), 0);
    if (!data || data.length < 1000) break;
    revenueOffset += 1000;
  }

  const planMap = new Map((plans || []).map(p => [p.id, p.name]));
  const totalAttempts = (paidCount || 0) + (failedCount || 0);
  const successRate = totalAttempts > 0 ? Math.round(((paidCount || 0) / totalAttempts) * 100) : 100;
  const avgOrderValue = paidCount && paidCount > 0 ? Math.round(grossRevenue / paidCount) : 0;
  const activePlansCount = (plans || []).filter(p => p.active).length;

  return (
    <main className="dashboard wrap admin-dashboard">
      <div className="dash-head">
        <div>
          <div className="eyebrow">SIGNALROOM ADMIN</div>
          <h1>Operations &amp; Analytics</h1>
          <p>Real-time revenue metrics, profit analytics, and direct access to management pages.</p>
        </div>
      </div>

      <AdminNav />

      {/* Top Financial & Analytics Metrics */}
      <div className="admin-analytics-grid">
        <div className="admin-stat-card admin-stat-highlight">
          <div className="admin-stat-top">
            <span className="admin-stat-label">GROSS REVENUE PAID</span>
            <Banknote size={18} className="text-emerald" />
          </div>
          <div className="admin-stat-value">₹{grossRevenue.toLocaleString('en-IN')}</div>
          <span className="admin-stat-caption">
            <TrendingUp size={13} className="text-emerald inline-icon" /> Lifetime verified revenue
          </span>
        </div>

        <div className="admin-stat-card">
          <div className="admin-stat-top">
            <span className="admin-stat-label">ACTIVE SUBSCRIBERS</span>
            <ShieldCheck size={18} className="text-emerald" />
          </div>
          <div className="admin-stat-value">{activeSubsCount || 0}</div>
          <span className="admin-stat-caption">
            {Math.round(((activeSubsCount || 0) / Math.max(1, userCount || 1)) * 100)}% member conversion
          </span>
        </div>

        <div className="admin-stat-card">
          <div className="admin-stat-top">
            <span className="admin-stat-label">PAYMENT SUCCESS RATE</span>
            <Percent size={18} className="text-emerald" />
          </div>
          <div className="admin-stat-value">{successRate}%</div>
          <span className="admin-stat-caption">
            {paidCount || 0} paid · {failedCount || 0} failed attempts
          </span>
        </div>

        <div className="admin-stat-card">
          <div className="admin-stat-top">
            <span className="admin-stat-label">AVG ORDER VALUE</span>
            <CreditCard size={18} className="text-emerald" />
          </div>
          <div className="admin-stat-value">₹{avgOrderValue.toLocaleString('en-IN')}</div>
          <span className="admin-stat-caption">Per successful checkout</span>
        </div>
      </div>

      {/* Navigation Hub Cards */}
      <section className="admin-hub-section">
        <div className="admin-section-header">
          <h2>Management Hub</h2>
          <p>Access dedicated management pages for members, subscriptions, billing, tiers, and telegram bot.</p>
        </div>

        <div className="admin-hub-grid">
          <Link href="/admin/members" className="admin-hub-card">
            <div className="admin-hub-icon">
              <UsersRound size={22} />
            </div>
            <div className="admin-hub-content">
              <h3>Member Directory</h3>
              <p>User accounts, active subscription access badge, legal privacy consent modal, and suspensions.</p>
              <div className="admin-hub-meta">
                <span><b>{userCount || 0}</b> Members</span>
                <span><b>{activeSubsCount || 0}</b> Active Access</span>
              </div>
            </div>
            <span className="admin-hub-arrow"><ArrowRight size={16} /></span>
          </Link>

          <Link href="/admin/subscriptions" className="admin-hub-card">
            <div className="admin-hub-icon">
              <ShieldCheck size={22} />
            </div>
            <div className="admin-hub-content">
              <h3>Subscriptions</h3>
              <p>Track plan validity, active windows, expiration dates, and override member access.</p>
              <div className="admin-hub-meta">
                <span><b>{activeSubsCount || 0}</b> Current Active</span>
                <span><b>{totalSubsCount || 0}</b> Lifetime</span>
              </div>
            </div>
            <span className="admin-hub-arrow"><ArrowRight size={16} /></span>
          </Link>

          <Link href="/admin/payments" className="admin-hub-card">
            <div className="admin-hub-icon">
              <CreditCard size={22} />
            </div>
            <div className="admin-hub-content">
              <h3>Payments &amp; Billing</h3>
              <p>Razorpay settlements, order references, paid transactions, and failed charges.</p>
              <div className="admin-hub-meta">
                <span><b>{paidCount || 0}</b> Settled</span>
                <span><b>₹{grossRevenue.toLocaleString('en-IN')}</b> Total</span>
              </div>
            </div>
            <span className="admin-hub-arrow"><ArrowRight size={16} /></span>
          </Link>

          <Link href="/admin/plans" className="admin-hub-card">
            <div className="admin-hub-icon">
              <Layers3 size={22} />
            </div>
            <div className="admin-hub-content">
              <h3>Membership Plans</h3>
              <p>Create tiers, configure durations, manage discounts, draft offers, and delete unused plans.</p>
              <div className="admin-hub-meta">
                <span><b>{activePlansCount}</b> Published</span>
                <span><b>{(plans || []).length}</b> Tiers</span>
              </div>
            </div>
            <span className="admin-hub-arrow"><ArrowRight size={16} /></span>
          </Link>

          <Link href="/admin/bot" className="admin-hub-card">
            <div className="admin-hub-icon">
              <Bot size={22} />
            </div>
            <div className="admin-hub-content">
              <h3>Bot Management</h3>
              <p>Audit users currently in the VIP group, review kicked/banned members, and check link codes.</p>
              <div className="admin-hub-meta">
                <span><b>{activeBotMembersCount || 0}</b> In Group</span>
                <span><b>{kickedBotCount || 0}</b> Banned / Kicked</span>
              </div>
            </div>
            <span className="admin-hub-arrow"><ArrowRight size={16} /></span>
          </Link>
        </div>
      </section>

      {/* Recent Activity Feeds */}
      <div className="admin-recent-grid">
        <section className="admin-section">
          <div className="admin-recent-head">
            <h2>Recent Payments</h2>
            <Link href="/admin/payments" className="text-link">View all ({paidCount || 0}) →</Link>
          </div>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Member</th>
                  <th>Plan</th>
                  <th>Amount</th>
                  <th>Status</th>
                  <th>Date</th>
                </tr>
              </thead>
              <tbody>
                {recentPayments?.map(p => {
                  const email = (p.profiles as unknown as { email?: string })?.email || '—';
                  const planName = (p.plans as unknown as { name?: string })?.name || planMap.get(p.plan_id) || p.plan_id;
                  const isPaid = p.status === 'paid';
                  return (
                    <tr key={p.id}>
                      <td><span className="table-member-primary">{email}</span></td>
                      <td><strong>{planName}</strong></td>
                      <td><b>₹{Number(p.amount_inr).toLocaleString('en-IN')}</b></td>
                      <td>
                        <span className={`status-pill ${isPaid ? 'status-active' : 'status-danger'}`}>
                          {p.status}
                        </span>
                      </td>
                      <td>{formatDate(p.paid_at || p.created_at)}</td>
                    </tr>
                  );
                })}
                {!recentPayments?.length && <tr><td colSpan={5}>No recent payments.</td></tr>}
              </tbody>
            </table>
          </div>
        </section>

        <section className="admin-section">
          <div className="admin-recent-head">
            <h2>Recent Subscriptions</h2>
            <Link href="/admin/subscriptions" className="text-link">View all ({totalSubsCount || 0}) →</Link>
          </div>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Member</th>
                  <th>Plan</th>
                  <th>Status</th>
                  <th>Expires</th>
                </tr>
              </thead>
              <tbody>
                {recentSubscriptions?.map(s => {
                  const email = (s.profiles as unknown as { email?: string })?.email || '—';
                  const planName = (s.plans as unknown as { name?: string })?.name || planMap.get(s.plan_id) || s.plan_id;
                  const isActive = s.status === 'active' && new Date(s.expires_at).getTime() > Date.now();
                  return (
                    <tr key={s.id}>
                      <td><span className="table-member-primary">{email}</span></td>
                      <td><strong>{planName}</strong></td>
                      <td>
                        <span className={`status-pill ${isActive ? 'status-active' : 'status-muted'}`}>
                          {isActive ? 'Active' : s.status}
                        </span>
                      </td>
                      <td>{formatDate(s.expires_at)}</td>
                    </tr>
                  );
                })}
                {!recentSubscriptions?.length && <tr><td colSpan={4}>No recent subscriptions.</td></tr>}
              </tbody>
            </table>
          </div>
        </section>
      </div>
    </main>
  );
}
