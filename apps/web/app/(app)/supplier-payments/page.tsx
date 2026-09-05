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

export default function SupplierPayments() {
  const [suppliers, setSuppliers] = useState<any[] | null>(null);
  const [payments, setPayments] = useState<any[] | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [openBills, setOpenBills] = useState<any[] | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const [recording, setRecording] = useState(false);
  const [supplierId, setSupplierId] = useState('');
  const [method, setMethod] = useState('BANK_TRANSFER');
  const [reference, setReference] = useState('');
  const [amount, setAmount] = useState('');

  const [allocBillId, setAllocBillId] = useState('');
  const [allocAmount, setAllocAmount] = useState('');

  const router = useRouter();

  async function loadList() {
    try {
      const [s, p] = await Promise.all([api('/suppliers'), api('/supplier-payments')]);
      setSuppliers(s);
      setPayments(p);
      if (s[0] && !supplierId) setSupplierId(s[0].id);
    } catch (e) {
      if (e instanceof ApiRequestError && e.status === 401) { router.push('/login'); return; }
      setError(e instanceof ApiRequestError ? e.error.message : 'Failed to load supplier payments');
    }
  }
  useEffect(() => { loadList(); }, []);

  const selected = useMemo(() => payments?.find((p) => p.id === selectedId) ?? null, [payments, selectedId]);

  async function selectPayment(id: string) {
    setSelectedId(id);
    setOpenBills(null);
    setAllocBillId('');
    setAllocAmount('');
    const p = payments?.find((x) => x.id === id);
    if (!p) return;
    try {
      const bills = await api(`/purchase-invoices?supplierId=${p.supplierId}`);
      const open = bills.filter((b: any) => b.status === 'APPROVED' || b.status === 'PARTIALLY_PAID');
      setOpenBills(open);
      if (open[0]) setAllocBillId(open[0].id);
    } catch (e) {
      setError(e instanceof ApiRequestError ? e.error.message : 'Failed to load open bills');
    }
  }

  async function record() {
    setBusy(true);
    try {
      await api('/supplier-payments', {
        method: 'POST',
        body: JSON.stringify({ supplierId, method, reference: reference || undefined, amountPence: Math.round(Number(amount) * 100) }),
      });
      setError('');
      setRecording(false);
      setReference(''); setAmount('');
      await loadList();
    } catch (e) {
      setError(e instanceof ApiRequestError ? e.error.message : 'Failed to record payment');
    } finally {
      setBusy(false);
    }
  }

  async function allocate() {
    if (!selected || !allocBillId) return;
    setBusy(true);
    try {
      await api(`/supplier-payments/${selected.id}/allocate`, {
        method: 'POST',
        body: JSON.stringify({ purchaseInvoiceId: allocBillId, amountPence: Math.round(Number(allocAmount) * 100) }),
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

  if (suppliers === null || payments === null) return <LoadingState label="Loading supplier payments…" />;

  return (
    <>
      <PageHead title="Supplier payments" subtitle="What we've paid, and which bills it clears">
        <Button variant="primary" onClick={() => setRecording((v) => !v)}>{recording ? 'Cancel' : 'Record payment'}</Button>
      </PageHead>

      {error && <ErrorBanner message={error} />}

      {recording && (
        <div className="card" style={{ marginBottom: 'var(--s5)', padding: 'var(--s5)', display: 'grid', gap: 10, maxWidth: 480 }}>
          <FormField label="Supplier">
            <Select value={supplierId} onChange={(e) => setSupplierId(e.target.value)}>
              {suppliers.map((s) => <option key={s.id} value={s.id}>{s.legalName}</option>)}
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
          <FormField label="Reference (optional)"><Input value={reference} onChange={(e) => setReference(e.target.value)} /></FormField>
          <FormField label="Amount (£)"><Input value={amount} onChange={(e) => setAmount(e.target.value)} inputMode="decimal" placeholder="0.00" /></FormField>
          <Button variant="primary" onClick={record} disabled={busy || !supplierId || !amount}>Record payment</Button>
        </div>
      )}

      <div className="workspace-split">
        <section>
          {payments.length === 0 ? (
            <EmptyState title="No supplier payments recorded" description="Record your first payment above." />
          ) : (
            <DataTable columns={COLUMNS}>
              <Row columns={COLUMNS} head>
                <Cell>Date</Cell><Cell>Supplier</Cell><Cell>Method</Cell><Cell>Reference</Cell>
                <Cell align="right">Amount</Cell><Cell align="right">Unallocated</Cell>
              </Row>
              {payments.map((p) => (
                <Row key={p.id} columns={COLUMNS} selected={p.id === selectedId} onClick={() => selectPayment(p.id)}>
                  <Cell><span className="num">{new Date(p.paidDate).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}</span></Cell>
                  <Cell>{p.supplierName}</Cell>
                  <Cell>{p.method.replace('_', ' ')}</Cell>
                  <Cell><span style={{ color: 'var(--slate)' }}>{p.reference ?? '—'}</span></Cell>
                  <Cell align="right"><span className="num" style={{ fontWeight: 600 }}>{gbp(p.amount)}</span></Cell>
                  <Cell align="right"><span className="num" style={{ color: p.unallocated !== '0' ? 'var(--warning)' : 'var(--slate)' }}>{gbp(p.unallocated)}</span></Cell>
                </Row>
              ))}
            </DataTable>
          )}
        </section>

        <DetailPanel>
          {!selected ? (
            <EmptyState title="No payment selected" description="Click a row to allocate it against a bill." />
          ) : (
            <>
              <DetailHead title={gbp(selected.amount)} subtitle={`${selected.supplierName} · ${new Date(selected.paidDate).toLocaleDateString('en-GB')}`} />
              <div className="detail-body">
                {selected.allocations.length === 0 ? (
                  <div style={{ padding: '0 var(--s5)', fontSize: 13, color: 'var(--slate)' }}>Not yet allocated to any bill.</div>
                ) : (
                  selected.allocations.map((a: any) => (
                    <AuditLine key={a.id}>Allocated {gbp(a.amount)} to {a.purchaseInvoice?.number ?? 'a bill'}</AuditLine>
                  ))
                )}
              </div>
              {selected.unallocated !== '0' && (
                <div style={{ padding: 'var(--s4) var(--s5)', display: 'grid', gap: 10 }}>
                  <div style={{ fontSize: 13, fontWeight: 500 }}>Allocate {gbp(selected.unallocated)} remaining</div>
                  {openBills === null ? (
                    <div style={{ fontSize: 13, color: 'var(--slate)' }}>Loading open bills…</div>
                  ) : openBills.length === 0 ? (
                    <div style={{ fontSize: 13, color: 'var(--slate)' }}>This supplier has no approved, unpaid bills.</div>
                  ) : (
                    <>
                      <FormField label="Bill">
                        <Select value={allocBillId} onChange={(e) => setAllocBillId(e.target.value)}>
                          {openBills.map((b) => (
                            <option key={b.id} value={b.id}>{b.number} — {gbp((BigInt(b.grossTotal) - BigInt(b.allocatedTotal)).toString())} outstanding</option>
                          ))}
                        </Select>
                      </FormField>
                      <FormField label="Amount (£)"><Input value={allocAmount} onChange={(e) => setAllocAmount(e.target.value)} inputMode="decimal" placeholder="0.00" /></FormField>
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
