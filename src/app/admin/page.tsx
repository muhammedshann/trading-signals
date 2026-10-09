import Link from 'next/link';
import { UsersRound, CreditCard, Layers3, Banknote } from 'lucide-react';
import { requireUser } from '@/lib/auth';
import { AdminAction } from '@/components/admin-action';
import { AdminPlanManager } from '@/components/admin-plan-manager';
import type { PlanRecord } from '@/lib/plans';

const PAGE_SIZE = 10;
type Search = { users_page?: string; subscriptions_page?: string; payments_page?: string };
function pageNumber(value: string | undefined) { const parsed = Number(value || '1'); return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : 1; }
function Pager({ current, total, param, search }: { current: number; total: number; param: keyof Search; search: Search }) {
  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  if (pages <= 1) return <div className="admin-pager-note">Showing {total} records</div>;
  const href = (n: number) => { const query = new URLSearchParams(); for (const [key, value] of Object.entries(search)) if (value) query.set(key, value); query.set(param, String(n)); return `/admin?${query.toString()}`; };
  return <nav className="admin-pager" aria-label="Table pages"><span>Page {current} of {pages} · {total} records</span><div>{current > 1 && <Link href={href(current - 1)}>Previous</Link>}{current < pages && <Link href={href(current + 1)}>Next</Link>}</div></nav>;
}

export default async function Admin({ searchParams }: { searchParams: Promise<Search> }) {
  const search = await searchParams;
  const { db } = await requireUser(true);
  const userPage = pageNumber(search.users_page), subscriptionPage = pageNumber(search.subscriptions_page), paymentPage = pageNumber(search.payments_page);
  const range = (p: number) => ({ from: (p - 1) * PAGE_SIZE, to: p * PAGE_SIZE - 1 });
  const [{ data: users, count: userCount }, { data: plans }, { data: subs, count: subCount }, { data: pays, count: paymentCount }, { count: paidCount }] = await Promise.all([
    db.from('profiles').select('id,email,full_name,created_at,role,is_suspended', { count: 'exact' }).is('removed_at', null).order('created_at', { ascending: false }).range(range(userPage).from, range(userPage).to),
    db.from('plans').select('id,name,price_inr,original_price_inr,duration_days,active').order('price_inr'),
    db.from('subscriptions').select('id,status,starts_at,expires_at,profiles(email),plans(name)', { count: 'exact' }).order('created_at', { ascending: false }).range(range(subscriptionPage).from, range(subscriptionPage).to),
    db.from('payments').select('id,status,amount_inr,razorpay_order_id,paid_at,profiles(email),plans(name)', { count: 'exact' }).order('created_at', { ascending: false }).range(range(paymentPage).from, range(paymentPage).to),
    db.from('payments').select('id', { count: 'exact', head: true }).eq('status', 'paid'),
  ]);
  let grossRevenue = 0, revenueOffset = 0;
  while (true) {
    const { data } = await db.from('payments').select('amount_inr').eq('status', 'paid').range(revenueOffset, revenueOffset + 999);
    grossRevenue += (data || []).reduce((sum, payment) => sum + Number(payment.amount_inr || 0), 0);
    if (!data || data.length < 1000) break;
    revenueOffset += 1000;
  }

  return <main className="dashboard wrap admin-dashboard">
    <div className="dash-head"><div><div className="eyebrow">SIGNALROOM ADMIN</div><h1>Operations</h1><p>Manage members, memberships and billing activity.</p></div></div>
    <div className="admin-metrics"><div><UsersRound/><small>MEMBERS</small><b>{userCount || 0}</b></div><div><Layers3/><small>PLANS</small><b>{plans?.length || 0}</b></div><div><CreditCard/><small>PAYMENTS</small><b>{paymentCount || 0}</b></div><div><Banknote/><small>GROSS PAID</small><b>₹{grossRevenue.toLocaleString('en-IN')}</b><small className="metric-caption">{paidCount || 0} verified payments · before fees and costs</small></div></div>
    <AdminPlanManager plans={(plans || []) as PlanRecord[]}/>
    <section className="admin-section"><h2>Subscriptions</h2><div className="table-wrap"><table><thead><tr><th>Member</th><th>Plan</th><th>Status</th><th>Expires</th><th>Manage</th></tr></thead><tbody>{subs?.map(s=><tr key={s.id}><td>{(s.profiles as {email:string}[]|null)?.[0]?.email || '—'}</td><td>{(s.plans as {name:string}[]|null)?.[0]?.name || '—'}</td><td><span className={`status-pill ${s.status === 'active' ? 'status-active' : 'status-muted'}`}>{s.status}</span></td><td>{new Date(s.expires_at).toLocaleDateString('en-IN')}</td><td><AdminAction kind="subscription" id={s.id} value={s.status==='suspended'?'active':'suspended'} label={s.status==='suspended'?'Reactivate':'Suspend'}/></td></tr>)}{!subs?.length&&<tr><td colSpan={5}>No subscriptions found.</td></tr>}</tbody></table></div><Pager current={subscriptionPage} total={subCount || 0} param="subscriptions_page" search={search}/></section>
    <section className="admin-section"><h2>Payments</h2><div className="table-wrap"><table><thead><tr><th>Member</th><th>Plan</th><th>Amount</th><th>Status</th><th>Order</th></tr></thead><tbody>{pays?.map(p=><tr key={p.id}><td>{(p.profiles as {email:string}[]|null)?.[0]?.email || '—'}</td><td>{(p.plans as {name:string}[]|null)?.[0]?.name || '—'}</td><td>₹{Number(p.amount_inr).toLocaleString('en-IN')}</td><td>{p.status}</td><td>{p.razorpay_order_id}</td></tr>)}{!pays?.length&&<tr><td colSpan={5}>No payments found.</td></tr>}</tbody></table></div><Pager current={paymentPage} total={paymentCount || 0} param="payments_page" search={search}/></section>
    <section className="admin-section"><h2>Members</h2><div className="table-wrap"><table><thead><tr><th>Name</th><th>Email</th><th>Role</th><th>Joined</th><th>Access</th><th>Manage</th></tr></thead><tbody>{users?.map(u=><tr key={u.id}><td>{u.full_name||'—'}</td><td>{u.email}</td><td>{u.role||'member'}</td><td>{new Date(u.created_at).toLocaleDateString('en-IN')}</td><td>{u.is_suspended?'Suspended':'Active'}</td><td className="member-actions"><AdminAction kind="user" id={u.id} value={!u.is_suspended} label={u.is_suspended?'Restore':'Suspend'}/><AdminAction kind="user" id={u.id} value="remove" label="Remove" remove/></td></tr>)}{!users?.length&&<tr><td colSpan={6}>No active member profiles found.</td></tr>}</tbody></table></div><Pager current={userPage} total={userCount || 0} param="users_page" search={search}/></section>
  </main>;
}
