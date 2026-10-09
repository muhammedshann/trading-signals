import Link from 'next/link';
import { redirect } from 'next/navigation';
import { AuthForm } from '@/components/auth-form';
import { createClient } from '@/lib/supabase/server';

export default async function Signup() {
  const db = await createClient();
  if (db) {
    const { data: { user } } = await db.auth.getUser();
    if (user) redirect('/dashboard');
  }
  return <main className="auth-page wrap"><div className="auth-side"><div className="eyebrow">JOIN SIGNALROOM</div><h1>Build your<br/><em>own process.</em></h1><p>Create your account and verify your email with a one-time code before choosing a membership.</p><div className="auth-assurance">◇ &nbsp;Secure checkout · Clear membership terms</div></div><div className="auth-card"><h2>Create account</h2><p>Use your name and email to get started.</p><AuthForm mode="signup"/><div className="auth-switch">Already a member? <Link href="/login">Sign in</Link></div><small className="terms-consent">By creating an account, you agree to our <Link href="/terms">Terms</Link> and <Link href="/privacy">Privacy Policy</Link>.</small></div></main>;
}
