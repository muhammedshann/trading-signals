'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { ConfirmationModal } from '@/components/confirmation-modal';

export function AdminBotAction({
  telegramUserId,
  displayName,
  action,
}: {
  telegramUserId: string;
  displayName: string;
  action: 'kick' | 'unban';
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [modalOpen, setModalOpen] = useState(false);

  const isKick = action === 'kick';

  async function handleConfirm() {
    setBusy(true);
    setError('');
    try {
      const response = await fetch('/api/admin/manage', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          kind: isKick ? 'bot_kick' : 'bot_unban',
          id: telegramUserId,
        }),
      });
      const data = await response.json() as { ok?: boolean; error?: string };
      if (!response.ok) throw new Error(data.error || 'Operation failed');
      setModalOpen(false);
      router.refresh();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Operation failed');
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <button
        type="button"
        className={`table-action ${isKick ? 'table-action-danger' : ''}`}
        disabled={busy}
        onClick={() => {
          setError('');
          setModalOpen(true);
        }}
      >
        {isKick ? 'Kick from Group' : 'Unban Member'}
      </button>

      {error && <small className="form-error" style={{ display: 'block', marginTop: 4 }}>{error}</small>}

      <ConfirmationModal
        open={modalOpen}
        title={isKick ? `Kick ${displayName} from VIP Group?` : `Unban ${displayName}?`}
        message={
          isKick
            ? `This will ban and remove Telegram user ${displayName} (ID: ${telegramUserId}) from the VIP Telegram group immediately.`
            : `This will lift the Telegram ban for ${displayName} (ID: ${telegramUserId}) so they can rejoin when eligible.`
        }
        confirmLabel={isKick ? 'Kick & Ban' : 'Unban Member'}
        danger={isKick}
        busy={busy}
        onCancel={() => setModalOpen(false)}
        onConfirm={() => void handleConfirm()}
      />
    </>
  );
}
