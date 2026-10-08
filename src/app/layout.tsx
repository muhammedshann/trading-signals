import type { Metadata } from 'next';
import './globals.css';
import { SiteHeader, SiteFooter } from '@/components/site-shell';
export const metadata: Metadata = { title: 'Signalroom — Trade with a clearer process', description: 'A research-led trading community built around disciplined setups, risk management and transparent education.' };
export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) { return <html lang="en"><body><SiteHeader />{children}<SiteFooter /></body></html>; }
