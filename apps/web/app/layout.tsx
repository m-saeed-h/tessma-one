import { cookies } from 'next/headers';
import './globals.css';

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
  primaryColor: '#0f2942',
  logoUrl: null as string | null,
};

async function resolveBranding() {
  const token = cookies().get('tsm_at')?.value;
  if (!token) return PLATFORM_DEFAULT;
  try {
    // Server-to-server fetch (Next's server, not the browser) — not subject
    // to the API's CORS policy, so the auth cookie is forwarded directly.
    const res = await fetch(`${API_BASE}/branding`, {
      headers: { cookie: `tsm_at=${token}` },
      cache: 'no-store',
    });
    if (!res.ok) return PLATFORM_DEFAULT;
    return await res.json();
  } catch {
    return PLATFORM_DEFAULT;
  }
}

export async function generateMetadata() {
  const branding = await resolveBranding();
  return { title: `${branding.productName} · Finance` };
}

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const branding = await resolveBranding();
  // Charter §7.4: "CSS custom properties injected from the resolved theme at
  // runtime" — one variable, set once here, read by every component in
  // components/ui.tsx via var(--brand-primary). No per-partner CSS build.
  const themeStyle = { '--brand-primary': branding.primaryColor } as React.CSSProperties;

  return (
    <html lang="en" style={themeStyle}>
      <body className="mx-auto max-w-4xl px-4 py-10 font-sans text-slate-900">
        <header className="mb-8 flex items-center justify-between">
          <h1 className="flex items-center gap-2 text-xl font-semibold text-[var(--brand-primary)]">
            {branding.logoUrl && (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={branding.logoUrl} alt="" className="h-6" />
            )}
            {branding.productName}
            <span className="text-slate-300">·</span>
            <span className="text-base font-normal text-slate-500">Finance</span>
          </h1>
          <nav className="flex gap-5 text-sm font-medium text-slate-600">
            <a href="/login" className="hover:text-[var(--brand-primary)]">Login</a>
            <a href="/customers" className="hover:text-[var(--brand-primary)]">Customers</a>
            <a href="/invoices" className="hover:text-[var(--brand-primary)]">Invoices</a>
            <a href="/notifications" className="hover:text-[var(--brand-primary)]">Notifications</a>
          </nav>
        </header>
        {children}
      </body>
    </html>
  );
}
