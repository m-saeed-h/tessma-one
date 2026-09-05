'use client';
import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { api, ApiRequestError, apiUrl } from '../../../lib/api';
import {
  AuditLine, Button, Cell, DataTable, DetailHead, DetailPanel, EmptyState, ErrorBanner,
  FormField, Input, LedgerPostingBlock, LineItem, LoadingState, Metric, MetricStrip, Row,
  Select, StatusPill, Tab, Tabs, Textarea, TotalRow, Totals,
} from '../../../components/ui';
import { PageHead } from '../../../components/shell';

const gbp = (pence: string) => '£' + (Number(pence) / 100).toFixed(2);
const COLUMNS = '96px 1fr 108px 130px 100px';

type TabKey = 'all' | 'draft' | 'issued' | 'overdue' | 'paid';

function isOverdue(inv: any): boolean {
  if (inv.status !== 'ISSUED' && inv.status !== 'PARTIALLY_PAID') return false;
  return !!inv.dueDate && new Date(inv.dueDate).getTime() < Date.now();
}

export default function Invoices() {
  const [customers, setCustomers] = useState<any[] | null>(null);
  const [invoices, setInvoices] = useState<any[] | null>(null);
  const [metrics, setMetrics] = useState<any | null>(null);
  const [partyId, setPartyId] = useState('');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [selected, setSelected] = useState<any | null>(null);
  const [tab, setTab] = useState<TabKey>('all');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [composing, setComposing] = useState(false);
  const [sendTo, setSendTo] = useState('');
  const [sendCc, setSendCc] = useState('');
  const [sendSubject, setSendSubject] = useState('');
  const [sendBody, setSendBody] = useState('');
  const router = useRouter();

  async function loadList() {
    try {
      const [c, i, m] = await Promise.all([
        api('/customers'), api('/invoices'), api('/reports/invoice-metrics'),
      ]);
      setCustomers(c);
      setInvoices(i);
      setMetrics(m);
      if (c[0] && !partyId) setPartyId(c[0].id);
    } catch (e) {
      if (e instanceof ApiRequestError && e.status === 401) { router.push('/login'); return; }
      setError(e instanceof ApiRequestError ? e.error.message : 'Failed to load invoices');
    }
  }
  useEffect(() => { loadList(); }, []);

  async function selectInvoice(id: string) {
    setSelectedId(id);
    setComposing(false);
    try {
      setSelected(await api(`/invoices/${id}`));
    } catch (e) {
      setError(e instanceof ApiRequestError ? e.error.message : 'Failed to load invoice');
    }
  }

  async function draft() {
    setBusy(true);
    try {
      const r = await api('/invoices/draft', {
        method: 'POST',
        body: JSON.stringify({
          partyId,
          lines: [
            { description: 'Consulting', quantity: 3, unitPrice: 1999, discountPct: 10, vatRatePct: 20 },
            { description: 'Setup fee', quantity: 1, unitPrice: 5000, vatRatePct: 20 },
          ],
        }),
      });
      setError('');
      await loadList();
      selectInvoice(r.id);
    } catch (e) {
      setError(e instanceof ApiRequestError ? e.error.message : 'Failed to create draft');
    } finally {
      setBusy(false);
    }
  }

  async function issue() {
    if (!selected) return;
    setBusy(true);
    try {
      await api(`/invoices/${selected.id}/issue`, { method: 'POST' });
      setError('');
      await loadList();
      selectInvoice(selected.id);
    } catch (e) {
      setError(e instanceof ApiRequestError ? e.error.message : 'Failed to issue invoice');
    } finally {
      setBusy(false);
    }
  }

  async function cancel() {
    if (!selected) return;
    const reason = window.prompt('Reason for cancelling this invoice (required):');
    if (!reason) return;
    setBusy(true);
    try {
      await api(`/invoices/${selected.id}/cancel`, { method: 'POST', body: JSON.stringify({ reason }) });
      setError('');
      await loadList();
      selectInvoice(selected.id);
    } catch (e) {
      setError(e instanceof ApiRequestError ? e.error.message : 'Failed to cancel invoice');
    } finally {
      setBusy(false);
    }
  }

  async function duplicate() {
    if (!selected) return;
    setBusy(true);
    try {
      const copy = await api(`/invoices/${selected.id}/duplicate`, { method: 'POST' });
      setError('');
      await loadList();
      selectInvoice(copy.id);
    } catch (e) {
      setError(e instanceof ApiRequestError ? e.error.message : 'Failed to duplicate invoice');
    } finally {
      setBusy(false);
    }
  }

  function openCompose() {
    setSendTo(selected?.party?.email ?? '');
    setSendCc('');
    setSendSubject(`Invoice ${selected?.number ?? ''}`.trim());
    setSendBody(`Please find attached invoice ${selected?.number}, due ${selected?.dueDate ? new Date(selected.dueDate).toLocaleDateString('en-GB') : ''}.`);
    setComposing(true);
  }

  async function sendEmail() {
    if (!selected) return;
    setBusy(true);
    try {
      const to = sendTo.split(',').map((s) => s.trim()).filter(Boolean);
      const cc = sendCc.split(',').map((s) => s.trim()).filter(Boolean);
      await api(`/invoices/${selected.id}/send`, {
        method: 'POST',
        body: JSON.stringify({ to, cc: cc.length ? cc : undefined, subject: sendSubject, body: sendBody }),
      });
      setError('');
      setComposing(false);
      selectInvoice(selected.id);
    } catch (e) {
      setError(e instanceof ApiRequestError ? e.error.message : 'Failed to send invoice');
    } finally {
      setBusy(false);
    }
  }

  const counts = useMemo(() => {
    if (!invoices) return { all: 0, draft: 0, issued: 0, overdue: 0, paid: 0 };
    return {
      all: invoices.length,
      draft: invoices.filter((i) => i.status === 'DRAFT').length,
      issued: invoices.filter((i) => (i.status === 'ISSUED' || i.status === 'PARTIALLY_PAID') && !isOverdue(i)).length,
      overdue: invoices.filter(isOverdue).length,
      paid: invoices.filter((i) => i.status === 'PAID').length,
    };
  }, [invoices]);

  const visible = useMemo(() => {
    if (!invoices) return [];
    switch (tab) {
      case 'draft': return invoices.filter((i) => i.status === 'DRAFT');
      case 'issued': return invoices.filter((i) => (i.status === 'ISSUED' || i.status === 'PARTIALLY_PAID') && !isOverdue(i));
      case 'overdue': return invoices.filter(isOverdue);
      case 'paid': return invoices.filter((i) => i.status === 'PAID');
      default: return invoices;
    }
  }, [invoices, tab]);

  if (customers === null || invoices === null) return <LoadingState label="Loading invoices…" />;

  return (
    <>
      <PageHead title="Invoices" subtitle="Sales invoicing & collection">
        <Select value={partyId} onChange={(e) => setPartyId(e.target.value)} style={{ width: 200 }}>
          {customers.map((c) => <option key={c.id} value={c.id}>{c.legalName}</option>)}
        </Select>
        <Button variant="primary" onClick={draft} disabled={!partyId || busy}>New invoice</Button>
      </PageHead>

      {error && <ErrorBanner message={error} />}

      {metrics && (
        <MetricStrip>
          <Metric label="Outstanding" value={gbp(metrics.outstandingPence)} />
          <Metric
            label="Overdue" value={gbp(metrics.overduePence)}
            delta={metrics.overduePence !== '0' ? `${counts.overdue} invoice${counts.overdue === 1 ? '' : 's'}` : 'None'}
            direction={metrics.overduePence !== '0' ? 'down' : 'up'}
          />
          <Metric label="Paid this month" value={gbp(metrics.paidThisMonthPence)} />
          <Metric label="Avg days to pay" value={metrics.avgDaysToPay === null ? '—' : String(metrics.avgDaysToPay)} minor={metrics.avgDaysToPay === null ? undefined : 'days'} />
        </MetricStrip>
      )}

      <div className="workspace-split">
        <section>
          <Tabs>
            <Tab active={tab === 'all'} count={counts.all} onClick={() => setTab('all')}>All</Tab>
            <Tab active={tab === 'draft'} count={counts.draft} onClick={() => setTab('draft')}>Draft</Tab>
            <Tab active={tab === 'issued'} count={counts.issued} onClick={() => setTab('issued')}>Issued</Tab>
            <Tab active={tab === 'overdue'} count={counts.overdue} onClick={() => setTab('overdue')}>Overdue</Tab>
            <Tab active={tab === 'paid'} count={counts.paid} onClick={() => setTab('paid')}>Paid</Tab>
          </Tabs>

          {visible.length === 0 ? (
            <EmptyState title="No invoices here" description={tab === 'all' ? 'Create your first invoice above.' : 'Nothing in this view yet.'} />
          ) : (
            <DataTable columns={COLUMNS}>
              <Row columns={COLUMNS} head>
                <Cell>Number</Cell><Cell>Customer</Cell><Cell align="right">Amount</Cell><Cell>Status</Cell><Cell align="right">Due</Cell>
              </Row>
              {visible.map((inv) => (
                <Row key={inv.id} columns={COLUMNS} selected={inv.id === selectedId} onClick={() => selectInvoice(inv.id)}>
                  <Cell><span className="ident">{inv.number ?? 'DRAFT'}</span></Cell>
                  <Cell>{inv.party?.legalName ?? '—'}</Cell>
                  <Cell align="right"><span className="num" style={{ fontWeight: 600 }}>{gbp(inv.grossTotal)}</span></Cell>
                  <Cell><StatusPill status={isOverdue(inv) ? 'OVERDUE' : inv.status} /></Cell>
                  <Cell align="right">
                    <span className="num" style={{ color: isOverdue(inv) ? 'var(--danger)' : 'var(--slate)' }}>
                      {inv.dueDate ? new Date(inv.dueDate).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' }) : '—'}
                    </span>
                  </Cell>
                </Row>
              ))}
            </DataTable>
          )}
        </section>

        <DetailPanel>
          {!selected ? (
            <EmptyState title="No invoice selected" description="Click a row to see its detail and ledger posting." />
          ) : (
            <>
              <DetailHead
                title={selected.number ?? 'Draft'}
                subtitle={selected.issueDate
                  ? `Issued ${new Date(selected.issueDate).toLocaleDateString('en-GB')} · due ${selected.dueDate ? new Date(selected.dueDate).toLocaleDateString('en-GB') : '—'}`
                  : 'Not yet issued'}
                status={<StatusPill status={isOverdue(selected) ? 'OVERDUE' : selected.status} />}
              />
              <div style={{ padding: '0 var(--s5)', paddingTop: 'var(--s4)', fontWeight: 500, fontSize: 15 }}>
                {selected.party?.legalName}
              </div>
              <div style={{ padding: 'var(--s3) var(--s5) 0', display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                <a className="btn" style={{ textDecoration: 'none' }} href={apiUrl(`/invoices/${selected.id}/pdf`)} target="_blank" rel="noreferrer">Download PDF</a>
                <Button onClick={duplicate} disabled={busy}>Duplicate</Button>
                {selected.status !== 'DRAFT' && selected.status !== 'CANCELLED' && (
                  <Button onClick={openCompose} disabled={busy}>Send to customer</Button>
                )}
              </div>
              {composing && (
                <div style={{ padding: 'var(--s4) var(--s5)', display: 'grid', gap: 10 }}>
                  <FormField label="To"><Input value={sendTo} onChange={(e) => setSendTo(e.target.value)} placeholder="customer@example.com" /></FormField>
                  <FormField label="Cc (optional)"><Input value={sendCc} onChange={(e) => setSendCc(e.target.value)} placeholder="comma-separated" /></FormField>
                  <FormField label="Subject"><Input value={sendSubject} onChange={(e) => setSendSubject(e.target.value)} /></FormField>
                  <FormField label="Message"><Textarea value={sendBody} onChange={(e) => setSendBody(e.target.value)} /></FormField>
                  <div style={{ display: 'flex', gap: 8 }}>
                    <Button variant="primary" onClick={sendEmail} disabled={busy || !sendTo.trim()}>Send</Button>
                    <Button onClick={() => setComposing(false)} disabled={busy}>Cancel</Button>
                  </div>
                </div>
              )}
              <div className="detail-body" style={{ paddingBottom: 'var(--s3)' }}>
                {selected.lines.map((l: any) => (
                  <LineItem
                    key={l.id}
                    description={l.description}
                    meta={` ${l.quantity} × ${gbp(l.unitPrice)}${l.discountPct ? ` · ${l.discountPct}% disc` : ''} · ${l.vatRatePct}% VAT`}
                    amount={gbp(l.total)}
                  />
                ))}
                <Totals>
                  <TotalRow label="Net" amount={gbp(selected.netTotal)} />
                  <TotalRow label={`VAT`} amount={gbp(selected.vatTotal)} />
                  <TotalRow label="Total due" amount={gbp(selected.grossTotal)} grand />
                </Totals>
              </div>

              {selected.status === 'DRAFT' && (
                <div style={{ padding: '0 var(--s5) var(--s5)' }}>
                  <Button variant="primary" onClick={issue} disabled={busy} style={{ width: '100%' }}>Issue invoice</Button>
                </div>
              )}

              <LedgerPostingBlock entries={selected.ledgerEntries} formatMoney={gbp} />

              {selected.status === 'ISSUED' && selected.allocatedTotal === '0' && (
                <div style={{ padding: '0 var(--s5) var(--s5)' }}>
                  <Button onClick={cancel} disabled={busy} style={{ width: '100%' }}>Cancel invoice</Button>
                </div>
              )}
              {selected.cancelledReason && (
                <AuditLine>Cancelled: {selected.cancelledReason}</AuditLine>
              )}
              {selected.status !== 'DRAFT' && !selected.cancelledReason && (
                <AuditLine>Locked & immutable once issued</AuditLine>
              )}
              {selected.deliveries?.map((d: any) => (
                <AuditLine key={d.id}>
                  {d.status === 'SENT' ? 'Sent' : 'Failed to send'} to {d.to.join(', ')} on {new Date(d.createdAt).toLocaleDateString('en-GB')}
                </AuditLine>
              ))}
            </>
          )}
        </DetailPanel>
      </div>
    </>
  );
}
