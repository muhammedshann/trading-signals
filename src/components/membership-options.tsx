import { ArrowRight, Check } from 'lucide-react';
import { Checkout } from '@/components/checkout';
import { formatInr, planCadence, planDiscountPercent, planDuration, type PlanRecord } from '@/lib/plans';

export function MembershipOptions({ context = 'landing', plans }: { context?: 'landing' | 'dashboard' | 'plans'; plans: PlanRecord[] }) {
  return <div className={`plans-grid membership-options membership-options-${context}`}>
    {plans.map(plan => {
      const discount = planDiscountPercent(plan);
      const cadence = planCadence(plan.duration_days);
      const duration = planDuration(plan.duration_days);
      return <article className={`plan-card ${plan.id === 'annual' ? 'plan-featured' : ''}`} key={plan.id}>
      {plan.id === 'annual' && <div className="plan-ribbon">ANNUAL MEMBERSHIP</div>}
      <div className="plan-name">{plan.name}<span>{duration}</span></div>
      <div className="plan-pricing">
        <div className="plan-price-current"><strong>{formatInr(plan.price_inr)}</strong><span>/{cadence}</span></div>
        {discount > 0 && <div className="plan-price-offer"><s>{formatInr(plan.original_price_inr!)}</s><b>{discount}% OFF</b></div>}
      </div>
      <p className="plan-description">Premium market research and Telegram community access for {duration.toLowerCase()}.</p>
      <div className="plan-rule" />
      <div className="plan-includes">INCLUDED IN YOUR MEMBERSHIP</div>
      <div className="plan-feature-list">{['Daily market notes', 'Trade ideas with risk context', 'Premium Telegram community access', 'Learning library and member Q&A'].map(feature => <div className="plan-item" key={feature}><Check size={16}/><span>{feature}</span></div>)}</div>
      <div className="plan-checkout"><Checkout planId={plan.id} label="Continue to secure checkout" />
      <small className="plan-legal">One-time payment for this period. Renew manually. Secure checkout by Razorpay.</small>
      <a className="membership-policy-link" href="/terms">View membership terms <ArrowRight size={13}/></a></div>
    </article>;
    })}
  </div>;
}
