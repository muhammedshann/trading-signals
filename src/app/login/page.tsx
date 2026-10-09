import Link from 'next/link';
import { redirect } from 'next/navigation';
import { AuthForm } from '@/components/auth-form';
import { createClient } from '@/lib/supabase/server';

export default async function Login({ searchParams }: { searchParams: Promise<{ setup?: string }> }) {
  const db = await createClient();
  if (db) {
    const { data: { user } } = await db.auth.getUser();
    if (user) redirect('/dashboard');
  }
  const { setup } = await searchParams;
  return <main className="auth-page wrap"><div className="auth-side"><div className="eyebrow">MEMBER ACCESS</div><h1>Good to see<br/><em>you again.</em></h1><p>Sign in with your password, then verify the one-time code sent to your email.</p><div className="auth-assurance">◇ &nbsp;A calmer place to follow the markets.</div></div><div className="auth-card"><h2>Sign in</h2><p>Enter your email and password. We’ll email a code to verify it’s you.</p>{setup&&<div className="setup-alert">Connect Supabase using the environment variables in <code>.env.example</code> to enable accounts.</div>}<AuthForm mode="login"/><div className="auth-switch">New to Signalroom? <Link href="/signup">Create an account</Link></div></div></main>;
}
