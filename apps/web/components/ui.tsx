// Charter §8: "Tailwind CSS + a single component library with design
// tokens... six modules built in parallel demand one visual language
// enforced by shared components." These are plain CSS classes (globals.css)
// rather than Tailwind utility soup — the design system's own tokens
// (spacing scale, radii, the two brand colours) are the source of truth, and
// every component here just wears them. A visual change lands once, here,
// not per-page.
import type { ButtonHTMLAttributes, HTMLAttributes, InputHTMLAttributes, ReactNode, SelectHTMLAttributes } from 'react';

export function Button({
  variant = 'default',
  className = '',
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: 'default' | 'primary' | 'danger' }) {
  const variantClass = variant === 'primary' ? 'btn-primary' : variant === 'danger' ? 'btn-danger' : '';
  return <button className={`btn ${variantClass} ${className}`} {...props} />;
}

export function Input(props: InputHTMLAttributes<HTMLInputElement>) {
  const { className = '', ...rest } = props;
  return <input {...rest} className={`field ${className}`} />;
}

export function Select(props: SelectHTMLAttributes<HTMLSelectElement>) {
  const { className = '', ...rest } = props;
  return <select {...rest} className={`field ${className}`} />;
}

export function FormField({ label, error, children }: { label: string; error?: string; children: ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1 block text-sm font-medium" style={{ color: 'var(--slate)' }}>{label}</span>
      {children}
      {error && <span className="mt-1 block text-xs" style={{ color: 'var(--danger)' }}>{error}</span>}
    </label>
  );
}

