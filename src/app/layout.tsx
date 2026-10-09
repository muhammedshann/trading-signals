import type { Metadata } from 'next';
import './globals.css';
import './signalroom-theme.css';
import './signalroom-dark.css';
import { SiteHeader, SiteFooter } from '@/components/site-shell';
import { createClient } from '@/lib/supabase/server';
export const metadata: Metadata = { title: 'Signalroom — Trade with a clearer process', description: 'A research-led trading community built around disciplined setups, risk management and transparent education.' };
export default async function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  const db = await createClient();
  const { data: { user } } = db ? await db.auth.getUser() : { data: { user: null } };
  const signedIn = Boolean(user);
  return <html lang="en"><body><SiteHeader signedIn={signedIn}/>{children}<SiteFooter signedIn={signedIn}/></body></html>;
}
