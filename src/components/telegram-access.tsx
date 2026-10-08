'use client';

import { useEffect, useState } from 'react';
import { ArrowUpRight, RefreshCw } from 'lucide-react';

export function TelegramAccess() {
  const [connected, setConnected] = useState(false);
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
      if (result.connected) setConnected(true);
      else setConnectUrl(result.connectUrl);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not connect Telegram.');
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
      <button className="button button-dark" onClick={connect} disabled={busy}>
        {busy ? 'Preparing…' : 'Connect my Telegram'} <ArrowUpRight size={15}/>
      </button>
      {connectUrl && <div className="form-success">
        <p>Open the bot and press <strong>Start</strong>. Then return here and check your connection.</p>
        <a className="button button-dark" href={connectUrl} target="_blank" rel="noreferrer">Open Telegram bot <ArrowUpRight size={15}/></a>
        <button className="button button-light" onClick={refreshStatus} disabled={busy}><RefreshCw size={15}/> I pressed Start — check</button>
      </div>}
    </> : <>
      <p className="form-success">Telegram account connected.</p>
      <button className="button button-dark" onClick={createInvite} disabled={busy}>
        {busy ? 'Creating invite…' : inviteUrl ? 'Create another invite' : 'Get private Telegram invite'} <ArrowUpRight size={15}/>
      </button>
      {inviteUrl && <p className="form-success"><a href={inviteUrl} target="_blank" rel="noreferrer">Open your private invite</a> · expires in 15 minutes</p>}
    </>}
    {error && <p className="form-error">{error}</p>}
  </div>;
}
