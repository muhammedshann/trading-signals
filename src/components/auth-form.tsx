'use client';

import { useEffect, useState } from 'react';
import { Eye, EyeOff } from 'lucide-react';
import { createClient } from '@/lib/supabase/browser';

type Step = 'details' | 'otp' | 'link' | 'reset-otp';
type AuthMode = 'login' | 'signup';

function PasswordField({ label, name, value, onChange, placeholder, autoComplete, minLength = 8 }: {
  label: string; name: string; value: string; onChange: (value: string) => void;
  placeholder: string; autoComplete: string; minLength?: number;
}) {
  const [visible, setVisible] = useState(false);
  return <label>{label}<span className="password-field">
    <input name={name} type={visible ? 'text' : 'password'} minLength={minLength} required autoComplete={autoComplete} value={value} onChange={event => onChange(event.target.value)} placeholder={placeholder} />
    <button className="password-toggle" type="button" onClick={() => setVisible(value => !value)} aria-label={visible ? 'Hide password' : 'Show password'} aria-pressed={visible}>
      {visible ? <EyeOff size={16} aria-hidden="true" /> : <Eye size={16} aria-hidden="true" />}
    </button>
  </span></label>;
}

export function AuthForm({ mode }: { mode: AuthMode }) {
  const [step, setStep] = useState<Step>('details');
  const [resetting, setResetting] = useState(false);
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [otp, setOtp] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');

  const purpose = resetting ? 'reset' : mode;

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
        body: JSON.stringify({ email, purpose, fullName: name }),
      });
      const result = await response.json() as { error?: string };
      if (!response.ok) throw new Error(result.error || 'Could not send the code. Please try again.');
      setStep(resetting ? 'reset-otp' : 'otp');
      setMessage(resetting
        ? `If an account exists for ${email}, a password reset code has been sent.`
        : `We sent a code to ${email}. Enter it here, or open the verification link in your email.`);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not send the code. Please try again.');
    } finally {
      setBusy(false);
    }
  }

  async function finishLogin() {
    const db = createClient();
    if (!db) throw new Error('Check NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY in .env.local.');
    const { error: authError } = await db.auth.signInWithPassword({ email, password });
    if (authError) throw new Error(authError.message || 'Could not sign in. Check your email and password.');
    location.href = '/dashboard';
  }

  async function verifyCode(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError('');
    setMessage('');
    try {
      if (resetting && password !== confirmPassword) throw new Error('Passwords do not match.');
      const response = await fetch('/api/auth/otp/verify', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, purpose, code: otp, password, confirmPassword }),
      });
      const result = await response.json() as { error?: string };
      if (!response.ok) throw new Error(result.error || 'That code could not be verified. Request a new one and try again.');
      if (resetting) setMessage('Password updated. Signing you in…');
      await finishLogin();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'That code could not be verified. Request a new one and try again.');
    } finally {
      setBusy(false);
    }
  }

  async function completeVerifiedLink(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError('');
    setMessage('');
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
        body: JSON.stringify({ email, purpose, fullName: name }),
      });
      const result = await response.json() as { error?: string };
      if (!response.ok) throw new Error(result.error || 'Could not send another code. Please try again.');
      setMessage(resetting ? `If an account exists for ${email}, a new reset code has been sent.` : `A new code was sent to ${email}.`);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not resend the code. Please try again.');
    } finally {
      setBusy(false);
    }
  }

  function backToLogin() {
    setResetting(false);
    setStep('details');
    setOtp('');
    setPassword('');
    setConfirmPassword('');
    setError('');
    setMessage('');
  }

  if (step === 'reset-otp') {
    return <form className="auth-form" onSubmit={verifyCode}>
      {message && <p className="form-success" role="status" aria-live="polite">{message}</p>}
      <label>Email code<input name="otp" inputMode="numeric" autoComplete="one-time-code" pattern="[0-9]{6}" minLength={6} maxLength={6} required value={otp} onChange={event => setOtp(event.target.value.replace(/\D/g, '').slice(0, 6))} placeholder="000000" /></label>
      <PasswordField label="New password" name="password" value={password} onChange={setPassword} placeholder="At least 8 characters" autoComplete="new-password" />
      <PasswordField label="Confirm new password" name="confirmPassword" value={confirmPassword} onChange={setConfirmPassword} placeholder="Enter your new password again" autoComplete="new-password" />
      {error && <p className="form-error" role="alert" aria-live="assertive">{error}</p>}
      <button className="button button-dark auth-submit" disabled={busy}>{busy ? 'Updating password…' : 'Verify code and reset password'}</button>
      <button type="button" className="text-link auth-resend" disabled={busy} onClick={resendCode}>Send a new code</button>
      <button type="button" className="auth-change-email" disabled={busy} onClick={backToLogin}>Back to sign in</button>
    </form>;
  }

  if (step === 'otp') {
    return <form className="auth-form" onSubmit={verifyCode}>
      {message && <p className="form-success" role="status" aria-live="polite">{message}</p>}
      <label>Email code<input name="otp" inputMode="numeric" autoComplete="one-time-code" pattern="[0-9]{6}" minLength={6} maxLength={6} required value={otp} onChange={event => setOtp(event.target.value.replace(/\D/g, '').slice(0, 6))} placeholder="000000" /></label>
      {mode === 'login' && <PasswordField label="Password" name="password" value={password} onChange={setPassword} placeholder="Your password" autoComplete="current-password" />}
      {error && <p className="form-error" role="alert" aria-live="assertive">{error}</p>}
      <button className="button button-dark auth-submit" disabled={busy}>{busy ? 'Verifying…' : 'Verify and continue'}</button>
      <button type="button" className="text-link auth-resend" disabled={busy} onClick={resendCode}>Send a new code</button>
      <button type="button" className="auth-change-email" disabled={busy} onClick={backToLogin}>Use a different email</button>
    </form>;
  }

  if (step === 'link') {
    return <form className="auth-form" onSubmit={completeVerifiedLink}>
      {message && <p className="form-success" role="status" aria-live="polite">{message}</p>}
      <PasswordField label="Password" name="password" value={password} onChange={setPassword} placeholder={mode === 'signup' ? 'At least 8 characters' : 'Your password'} autoComplete={mode === 'signup' ? 'new-password' : 'current-password'} />
      {mode === 'signup' && <PasswordField label="Confirm password" name="confirmPassword" value={confirmPassword} onChange={setConfirmPassword} placeholder="Enter your password again" autoComplete="new-password" />}
      {error && <p className="form-error" role="alert" aria-live="assertive">{error}</p>}
      <button className="button button-dark auth-submit" disabled={busy}>{busy ? 'Finishing…' : mode === 'signup' ? 'Create account' : 'Sign in'}</button>
    </form>;
  }

  if (resetting) {
    return <form className="auth-form" onSubmit={requestCode}>
      <label>Email address<input name="email" type="email" required autoComplete="email" value={email} onChange={event => setEmail(event.target.value)} placeholder="you@example.com" /></label>
      {error && <p className="form-error" role="alert" aria-live="assertive">{error}</p>}
      {message && <p className="form-success" role="status" aria-live="polite">{message}</p>}
      <button className="button button-dark auth-submit" disabled={busy}>{busy ? 'Sending code…' : 'Send password reset code'}</button>
      <button type="button" className="auth-change-email" disabled={busy} onClick={backToLogin}>Back to sign in</button>
    </form>;
  }

  return <form className="auth-form" onSubmit={requestCode}>
    {mode === 'signup' && <label>Full name<input name="name" autoComplete="name" required minLength={2} value={name} onChange={event => setName(event.target.value)} placeholder="Your name" /></label>}
    <label>Email address<input name="email" type="email" required autoComplete="email" value={email} onChange={event => setEmail(event.target.value)} placeholder="you@example.com" /></label>
    {mode === 'signup' && <>
      <PasswordField label="Password" name="password" value={password} onChange={setPassword} placeholder="At least 8 characters" autoComplete="new-password" />
      <PasswordField label="Confirm password" name="confirmPassword" value={confirmPassword} onChange={setConfirmPassword} placeholder="Enter your password again" autoComplete="new-password" />
    </>}
    {error && <p className="form-error" role="alert" aria-live="assertive">{error}</p>}
    {message && <p className="form-success" role="status" aria-live="polite">{message}</p>}
    <button className="button button-dark auth-submit" disabled={busy}>{busy ? 'Please wait…' : mode === 'login' ? 'Email me a sign-in code' : 'Create account and send code'}</button>
    {mode === 'login' && <button type="button" className="text-link auth-resend" disabled={busy} onClick={() => { setResetting(true); setError(''); setMessage(''); }}>Forgot password?</button>}
  </form>;
}
