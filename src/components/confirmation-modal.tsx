'use client';

import { useEffect } from 'react';

export function ConfirmationModal({ open, title, message, confirmLabel = 'Confirm', danger = false, busy = false, onCancel, onConfirm }: {
  open: boolean; title: string; message: string; confirmLabel?: string; danger?: boolean; busy?: boolean;
  onCancel: () => void; onConfirm: () => void;
}) {
  useEffect(() => {
    if (!open) return;
    const key = (event: KeyboardEvent) => { if (event.key === 'Escape' && !busy) onCancel(); };
    document.addEventListener('keydown', key);
    return () => document.removeEventListener('keydown', key);
  }, [open, busy, onCancel]);
  if (!open) return null;
  return <div className="confirm-backdrop" onMouseDown={event => { if (event.target === event.currentTarget && !busy) onCancel(); }}>
    <section className="confirm-modal" role="alertdialog" aria-modal="true" aria-labelledby="confirm-title">
      <span className="eyebrow">PLEASE CONFIRM</span><h2 id="confirm-title">{title}</h2><p>{message}</p>
      <div className="confirm-actions"><button type="button" className="plan-cancel" disabled={busy} onClick={onCancel}>Cancel</button><button type="button" className={`button button-small ${danger ? 'confirm-danger' : 'button-dark'}`} disabled={busy} onClick={onConfirm}>{busy ? 'Please wait…' : confirmLabel}</button></div>
    </section>
  </div>;
}
