'use client';

import { useEffect, useRef, useState } from 'react';
import { ArrowUpRight, CheckCircle2, RefreshCw } from 'lucide-react';

type TelegramIdentity = { telegramUserId: string; username: string | null; displayName: string | null };

export function TelegramAccess() {
  const [connected, setConnected] = useState(false);
  const [identity, setIdentity] = useState<TelegramIdentity | null>(null);
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [connectUrl, setConnectUrl] = useState('');
  const [inviteUrl, setInviteUrl] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const pollTimerRef = useRef<NodeJS.Timeout | null>(null);

  async function refreshStatus(silent = false) {
    if (!silent) setBusy(true);
    setError('');
    try {
      const response = await fetch('/api/telegram/connect');
      const result = await response.json();
      if (!response.ok) throw new Error(result.error);
      const isConn = Boolean(result.connected);
      setConnected(isConn);
      setIdentity(result.identity ?? result.pending ?? null);
      setPendingId(result.pending?.id ?? null);
      if (isConn) {
        setConnectUrl('');
      }
    } catch (cause) {
      if (!silent) {
        setError(cause instanceof Error ? cause.message : 'Could not check Telegram connection.');
      }
    } finally {
      if (!silent) setBusy(false);
    }
  }

  useEffect(() => {
    void refreshStatus();
  }, []);

  // Auto-poll status while waiting for bot verification
  useEffect(() => {
    if (connectUrl && !connected) {
      pollTimerRef.current = setInterval(() => {
        void refreshStatus(true);
      }, 3000);
    } else if (pollTimerRef.current) {
      clearInterval(pollTimerRef.current);
      pollTimerRef.current = null;
    }

    return () => {
      if (pollTimerRef.current) {
        clearInterval(pollTimerRef.current);
        pollTimerRef.current = null;
      }
    };
  }, [connectUrl, connected]);

  async function connect() {
    setBusy(true);
    setError('');
    try {
      const response = await fetch('/api/telegram/connect', { method: 'POST' });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error);
      if (result.connected) {
        setConnected(true);
        setIdentity(result.identity ?? null);
        setPendingId(null);
        setConnectUrl('');
      } else {
        setConnected(false);
        setIdentity(null);
        setPendingId(null);
        setConnectUrl(result.connectUrl);
      }
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not connect Telegram.');
    } finally {
      setBusy(false);
    }
  }

  async function confirmTelegram() {
    if (!pendingId) return;
    setBusy(true);
    setError('');
    try {
      const response = await fetch('/api/telegram/connect/confirm', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ codeId: pendingId }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error);
      setConnected(true);
      setIdentity(result.identity ?? identity);
      setPendingId(null);
      setConnectUrl('');
      const inviteResponse = await fetch('/api/telegram/invite', { method: 'POST' });
      const invite = await inviteResponse.json();
      if (!inviteResponse.ok) throw new Error(invite.error || 'Telegram is linked, but we could not create the group request yet.');
      setInviteUrl(invite.inviteUrl);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not confirm Telegram.');
    } finally {
      setBusy(false);
    }
  }

  async function createInvite() {
    setBusy(true);
    setError('');
    try {
      const response = await fetch('/api/telegram/invite', { method: 'POST' });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error);
      setInviteUrl(result.inviteUrl);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Invite unavailable.');
    } finally {
      setBusy(false);
    }
  }

  return <div className="telegram-access-wrap">
    {!connected ? <>
      {pendingId && identity ? <div className="telegram-pending-card">
        <p>Telegram account detected: <strong>{identity.displayName || 'Telegram user'}</strong>{identity.username ? ` (@${identity.username})` : ''} · ID ending <strong>{identity.telegramUserId.slice(-4)}</strong>.</p>
        <p>Please tap <strong>&ldquo;Yes, Verify &amp; Join Group&rdquo;</strong> in the Telegram bot to finish verification and enter the group.</p>
        <div className="telegram-steps-actions">
          <button className="button button-dark" onClick={confirmTelegram} disabled={busy}>{busy ? 'Confirming…' : 'Confirm on website instead'}</button>
          <button className="button button-light" onClick={connect} disabled={busy}>Create a fresh link</button>
        </div>
      </div> : <>
        <button className="button button-dark" onClick={connect} disabled={busy}>
          {busy ? 'Preparing…' : 'Connect my Telegram'} <ArrowUpRight size={15}/>
        </button>
        {connectUrl && <div className="telegram-steps-card">
          <p><strong>Next steps to join:</strong></p>
          <ol className="telegram-steps-list">
            <li>Tap <strong>Open Telegram bot</strong> below.</li>
            <li>In Telegram, press <strong>Start</strong>.</li>
            <li>When the bot asks <em>&ldquo;Is this the Telegram account you want to verify?&rdquo;</em>, tap <strong>&ldquo;Yes, Verify &amp; Join Group&rdquo;</strong>.</li>
            <li>The bot verifies you immediately and provides your direct entry link into the VIP group!</li>
          </ol>
          <div className="telegram-steps-actions">
            <a className="button button-dark" href={connectUrl} target="_blank" rel="noreferrer">Open Telegram bot <ArrowUpRight size={15}/></a>
            <button className="button button-light" onClick={() => void refreshStatus(false)} disabled={busy}><RefreshCw size={15}/> Check status</button>
          </div>
          <small>This page will automatically update once verified in Telegram.</small>
        </div>}
      </>}
    </> : <div className="telegram-connected-box">
      <div className="telegram-connected-pill">
        <CheckCircle2 size={16} />
        <span>Telegram connected{identity ? `: ${identity.displayName || 'Telegram user'}${identity.username ? ` (@${identity.username})` : ''}` : ''}</span>
      </div>
      <button className="button button-dark" onClick={createInvite} disabled={busy}>
        {busy ? 'Creating invite…' : inviteUrl ? 'Create another invite' : 'Get private Telegram invite'} <ArrowUpRight size={15}/>
      </button>
      {inviteUrl && <div className="telegram-invite-result"><p>Your private invite link is ready. This link expires in 15 minutes.</p><a className="button button-dark telegram-invite-button" href={inviteUrl} target="_blank" rel="noreferrer">Open Telegram group request <ArrowUpRight size={15}/></a></div>}
    </div>}
    {error && <p className="form-error">{error}</p>}
  </div>;
}
