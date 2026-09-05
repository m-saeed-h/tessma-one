// The app chrome — one Sidebar/Topbar for every screen, per Charter §8's
// "one visual language enforced by shared components." Rendered once in
// layout.tsx; pages only ever render into <main class="work">.
'use client';
import type { ReactNode } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { api } from '../lib/api';

export function AppShell({ children }: { children: ReactNode }) {
  return <div className="app">{children}</div>;
}

export function Sidebar({ productName, logoUrl, children }: { productName: string; logoUrl: string | null; children: ReactNode }) {
  return (
    <aside className="sidebar">
      <div className="brand">
        {logoUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={logoUrl} alt="" className="brand-mark" style={{ objectFit: 'cover' }} />
        ) : (
          <div className="brand-mark">{productName.charAt(0)}</div>
        )}
        <div className="brand-name">{productName}</div>
      </div>
      {children}
    </aside>
  );
}

export function NavSection({ children }: { children: ReactNode }) {
  return <div className="nav-section">{children}</div>;
}

export function NavItem({ href, locked, children }: { href?: string; locked?: boolean; children: ReactNode }) {
  const pathname = usePathname();
  const active = !!href && (href === '/' ? pathname === '/' : pathname.startsWith(href));
  const className = `nav-item ${active ? 'active' : ''} ${locked ? 'locked' : ''}`;
  if (locked || !href) {
    return (
      <span className={className}>
        <span className="dot" />
        {children}
        {locked && <span className="tag">soon</span>}
      </span>
    );
  }
  return (
    <Link href={href} className={className}>
      <span className="dot" />
      {children}
    </Link>
  );
}

export function Main({ children }: { children: ReactNode }) {
  return <div className="main">{children}</div>;
}

export function Topbar({ tenantName, avatarInitials, children }: { tenantName: string; avatarInitials: string; children?: ReactNode }) {
  const router = useRouter();

  async function logout() {
    try { await api('/auth/logout', { method: 'POST' }); } catch { /* clearing cookies server-side is best-effort; navigating away is what actually matters */ }
    router.push('/login');
    router.refresh();
  }

  return (
    <div className="topbar">
      <div className="search">Search invoices, customers, references…</div>
      {children}
      <div className="tenant-pill"><span className="swatch" />{tenantName}</div>
      <div className="avatar">{avatarInitials}</div>
      <button type="button" className="topbar-logout" onClick={logout}>Log out</button>
    </div>
  );
}

export function Work({ children }: { children: ReactNode }) {
  return <main className="work">{children}</main>;
}

export function PageHead({ title, subtitle, children }: { title: string; subtitle?: string; children?: ReactNode }) {
  return (
    <div className="page-head">
      <h1>{title}</h1>
      {subtitle && <span className="sub">{subtitle}</span>}
      {children && <div style={{ marginLeft: 'auto', display: 'flex', gap: 10 }}>{children}</div>}
    </div>
  );
}
