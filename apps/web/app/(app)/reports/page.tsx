'use client';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { api, apiUrl, ApiRequestError } from '../../../lib/api';
import { Card, ErrorBanner, Input, LoadingState } from '../../../components/ui';
import { PageHead } from '../../../components/shell';

const gbp = (pence: string) => '£' + (Number(pence) / 100).toFixed(2);
const monthStart = () => { const d = new Date(); d.setDate(1); return d.toISOString().slice(0, 10); };
const today = () => new Date().toISOString().slice(0, 10);

export default function Reports() {
  const [pl, setPl] = useState<any | null>(null);
  const [bs, setBs] = useState<any | null>(null);
  const [from, setFrom] = useState(monthStart());
  const [to, setTo] = useState(today());
  const [asOf, setAsOf] = useState(today());
  const [error, setError] = useState('');
  const router = useRouter();

  async function loadPl(f: string, t: string) {
    try {
      setPl(await api(`/reports/profit-and-loss?from=${f}T00:00:00.000Z&to=${t}T23:59:59.999Z`));
    } catch (e) {
      if (e instanceof ApiRequestError && e.status === 401) { router.push('/login'); return; }
      setError(e instanceof ApiRequestError ? e.error.message : 'Failed to load profit & loss');
    }
  }
  async function loadBs(d: string) {
    try {
      setBs(await api(`/reports/balance-sheet?asOf=${d}T23:59:59.999Z`));
    } catch (e) {
      setError(e instanceof ApiRequestError ? e.error.message : 'Failed to load balance sheet');
    }
  }

  useEffect(() => { loadPl(from, to); }, []);
  useEffect(() => { loadBs(asOf); }, []);

  if (!pl || !bs) return <LoadingState label="Loading reports…" />;

  return (
    <>
      <PageHead title="Reports" subtitle="Profit & loss and balance sheet, drawn straight from the ledger" />
      {error && <ErrorBanner message={error} />}

      <div className="grid gap-5" style={{ gridTemplateColumns: '1fr 1fr' }}>
        <Card>
          <div className="flex items-center justify-between" style={{ marginBottom: 'var(--s4)' }}>
            <div style={{ fontWeight: 600, fontSize: 14 }}>Profit &amp; loss</div>
            <a className="btn" style={{ textDecoration: 'none' }} href={apiUrl(`/reports/profit-and-loss?format=csv&from=${from}T00:00:00.000Z&to=${to}T23:59:59.999Z`)} target="_blank" rel="noreferrer">Download CSV</a>
          </div>
          <div className="flex gap-3" style={{ marginBottom: 'var(--s4)' }}>
            <Input type="date" value={from} onChange={(e) => { setFrom(e.target.value); loadPl(e.target.value, to); }} />
            <Input type="date" value={to} onChange={(e) => { setTo(e.target.value); loadPl(from, e.target.value); }} />
          </div>
          <ReportTable
            sections={[
              { label: 'Income', rows: Object.entries(pl.income).map(([code, v]: any) => ({ code, name: v.name, amount: v.amount })) },
              { label: 'Expense', rows: Object.entries(pl.expense).map(([code, v]: any) => ({ code, name: v.name, amount: v.amount })) },
            ]}
            total={{ label: 'Net profit', amount: pl.netProfit }}
          />
        </Card>

        <Card>
          <div className="flex items-center justify-between" style={{ marginBottom: 'var(--s4)' }}>
            <div style={{ fontWeight: 600, fontSize: 14 }}>Balance sheet</div>
            <a className="btn" style={{ textDecoration: 'none' }} href={apiUrl(`/reports/balance-sheet?format=csv&asOf=${asOf}T23:59:59.999Z`)} target="_blank" rel="noreferrer">Download CSV</a>
          </div>
          <div style={{ marginBottom: 'var(--s4)' }}>
            <Input type="date" value={asOf} onChange={(e) => { setAsOf(e.target.value); loadBs(e.target.value); }} />
          </div>
          <ReportTable
            sections={[
              { label: 'Assets', rows: Object.entries(bs.assets).map(([code, v]: any) => ({ code, name: v.name, amount: v.amount })) },
              { label: 'Liabilities', rows: Object.entries(bs.liabilities).map(([code, v]: any) => ({ code, name: v.name, amount: v.amount })) },
            ]}
            total={{ label: 'Retained earnings (calculated)', amount: bs.retainedEarnings }}
          />
        </Card>
      </div>
    </>
  );
}

function ReportTable({ sections, total }: { sections: { label: string; rows: { code: string; name: string; amount: string }[] }[]; total: { label: string; amount: string } }) {
  return (
    <div style={{ fontSize: 13 }}>
      {sections.map((s) => (
        <div key={s.label} style={{ marginBottom: 'var(--s3)' }}>
          <div style={{ color: 'var(--slate)', fontWeight: 500, marginBottom: 4, textTransform: 'uppercase', fontSize: 11, letterSpacing: '.03em' }}>{s.label}</div>
          {s.rows.length === 0 ? (
            <div style={{ color: 'var(--muted)', padding: '4px 0' }}>Nothing posted</div>
          ) : s.rows.map((r) => (
            <div key={r.code} className="flex items-center justify-between" style={{ padding: '4px 0' }}>
              <span>{r.name} <span className="ident" style={{ color: 'var(--muted)' }}>{r.code}</span></span>
              <span className="num">{gbp(r.amount)}</span>
            </div>
          ))}
        </div>
      ))}
      <div className="flex items-center justify-between" style={{ borderTop: '1px solid var(--line)', paddingTop: 8, fontWeight: 600 }}>
        <span>{total.label}</span>
        <span className="num">{gbp(total.amount)}</span>
      </div>
    </div>
  );
}
