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
        <NavSection>Sales</NavSection>
        <NavItem href="/quotations">Quotations</NavItem>
        <NavItem href="/invoices">Invoices</NavItem>
        <NavItem href="/credit-notes">Credit notes</NavItem>
        <NavItem href="/payments">Payments</NavItem>
        <NavItem href="/receivables">Aged receivables</NavItem>
        <NavSection>Purchases</NavSection>
        <NavItem href="/bills">Bills</NavItem>
        <NavItem href="/supplier-payments">Supplier payments</NavItem>
        <NavItem href="/expenses">Expenses</NavItem>
        <NavSection>Accounting</NavSection>
        <NavItem href="/journals">Journals</NavItem>
        <NavItem href="/periods">Accounting periods</NavItem>
        <NavItem href="/reports">Reports</NavItem>
        <NavItem locked>Banking</NavItem>
        <NavItem locked>VAT</NavItem>
        <NavSection>Setup</NavSection>
        <NavItem href="/customers">Customers</NavItem>
        <NavItem href="/suppliers">Suppliers</NavItem>
        <NavItem href="/products">Products</NavItem>
        <NavItem href="/settings">Finance settings</NavItem>
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
