import { Layers3, Eye, EyeOff } from 'lucide-react';
import { requireUser } from '@/lib/auth';
import { createAdminClient } from '@/lib/supabase/admin';
import { AdminNav } from '@/components/admin-nav';
import { AdminPlanManager } from '@/components/admin-plan-manager';
import type { PlanRecord } from '@/lib/plans';

export default async function AdminPlansPage() {
  await requireUser(true);
  const adminDb = createAdminClient();

  const { data: plans } = await adminDb
    .from('plans')
    .select('id,name,price_inr,original_price_inr,duration_days,active')
    .order('price_inr', { ascending: true });

  const allPlans = (plans || []) as PlanRecord[];
  const publishedCount = allPlans.filter(p => p.active).length;
  const draftCount = allPlans.filter(p => !p.active).length;

  return (
    <main className="dashboard wrap admin-dashboard">
      <div className="dash-head">
        <div>
          <div className="eyebrow">SIGNALROOM ADMIN</div>
          <h1>Membership Plans &amp; Pricing</h1>
          <p>Create new membership tiers, update pricing discounts, manage drafts, and delete unused plans.</p>
        </div>
      </div>

      <AdminNav />

      <div className="admin-metrics">
        <div>
          <Layers3 />
          <small>CONFIGURED PLANS</small>
          <b>{allPlans.length}</b>
          <span className="metric-caption">Total tiers in database</span>
        </div>
        <div>
          <Eye />
          <small>PUBLISHED &amp; ACTIVE</small>
          <b>{publishedCount}</b>
          <span className="metric-caption">Visible to members on site</span>
        </div>
        <div>
          <EyeOff />
          <small>DRAFT OFFERS</small>
          <b>{draftCount}</b>
          <span className="metric-caption">Hidden from public checkout</span>
        </div>
      </div>

      <AdminPlanManager plans={allPlans} />
    </main>
  );
}
