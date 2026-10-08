'use client';

import { useEffect, useState } from 'react';
import { createClient } from '@/lib/supabase/browser';

type Step = 'details' | 'otp' | 'link';

export function AuthForm({ mode }: { mode: 'login' | 'signup' }) {
  const [step, setStep] = useState<Step>('details');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [otp, setOtp] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');

  useEffect(() => {
    const query = new URLSearchParams(location.search);
    if (query.get('verified') === '1') {
      setEmail(query.get('email') || '');
      setStep('link');
      setMessage(mode === 'signup' ? 'Email verified. Set a password to finish creating your account.' : 'Email verified. Enter your password to sign in.');
    } else if (query.get('error') === 'link_expired') {
      setError('That email link has expired. Request a new code.');
    }
  }, [mode]);

  async function requestCode(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError('');
    setMessage('');
    try {
      if (mode === 'signup' && password !== confirmPassword) throw new Error('Passwords do not match.');
      const response = await fetch('/api/auth/otp/request', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, purpose: mode, fullName: name }),
      });
      const result = await response.json() as { error?: string };
      if (!response.ok) throw new Error(result.error || 'Could not send the code.');
      setStep('otp');
      setMessage(`We sent a code to ${email}. Use it here, or open the link in the email on this device.`);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not send the code.');
    } finally {
      setBusy(false);
    }
  }

  async function finishLogin() {
    const db = createClient();
    if (!db) throw new Error('Check NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY in .env.local.');
    const { error: authError } = await db.auth.signInWithPassword({ email, password });
    if (authError) throw authError;
    location.href = '/dashboard';
  }

  async function verifyCode(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError('');
    try {
      const response = await fetch('/api/auth/otp/verify', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, purpose: mode, code: otp, password }),
      });
      const result = await response.json() as { error?: string };
      if (!response.ok) throw new Error(result.error || 'That code could not be verified.');
      if (mode === 'signup') {
        await finishLogin();
      } else {
        await finishLogin();
      }
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'That code could not be verified.');
    } finally {
      setBusy(false);
    }
  }

  async function completeVerifiedLink(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError('');
    try {
      if (mode === 'signup') {
        if (password !== confirmPassword) throw new Error('Passwords do not match.');
        const response = await fetch('/api/auth/otp/complete-signup', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email, password, confirmPassword }),
        });
        const result = await response.json() as { error?: string };
        if (!response.ok) throw new Error(result.error || 'Could not finish account creation.');
      }
      await finishLogin();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not finish signing in.');
    } finally {
      setBusy(false);
    }
  }

  async function resendCode() {
    setBusy(true);
    setError('');
    setMessage('');
    try {
      const response = await fetch('/api/auth/otp/request', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, purpose: mode, fullName: name }),
      });
      const result = await response.json() as { error?: string };
      if (!response.ok) throw new Error(result.error || 'Could not send another code.');
      setMessage(`A new code was sent to ${email}.`);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not resend the code.');
    } finally {
      setBusy(false);
    }
  }

  if (step === 'otp') {
    return <form className="auth-form" onSubmit={verifyCode}>
      <p className="form-success">{message}</p>
      <label>Email code<input name="otp" inputMode="numeric" autoComplete="one-time-code" pattern="[0-9]{6}" minLength={6} maxLength={6} required value={otp} onChange={event => setOtp(event.target.value)} placeholder="000000" /></label>
      {mode === 'login' && <label>Password<input name="password" type="password" autoComplete="current-password" required value={password} onChange={event => setPassword(event.target.value)} placeholder="Your password" /></label>}
      {error && <p className="form-error">{error}</p>}
      <button className="button button-dark auth-submit" disabled={busy}>{busy ? 'Verifying…' : 'Verify and continue'}</button>
      <button type="button" className="text-link auth-resend" disabled={busy} onClick={resendCode}>Send a new code</button>
      <button type="button" className="auth-change-email" disabled={busy} onClick={() => { setStep('details'); setOtp(''); setError(''); setMessage(''); }}>Use a different email</button>
    </form>;
  }

  if (step === 'link') {
    return <form className="auth-form" onSubmit={completeVerifiedLink}>
      <p className="form-success">{message}</p>
      <label>Password<input name="password" type="password" minLength={8} required autoComplete={mode === 'signup' ? 'new-password' : 'current-password'} value={password} onChange={event => setPassword(event.target.value)} placeholder={mode === 'signup' ? 'At least 8 characters' : 'Your password'} /></label>
      {mode === 'signup' && <label>Confirm password<input name="confirmPassword" type="password" minLength={8} required autoComplete="new-password" value={confirmPassword} onChange={event => setConfirmPassword(event.target.value)} placeholder="Enter your password again" /></label>}
      {error && <p className="form-error">{error}</p>}
      <button className="button button-dark auth-submit" disabled={busy}>{busy ? 'Finishing…' : mode === 'signup' ? 'Create account' : 'Sign in'}</button>
    </form>;
  }

  return <form className="auth-form" onSubmit={requestCode}>
    {mode === 'signup' && <label>Full name<input name="name" autoComplete="name" required minLength={2} value={name} onChange={event => setName(event.target.value)} placeholder="Your name" /></label>}
    <label>Email address<input name="email" type="email" required autoComplete="email" value={email} onChange={event => setEmail(event.target.value)} placeholder="you@example.com" /></label>
    {mode === 'signup' && <>
      <label>Password<input name="password" type="password" minLength={8} required autoComplete="new-password" value={password} onChange={event => setPassword(event.target.value)} placeholder="At least 8 characters" /></label>
      <label>Confirm password<input name="confirmPassword" type="password" minLength={8} required autoComplete="new-password" value={confirmPassword} onChange={event => setConfirmPassword(event.target.value)} placeholder="Enter your password again" /></label>
    </>}
    {error && <p className="form-error">{error}</p>}
    {message && <p className="form-success">{message}</p>}
    <button className="button button-dark auth-submit" disabled={busy}>{busy ? 'Please wait…' : mode === 'login' ? 'Email me a sign-in code' : 'Create account and send code'}</button>
  </form>;
}
