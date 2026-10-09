export type PlanRecord = {
  id: string;
  name: string;
  price_inr: number;
  original_price_inr: number | null;
  duration_days: number;
  active: boolean;
};

export function formatInr(amount: number) {
  return `₹${amount.toLocaleString('en-IN')}`;
}

export function planDiscountPercent(plan: Pick<PlanRecord, 'price_inr' | 'original_price_inr'>) {
  if (!plan.original_price_inr || plan.original_price_inr <= plan.price_inr) return 0;
  return Math.round(((plan.original_price_inr - plan.price_inr) / plan.original_price_inr) * 100);
}

export function planCadence(days: number) {
  if (days === 30) return 'month';
  if (days === 90) return '3 months';
  if (days === 365) return 'year';
  return `${days} days`;
}

export function planDuration(days: number) {
  if (days === 30) return '1 month';
  if (days === 90) return '3 months';
  if (days === 365) return '12 months';
  return `${days} days`;
}
