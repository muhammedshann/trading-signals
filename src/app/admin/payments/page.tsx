import Link from 'next/link';
import { CreditCard, Banknote, CheckCircle2, XCircle } from 'lucide-react';
import { requireUser } from '@/lib/auth';
import { createAdminClient } from '@/lib/supabase/admin';
import { AdminNav } from '@/components/admin-nav';

const PAGE_SIZE = 12;

function pageNumber(value: string | undefined) {
  const parsed = Number(value || '1');
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : 1;
}

function Pager({ current, total }: { current: number; total: number }) {
  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  if (pages <= 1) return <div className="admin-pager-note">Showing {total} payments</div>;
  const href = (n: number) => `/admin/payments?page=${n}`;
  return (
    <nav className="admin-pager" aria-label="Payment pages">
      <span>Page {current} of {pages} · {total} payments</span>
      <div>
        {current > 1 && <Link href={href(current - 1)}>Previous</Link>}
        {current < pages && <Link href={href(current + 1)}>Next</Link>}
      </div>
    </nav>
  );
}

function extractMember(profile: unknown, fallback?: { email?: string; full_name?: string } | null, userId?: string) {
  if (profile) {
    if (typeof profile === 'object' && !Array.isArray(profile)) {
      const p = profile as { email?: string; full_name?: string };
      if (p.email || p.full_name) return { email: p.email || '', name: p.full_name || '' };
    }
    if (Array.isArray(profile) && profile.length > 0) {
      const p = profile[0] as { email?: string; full_name?: string };
      if (p.email || p.full_name) return { email: p.email || '', name: p.full_name || '' };
    }
  }
  if (fallback?.email || fallback?.full_name) {
    return { email: fallback.email || '', name: fallback.full_name || '' };
  }
  if (userId) return { email: `User (${userId.slice(0, 8)}…)`, name: '' };
  return { email: '—', name: '' };
}

function extractPlanName(plan: unknown, planMap: Map<string, string>, planId?: string) {
  if (plan) {
    if (typeof plan === 'object' && !Array.isArray(plan)) {
      const p = plan as { name?: string };
      if (p.name) return p.name;
    }
    if (Array.isArray(plan) && plan.length > 0) {
      const p = plan[0] as { name?: string };
      if (p.name) return p.name;
    }
  }
  if (planId && planMap.has(planId)) return planMap.get(planId)!;
  if (planId) return planId.charAt(0).toUpperCase() + planId.slice(1);
  return '—';
}

function formatDate(value: string | null | undefined) {
  if (!value) return '—';
  return new Date(value).toLocaleDateString('en-IN', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export default async function AdminPaymentsPage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string }>;
}) {
  const search = await searchParams;
  await requireUser(true);
  const adminDb = createAdminClient();

  const currentPage = pageNumber(search.page);
  const from = (currentPage - 1) * PAGE_SIZE;
  const to = currentPage * PAGE_SIZE - 1;

  const [
    { data: pays, count: totalCount },
    { count: paidCount },
    { count: failedCount },
    { data: plans },
    { data: paidAmounts },
  ] = await Promise.all([
    adminDb
      .from('payments')
      .select('id,user_id,plan_id,status,amount_inr,razorpay_order_id,razorpay_payment_id,paid_at,created_at,profiles(email,full_name),plans(name)', { count: 'exact' })
      .neq('status', 'created')
      .order('created_at', { ascending: false })
      .range(from, to),
    adminDb.from('payments').select('id', { count: 'exact', head: true }).eq('status', 'paid'),
    adminDb.from('payments').select('id', { count: 'exact', head: true }).eq('status', 'failed'),
    adminDb.from('plans').select('id,name'),
    adminDb.from('payments').select('amount_inr').eq('status', 'paid'),
  ]);

  const planMap = new Map((plans || []).map(p => [p.id, p.name]));

  const missingUserIds = Array.from(
    new Set((pays || []).filter(p => !p.profiles).map(p => p.user_id))
  ).filter(Boolean);

  const profileFallbackMap = new Map<string, { email: string; full_name?: string }>();
  if (missingUserIds.length > 0) {
    const { data: extraProfiles } = await adminDb
      .from('profiles')
      .select('id,email,full_name')
      .in('id', missingUserIds);
    (extraProfiles || []).forEach(ep => {
      profileFallbackMap.set(ep.id, { email: ep.email, full_name: ep.full_name || undefined });
    });
  }

  const grossRevenue = (paidAmounts || []).reduce(
    (sum, p) => sum + Number(p.amount_inr || 0),
    0
  );

  const avgOrderValue = paidCount && paidCount > 0 ? Math.round(grossRevenue / paidCount) : 0;


  return (
    <main className="dashboard wrap admin-dashboard">
      <div className="dash-head">
        <div>
          <div className="eyebrow">SIGNALROOM ADMIN</div>
          <h1>Billing &amp; Payments</h1>
          <p>Verified checkout transactions, payment statuses, and revenue analytics. Abandoned drafts are excluded.</p>
        </div>
      </div>

      <AdminNav />

      <div className="admin-metrics">
        <div>
          <Banknote />
          <small>GROSS REVENUE PAID</small>
          <b>₹{grossRevenue.toLocaleString('en-IN')}</b>
          <span className="metric-caption">From {paidCount || 0} successful charges</span>
        </div>
        <div>
          <CheckCircle2 />
          <small>PAID TRANSACTIONS</small>
          <b>{paidCount || 0}</b>
          <span className="metric-caption">Successfully settled</span>
        </div>
        <div>
          <XCircle />
          <small>FAILED ATTEMPTS</small>
          <b>{failedCount || 0}</b>
          <span className="metric-caption">Failed authorization or card</span>
        </div>
        <div>
          <CreditCard />
          <small>AVERAGE ORDER VALUE</small>
          <b>₹{avgOrderValue.toLocaleString('en-IN')}</b>
          <span className="metric-caption">Per successful transaction</span>
        </div>
      </div>

      <section className="admin-section">
        <h2>Payment Records</h2>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Member</th>
                <th>Plan Tier</th>
                <th>Amount</th>
                <th>Status</th>
                <th>Date &amp; Time</th>
                <th>Payment / Order ID</th>
              </tr>
            </thead>
            <tbody>
              {pays?.map(p => {
                const member = extractMember(p.profiles, profileFallbackMap.get(p.user_id), p.user_id);
                const planTitle = extractPlanName(p.plans, planMap, p.plan_id);
                const isPaid = p.status === 'paid';
                const isFailed = p.status === 'failed';

                return (
                  <tr key={p.id}>
                    <td>
                      <span className="table-member-primary">{member.email}</span>
                      {member.name && <small className="table-member-secondary">{member.name}</small>}
                    </td>
                    <td>
                      <strong>{planTitle}</strong>
                    </td>
                    <td>
                      <b>₹{Number(p.amount_inr).toLocaleString('en-IN')}</b>
                    </td>
                    <td>
                      <span
                        className={`status-pill ${
                          isPaid ? 'status-active' : isFailed ? 'status-danger' : 'status-muted'
                        }`}
                      >
                        {isPaid ? 'Paid' : isFailed ? 'Failed' : p.status}
                      </span>
                    </td>
                    <td>{formatDate(p.paid_at || p.created_at)}</td>
                    <td>
                      <code className="table-code">{p.razorpay_payment_id || p.razorpay_order_id || '—'}</code>
                    </td>
                  </tr>
                );
              })}
              {!pays?.length && (
                <tr>
                  <td colSpan={6}>No completed or failed payments found.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
        <Pager current={currentPage} total={totalCount || 0} />
      </section>
    </main>
  );
}
