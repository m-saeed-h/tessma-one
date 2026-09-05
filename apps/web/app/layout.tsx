import { cookies } from 'next/headers';
import { IBM_Plex_Sans, IBM_Plex_Mono } from 'next/font/google';
import './globals.css';
import { darken, tint } from '../lib/color';
import { AppShell, Main, NavItem, NavSection, Sidebar, Topbar, Work } from '../components/shell';

const plexSans = IBM_Plex_Sans({ subsets: ['latin'], weight: ['400', '500', '600', '700'], variable: '--font-plex-sans' });
const plexMono = IBM_Plex_Mono({ subsets: ['latin'], weight: ['400', '500'], variable: '--font-plex-mono' });

// A separate, non-NEXT_PUBLIC_ env var: this runs on the Next.js SERVER
// (inside the container on the compose network), not the browser, so it
// needs the compose service name (`api`), not the host-published port that
// NEXT_PUBLIC_API_URL resolves to for browser-side calls. See docker-compose.yml.
const API_BASE = process.env.API_INTERNAL_URL || process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000';

// Charter §7.8, rule 1 for module developers: "Never hard-code the product
// name, a logo, a colour, a support URL or a sender address. Resolve all of
// them through the branding service." This is the platform-default rung of
// the resolution chain (tenant override -> partner theme -> platform
// default) — it intentionally matches api/src/core/branding/branding.service.ts's
// PLATFORM_DEFAULT, since there is no shared package between web and api in
// this scaffold yet, and is what renders before login / if the call fails.
const PLATFORM_DEFAULT = {
  productName: 'Tessma One',
  primaryColor: '#175E7A',
  accentColor: '#B4832A',
  logoUrl: null as string | null,
};

async function fetchFromApi(path: string, token: string | undefined) {
  if (!token) return null;
  try {
    // Server-to-server fetch (Next's server, not the browser) — not subject
    // to the API's CORS policy, so the auth cookie is forwarded directly.
    const res = await fetch(`${API_BASE}${path}`, { headers: { cookie: `tsm_at=${token}` }, cache: 'no-store' });
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  }
}

async function resolveBranding(token: string | undefined) {
  return (await fetchFromApi('/branding', token)) ?? PLATFORM_DEFAULT;
}

async function resolveMe(token: string | undefined) {
  return await fetchFromApi('/auth/me', token) as { email: string; displayName: string; tenantName: string } | null;
}

export async function generateMetadata() {
  const token = cookies().get('tsm_at')?.value;
  const branding = await resolveBranding(token);
  return { title: `${branding.productName} · Finance` };
}

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const token = cookies().get('tsm_at')?.value;
  const [branding, me] = await Promise.all([resolveBranding(token), resolveMe(token)]);

  // Design system rule: white-label swaps --primary/--accent only. Everything
  // else (--primary-ink, --primary-wash, --accent-wash) is derived from those
  // two here, at render time, rather than being four more stored fields.
  const themeStyle = {
    '--primary': branding.primaryColor,
    '--primary-ink': darken(branding.primaryColor, 0.25),
    '--primary-wash': tint(branding.primaryColor, 0.9),
    '--accent': branding.accentColor,
    '--accent-wash': tint(branding.accentColor, 0.9),
  } as React.CSSProperties;

  const initials = me
    ? me.displayName.split(' ').map((p) => p[0]).slice(0, 2).join('').toUpperCase()
    : '—';

  return (
    <html lang="en" style={themeStyle} className={`${plexSans.variable} ${plexMono.variable}`}>
      <body>
        <AppShell>
          <Sidebar productName={branding.productName} logoUrl={branding.logoUrl}>
            <NavItem href="/">Dashboard</NavItem>
            <NavSection>Finance</NavSection>
            <NavItem href="/invoices">Invoices</NavItem>
            <NavItem href="/customers">Customers</NavItem>
            <NavItem href="/suppliers">Suppliers</NavItem>
            <NavItem href="/products">Products</NavItem>
            <NavItem href="/settings">Finance settings</NavItem>
            <NavItem locked>Bills &amp; expenses</NavItem>
            <NavItem locked>Banking</NavItem>
            <NavItem locked>VAT</NavItem>
            <NavItem href="/notifications">Notifications</NavItem>
            <NavSection>Platform</NavSection>
            <NavItem locked>CRM</NavItem>
            <NavItem locked>Projects</NavItem>
            <NavItem href="/login">{me ? 'Switch account' : 'Login'}</NavItem>
          </Sidebar>
          <Main>
            <Topbar tenantName={me?.tenantName ?? branding.productName} avatarInitials={initials} />
            <Work>{children}</Work>
          </Main>
        </AppShell>
      </body>
    </html>
  );
}
