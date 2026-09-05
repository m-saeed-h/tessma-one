const BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000';

// SEC-IAM-03: the access token now lives in an httpOnly cookie set by the API
// — page script never reads or stores it (no more localStorage.setItem('token', ...)).
// The CSRF token, by design, IS readable: it's the "same-origin script can
// read this, a forged cross-site request cannot" half of the double-submit
// pattern (see api/src/core/identity/csrf.guard.ts).
function readCookie(name: string): string | null {
  if (typeof document === 'undefined') return null;
  const match = document.cookie.match(new RegExp('(?:^|; )' + name + '=([^;]*)'));
  return match ? decodeURIComponent(match[1]) : null;
}

// For a plain <a href> (e.g. "Download PDF") — a top-level browser navigation
// carries the httpOnly session cookie automatically and isn't subject to CORS
// the way fetch() is, so this doesn't need the api() wrapper's machinery.
export function apiUrl(path: string): string {
  return `${BASE}${path}`;
}

export interface ApiErrorBody {
  code: string;
  message: string;
  details?: unknown;
}

export class ApiRequestError extends Error {
  constructor(public status: number, public error: ApiErrorBody) {
    super(error.message);
  }
}

export async function api(path: string, opts: RequestInit = {}) {
  const method = (opts.method || 'GET').toUpperCase();
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...((opts.headers as Record<string, string>) || {}),
  };
  if (method !== 'GET' && method !== 'HEAD') {
    const csrf = readCookie('tsm_csrf');
    if (csrf) headers['X-CSRF-Token'] = csrf;
  }

  const res = await fetch(`${BASE}${path}`, {
    ...opts,
    method,
    headers,
    credentials: 'include', // send the httpOnly tsm_at cookie
  });

  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new ApiRequestError(res.status, body.error ?? { code: 'unknown', message: 'Request failed' });
  }
  return body;
}

// A cheap, non-authoritative UI signal only — hiding a nav item is a
// usability behaviour, not access control (Charter §6.4). The server enforces
// the real check on every request regardless of what this returns.
export function hasSessionCookie(): boolean {
  return readCookie('tsm_csrf') !== null;
}
