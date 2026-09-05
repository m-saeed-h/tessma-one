'use client';
import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { api, ApiRequestError } from '../../../lib/api';
import {
  AuditLine, Button, Cell, DataTable, DetailHead, DetailPanel, EmptyState, ErrorBanner,
  FormField, Input, LoadingState, Row, Select,
} from '../../../components/ui';
import { PageHead } from '../../../components/shell';

const gbp = (pence: string) => '£' + (Number(pence) / 100).toFixed(2);
const COLUMNS = '110px 1fr 130px 1fr 110px 110px';

export default function Payments() {
  const [customers, setCustomers] = useState<any[] | null>(null);
  const [payments, setPayments] = useState<any[] | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [openInvoices, setOpenInvoices] = useState<any[] | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const [recording, setRecording] = useState(false);
  const [partyId, setPartyId] = useState('');
  const [method, setMethod] = useState('BANK_TRANSFER');
  const [reference, setReference] = useState('');
  const [amount, setAmount] = useState('');

  const [allocInvoiceId, setAllocInvoiceId] = useState('');
  const [allocAmount, setAllocAmount] = useState('');

  const router = useRouter();

  async function loadList() {
    try {
      const [c, p] = await Promise.all([api('/customers'), api('/payments')]);
      setCustomers(c);
      setPayments(p);
      if (c[0] && !partyId) setPartyId(c[0].id);
    } catch (e) {
      if (e instanceof ApiRequestError && e.status === 401) { router.push('/login'); return; }
      setError(e instanceof ApiRequestError ? e.error.message : 'Failed to load payments');
    }
  }
  useEffect(() => { loadList(); }, []);

  const selected = useMemo(() => payments?.find((p) => p.id === selectedId) ?? null, [payments, selectedId]);

  async function selectPayment(id: string) {
    setSelectedId(id);
    setOpenInvoices(null);
    setAllocInvoiceId('');
    setAllocAmount('');
    const p = payments?.find((x) => x.id === id);
    if (!p) return;
    try {
      const invoices = await api(`/invoices?partyId=${p.partyId}`);
      const open = invoices.filter((i: any) => i.status === 'ISSUED' || i.status === 'PARTIALLY_PAID');
      setOpenInvoices(open);
      if (open[0]) setAllocInvoiceId(open[0].id);
    } catch (e) {
      setError(e instanceof ApiRequestError ? e.error.message : 'Failed to load open invoices');
    }
  }

  async function record() {
    setBusy(true);
    try {
      await api('/payments', {
        method: 'POST',
        body: JSON.stringify({
          partyId, method, reference: reference || undefined,
          amountPence: Math.round(Number(amount) * 100),
        }),
      });
      setError('');
      setRecording(false);
      setReference('');
      setAmount('');
      await loadList();
    } catch (e) {
      setError(e instanceof ApiRequestError ? e.error.message : 'Failed to record payment');
    } finally {
      setBusy(false);
    }
  }

  async function allocate() {
    if (!selected || !allocInvoiceId) return;
    setBusy(true);
    try {
      await api(`/payments/${selected.id}/allocate`, {
        method: 'POST',
        body: JSON.stringify({ invoiceId: allocInvoiceId, amountPence: Math.round(Number(allocAmount) * 100) }),
      });
      setError('');
      setAllocAmount('');
      await loadList();
      selectPayment(selected.id);
    } catch (e) {
      setError(e instanceof ApiRequestError ? e.error.message : 'Failed to allocate payment');
    } finally {
      setBusy(false);
    }
  }

  if (customers === null || payments === null) return <LoadingState label="Loading payments…" />;

  return (
    <>
      <PageHead title="Payments" subtitle="Receipts and allocation against outstanding invoices">
        <Button variant="primary" onClick={() => setRecording((v) => !v)}>{recording ? 'Cancel' : 'Record payment'}</Button>
      </PageHead>

      {error && <ErrorBanner message={error} />}

      {recording && (
        <div className="card" style={{ marginBottom: 'var(--s5)', padding: 'var(--s5)', display: 'grid', gap: 10, maxWidth: 480 }}>
          <FormField label="Customer">
            <Select value={partyId} onChange={(e) => setPartyId(e.target.value)}>
              {customers.map((c) => <option key={c.id} value={c.id}>{c.legalName}</option>)}
            </Select>
          </FormField>
          <FormField label="Method">
            <Select value={method} onChange={(e) => setMethod(e.target.value)}>
              <option value="BANK_TRANSFER">Bank transfer</option>
              <option value="CARD">Card</option>
              <option value="CASH">Cash</option>
              <option value="OTHER">Other</option>
            </Select>
          </FormField>
          <FormField label="Reference (optional)">
            <Input value={reference} onChange={(e) => setReference(e.target.value)} placeholder="e.g. bank ref" />
          </FormField>
          <FormField label="Amount (£)">
            <Input value={amount} onChange={(e) => setAmount(e.target.value)} inputMode="decimal" placeholder="0.00" />
          </FormField>
          <Button variant="primary" onClick={record} disabled={busy || !partyId || !amount}>Record payment</Button>
        </div>
      )}

      <div className="workspace-split">
        <section>
          {payments.length === 0 ? (
            <EmptyState title="No payments recorded" description="Record your first receipt above." />
          ) : (
            <DataTable columns={COLUMNS}>
              <Row columns={COLUMNS} head>
                <Cell>Date</Cell><Cell>Customer</Cell><Cell>Method</Cell><Cell>Reference</Cell>
                <Cell align="right">Amount</Cell><Cell align="right">Unallocated</Cell>
              </Row>
              {payments.map((p) => (
                <Row key={p.id} columns={COLUMNS} selected={p.id === selectedId} onClick={() => selectPayment(p.id)}>
                  <Cell><span className="num">{new Date(p.receivedDate).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}</span></Cell>
                  <Cell>{p.party?.legalName ?? '—'}</Cell>
                  <Cell>{p.method.replace('_', ' ')}</Cell>
                  <Cell><span style={{ color: 'var(--slate)' }}>{p.reference ?? '—'}</span></Cell>
                  <Cell align="right"><span className="num" style={{ fontWeight: 600 }}>{gbp(p.amount)}</span></Cell>
                  <Cell align="right">
                    <span className="num" style={{ color: p.unallocated !== '0' ? 'var(--warning)' : 'var(--slate)' }}>
                      {gbp(p.unallocated)}
                    </span>
                  </Cell>
                </Row>
              ))}
            </DataTable>
          )}
        </section>

        <DetailPanel>
          {!selected ? (
            <EmptyState title="No payment selected" description="Click a row to allocate it against an invoice." />
          ) : (
            <>
              <DetailHead
                title={gbp(selected.amount)}
                subtitle={`${selected.party?.legalName ?? ''} · ${new Date(selected.receivedDate).toLocaleDateString('en-GB')}`}
              />
              <div className="detail-body">
                {selected.allocations.length === 0 ? (
                  <div style={{ padding: '0 var(--s5)', fontSize: 13, color: 'var(--slate)' }}>Not yet allocated to any invoice.</div>
                ) : (
                  selected.allocations.map((a: any) => (
                    <AuditLine key={a.id}>Allocated {gbp(a.amount)} to {a.invoice?.number ?? 'invoice'}</AuditLine>
                  ))
                )}
              </div>

              {selected.unallocated !== '0' && (
                <div style={{ padding: 'var(--s4) var(--s5)', display: 'grid', gap: 10 }}>
                  <div style={{ fontSize: 13, fontWeight: 500 }}>Allocate {gbp(selected.unallocated)} remaining</div>
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
