import Link from 'next/link';
import {
  Bot,
  UsersRound,
  UserCheck,
  UserX,
  Link2,
  ShieldCheck,
  ExternalLink,
} from 'lucide-react';
import { requireUser } from '@/lib/auth';
import { createAdminClient } from '@/lib/supabase/admin';
import { AdminNav } from '@/components/admin-nav';
import { AdminBotAction } from '@/components/admin-bot-actions';

const PAGE_SIZE = 12;

function pageNumber(value: string | undefined) {
  const parsed = Number(value || '1');
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : 1;
}

function Pager({ current, total }: { current: number; total: number }) {
  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  if (pages <= 1) return <div className="admin-pager-note">Showing {total} telegram members</div>;
  const href = (n: number) => `/admin/bot?page=${n}`;
  return (
    <nav className="admin-pager" aria-label="Bot member pages">
      <span>Page {current} of {pages} · {total} telegram members</span>
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

export default async function AdminBotPage({
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
    { data: members, count: totalCount },
    { count: activeInGroupCount },
    { count: kickedCount },
    { count: pendingCodesCount },
  ] = await Promise.all([
    adminDb
      .from('telegram_members')
      .select('telegram_user_id, user_id, username, display_name, joined_at, kicked_at, verified_at, profiles(email, full_name)', { count: 'exact' })
      .order('joined_at', { ascending: false })
      .range(from, to),
    adminDb
      .from('telegram_members')
      .select('telegram_user_id', { count: 'exact', head: true })
      .is('kicked_at', null),
    adminDb
      .from('telegram_members')
      .select('telegram_user_id', { count: 'exact', head: true })
      .not('kicked_at', 'is', null),
    adminDb
      .from('telegram_link_codes')
      .select('id', { count: 'exact', head: true })
      .is('used_at', null)
      .gt('expires_at', nowIso),
  ]);

  const missingUserIds = Array.from(
    new Set((members || []).filter(m => !m.profiles).map(m => m.user_id))
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

  const botConfigured = Boolean(process.env.TELEGRAM_BOT_TOKEN);
  const chatIdConfigured = process.env.TELEGRAM_CHAT_ID || 'Not set';

  return (
    <main className="dashboard wrap admin-dashboard">
      <div className="dash-head">
        <div>
          <div className="eyebrow">SIGNALROOM ADMIN</div>
          <h1>Telegram Bot &amp; Community</h1>
          <p>Real-time audit of verified Telegram accounts, members currently inside the VIP group, and kicked or banned accounts.</p>
        </div>
      </div>

      <AdminNav />

      <div className="admin-metrics">
        <div>
          <UserCheck />
          <small>ACTIVE IN VIP GROUP</small>
          <b>{activeInGroupCount || 0}</b>
          <span className="metric-caption">Members with current access</span>
        </div>
        <div>
          <UserX />
          <small>BANNED / KICKED</small>
          <b>{kickedCount || 0}</b>
          <span className="metric-caption">Expired or removed members</span>
        </div>
        <div>
          <UsersRound />
          <small>LIFETIME VERIFIED</small>
          <b>{totalCount || 0}</b>
          <span className="metric-caption">Telegram accounts linked</span>
        </div>
        <div>
          <Link2 />
          <small>PENDING LINK CODES</small>
          <b>{pendingCodesCount || 0}</b>
          <span className="metric-caption">Awaiting bot verification</span>
        </div>
      </div>

      <div className="admin-bot-config-card">
        <div className="admin-bot-config-header">
          <Bot size={20} className="text-emerald" />
          <div>
            <h3>Telegram Bot Operational Status</h3>
            <p>Verification flow: in-bot confirmation button with auto 1-time single-use invite generation.</p>
          </div>
        </div>
        <div className="admin-bot-config-grid">
          <div>
            <small>BOT CREDENTIALS</small>
            <b>{botConfigured ? 'Connected & Active' : 'Missing Token'}</b>
          </div>
          <div>
            <small>VIP CHAT / CHANNEL ID</small>
            <code>{chatIdConfigured}</code>
          </div>
          <div>
            <small>EXCLUSIVITY RULE</small>
            <b>1 Member per Invite Link</b>
          </div>
        </div>
      </div>

      <section className="admin-section">
        <h2>Telegram Members Directory</h2>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Telegram Identity</th>
                <th>Linked Account</th>
                <th>Group Access</th>
                <th>Verified At</th>
                <th>Joined Group</th>
                <th>Kicked / Removed</th>
                <th>Action</th>
              </tr>
            </thead>
            <tbody>
              {members?.map(m => {
                const member = extractMember(m.profiles, profileFallbackMap.get(m.user_id), m.user_id);
                const isKicked = Boolean(m.kicked_at);

                return (
                  <tr key={m.telegram_user_id}>
                    <td>
                      <span className="table-member-primary">
                        {m.display_name || m.username || 'Telegram User'}
                      </span>
                      <small className="table-member-secondary">
                        {m.username ? `@${m.username} · ` : ''}ID: {m.telegram_user_id}
                      </small>
                    </td>
                    <td>
                      <span className="table-member-primary">{member.email}</span>
                      {member.name && <small className="table-member-secondary">{member.name}</small>}
                    </td>
                    <td>
                      <span className={`status-pill ${isKicked ? 'status-danger' : 'status-active'}`}>
                        {isKicked ? 'Banned / Kicked' : 'Active in Group'}
                      </span>
                    </td>
                    <td>{formatDate(m.verified_at || m.joined_at)}</td>
                    <td>{formatDate(m.joined_at)}</td>
                    <td>
                      {m.kicked_at ? (
                        <span className="text-danger font-mono text-xs">{formatDate(m.kicked_at)}</span>
                      ) : (
                        <span className="text-muted">—</span>
                      )}
                    </td>
                    <td>
                      <AdminBotAction
                        telegramUserId={m.telegram_user_id}
                        displayName={m.display_name || m.username || m.telegram_user_id}
                        action={isKicked ? 'unban' : 'kick'}
                      />
                    </td>
                  </tr>
                );
              })}
              {!members?.length && (
                <tr>
                  <td colSpan={7}>No verified Telegram members found yet.</td>
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
