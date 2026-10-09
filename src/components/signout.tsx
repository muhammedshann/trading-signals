'use client';

import { useState } from 'react';
import { createClient } from '@/lib/supabase/browser';
import { ConfirmationModal } from '@/components/confirmation-modal';

export function SignOut() {
  const [open, setOpen] = useState(false), [busy, setBusy] = useState(false);
  async function signOut() {
    setBusy(true);
    const db = createClient();
    if (db) await db.auth.signOut();
    location.href = '/';
  }
  return <><button className="button button-outline" onClick={() => setOpen(true)}>Sign out</button><ConfirmationModal open={open} title="Sign out of Signalroom?" message="You can sign back in at any time with your account." confirmLabel="Sign out" busy={busy} onCancel={() => setOpen(false)} onConfirm={signOut}/></>;
}
