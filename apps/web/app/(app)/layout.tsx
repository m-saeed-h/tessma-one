import { redirect } from 'next/navigation';
import { resolveBranding, resolveMe } from '../../lib/branding';
import { AppShell, Main, NavItem, NavSection, Sidebar, Topbar, Work } from '../../components/shell';

// Every page under this route group requires a session — enforced here,
// once, server-side, rather than each page discovering its own 401 after a
// flash of the authenticated shell around empty/loading content.
export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const [branding, me] = await Promise.all([resolveBranding(), resolveMe()]);
  if (!me) redirect('/login');

  const initials = me.displayName.split(' ').map((p) => p[0]).slice(0, 2).join('').toUpperCase();

  return (
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
        <NavItem href="/login">Switch account</NavItem>
      </Sidebar>
      <Main>
        <Topbar tenantName={me.tenantName} avatarInitials={initials} />
        <Work>{children}</Work>
      </Main>
    </AppShell>
  );
}
