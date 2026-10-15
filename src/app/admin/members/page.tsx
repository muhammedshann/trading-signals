import Link from 'next/link';
import { UsersRound, ShieldCheck, UserX } from 'lucide-react';
import { requireUser } from '@/lib/auth';
import { createAdminClient } from '@/lib/supabase/admin';
import { AdminNav } from '@/components/admin-nav';
import { AdminMembersView, type UserRecord, type MemberAccess, type AgreementConsent } from '@/components/admin-members-view';

const PAGE_SIZE = 12;

function pageNumber(value: string | undefined) {
  const parsed = Number(value || '1');
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : 1;
}

function Pager({ current, total }: { current: number; total: number }) {
  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  if (pages <= 1) return <div className="admin-pager-note">Showing {total} members</div>;
  const href = (n: number) => `/admin/members?page=${n}`;
  return (
    <nav className="admin-pager" aria-label="Member pages">
      <span>Page {current} of {pages} · {total} members</span>
      <div>
        {current > 1 && <Link href={href(current - 1)}>Previous</Link>}
        {current < pages && <Link href={href(current + 1)}>Next</Link>}
      </div>
    </nav>
  );
}

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export default async function AdminMembersPage({
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
    { data: users, count: totalCount },
    { count: suspendedCount },
    { count: activeSubsCount },
    { data: plans },
  ] = await Promise.all([
    adminDb
      .from('profiles')
      .select('id,email,full_name,created_at,role,is_suspended', { count: 'exact' })
      .is('removed_at', null)
      .order('created_at', { ascending: false })
      .range(from, to),
    adminDb
      .from('profiles')
      .select('id', { count: 'exact', head: true })
      .eq('is_suspended', true)
      .is('removed_at', null),
    adminDb
      .from('subscriptions')
      .select('id', { count: 'exact', head: true })
      .eq('status', 'active')
      .gt('expires_at', new Date().toISOString()),
    adminDb.from('plans').select('id,name'),
  ]);

  const userIds = (users || []).map(u => u.id);

  const [subscriptionsRes, agreementsRes] = await Promise.all([
    userIds.length > 0
      ? adminDb
          .from('subscriptions')
          .select('id,user_id,plan_id,status,starts_at,expires_at,plans(name)')
          .in('user_id', userIds)
          .order('expires_at', { ascending: false })
      : { data: [] },
    userIds.length > 0
      ? adminDb
          .from('agreement_acceptances')
          .select('*')
          .in('user_id', userIds)
          .order('accepted_at', { ascending: false })
      : { data: [] },
  ]);

  const planMap = new Map((plans || []).map(p => [p.id, p.name]));
  const accessMap: Record<string, MemberAccess> = {};
  const consentMap: Record<string, AgreementConsent | null> = {};


  const now = Date.now();

  for (const u of users || []) {
    consentMap[u.id] = null;
    accessMap[u.id] = { status: 'none', planName: '', daysLeft: null, expiresAt: null };

    const userSubs = (subscriptionsRes.data || []).filter(s => s.user_id === u.id);
    const activeSub = userSubs.find(
      s => s.status === 'active' && new Date(s.expires_at).getTime() > now
    );

    if (activeSub) {
      const planName =
        (activeSub.plans as unknown as { name?: string })?.name ||
        planMap.get(activeSub.plan_id) ||
        activeSub.plan_id;
      const daysLeft = Math.max(
        0,
        Math.ceil((new Date(activeSub.expires_at).getTime() - now) / (1000 * 60 * 60 * 24))
      );
      accessMap[u.id] = {
        status: 'active',
        planName,
        daysLeft,
        expiresAt: activeSub.expires_at,
      };
    } else {
      const latestSub = userSubs[0];
      if (latestSub) {
        const planName =
          (latestSub.plans as unknown as { name?: string })?.name ||
          planMap.get(latestSub.plan_id) ||
          latestSub.plan_id;
        if (latestSub.status === 'suspended') {
          accessMap[u.id] = {
            status: 'suspended',
            planName,
            daysLeft: null,
            expiresAt: latestSub.expires_at,
          };
        } else {
          accessMap[u.id] = {
            status: 'expired',
            planName,
            daysLeft: null,
            expiresAt: latestSub.expires_at,
          };
        }
      }
    }

    const userAgreement = (agreementsRes.data || []).find(a => a.user_id === u.id);
    if (userAgreement) {
      consentMap[u.id] = userAgreement as AgreementConsent;
    }
  }

  return (
    <main className="dashboard wrap admin-dashboard">
      <div className="dash-head">
        <div>
          <div className="eyebrow">SIGNALROOM ADMIN</div>
          <h1>Member Accounts</h1>
          <p>Review members, verify active subscription access, inspect IP/device legal consent, and manage accounts.</p>
        </div>
      </div>

      <AdminNav />

      <div className="admin-metrics">
        <div>
          <UsersRound />
          <small>REGISTERED MEMBERS</small>
          <b>{totalCount || 0}</b>
          <span className="metric-caption">Active member accounts</span>
        </div>
        <div>
          <ShieldCheck />
          <small>ACTIVE SUBSCRIBERS</small>
          <b>{activeSubsCount || 0}</b>
          <span className="metric-caption">Non-expired paid access</span>
        </div>
        <div>
          <UserX />
          <small>SUSPENDED ACCOUNTS</small>
          <b>{suspendedCount || 0}</b>
          <span className="metric-caption">Access blocked</span>
        </div>
      </div>

      <section className="admin-section">
        <h2>Members Directory</h2>
        <AdminMembersView
          users={(users || []) as UserRecord[]}
          accessMap={accessMap}
          consentMap={consentMap}
        />
        <Pager current={currentPage} total={totalCount || 0} />
      </section>
    </main>
  );
}