export function Card({ className = '', ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={`card ${className}`} {...props} />;
}

type PillVariant = 'neutral' | 'info' | 'pending' | 'positive' | 'negative';

export function Pill({ variant, children }: { variant: PillVariant; children: ReactNode }) {
  return <span className={`pill ${variant}`}>{children}</span>;
}

// The full status vocabulary this system actually uses, mapped onto the five
// fixed pill variants — not a one-off colour per status, the same small
// palette every time.
const STATUS_VARIANT: Record<string, PillVariant> = {
  DRAFT: 'neutral', PENDING: 'pending', PARTIALLY_PAID: 'pending',
  ISSUED: 'info', SENT: 'info', ACTIVE: 'positive',
  PAID: 'positive', APPROVED: 'positive', ACCEPTED: 'positive', UPLOADED: 'positive',
  CANCELLED: 'negative', REJECTED: 'negative', DECLINED: 'negative', EXPIRED: 'negative',
  WRITTEN_OFF: 'negative', FAILED: 'negative', OVERDUE: 'negative',
  READ: 'neutral', ARCHIVED: 'neutral',
};

export function StatusPill({ status }: { status: string }) {
  return <Pill variant={STATUS_VARIANT[status] ?? 'neutral'}>{status.replace(/_/g, ' ')}</Pill>;
}

export function EmptyState({ title, description }: { title: string; description?: string }) {
  return (
    <div className="state-block">
      <p style={{ fontWeight: 500, color: 'var(--ink)' }}>{title}</p>
      {description && <p style={{ marginTop: 4 }}>{description}</p>}
    </div>
  );
}

export function LoadingState({ label = 'Loading…' }: { label?: string }) {
  return (
    <div role="status" aria-live="polite" className="state-block flex items-center justify-center gap-2">
      <span
        className="h-4 w-4 animate-spin rounded-full border-2"
        style={{ borderColor: 'var(--line)', borderTopColor: 'var(--primary)' }}
      />
      {label}
    </div>
  );
}

export function ErrorBanner({ message }: { message: string }) {
  return (
    <div role="alert" className="state-block error" style={{ textAlign: 'left', border: '1px solid var(--danger-wash)', background: 'var(--danger-wash)', borderRadius: 'var(--r-md)', padding: 'var(--s3) var(--s4)' }}>
      {message}
    </div>
  );
}

// ---------- Table (mockup's .trow grid pattern, not a semantic <table>, but
// with the ARIA roles that make it behave like one for assistive tech). ----

export function DataTable({ columns, children }: { columns: string; children: ReactNode }) {
  return (
    <div className="table" role="table">
      <div style={{ ['--cols' as string]: columns }}>{children}</div>
    </div>
  );
}

export function Row({
  columns, head = false, selected = false, onClick, children,
}: { columns: string; head?: boolean; selected?: boolean; onClick?: () => void; children: ReactNode }) {
  return (
    <div
      role="row"
      className={`trow ${head ? 'head' : ''} ${selected ? 'sel' : ''}`}
      style={{ gridTemplateColumns: columns }}
      onClick={onClick}
    >
      {children}
    </div>
  );
}

export function Cell({ align, children }: { align?: 'right'; children?: ReactNode }) {
  return <div role="cell" className={align === 'right' ? 'right' : undefined}>{children}</div>;
}

// ---------- Metrics & tabs ----------

export function MetricStrip({ children }: { children: ReactNode }) {
  return <div className="metrics">{children}</div>;
}

export function Metric({ label, value, minor, delta, direction }: {
  label: string; value: string; minor?: string; delta?: string; direction?: 'up' | 'down';
}) {
  return (
    <div className="metric">
      <div className="label">{label}</div>
      <div className="value num">{value}{minor && <span className="minor"> {minor}</span>}</div>
      {delta && <div className={`delta ${direction ?? ''}`}>{delta}</div>}
    </div>
  );
}

export function Tabs({ children }: { children: ReactNode }) {
  return <div className="tabs">{children}</div>;
}

export function Tab({ active, count, onClick, children }: { active?: boolean; count?: number; onClick?: () => void; children: ReactNode }) {
  return (
    <button type="button" className={`tab ${active ? 'active' : ''}`} onClick={onClick}>
      {children}
      {count !== undefined && <span className="count">{count}</span>}
    </button>
  );
}

// ---------- Detail panel + the signature ledger-posting block ----------

export function DetailPanel({ children }: { children: ReactNode }) {
  return <aside className="detail">{children}</aside>;
}

export function DetailHead({ title, subtitle, status }: { title: string; subtitle?: string; status?: ReactNode }) {
  return (
    <div className="detail-head">
      <div className="row1">
        <span className="inv-no">{title}</span>
        {status}
      </div>
      {subtitle && <div className="cust-sub">{subtitle}</div>}
    </div>
  );
}

export function LineItem({ description, meta, amount }: { description: string; meta?: string; amount: string }) {
  return (
    <div className="line">
      <span className="desc">{description}{meta && <small>{meta}</small>}</span>
      <span className="num" style={{ fontWeight: 500 }}>{amount}</span>
    </div>
  );
}

export function Totals({ children }: { children: ReactNode }) {
  return <div className="totals">{children}</div>;
}

export function TotalRow({ label, amount, grand }: { label: string; amount: string; grand?: boolean }) {
  return (
    <div className={`t ${grand ? 'grand' : ''}`}>
      <span>{label}</span>
      <span className="num">{amount}</span>
    </div>
  );
}

// The signature moment: the actual balanced double-entry behind this
// document, not a rendering of its total. `entries` are real LedgerEntry
// rows from the API (account code/name + debit/credit in pence-as-string).
export function LedgerPostingBlock({
  entries, formatMoney,
}: {
  entries: Array<{ account: { code: string; name: string }; debit: string; credit: string }>;
  formatMoney: (pence: string) => string;
}) {
  if (entries.length === 0) return null;
  const totalDebit = entries.reduce((s, e) => s + BigInt(e.debit), 0n);
  const totalCredit = entries.reduce((s, e) => s + BigInt(e.credit), 0n);
  const balanced = totalDebit === totalCredit;

  return (
    <div className="posting">
      <div className="posting-title">
        <span className="h">Ledger posting</span>
        {balanced && <span className="balanced">Balanced</span>}
      </div>
      <div className="post-row h"><span>Account</span><span className="dr">Debit</span><span className="cr">Credit</span></div>
      {entries.map((e, i) => (
        <div className="post-row" key={i}>
          <span className="acct">{e.account.name} <span className="code ident">{e.account.code}</span></span>
          <span className="dr num">{e.debit !== '0' ? formatMoney(e.debit) : <span className="z">—</span>}</span>
          <span className="cr num">{e.credit !== '0' ? formatMoney(e.credit) : <span className="z">—</span>}</span>
        </div>
      ))}
      <div className="post-row total">
        <span className="acct">Totals</span>
        <span className="dr num">{formatMoney(totalDebit.toString())}</span>
        <span className="cr num">{formatMoney(totalCredit.toString())}</span>
      </div>
    </div>
  );
}

export function AuditLine({ children }: { children: ReactNode }) {
  return <div className="audit">{children}</div>;
}
