import { resolveBranding } from '../../lib/branding';

// The sign-in / sign-up chrome — deliberately not the app shell (Sidebar/
// Topbar): an anonymous visitor has nothing to navigate to yet. Branding
// still resolves through the normal chain so a returning "switch account"
// visit (still holding a valid session cookie) sees their own tenant's
// colours here too, not just the platform default.
export default async function AuthLayout({ children }: { children: React.ReactNode }) {
  const branding = await resolveBranding();
  const initial = branding.productName.charAt(0).toUpperCase();

  return (
    <div className="auth-shell">
      <div className="auth-brand">
        <div className="auth-brand-top">
          <div className="auth-brand-mark">{initial}</div>
          <div className="auth-brand-name">{branding.productName}</div>
        </div>
        <div className="auth-brand-mid">
          <h1>Run finance the way an accountant would sign off on.</h1>
          <p>Multi-tenant, audit-clean, and built on a balanced double-entry ledger from day one.</p>
          <div className="auth-feature-list">
            <div className="auth-feature"><span className="dot">✓</span> Exact-penny money — never a floating-point cent</div>
            <div className="auth-feature"><span className="dot">✓</span> Every posting balanced, every change audited</div>
            <div className="auth-feature"><span className="dot">✓</span> Bank-grade tenant isolation, proven by tests</div>
          </div>
        </div>
        <div className="auth-brand-bottom">© {new Date().getFullYear()} {branding.productName}</div>
      </div>
      <div className="auth-form-panel">
        <div className="auth-card">
          <div className="auth-mobile-brand">
            <div className="auth-brand-mark" style={{ background: 'var(--primary-wash)', color: 'var(--primary)' }}>{initial}</div>
            <div style={{ fontWeight: 600 }}>{branding.productName}</div>
          </div>
          {children}
        </div>
      </div>
    </div>
  );
}
