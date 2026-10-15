import {
  Banknote,
  ShieldCheck,
  Percent,
  CreditCard,
  TrendingUp,
} from 'lucide-react';
import { requireUser } from '@/lib/auth';
import { createAdminClient } from '@/lib/supabase/admin';
import { AdminNav } from '@/components/admin-nav';
import {
  AdminAnalyticsChart,
  type AnalyticsPayment,
  type AnalyticsMember,
  type AnalyticsSubscription,
  type AnalyticsBotMember,
} from '@/components/admin-analytics-chart';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export default async function AdminDashboardPage() {
  await requireUser(true);
  const adminDb = createAdminClient();
  const nowIso = new Date().toISOString();

  // Run all queries concurrently in a single parallel batch for maximum speed
  const [
    { count: userCount },
    { count: activeSubsCount },
    { count: paidCount },
    { count: failedCount },
    { data: allPaidPayments },
    { data: memberGrowth },
    { data: subGrowth },
    { data: botGrowth },
  ] = await Promise.all([
    adminDb.from('profiles').select('id', { count: 'exact', head: true }).is('removed_at', null),
    adminDb
      .from('subscriptions')
      .select('id', { count: 'exact', head: true })
      .eq('status', 'active')
      .gt('expires_at', nowIso),
    adminDb.from('payments').select('id', { count: 'exact', head: true }).eq('status', 'paid'),
    adminDb.from('payments').select('id', { count: 'exact', head: true }).eq('status', 'failed'),
    adminDb.from('payments').select('amount_inr,paid_at,created_at').eq('status', 'paid'),
    adminDb.from('profiles').select('created_at').is('removed_at', null),
    adminDb.from('subscriptions').select('created_at,status'),
    adminDb.from('telegram_members').select('joined_at,kicked_at'),
  ]);

  // Compute revenue instantly in memory without sequential HTTP roundtrips
  const grossRevenue = (allPaidPayments || []).reduce(
    (sum, p) => sum + Number(p.amount_inr || 0),
    0
  );

  const totalAttempts = (paidCount || 0) + (failedCount || 0);
  const successRate = totalAttempts > 0 ? Math.round(((paidCount || 0) / totalAttempts) * 100) : 100;
  const avgOrderValue = paidCount && paidCount > 0 ? Math.round(grossRevenue / paidCount) : 0;

  return (
    <main className="dashboard wrap admin-dashboard">
      <div className="dash-head">
        <div>
          <div className="eyebrow">SIGNALROOM ADMIN</div>
          <h1>Operations &amp; Analytics</h1>
          <p>Real-time revenue metrics, profit analytics, and membership intelligence.</p>
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

      {/* Interactive Analytics Charts with Filters (Profit by default) */}
      <AdminAnalyticsChart
        payments={(allPaidPayments || []) as AnalyticsPayment[]}
        members={(memberGrowth || []) as AnalyticsMember[]}
        subscriptions={(subGrowth || []) as AnalyticsSubscription[]}
        botMembers={(botGrowth || []) as AnalyticsBotMember[]}
      />
    </main>
  );
}
