import Link from 'next/link';
import { ShieldCheck, ShieldAlert, Clock, Layers3 } from 'lucide-react';
import { requireUser } from '@/lib/auth';
import { createAdminClient } from '@/lib/supabase/admin';
import { AdminNav } from '@/components/admin-nav';
import { AdminAction } from '@/components/admin-action';

const PAGE_SIZE = 12;

function pageNumber(value: string | undefined) {
  const parsed = Number(value || '1');
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : 1;
}

function Pager({ current, total }: { current: number; total: number }) {
  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  if (pages <= 1) return <div className="admin-pager-note">Showing {total} subscriptions</div>;
  const href = (n: number) => `/admin/subscriptions?page=${n}`;
  return (
    <nav className="admin-pager" aria-label="Subscription pages">
      <span>Page {current} of {pages} · {total} subscriptions</span>
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
  });
}

export default async function AdminSubscriptionsPage({
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
  const nowIso = new Date().toISOString();

  const [
    { data: subs, count: totalCount },
    { count: activeCount },
    { count: suspendedCount },
    { data: plans },
  ] = await Promise.all([
    adminDb
      .from('subscriptions')
      .select('id,user_id,plan_id,status,starts_at,expires_at,created_at,profiles(email,full_name),plans(name)', { count: 'exact' })
      .order('created_at', { ascending: false })
      .range(from, to),
    adminDb
      .from('subscriptions')
      .select('id', { count: 'exact', head: true })
      .eq('status', 'active')
      .gt('expires_at', nowIso),
    adminDb
      .from('subscriptions')
      .select('id', { count: 'exact', head: true })
      .eq('status', 'suspended'),
    adminDb.from('plans').select('id,name'),
  ]);

  const planMap = new Map((plans || []).map(p => [p.id, p.name]));

  const missingUserIds = Array.from(
    new Set((subs || []).filter(s => !s.profiles).map(s => s.user_id))
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

  const nowTime = Date.now();

  return (
    <main className="dashboard wrap admin-dashboard">
      <div className="dash-head">
        <div>
          <div className="eyebrow">SIGNALROOM ADMIN</div>
          <h1>Subscriptions Management</h1>
          <p>Monitor active periods, track renewals, review expiry dates, and manage suspension overrides.</p>
        </div>
      </div>

      <AdminNav />

      <div className="admin-metrics">
        <div>
          <Layers3 />
          <small>TOTAL SUBSCRIPTIONS</small>
          <b>{totalCount || 0}</b>
          <span className="metric-caption">Lifetime plan activations</span>
        </div>
        <div>
          <ShieldCheck />
          <small>CURRENTLY ACTIVE</small>
          <b>{activeCount || 0}</b>
          <span className="metric-caption">Valid non-expired access</span>
        </div>
        <div>
          <ShieldAlert />
          <small>SUSPENDED</small>
          <b>{suspendedCount || 0}</b>
          <span className="metric-caption">Manually suspended</span>
        </div>
        <div>
          <Clock />
          <small>EXPIRED</small>
          <b>{Math.max(0, (totalCount || 0) - (activeCount || 0) - (suspendedCount || 0))}</b>
          <span className="metric-caption">Ended access periods</span>
        </div>
      </div>

      <section className="admin-section">
        <h2>All Subscriptions</h2>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Member</th>
                <th>Plan Tier</th>
                <th>Status</th>
                <th>Starts</th>
                <th>Expires</th>
                <th>Access Window</th>
                <th>Manage</th>
              </tr>
            </thead>
            <tbody>
              {subs?.map(s => {
                const member = extractMember(s.profiles, profileFallbackMap.get(s.user_id), s.user_id);
                const planTitle = extractPlanName(s.plans, planMap, s.plan_id);
                const isExpired = new Date(s.expires_at).getTime() <= nowTime;
                const isActive = s.status === 'active' && !isExpired;
                const isSuspended = s.status === 'suspended';
                const daysLeft = Math.max(
                  0,
                  Math.ceil((new Date(s.expires_at).getTime() - nowTime) / (1000 * 60 * 60 * 24))
                );

                return (
                  <tr key={s.id}>
                    <td>
                      <span className="table-member-primary">{member.email}</span>
                      {member.name && <small className="table-member-secondary">{member.name}</small>}
                    </td>
                    <td>
                      <strong>{planTitle}</strong>
                    </td>
                    <td>
                      <span
                        className={`status-pill ${
                          isActive ? 'status-active' : isSuspended ? 'status-danger' : 'status-muted'
                        }`}
                      >
                        {isActive ? 'Active' : isSuspended ? 'Suspended' : 'Expired'}
                      </span>
                    </td>
                    <td>{formatDate(s.starts_at)}</td>
                    <td>{formatDate(s.expires_at)}</td>
                    <td>
                      {isActive ? (
                        <span className="text-emerald font-mono text-xs">{daysLeft} days remaining</span>
                      ) : isSuspended ? (
                        <span className="text-danger font-mono text-xs">Access halted</span>
                      ) : (
                        <span className="text-muted font-mono text-xs">Ended</span>
                      )}
                    </td>
                    <td>
                      <AdminAction
                        kind="subscription"
                        id={s.id}
                        value={isSuspended ? 'active' : 'suspended'}
                        label={isSuspended ? 'Reactivate' : 'Suspend'}
                      />
                    </td>
                  </tr>
                );
              })}
              {!subs?.length && (
                <tr>
                  <td colSpan={7}>No subscriptions found.</td>
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
