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
export const PLATFORM_DEFAULT = {
  productName: 'Tessma One',
  primaryColor: '#175E7A',
  accentColor: '#B4832A',
  logoUrl: null as string | null,
};

export interface Me { email: string; displayName: string; tenantName: string }

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

export async function resolveBranding(token?: string) {
  const t = token ?? cookies().get('tsm_at')?.value;
  return (await fetchFromApi('/branding', t)) ?? PLATFORM_DEFAULT;
}

export async function resolveMe(token?: string): Promise<Me | null> {
  const t = token ?? cookies().get('tsm_at')?.value;
  return (await fetchFromApi('/auth/me', t)) as Me | null;
}
