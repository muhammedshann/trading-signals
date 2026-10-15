'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  LayoutDashboard,
  UsersRound,
  ShieldCheck,
  CreditCard,
  Layers3,
  Bot,
  ArrowUpRight,
} from 'lucide-react';

const navItems = [
  { href: '/admin', label: 'Dashboard', icon: LayoutDashboard, exact: true },
  { href: '/admin/members', label: 'Members', icon: UsersRound },
  { href: '/admin/subscriptions', label: 'Subscriptions', icon: ShieldCheck },
  { href: '/admin/payments', label: 'Payments', icon: CreditCard },
  { href: '/admin/plans', label: 'Plans', icon: Layers3 },
  { href: '/admin/bot', label: 'Bot Management', icon: Bot },
];

export function AdminNav() {
  const pathname = usePathname();

  return (
    <nav className="admin-nav-bar" aria-label="Admin Sections">
      <div className="admin-nav-links">
        {navItems.map(item => {
          const Icon = item.icon;
          const isActive = item.exact ? pathname === item.href : pathname.startsWith(item.href);
          return (
            <Link
              key={item.href}
              href={item.href}
              className={`admin-nav-item ${isActive ? 'active' : ''}`}
            >
              <Icon size={16} />
              <span>{item.label}</span>
            </Link>
          );
        })}
      </div>
      <div className="admin-nav-extra">
        <Link href="/dashboard" className="admin-nav-view-site">
          Member Dashboard <ArrowUpRight size={13} />
        </Link>
      </div>
    </nav>
  );
}
