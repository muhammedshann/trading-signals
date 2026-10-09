'use client';

import { useState } from 'react';
import { ConfirmationModal } from '@/components/confirmation-modal';

export function AdminAction({ kind, id, value, label, remove = false }: {
  kind: 'plan' | 'subscription' | 'user'; id: string; value: string | boolean; label: string; remove?: boolean;
}) {
  const [busy, setBusy] = useState(false), [error, setError] = useState(''), [confirm, setConfirm] = useState(false);
  const isRemove = remove;
  async function act() {
    setBusy(true); setError('');
    try {
      const response = await fetch('/api/admin/manage', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ kind: isRemove ? 'remove_user' : kind, id, value }) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Update failed');
      location.reload();
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Update failed'); setBusy(false); setConfirm(false); }
  }
  const title = isRemove ? 'Remove this member?' : `${label} this ${kind}?`;
  const message = isRemove
    ? 'This blocks sign-in, anonymizes the profile and hides it from the member list. Payment and subscription history is retained for audit records.'
    : kind === 'user' ? `This will ${value ? 'suspend' : 'restore'} this account’s sign-in and community access.`
      : kind === 'subscription' ? `This will change this subscription to ${String(value)}. Telegram access eligibility will follow the subscription status.`
        : `This will ${value ? 'publish' : 'hide'} this plan on the public membership pages.`;
  return <span className="admin-action"><button className={`table-action ${isRemove ? 'table-action-danger' : ''}`} disabled={busy} onClick={() => setConfirm(true)}>{busy ? 'Saving…' : label}</button>{error && <small className="form-error">{error}</small>}<ConfirmationModal open={confirm} title={title} message={message} confirmLabel={isRemove ? 'Remove member' : label} danger={isRemove || (kind === 'user' && !!value) || (kind === 'subscription' && value === 'suspended')} busy={busy} onCancel={() => setConfirm(false)} onConfirm={act}/></span>;
}
