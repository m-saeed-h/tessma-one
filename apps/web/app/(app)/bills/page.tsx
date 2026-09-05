'use client';
import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { api, ApiRequestError } from '../../../lib/api';
import { uploadDocument } from '../../../lib/upload';
import {
  Button, Cell, DataTable, DetailHead, DetailPanel, EmptyState, ErrorBanner,
  FormField, Input, LineItem, LoadingState, Row, Select, StatusPill, TotalRow, Totals,
} from '../../../components/ui';
import { PageHead } from '../../../components/shell';

const gbp = (pence: string) => '£' + (Number(pence) / 100).toFixed(2);
const COLUMNS = '130px 1fr 110px 100px';

export default function Bills() {
  const [suppliers, setSuppliers] = useState<any[] | null>(null);
  const [bills, setBills] = useState<any[] | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [selected, setSelected] = useState<any | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const [creating, setCreating] = useState(false);
  const [supplierId, setSupplierId] = useState('');
  const [number, setNumber] = useState('');
  const [invoiceDate, setInvoiceDate] = useState(new Date().toISOString().slice(0, 10));
  const [description, setDescription] = useState('Office supplies');
  const [amount, setAmount] = useState('');
  const [vatRatePct, setVatRatePct] = useState('20');
  const [file, setFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const router = useRouter();

  async function loadList() {
    try {
      const [s, b] = await Promise.all([api('/suppliers'), api('/purchase-invoices')]);
      setSuppliers(s);
      setBills(b);
      if (s[0] && !supplierId) setSupplierId(s[0].id);
    } catch (e) {
      if (e instanceof ApiRequestError && e.status === 401) { router.push('/login'); return; }
      setError(e instanceof ApiRequestError ? e.error.message : 'Failed to load bills');
    }
  }
  useEffect(() => { loadList(); }, []);

  async function selectBill(id: string) {
    setSelectedId(id);
    try {
      setSelected(await api(`/purchase-invoices/${id}`));
    } catch (e) {
      setError(e instanceof ApiRequestError ? e.error.message : 'Failed to load bill');
    }
  }

  async function create() {
    if (!file) { setError('Attach the original bill before entering it — FR-PIN-002 requires the source document.'); return; }
    setUploading(true);
    try {
      const documentId = await uploadDocument(file, 'PurchaseInvoice', 'pending');
      await api('/purchase-invoices', {
        method: 'POST',
        body: JSON.stringify({
          supplierId, number, invoiceDate: new Date(invoiceDate).toISOString(), documentId,
          lines: [{ description, nominalCode: '6000', quantity: 1, unitPrice: Math.round(Number(amount) * 100), vatRatePct: Number(vatRatePct) }],
        }),
      });
      setError('');
      setCreating(false);
      setNumber(''); setAmount(''); setFile(null);
      await loadList();
    } catch (e) {
      setError(e instanceof ApiRequestError ? e.error.message : 'Failed to enter bill');
    } finally {
      setUploading(false);
    }
  }

  async function submit() {
    if (!selected) return;
    setBusy(true);
    try {
      await api(`/purchase-invoices/${selected.id}/submit`, { method: 'POST' });
      setError('');
      await loadList();
      selectBill(selected.id);
    } catch (e) {
      setError(e instanceof ApiRequestError ? e.error.message : 'Failed to submit for approval');
    } finally {
      setBusy(false);
    }
  }

  const supplierName = useMemo(() => (id: string) => suppliers?.find((s) => s.id === id)?.legalName ?? '—', [suppliers]);

  if (suppliers === null || bills === null) return <LoadingState label="Loading bills…" />;

  return (
    <>
      <PageHead title="Bills" subtitle="Accounts payable — supplier invoices, entered, approved, and posted to the ledger">
        <Button variant="primary" onClick={() => setCreating((v) => !v)}>{creating ? 'Cancel' : 'Enter a bill'}</Button>
      </PageHead>

      {error && <ErrorBanner message={error} />}

      {creating && (
        <div className="card" style={{ marginBottom: 'var(--s5)', padding: 'var(--s5)', display: 'grid', gap: 10, maxWidth: 480 }}>
          <FormField label="Supplier">
            <Select value={supplierId} onChange={(e) => setSupplierId(e.target.value)}>
              {suppliers.map((s) => <option key={s.id} value={s.id}>{s.legalName}</option>)}
            </Select>
          </FormField>
          <FormField label="Supplier's invoice number"><Input value={number} onChange={(e) => setNumber(e.target.value)} placeholder="e.g. INV-4471" /></FormField>
          <FormField label="Invoice date"><Input type="date" value={invoiceDate} onChange={(e) => setInvoiceDate(e.target.value)} /></FormField>
          <FormField label="Description"><Input value={description} onChange={(e) => setDescription(e.target.value)} /></FormField>
          <div className="flex gap-3">
            <div style={{ flex: 1 }}><FormField label="Amount, net of VAT (£)"><Input value={amount} onChange={(e) => setAmount(e.target.value)} inputMode="decimal" placeholder="0.00" /></FormField></div>
            <div style={{ width: 100 }}><FormField label="VAT %"><Input value={vatRatePct} onChange={(e) => setVatRatePct(e.target.value)} inputMode="numeric" /></FormField></div>
          </div>
          <FormField label="Original bill (required)">
            <input type="file" accept="image/*,.pdf" onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
          </FormField>
          <Button variant="primary" onClick={create} disabled={uploading || !supplierId || !number.trim() || !amount || !file}>
            {uploading ? 'Uploading…' : 'Enter bill'}
          </Button>
        </div>
      )}

      <div className="workspace-split">
        <section>
          {bills.length === 0 ? (
            <EmptyState title="No bills yet" description="Enter your first supplier bill above." />
          ) : (
            <DataTable columns={COLUMNS}>
              <Row columns={COLUMNS} head><Cell>Number</Cell><Cell>Supplier</Cell><Cell align="right">Amount</Cell><Cell>Status</Cell></Row>
              {bills.map((b) => (
                <Row key={b.id} columns={COLUMNS} selected={b.id === selectedId} onClick={() => selectBill(b.id)}>
                  <Cell><span className="ident">{b.number}</span></Cell>
                  <Cell>{b.supplierName ?? supplierName(b.supplierId)}</Cell>
                  <Cell align="right"><span className="num" style={{ fontWeight: 600 }}>{gbp(b.grossTotal)}</span></Cell>
                  <Cell><StatusPill status={b.status} /></Cell>
                </Row>
              ))}
            </DataTable>
          )}
        </section>

        <DetailPanel>
          {!selected ? (
            <EmptyState title="No bill selected" description="Click a row to see its lines and posting." />
          ) : (
            <>
              <DetailHead title={selected.number} subtitle={selected.supplierName} status={<StatusPill status={selected.status} />} />
              <div className="detail-body">
                {selected.lines.map((l: any) => (
                  <LineItem key={l.id} description={l.description} meta={` ${l.quantity} × ${gbp(l.unitPrice)} · ${l.vatRatePct}% VAT`} amount={gbp(l.total)} />
                ))}
                <Totals>
                  <TotalRow label="Net" amount={gbp(selected.netTotal)} />
                  <TotalRow label="VAT" amount={gbp(selected.vatTotal)} />
                  <TotalRow label="Total" amount={gbp(selected.grossTotal)} grand />
                </Totals>
              </div>
              {selected.status === 'DRAFT' && (
                <div style={{ padding: '0 var(--s5) var(--s5)' }}>
                  <Button variant="primary" onClick={submit} disabled={busy} style={{ width: '100%' }}>Submit for approval</Button>
                </div>
              )}
              {selected.ledgerEntries?.length > 0 && (
                <div className="posting">
                  <div className="posting-title"><span className="h">Ledger posting</span></div>
                  <div className="post-row h"><span>Account</span><span className="dr">Debit</span><span className="cr">Credit</span></div>
                  {selected.ledgerEntries.map((e: any) => (
                    <div className="post-row" key={e.id}>
                      <span className="acct">{e.account.name} <span className="code ident">{e.account.code}</span></span>
                      <span className="dr num">{e.debit !== '0' ? gbp(e.debit) : '—'}</span>
                      <span className="cr num">{e.credit !== '0' ? gbp(e.credit) : '—'}</span>
                    </div>
                  ))}
                </div>
              )}
            </>
          )}
        </DetailPanel>
      </div>
    </>
  );
}
