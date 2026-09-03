import { cookies } from 'next/headers';

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
  return (
    <html lang="en">
      <body style={{ fontFamily: 'system-ui, sans-serif', maxWidth: 760, margin: '40px auto', padding: '0 16px', color: '#1f2733' }}>
        <h2 style={{ color: branding.primaryColor }}>
          {branding.logoUrl && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={branding.logoUrl} alt="" height={24} style={{ verticalAlign: 'middle', marginRight: 8 }} />
          )}
          {branding.productName} <span style={{ color: '#d8b04a' }}>·</span> Finance
        </h2>
        <nav style={{ display: 'flex', gap: 16, marginBottom: 24, fontSize: 14 }}>
          <a href="/login">Login</a>
          <a href="/customers">Customers</a>
          <a href="/invoices">Invoices</a>
        </nav>
        {children}
      </body>
    </html>
  );
}
