'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { formatInr, planDiscountPercent, planDuration, type PlanRecord } from '@/lib/plans';
import { ConfirmationModal } from '@/components/confirmation-modal';

type Draft = { id: string; name: string; offerPrice: string; originalPrice: string; durationDays: string };
const emptyDraft: Draft = { id: '', name: '', offerPrice: '', originalPrice: '', durationDays: '30' };

function slug(value: string) {
  return value.toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 48);
}

export function AdminPlanManager({ plans }: { plans: PlanRecord[] }) {
  const router = useRouter();
  const [draft, setDraft] = useState<Draft>(emptyDraft);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [pendingActive, setPendingActive] = useState<boolean | null>(null);
  const discount = draft.offerPrice && draft.originalPrice && Number(draft.originalPrice) > Number(draft.offerPrice)
    ? Math.round(((Number(draft.originalPrice) - Number(draft.offerPrice)) / Number(draft.originalPrice)) * 100)
    : 0;

  function startCreate() {
    setEditingId(null);
    setFormOpen(true);
    setDraft(emptyDraft);
    setError('');
    setMessage('');
  }

  function startEdit(plan: PlanRecord) {
    setEditingId(plan.id);
    setFormOpen(true);
    setDraft({ id: plan.id, name: plan.name, offerPrice: String(plan.price_inr), originalPrice: plan.original_price_inr ? String(plan.original_price_inr) : '', durationDays: String(plan.duration_days) });
    setError('');
    setMessage('');
  }

  async function save(active: boolean) {
    setBusy(true);
    setError('');
    setMessage('');
    try {
      const payload = {
        id: editingId || slug(draft.name),
        name: draft.name,
        priceInr: Number(draft.offerPrice),
        originalPriceInr: draft.originalPrice ? Number(draft.originalPrice) : null,
        durationDays: Number(draft.durationDays),
        active,
      };
      const response = await fetch('/api/admin/plans', {
        method: editingId ? 'PUT' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const result = await response.json() as { error?: string };
      if (!response.ok) throw new Error(result.error || 'Could not save this plan.');
      setMessage(active ? 'Plan published and available to members.' : 'Plan saved as a draft. It is hidden from the membership pages.');
      setPendingActive(null);
      setEditingId(null);
      setFormOpen(false);
      setDraft(emptyDraft);
      router.refresh();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not save this plan.');
    } finally {
      setBusy(false);
    }
  }

  return <section className="admin-section plan-admin">
    <div className="plan-admin-heading"><div><h2>Membership plans</h2><p>Create plans, edit prices, and keep unfinished offers as drafts.</p></div><button className="button button-dark button-small" type="button" onClick={startCreate}>Add a plan</button></div>
    {message && <p className="form-success admin-feedback" role="status">{message}</p>}
    {error && <p className="form-error admin-feedback" role="alert">{error}</p>}
    <div className="table-wrap"><table><thead><tr><th>Plan</th><th>Offer price</th><th>Actual price</th><th>Offer</th><th>Duration</th><th>Status</th><th>Edit</th></tr></thead><tbody>
      {plans.map(plan => {
        const percent = planDiscountPercent(plan);
        return <tr key={plan.id}><td>{plan.name}</td><td>{formatInr(plan.price_inr)}</td><td>{plan.original_price_inr ? formatInr(plan.original_price_inr) : '—'}</td><td>{percent ? `${percent}% off` : '—'}</td><td>{planDuration(plan.duration_days)}</td><td><span className={`status-pill ${plan.active ? 'status-active' : 'status-muted'}`}>{plan.active ? 'Published' : 'Draft'}</span></td><td><button type="button" className="table-action" onClick={() => startEdit(plan)}>Edit</button></td></tr>;
      })}
      {!plans.length && <tr><td colSpan={7}>No plans yet. Add a plan to make an offer available.</td></tr>}
    </tbody></table></div>

    {formOpen && <form className="plan-editor" onSubmit={event => event.preventDefault()}>
      <div className="plan-editor-title"><div><span className="eyebrow">{editingId ? 'EDIT PLAN' : 'NEW PLAN'}</span><h3>{editingId ? `Editing ${draft.name}` : 'Plan details'}</h3></div>{editingId && <small>Plan ID: {editingId}</small>}</div>
      <div className="plan-editor-grid">
        <label>Plan name<input required maxLength={80} value={draft.name} onChange={event => setDraft({ ...draft, name: event.target.value })} placeholder="For example, 3 month membership"/></label>
        <label>Duration (days)<input required type="number" min={1} max={3650} step={1} value={draft.durationDays} onChange={event => setDraft({ ...draft, durationDays: event.target.value })}/></label>
        <label>Offer price (INR)<input required type="number" min={1} step={1} value={draft.offerPrice} onChange={event => setDraft({ ...draft, offerPrice: event.target.value })} placeholder="1000"/></label>
        <label>Actual price (INR)<input type="number" min={1} step={1} value={draft.originalPrice} onChange={event => setDraft({ ...draft, originalPrice: event.target.value })} placeholder="Optional; leave blank for no offer"/></label>
      </div>
      <p className="discount-preview">{discount ? <><s>{formatInr(Number(draft.originalPrice))}</s> &nbsp; Offer {formatInr(Number(draft.offerPrice))} · <b>{discount}% OFF</b></> : 'Enter an actual price higher than the offer price to display an automatic discount.'}</p>
      <div className="plan-editor-actions"><button type="button" className="table-action" disabled={busy} onClick={() => setPendingActive(false)}>Save as draft</button><button type="button" className="button button-dark button-small" disabled={busy} onClick={() => setPendingActive(true)}>Save and publish</button><button type="button" className="plan-cancel" disabled={busy} onClick={() => { setFormOpen(false); setEditingId(null); setDraft(emptyDraft); setError(''); }}>Cancel</button></div>
      <ConfirmationModal open={pendingActive !== null} title={pendingActive ? 'Publish this plan?' : 'Save this plan as a draft?'} message={pendingActive ? 'Members will be able to select this plan and start checkout immediately.' : 'This plan will be saved in admin and stay hidden from membership pages.'} confirmLabel={pendingActive ? 'Publish plan' : 'Save draft'} busy={busy} onCancel={() => setPendingActive(null)} onConfirm={() => { if (pendingActive !== null) void save(pendingActive); }}/>
    </form>}
  </section>;
}
