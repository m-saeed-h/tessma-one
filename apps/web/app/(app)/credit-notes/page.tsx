'use client';
import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { api, ApiRequestError } from '../../../lib/api';
import {
  AuditLine, Button, Cell, DataTable, DetailHead, DetailPanel, EmptyState, ErrorBanner,
  FormField, Input, LineItem, LoadingState, Row, Select, StatusPill, Textarea, TotalRow, Totals,
} from '../../../components/ui';
import { PageHead } from '../../../components/shell';

const gbp = (pence: string) => '£' + (Number(pence) / 100).toFixed(2);
const COLUMNS = '110px 1fr 130px 110px 110px 100px';

export default function CreditNotes() {
  const [customers, setCustomers] = useState<any[] | null>(null);
  const [notes, setNotes] = useState<any[] | null>(null);
  const [customerInvoices, setCustomerInvoices] = useState<any[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [openInvoices, setOpenInvoices] = useState<any[] | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const [creating, setCreating] = useState(false);
  const [partyId, setPartyId] = useState('');
  const [invoiceId, setInvoiceId] = useState('');
  const [reasonCode, setReasonCode] = useState('RETURN');
  const [reasonText, setReasonText] = useState('');
  const [description, setDescription] = useState('Credit');
  const [amount, setAmount] = useState('');

  const [allocInvoiceId, setAllocInvoiceId] = useState('');
  const [allocAmount, setAllocAmount] = useState('');

  const router = useRouter();

  async function loadList() {
    try {
      const [c, n] = await Promise.all([api('/customers'), api('/credit-notes')]);
      setCustomers(c);
      setNotes(n);
      if (c[0] && !partyId) setPartyId(c[0].id);
    } catch (e) {
      if (e instanceof ApiRequestError && e.status === 401) { router.push('/login'); return; }
      setError(e instanceof ApiRequestError ? e.error.message : 'Failed to load credit notes');
    }
  }
  useEffect(() => { loadList(); }, []);

  useEffect(() => {
    if (!partyId) return;
    api(`/invoices?partyId=${partyId}`).then(setCustomerInvoices).catch(() => setCustomerInvoices([]));
  }, [partyId]);

  const selected = useMemo(() => notes?.find((n) => n.id === selectedId) ?? null, [notes, selectedId]);

  async function selectNote(id: string) {
    setSelectedId(id);
    setOpenInvoices(null);
    setAllocInvoiceId('');
    setAllocAmount('');
    const n = notes?.find((x) => x.id === id);
    if (!n) return;
    try {
      const invoices = await api(`/invoices?partyId=${n.partyId}`);
      const open = invoices.filter((i: any) => i.status === 'ISSUED' || i.status === 'PARTIALLY_PAID');
      setOpenInvoices(open);
      if (open[0]) setAllocInvoiceId(open[0].id);
    } catch (e) {
      setError(e instanceof ApiRequestError ? e.error.message : 'Failed to load open invoices');
    }
  }

  async function create() {
    setBusy(true);
    try {
      await api('/credit-notes', {
        method: 'POST',
        body: JSON.stringify({
          partyId, invoiceId: invoiceId || undefined, reasonCode, reasonText,
          lines: [{ description, quantity: 1, unitPrice: Math.round(Number(amount) * 100), vatRatePct: 20 }],
        }),
      });
      setError('');
      setCreating(false);
      setReasonText('');
      setAmount('');
      await loadList();
    } catch (e) {
      setError(e instanceof ApiRequestError ? e.error.message : 'Failed to create credit note');
    } finally {
      setBusy(false);
    }
  }

  async function allocate() {
    if (!selected || !allocInvoiceId) return;
    setBusy(true);
    try {
      await api(`/credit-notes/${selected.id}/allocate`, {
        method: 'POST',
        body: JSON.stringify({ invoiceId: allocInvoiceId, amountPence: Math.round(Number(allocAmount) * 100) }),
      });
      setError('');
      setAllocAmount('');
      await loadList();
      selectNote(selected.id);
    } catch (e) {
      setError(e instanceof ApiRequestError ? e.error.message : 'Failed to allocate credit note');
    } finally {
      setBusy(false);
    }
  }

  if (customers === null || notes === null) return <LoadingState label="Loading credit notes…" />;

  return (
    <>
      <PageHead title="Credit notes" subtitle="Corrections and adjustments, always reversing the ledger">
        <Button variant="primary" onClick={() => setCreating((v) => !v)}>{creating ? 'Cancel' : 'New credit note'}</Button>
      </PageHead>

      {error && <ErrorBanner message={error} />}

      {creating && (
        <div className="card" style={{ marginBottom: 'var(--s5)', padding: 'var(--s5)', display: 'grid', gap: 10, maxWidth: 480 }}>
          <FormField label="Customer">
            <Select value={partyId} onChange={(e) => { setPartyId(e.target.value); setInvoiceId(''); }}>
              {customers.map((c) => <option key={c.id} value={c.id}>{c.legalName}</option>)}
            </Select>
          </FormField>
          <FormField label="Against invoice (optional — leave blank for a credit on account)">
            <Select value={invoiceId} onChange={(e) => setInvoiceId(e.target.value)}>
              <option value="">— None —</option>
              {customerInvoices.filter((i) => i.status !== 'DRAFT').map((i) => <option key={i.id} value={i.id}>{i.number}</option>)}
            </Select>
          </FormField>
          <FormField label="Reason">
            <Select value={reasonCode} onChange={(e) => setReasonCode(e.target.value)}>
              <option value="RETURN">Return</option>
              <option value="PRICING_ERROR">Pricing error</option>
              <option value="GOODWILL">Goodwill</option>
              <option value="BAD_DEBT">Bad debt write-off</option>
              <option value="OTHER">Other</option>
            </Select>
          </FormField>
          <FormField label="Reason detail">
            <Textarea value={reasonText} onChange={(e) => setReasonText(e.target.value)} placeholder="Explain the reason for this credit" />
          </FormField>
          <FormField label="Description">
            <Input value={description} onChange={(e) => setDescription(e.target.value)} />
          </FormField>
          <FormField label="Amount, net of VAT (£)">
            <Input value={amount} onChange={(e) => setAmount(e.target.value)} inputMode="decimal" placeholder="0.00" />
          </FormField>
          <Button variant="primary" onClick={create} disabled={busy || !partyId || !reasonText.trim() || !amount}>Issue credit note</Button>
        </div>
      )}

      <div className="workspace-split">
        <section>
          {notes.length === 0 ? (
            <EmptyState title="No credit notes yet" description="Issue your first credit note above." />
          ) : (
            <DataTable columns={COLUMNS}>
              <Row columns={COLUMNS} head>
                <Cell>Number</Cell><Cell>Customer</Cell><Cell>Reason</Cell>
                <Cell align="right">Amount</Cell><Cell align="right">Allocated</Cell><Cell>Status</Cell>
              </Row>
              {notes.map((n) => (
                <Row key={n.id} columns={COLUMNS} selected={n.id === selectedId} onClick={() => selectNote(n.id)}>
                  <Cell><span className="ident">{n.number ?? 'DRAFT'}</span></Cell>
                  <Cell>{n.party?.legalName ?? '—'}</Cell>
                  <Cell>{n.reasonCode.replace('_', ' ')}</Cell>
                  <Cell align="right"><span className="num" style={{ fontWeight: 600 }}>{gbp(n.grossTotal)}</span></Cell>
                  <Cell align="right"><span className="num">{gbp(n.allocatedTotal)}</span></Cell>
                  <Cell><StatusPill status={n.status} /></Cell>
                </Row>
              ))}
            </DataTable>
          )}
        </section>

        <DetailPanel>
          {!selected ? (
            <EmptyState title="No credit note selected" description="Click a row to see its detail." />
          ) : (
            <>
              <DetailHead
                title={selected.number ?? 'Draft'}
                subtitle={`${selected.party?.legalName ?? ''} · ${selected.reasonCode.replace('_', ' ')}`}
                status={<StatusPill status={selected.status} />}
              />
              <div className="detail-body">
                {selected.lines?.map((l: any) => (
                  <LineItem key={l.id} description={l.description} meta={` ${l.quantity} × ${gbp(l.unitPrice)} · ${l.vatRatePct}% VAT`} amount={gbp(l.total)} />
                ))}
                <Totals>
                  <TotalRow label="Net" amount={gbp(selected.netTotal)} />
                  <TotalRow label="VAT" amount={gbp(selected.vatTotal)} />
                  <TotalRow label="Total credit" amount={gbp(selected.grossTotal)} grand />
                </Totals>
              </div>
              <AuditLine>{selected.reasonText}</AuditLine>

              {selected.grossTotal !== selected.allocatedTotal && (
                <div style={{ padding: 'var(--s4) var(--s5)', display: 'grid', gap: 10 }}>
                  <div style={{ fontSize: 13, fontWeight: 500 }}>
                    Allocate {gbp((BigInt(selected.grossTotal) - BigInt(selected.allocatedTotal)).toString())} remaining
                  </div>
                  {openInvoices === null ? (
                    <div style={{ fontSize: 13, color: 'var(--slate)' }}>Loading open invoices…</div>
                  ) : openInvoices.length === 0 ? (
                    <div style={{ fontSize: 13, color: 'var(--slate)' }}>This customer has no open invoices.</div>
                  ) : (
                    <>
                      <FormField label="Invoice">
                        <Select value={allocInvoiceId} onChange={(e) => setAllocInvoiceId(e.target.value)}>
                          {openInvoices.map((i) => (
                            <option key={i.id} value={i.id}>{i.number} — {gbp((BigInt(i.grossTotal) - BigInt(i.allocatedTotal)).toString())} outstanding</option>
                          ))}
                        </Select>
                      </FormField>
                      <FormField label="Amount (£)">
                        <Input value={allocAmount} onChange={(e) => setAllocAmount(e.target.value)} inputMode="decimal" placeholder="0.00" />
                      </FormField>
                      <Button variant="primary" onClick={allocate} disabled={busy || !allocAmount}>Allocate</Button>
                    </>
                  )}
                </div>
              )}
            </>
          )}
        </DetailPanel>
      </div>
    </>
  );
}
