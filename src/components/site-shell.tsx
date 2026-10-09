'use client';
import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import { Menu, X, ArrowUpRight } from 'lucide-react';
const links = [['About','/about'],['How it works','/how-it-works'],['Membership','/plans'],['FAQ','/faq']];
export function SiteHeader({ signedIn }: { signedIn: boolean }) {
  const [open, setOpen] = useState(false);
  const navRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const dismissOutside = (event: PointerEvent) => { if (navRef.current && !navRef.current.contains(event.target as Node)) setOpen(false); };
    const dismissEscape = (event: KeyboardEvent) => { if (event.key === 'Escape') setOpen(false); };
    document.addEventListener('pointerdown', dismissOutside);
    document.addEventListener('keydown', dismissEscape);
    return () => { document.removeEventListener('pointerdown', dismissOutside); document.removeEventListener('keydown', dismissEscape); };
  }, [open]);
  return <header className="header"><div className="nav wrap" ref={navRef}><Link href="/" className="brand" onClick={()=>setOpen(false)}><span className="brand-mark">S</span><span>signalroom<span className="brand-dot">.</span></span></Link><nav className={open?'nav-links mobile-open':'nav-links'}>{links.map(([label,href])=><Link key={href} href={href} onClick={()=>setOpen(false)}>{label}</Link>)}<Link className="mobile-account" href={signedIn?'/dashboard':'/login'} onClick={()=>setOpen(false)}>{signedIn?'Dashboard':'Sign in'}</Link>{!signedIn&&<Link className="mobile-account" href="/signup" onClick={()=>setOpen(false)}>Create account</Link>}</nav><div className="nav-actions">{signedIn?<Link href="/dashboard" className="button button-dark button-small">Go to dashboard <ArrowUpRight size={15}/></Link>:<><Link href="/login" className="login-link">Sign in</Link><Link href="/signup" className="button button-dark button-small">Create account <ArrowUpRight size={15}/></Link></>}</div><button className="menu-toggle" aria-label={open?'Close navigation':'Open navigation'} aria-expanded={open} onClick={()=>setOpen(!open)}>{open?<X/>:<Menu/>}</button></div></header>;
}
export function SiteFooter({ signedIn }: { signedIn: boolean }) { return <footer className="footer"><div className="wrap"><div className="footer-top"><div><Link href="/" className="brand footer-brand"><span className="brand-mark">S</span><span>signalroom<span className="brand-dot">.</span></span></Link><p>A calmer approach to market education.<br/>Built for process, not promises.</p></div><div className="footer-links"><div><b>Explore</b><Link href="/about">About</Link><Link href="/how-it-works">How it works</Link><Link href="/plans">Membership</Link><Link href="/faq">FAQ</Link></div><div><b>Information</b><Link href="/privacy">Privacy policy</Link><Link href="/terms">Terms & conditions</Link><Link href="/refund-policy">Refund & cancellation</Link><Link href="/risk-disclaimer">Risk disclaimer</Link></div><div><b>Your account</b>{signedIn?<Link href="/dashboard">Dashboard</Link>:<><Link href="/login">Sign in</Link><Link href="/signup">Create account</Link></>}</div></div></div><div className="footer-disclaimer">Trading involves substantial risk. Signals and educational content are not investment advice or a guarantee of results. You are responsible for your own decisions.</div><div className="footer-bottom"><span>© {new Date().getFullYear()} Signalroom. All rights reserved.</span><span>Made for thoughtful market participants.</span></div></div></footer>; }
