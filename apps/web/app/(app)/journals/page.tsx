'use client';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { api, ApiRequestError } from '../../../lib/api';
import {
  Button, Cell, DataTable, DetailHead, DetailPanel, EmptyState, ErrorBanner,
  FormField, Input, LoadingState, Row, Select,
} from '../../../components/ui';
import { PageHead } from '../../../components/shell';

const gbp = (pence: string) => '£' + (Number(pence) / 100).toFixed(2);
const COLUMNS = '1fr 110px 130px';

interface Line { accountId: string; debit: string; credit: string; }

export default function Journals() {
  const [accounts, setAccounts] = useState<any[] | null>(null);
  const [journals, setJournals] = useState<any[] | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const [creating, setCreating] = useState(false);
  const [narrative, setNarrative] = useState('');
  const [lines, setLines] = useState<Line[]>([{ accountId: '', debit: '', credit: '' }, { accountId: '', debit: '', credit: '' }]);
  const router = useRouter();

  async function load() {
    try {
      const [a, j] = await Promise.all([api('/accounts'), api('/finance/journals')]);
      setAccounts(a);
      setJournals(j);
    } catch (e) {
      if (e instanceof ApiRequestError && e.status === 401) { router.push('/login'); return; }
      setError(e instanceof ApiRequestError ? e.error.message : 'Failed to load journals');
    }
  }
  useEffect(() => { load(); }, []);

  const selected = journals?.find((j) => j.id === selectedId) ?? null;

  function addLine() { setLines((l) => [...l, { accountId: '', debit: '', credit: '' }]); }
  function updateLine(i: number, patch: Partial<Line>) {
    setLines((l) => l.map((line, idx) => (idx === i ? { ...line, ...patch } : line)));
  }

  const totalDebit = lines.reduce((s, l) => s + (Number(l.debit) || 0), 0);
  const totalCredit = lines.reduce((s, l) => s + (Number(l.credit) || 0), 0);
  const balanced = totalDebit === totalCredit && totalDebit > 0;

  async function post() {
    setBusy(true);
    try {
      await api('/finance/journals', {
        method: 'POST',
        body: JSON.stringify({
          narrative,
          lines: lines
            .filter((l) => l.accountId && (Number(l.debit) || Number(l.credit)))
            .map((l) => ({ accountId: l.accountId, debit: Math.round(Number(l.debit || 0) * 100), credit: Math.round(Number(l.credit || 0) * 100) })),
        }),
      });
      setError('');
      setCreating(false);
      setNarrative('');
      setLines([{ accountId: '', debit: '', credit: '' }, { accountId: '', debit: '', credit: '' }]);
      await load();
    } catch (e) {
      setError(e instanceof ApiRequestError ? e.error.message : 'Failed to post journal');
    } finally {
      setBusy(false);
    }
  }

  async function reverse() {
    if (!selected) return;
    setBusy(true);
    try {
      await api(`/finance/journals/${selected.id}/reverse`, { method: 'POST' });
      setError('');
      await load();
    } catch (e) {
      setError(e instanceof ApiRequestError ? e.error.message : 'Failed to reverse journal');
    } finally {
      setBusy(false);
    }
  }

  if (accounts === null || journals === null) return <LoadingState label="Loading journals…" />;

  return (
    <>
      <PageHead title="Manual journals" subtitle="The posting path for corrections and adjustments — never for what invoices, payments and credit notes already post automatically">
        <Button variant="primary" onClick={() => setCreating((v) => !v)}>{creating ? 'Cancel' : 'New journal'}</Button>
      </PageHead>

      {error && <ErrorBanner message={error} />}

      {creating && (
        <div className="card" style={{ marginBottom: 'var(--s5)', padding: 'var(--s5)', display: 'grid', gap: 12, maxWidth: 640 }}>
          <FormField label="Narrative"><Input value={narrative} onChange={(e) => setNarrative(e.target.value)} placeholder="Why this journal exists" /></FormField>
          {lines.map((l, i) => (
            <div key={i} className="flex gap-3 items-end">
              <div style={{ flex: 1 }}>
                <FormField label={i === 0 ? 'Account' : ''}>
                  <Select value={l.accountId} onChange={(e) => updateLine(i, { accountId: e.target.value })}>
                    <option value="">— Select —</option>
                    {accounts.map((a) => <option key={a.id} value={a.id}>{a.code} {a.name}</option>)}
                  </Select>
                </FormField>
              </div>
              <div style={{ width: 110 }}><FormField label={i === 0 ? 'Debit (£)' : ''}><Input value={l.debit} onChange={(e) => updateLine(i, { debit: e.target.value, credit: '' })} inputMode="decimal" placeholder="0.00" /></FormField></div>
              <div style={{ width: 110 }}><FormField label={i === 0 ? 'Credit (£)' : ''}><Input value={l.credit} onChange={(e) => updateLine(i, { credit: e.target.value, debit: '' })} inputMode="decimal" placeholder="0.00" /></FormField></div>
            </div>
          ))}
          <Button onClick={addLine} style={{ width: 'fit-content' }}>Add line</Button>
          <div style={{ fontSize: 13, color: balanced ? 'var(--success)' : 'var(--danger)' }}>
            Debits £{(totalDebit).toFixed(2)} · Credits £{(totalCredit).toFixed(2)} {balanced ? '· Balanced' : '· Must balance before posting'}
          </div>
          <Button variant="primary" onClick={post} disabled={busy || !balanced || !narrative.trim()} style={{ width: 'fit-content' }}>Post journal</Button>
        </div>
      )}

      <div className="workspace-split">
        <section>
          {journals.length === 0 ? (
            <EmptyState title="No manual journals yet" description="Post your first adjustment above." />
          ) : (
            <DataTable columns={COLUMNS}>
              <Row columns={COLUMNS} head><Cell>Narrative</Cell><Cell align="right">Amount</Cell><Cell align="right">Posted</Cell></Row>
              {journals.map((j) => {
                const total = j.entries.reduce((s: number, e: any) => s + Number(e.debit), 0);
                return (
                  <Row key={j.id} columns={COLUMNS} selected={j.id === selectedId} onClick={() => setSelectedId(j.id)}>
                    <Cell>{j.narrative}</Cell>
                    <Cell align="right"><span className="num">{gbp(String(total))}</span></Cell>
                    <Cell align="right"><span className="num" style={{ color: 'var(--slate)' }}>{new Date(j.createdAt).toLocaleDateString('en-GB')}</span></Cell>
                  </Row>
                );
              })}
            </DataTable>
          )}
        </section>

        <DetailPanel>
          {!selected ? (
            <EmptyState title="No journal selected" description="Click a row to see its posting." />
          ) : (
            <>
              <DetailHead title={selected.narrative} subtitle={new Date(selected.createdAt).toLocaleDateString('en-GB')} />
              <div className="detail-body">
                {selected.entries.map((e: any) => (
                  <div className="post-row" key={e.id} style={{ padding: '8px var(--s5)' }}>
                    <span className="acct">{e.account.name} <span className="code ident">{e.account.code}</span></span>
                    <span className="dr num">{e.debit !== '0' ? gbp(e.debit) : '—'}</span>
                    <span className="cr num">{e.credit !== '0' ? gbp(e.credit) : '—'}</span>
                  </div>
                ))}
              </div>
              {!selected.reversalOfJournalId && (
                <div style={{ padding: '0 var(--s5) var(--s5)' }}>
                  <Button onClick={reverse} disabled={busy} style={{ width: '100%' }}>Reverse this journal</Button>
                </div>
              )}
            </>
          )}
        </DetailPanel>
      </div>
    </>
  );
}
