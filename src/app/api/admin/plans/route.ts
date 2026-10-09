import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { isSameOriginRequest } from '@/lib/auth/otp';

type PlanPayload = {
  id?: string;
  name?: string;
  priceInr?: number;
  originalPriceInr?: number | null;
  durationDays?: number;
  active?: boolean;
};

async function requireAdmin(request: Request) {
  if (!isSameOriginRequest(request)) return { error: NextResponse.json({ error: 'Invalid request origin.' }, { status: 403 }) };
  const auth = await createClient();
  if (!auth) return { error: NextResponse.json({ error: 'Database unavailable.' }, { status: 503 }) };
  const { data: { user } } = await auth.auth.getUser();
  if (!user || user.app_metadata.role !== 'admin') return { error: NextResponse.json({ error: 'Admin access required.' }, { status: 403 }) };
  return { error: null };
}

function validatePlan(body: PlanPayload) {
  const id = body.id?.trim().toLowerCase() || '';
  const name = body.name?.trim() || '';
  const price = body.priceInr;
  const originalPrice = body.originalPriceInr ?? null;
  const days = body.durationDays;
  if (!/^[a-z0-9][a-z0-9_-]{1,47}$/.test(id)) return { error: 'Plan ID is invalid. Use at least 2 letters, numbers, hyphens or underscores.' };
  if (!name || name.length > 80) return { error: 'Enter a plan name (up to 80 characters).' };
  if (!Number.isSafeInteger(price) || Number(price) < 1 || Number(price) > 10_000_000) return { error: 'Enter a valid offer price in rupees.' };
  if (originalPrice !== null && (!Number.isSafeInteger(originalPrice) || originalPrice <= Number(price) || originalPrice > 10_000_000)) {
    return { error: 'The actual price must be greater than the offer price.' };
  }
  if (!Number.isSafeInteger(days) || Number(days) < 1 || Number(days) > 3650) return { error: 'Plan duration must be between 1 and 3,650 days.' };
  if (typeof body.active !== 'boolean') return { error: 'Choose whether to save this plan as a draft or publish it.' };
  return { value: { id, name, price_inr: Number(price), original_price_inr: originalPrice, duration_days: Number(days), active: body.active } };
}

async function savePlan(request: Request, method: 'POST' | 'PUT') {
  const { error: accessError } = await requireAdmin(request);
  if (accessError) return accessError;
  try {
    const body = await request.json() as PlanPayload;
    const checked = validatePlan(body);
    if (checked.error) return NextResponse.json({ error: checked.error }, { status: 400 });
    const admin = createAdminClient();
    if (method === 'POST') {
      const { error } = await admin.from('plans').insert(checked.value!);
      if (error?.code === '23505') return NextResponse.json({ error: 'A plan already uses this ID. Choose another plan name.' }, { status: 409 });
      if (error) throw error;
    } else {
      const { data, error } = await admin.from('plans').update(checked.value!).eq('id', checked.value!.id).select('id').maybeSingle();
      if (error) throw error;
      if (!data) return NextResponse.json({ error: 'Plan not found. Refresh the page and try again.' }, { status: 404 });
    }
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error('Admin plan save failed:', error);
    return NextResponse.json({ error: 'Could not save the plan. Apply the latest plans database migration and try again.' }, { status: 500 });
  }
}

export async function POST(request: Request) {
  return savePlan(request, 'POST');
}

export async function PUT(request: Request) {
  return savePlan(request, 'PUT');
}
