'use client';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { api, ApiRequestError } from '../../../lib/api';
import { Button, Cell, DataTable, EmptyState, ErrorBanner, FormField, Input, LoadingState, Row, StatusPill } from '../../../components/ui';
import { PageHead } from '../../../components/shell';

const COLUMNS = '1fr 130px 160px';

export default function Periods() {
  const [periods, setPeriods] = useState<any[] | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState<string | null>(null);
  const [generating, setGenerating] = useState(false);
  const [startYear, setStartYear] = useState(new Date().getFullYear());
  const [startMonth, setStartMonth] = useState(1);
  const [startDay, setStartDay] = useState(1);
  const router = useRouter();

  async function load() {
    try {
      const [p, settings] = await Promise.all([api('/finance/periods'), api('/finance/settings')]);
      setPeriods(p);
      setStartMonth(settings.financialYearStartMonth);
      setStartDay(settings.financialYearStartDay);
    } catch (e) {
      if (e instanceof ApiRequestError && e.status === 401) { router.push('/login'); return; }
      setError(e instanceof ApiRequestError ? e.error.message : 'Failed to load periods');
    }
  }
  useEffect(() => { load(); }, []);

  async function generate() {
    setGenerating(true);
    try {
      await api('/finance/periods/generate', { method: 'POST', body: JSON.stringify({ startYear, startMonth, startDay }) });
      setError('');
      await load();
    } catch (e) {
      setError(e instanceof ApiRequestError ? e.error.message : 'Failed to generate periods');
    } finally {
      setGenerating(false);
    }
  }

  async function toggle(period: any) {
    setBusy(period.id);
    try {
      const action = period.status === 'OPEN' ? 'close' : 'reopen';
      await api(`/finance/periods/${period.id}/${action}`, { method: 'POST' });
      setError('');
      await load();
    } catch (e) {
      setError(e instanceof ApiRequestError ? e.error.message : 'Failed to update period');
    } finally {
      setBusy(null);
    }
  }

  if (periods === null) return <LoadingState label="Loading accounting periods…" />;

  const now = Date.now();
  const fmt = (d: string) => new Date(d).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });

  return (
    <>
      <PageHead title="Accounting periods" subtitle="A closed period refuses new postings — the one control the finance spec calls non-negotiable">
        <Button variant="primary" onClick={() => setGenerating((v) => !v)}>{generating ? 'Cancel' : 'Generate a year'}</Button>
      </PageHead>

      {error && <ErrorBanner message={error} />}

      {generating && (
        <div className="card" style={{ marginBottom: 'var(--s5)', padding: 'var(--s5)', display: 'flex', gap: 12, alignItems: 'end', maxWidth: 480 }}>
          <FormField label="Year"><Input type="number" value={startYear} onChange={(e) => setStartYear(Number(e.target.value))} style={{ width: 100 }} /></FormField>
          <FormField label="Starts month"><Input type="number" min={1} max={12} value={startMonth} onChange={(e) => setStartMonth(Number(e.target.value))} style={{ width: 80 }} /></FormField>
          <FormField label="Day"><Input type="number" min={1} max={31} value={startDay} onChange={(e) => setStartDay(Number(e.target.value))} style={{ width: 80 }} /></FormField>
          <Button variant="primary" onClick={generate}>Generate 12 periods</Button>
        </div>
      )}

      {periods.length === 0 ? (
        <EmptyState title="No accounting periods yet" description="Generate a financial year above. Until then, postings aren't restricted by period at all." />
      ) : (
        <DataTable columns={COLUMNS}>
          <Row columns={COLUMNS} head>
            <Cell>Period</Cell><Cell>Status</Cell><Cell></Cell>
          </Row>
          {periods.map((p) => {
            const current = new Date(p.startDate).getTime() <= now && new Date(p.endDate).getTime() >= now;
            return (
              <Row key={p.id} columns={COLUMNS}>
                <Cell>{fmt(p.startDate)} – {fmt(p.endDate)} {current && <span className="ident" style={{ marginLeft: 8, color: 'var(--primary)' }}>current</span>}</Cell>
                <Cell><StatusPill status={p.status === 'OPEN' ? 'ACTIVE' : 'CANCELLED'} /></Cell>
                <Cell>
                  <Button onClick={() => toggle(p)} disabled={busy === p.id}>
                    {p.status === 'OPEN' ? 'Close' : 'Reopen'}
                  </Button>
                </Cell>
              </Row>
            );
          })}
        </DataTable>
      )}
    </>
  );
}
