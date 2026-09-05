'use client';
import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { api, ApiRequestError } from '../../../lib/api';
import {
  AuditLine, Button, Cell, DataTable, DetailHead, DetailPanel, EmptyState, ErrorBanner,
  FormField, Input, LineItem, LoadingState, Row, Select, StatusPill, TotalRow, Totals,
} from '../../../components/ui';
import { PageHead } from '../../../components/shell';

const gbp = (pence: string) => '£' + (Number(pence) / 100).toFixed(2);
const COLUMNS = '110px 1fr 110px 110px 120px';

export default function Quotations() {
  const [customers, setCustomers] = useState<any[] | null>(null);
  const [quotes, setQuotes] = useState<any[] | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState(false);

  const [creating, setCreating] = useState(false);
  const [partyId, setPartyId] = useState('');
  const [expiryDate, setExpiryDate] = useState('');
  const [description, setDescription] = useState('Consulting');
  const [quantity, setQuantity] = useState('1');
  const [unitPrice, setUnitPrice] = useState('');

  const router = useRouter();

  async function loadList() {
    try {
      const [c, q] = await Promise.all([api('/customers'), api('/quotations')]);
      setCustomers(c);
      setQuotes(q);
      if (c[0] && !partyId) setPartyId(c[0].id);
    } catch (e) {
      if (e instanceof ApiRequestError && e.status === 401) { router.push('/login'); return; }
      setError(e instanceof ApiRequestError ? e.error.message : 'Failed to load quotations');
    }
  }
  useEffect(() => { loadList(); }, []);

  const selected = useMemo(() => quotes?.find((q) => q.id === selectedId) ?? null, [quotes, selectedId]);

  async function create() {
    setBusy(true);
    try {
      await api('/quotations', {
        method: 'POST',
        body: JSON.stringify({
          partyId,
          expiryDate: expiryDate ? new Date(expiryDate).toISOString() : undefined,
          lines: [{ description, quantity: Number(quantity), unitPrice: Math.round(Number(unitPrice) * 100), vatRatePct: 20 }],
        }),
      });
      setError('');
      setNotice('');
      setCreating(false);
      setUnitPrice('');
      await loadList();
    } catch (e) {
      setError(e instanceof ApiRequestError ? e.error.message : 'Failed to create quotation');
    } finally {
      setBusy(false);
    }
  }

  async function decide(decision: 'ACCEPTED' | 'DECLINED') {
    if (!selected) return;
    setBusy(true);
    try {
      await api(`/quotations/${selected.id}/decide`, { method: 'POST', body: JSON.stringify({ decision }) });
      setError('');
      await loadList();
      setSelectedId(selected.id);
    } catch (e) {
      setError(e instanceof ApiRequestError ? e.error.message : 'Failed to record decision');
    } finally {
      setBusy(false);
    }
  }

  async function convert(allowExpired = false) {
    if (!selected) return;
    setBusy(true);
    try {
      const invoice = await api(`/quotations/${selected.id}/convert`, {
        method: 'POST', body: JSON.stringify({ allowExpired }),
      });
      setError('');
      setNotice(`Converted to draft invoice — go to Invoices to issue it.`);
      await loadList();
      void invoice;
    } catch (e) {
      if (e instanceof ApiRequestError && e.error.code === 'quotation.expired') {
        if (window.confirm('This quotation has expired. Convert it anyway?')) return convert(true);
        return;
      }
      setError(e instanceof ApiRequestError ? e.error.message : 'Failed to convert quotation');
    } finally {
      setBusy(false);
    }
  }

  if (customers === null || quotes === null) return <LoadingState label="Loading quotations…" />;

  return (
    <>
      <PageHead title="Quotations" subtitle="Quote, get a decision, convert to an invoice">
        <Button variant="primary" onClick={() => setCreating((v) => !v)}>{creating ? 'Cancel' : 'New quotation'}</Button>
      </PageHead>

      {error && <ErrorBanner message={error} />}

      {creating && (
        <div className="card" style={{ marginBottom: 'var(--s5)', padding: 'var(--s5)', display: 'grid', gap: 10, maxWidth: 480 }}>
          <FormField label="Customer">
            <Select value={partyId} onChange={(e) => setPartyId(e.target.value)}>
              {customers.map((c) => <option key={c.id} value={c.id}>{c.legalName}</option>)}
            </Select>
          </FormField>
          <FormField label="Expiry date (optional)">
            <Input value={expiryDate} onChange={(e) => setExpiryDate(e.target.value)} type="date" />
          </FormField>
          <FormField label="Description">
            <Input value={description} onChange={(e) => setDescription(e.target.value)} />
          </FormField>
          <div className="flex gap-3">
            <div style={{ flex: 1 }}><FormField label="Qty"><Input value={quantity} onChange={(e) => setQuantity(e.target.value)} inputMode="numeric" /></FormField></div>
            <div style={{ flex: 2 }}><FormField label="Unit price (£)"><Input value={unitPrice} onChange={(e) => setUnitPrice(e.target.value)} inputMode="decimal" placeholder="0.00" /></FormField></div>
          </div>
          <Button variant="primary" onClick={create} disabled={busy || !partyId || !unitPrice}>Create quotation</Button>
        </div>
      )}

      <div className="workspace-split">
        <section>
          {quotes.length === 0 ? (
            <EmptyState title="No quotations yet" description="Create your first quotation above." />
          ) : (
            <DataTable columns={COLUMNS}>
              <Row columns={COLUMNS} head>
                <Cell>Number</Cell><Cell>Customer</Cell><Cell align="right">Amount</Cell><Cell>Status</Cell><Cell align="right">Expiry</Cell>
              </Row>
              {quotes.map((q) => (
                <Row key={q.id} columns={COLUMNS} selected={q.id === selectedId} onClick={() => { setSelectedId(q.id); setNotice(''); }}>
                  <Cell><span className="ident">{q.number}</span></Cell>
                  <Cell>{q.party?.legalName ?? '—'}</Cell>
                  <Cell align="right"><span className="num" style={{ fontWeight: 600 }}>{gbp(q.grossTotal)}</span></Cell>
                  <Cell><StatusPill status={q.status} /></Cell>
                  <Cell align="right">
                    <span className="num" style={{ color: 'var(--slate)' }}>
                      {q.expiryDate ? new Date(q.expiryDate).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' }) : '—'}
                    </span>
                  </Cell>
                </Row>
              ))}
            </DataTable>
          )}
        </section>

        <DetailPanel>
          {!selected ? (
            <EmptyState title="No quotation selected" description="Click a row to see its detail." />
          ) : (
            <>
              <DetailHead
                title={selected.number}
                subtitle={selected.party?.legalName}
                status={<StatusPill status={selected.status} />}
              />
              <div className="detail-body">
                {selected.lines?.map((l: any) => (
                  <LineItem key={l.id} description={l.description} meta={` ${l.quantity} × ${gbp(l.unitPrice)} · ${l.vatRatePct}% VAT`} amount={gbp(l.total)} />
                ))}
                <Totals>
                  <TotalRow label="Net" amount={gbp(selected.netTotal)} />
                  <TotalRow label="VAT" amount={gbp(selected.vatTotal)} />
                  <TotalRow label="Total" amount={gbp(selected.grossTotal)} grand />
                </Totals>
              </div>

              {selected.status === 'SENT' && (
                <div style={{ padding: '0 var(--s5) var(--s5)', display: 'flex', gap: 8 }}>
                  <Button variant="primary" onClick={() => decide('ACCEPTED')} disabled={busy} style={{ flex: 1, justifyContent: 'center' }}>Accept</Button>
                  <Button onClick={() => decide('DECLINED')} disabled={busy} style={{ flex: 1, justifyContent: 'center' }}>Decline</Button>
                </div>
              )}
              {selected.status === 'ACCEPTED' && (
                <div style={{ padding: '0 var(--s5) var(--s5)' }}>
                  <Button variant="primary" onClick={() => convert(false)} disabled={busy} style={{ width: '100%', justifyContent: 'center' }}>Convert to invoice</Button>
                </div>
              )}
              {notice && (
                <AuditLine>{notice} <Link href="/invoices" style={{ color: 'var(--primary)' }}>Open Invoices →</Link></AuditLine>
              )}
              {selected.decidedAt && (
                <AuditLine>{selected.status === 'ACCEPTED' ? 'Accepted' : 'Declined'} on {new Date(selected.decidedAt).toLocaleDateString('en-GB')}</AuditLine>
              )}
            </>
          )}
        </DetailPanel>
      </div>
    </>
  );
}
