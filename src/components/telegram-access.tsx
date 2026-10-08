'use client';

import { useEffect, useState } from 'react';
import { ArrowUpRight, RefreshCw } from 'lucide-react';

type TelegramIdentity = { telegramUserId: string; username: string | null; displayName: string | null };

export function TelegramAccess() {
  const [connected, setConnected] = useState(false);
  const [identity, setIdentity] = useState<TelegramIdentity | null>(null);
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [connectUrl, setConnectUrl] = useState('');
  const [inviteUrl, setInviteUrl] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  async function refreshStatus() {
    setBusy(true);
    setError('');
    try {
      const response = await fetch('/api/telegram/connect');
      const result = await response.json();
      if (!response.ok) throw new Error(result.error);
      setConnected(Boolean(result.connected));
      setIdentity(result.identity ?? result.pending ?? null);
      setPendingId(result.pending?.id ?? null);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not check Telegram connection.');
    } finally {
      setBusy(false);
    }
  }

  useEffect(() => { void refreshStatus(); }, []);

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

  return <div>
    {!connected ? <>
      {pendingId && identity ? <div className="form-success">
        <p>The Telegram account that responded is <strong>{identity.displayName || 'Telegram user'}</strong>{identity.username ? ` (@${identity.username})` : ''} · ID ending <strong>{identity.telegramUserId.slice(-4)}</strong>.</p>
        <p>No group access is granted until you confirm this identity here.</p>
        <button className="button button-dark" onClick={confirmTelegram} disabled={busy}>{busy ? 'Confirming…' : 'Confirm this is my Telegram account'}</button>
        <button className="button button-light" onClick={connect} disabled={busy}>Wrong account? Create a fresh link</button>
      </div> : <>
        <button className="button button-dark" onClick={connect} disabled={busy}>
          {busy ? 'Preparing…' : 'Connect my Telegram'} <ArrowUpRight size={15}/>
        </button>
        {connectUrl && <div className="form-success">
          <p>Open the bot and press <strong>Start</strong>. The bot will reply with the account it received. Return here to review that identity and confirm it; only then can you request group access.</p>
          <a className="button button-dark" href={connectUrl} target="_blank" rel="noreferrer">Open Telegram bot <ArrowUpRight size={15}/></a>
          <button className="button button-light" onClick={refreshStatus} disabled={busy}><RefreshCw size={15}/> I pressed Start — check identity</button>
        </div>}
      </>}
    </> : <>
      <p className="form-success">Telegram account connected{identity ? `: ${identity.displayName || 'Telegram user'}${identity.username ? ` (@${identity.username})` : ''}` : ''}.</p>
      <button className="button button-dark" onClick={createInvite} disabled={busy}>
        {busy ? 'Creating invite…' : inviteUrl ? 'Create another invite' : 'Get private Telegram invite'} <ArrowUpRight size={15}/>
      </button>
      {inviteUrl && <p className="form-success"><a href={inviteUrl} target="_blank" rel="noreferrer">Open your private invite</a> · expires in 15 minutes</p>}
    </>}
    {error && <p className="form-error">{error}</p>}
  </div>;
}
