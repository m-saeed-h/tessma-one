'use client';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { api, ApiRequestError } from '../../../lib/api';
import { uploadDocument } from '../../../lib/upload';
import {
  Button, Cell, DataTable, EmptyState, ErrorBanner, FormField, Input, LoadingState, Row, Select, StatusPill,
} from '../../../components/ui';
import { PageHead } from '../../../components/shell';

const gbp = (pence: string) => '£' + (Number(pence) / 100).toFixed(2);
const COLUMNS = '110px 1fr 110px 100px 100px 120px';

export default function Expenses() {
  const [mine, setMine] = useState<any[] | null>(null);
  const [pending, setPending] = useState<any[] | null>(null); // null = not permitted / not loaded
  const [canApprove, setCanApprove] = useState(false);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState<string | null>(null);

  const [creating, setCreating] = useState(false);
  const [category, setCategory] = useState('Travel');
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [description, setDescription] = useState('');
  const [amount, setAmount] = useState('');
  const [vatRatePct, setVatRatePct] = useState('20');
  const [paymentMethod, setPaymentMethod] = useState('EMPLOYEE_PAID');
  const [receipt, setReceipt] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const router = useRouter();

  async function load() {
    try {
      setMine(await api('/expenses/mine'));
    } catch (e) {
      if (e instanceof ApiRequestError && e.status === 401) { router.push('/login'); return; }
      setError(e instanceof ApiRequestError ? e.error.message : 'Failed to load expenses');
    }
    try {
      setPending(await api('/expenses/pending'));
      setCanApprove(true);
    } catch {
      setCanApprove(false); // no EXPENSE_APPROVE permission — not an error, just a narrower view
    }
  }
  useEffect(() => { load(); }, []);

  async function submitNew() {
    setUploading(true);
    try {
      let receiptDocId: string | undefined;
      if (receipt) receiptDocId = await uploadDocument(receipt, 'Expense', 'pending');

      const created = await api('/expenses', {
        method: 'POST',
        body: JSON.stringify({
          category, date: new Date(date).toISOString(), description,
          grossPence: Math.round(Number(amount) * 100), vatRatePct: Number(vatRatePct),
          paymentMethod, receiptDocId, vatRecoverable: !!receiptDocId,
        }),
      });
      await api(`/expenses/${created.id}/submit`, { method: 'POST' });
      setError('');
      setCreating(false);
      setDescription(''); setAmount(''); setReceipt(null);
      await load();
    } catch (e) {
      setError(e instanceof ApiRequestError ? e.error.message : 'Failed to submit expense');
    } finally {
      setUploading(false);
    }
  }

  async function decide(id: string, decision: 'APPROVED' | 'REJECTED') {
    setBusy(id);
    try {
      await api(`/expenses/${id}/decide`, { method: 'POST', body: JSON.stringify({ decision }) });
      setError('');
      await load();
    } catch (e) {
      setError(e instanceof ApiRequestError ? e.error.message : 'Failed to record decision');
    } finally {
      setBusy(null);
    }
  }

  if (mine === null) return <LoadingState label="Loading expenses…" />;

  return (
    <>
      <PageHead title="Expenses" subtitle="Submit a claim, track its approval, see it post to the ledger once approved">
        <Button variant="primary" onClick={() => setCreating((v) => !v)}>{creating ? 'Cancel' : 'New expense'}</Button>
      </PageHead>

      {error && <ErrorBanner message={error} />}

      {creating && (
        <div className="card" style={{ marginBottom: 'var(--s5)', padding: 'var(--s5)', display: 'grid', gap: 10, maxWidth: 480 }}>
          <FormField label="Category">
            <Select value={category} onChange={(e) => setCategory(e.target.value)}>
              <option>Travel</option><option>Meals & entertainment</option><option>Office supplies</option>
              <option>Software</option><option>Other</option>
            </Select>
          </FormField>
          <FormField label="Date"><Input type="date" value={date} onChange={(e) => setDate(e.target.value)} /></FormField>
          <FormField label="Description"><Input value={description} onChange={(e) => setDescription(e.target.value)} placeholder="What was this for?" /></FormField>
          <div className="flex gap-3">
            <div style={{ flex: 1 }}><FormField label="Amount, gross (£)"><Input value={amount} onChange={(e) => setAmount(e.target.value)} inputMode="decimal" placeholder="0.00" /></FormField></div>
            <div style={{ width: 100 }}><FormField label="VAT %"><Input value={vatRatePct} onChange={(e) => setVatRatePct(e.target.value)} inputMode="numeric" /></FormField></div>
          </div>
          <FormField label="Paid by">
            <Select value={paymentMethod} onChange={(e) => setPaymentMethod(e.target.value)}>
              <option value="EMPLOYEE_PAID">Me (reimburse later)</option>
              <option value="COMPANY_CARD">Company card</option>
              <option value="CASH">Cash</option>
            </Select>
          </FormField>
          <FormField label="Receipt (optional — required to reclaim VAT)">
            <input type="file" accept="image/*,.pdf" onChange={(e) => setReceipt(e.target.files?.[0] ?? null)} />
          </FormField>
          <Button variant="primary" onClick={submitNew} disabled={uploading || !description.trim() || !amount}>
            {uploading ? 'Submitting…' : 'Submit for approval'}
          </Button>
        </div>
      )}

      {canApprove && pending && pending.length > 0 && (
        <section style={{ marginBottom: 'var(--s6)' }}>
          <div style={{ fontWeight: 600, fontSize: 14, marginBottom: 'var(--s3)' }}>Awaiting your approval</div>
          <DataTable columns={COLUMNS}>
            <Row columns={COLUMNS} head><Cell>Date</Cell><Cell>Description</Cell><Cell>Category</Cell><Cell align="right">Amount</Cell><Cell>Status</Cell><Cell></Cell></Row>
            {pending.map((e) => (
              <Row key={e.id} columns={COLUMNS}>
                <Cell><span className="num">{new Date(e.date).toLocaleDateString('en-GB')}</span></Cell>
                <Cell>{e.description}</Cell>
                <Cell>{e.category}</Cell>
                <Cell align="right"><span className="num">{gbp(e.gross)}</span></Cell>
                <Cell><StatusPill status={e.status} /></Cell>
                <Cell>
                  <div className="flex gap-2">
                    <Button variant="primary" onClick={() => decide(e.id, 'APPROVED')} disabled={busy === e.id}>Approve</Button>
                    <Button onClick={() => decide(e.id, 'REJECTED')} disabled={busy === e.id}>Reject</Button>
                  </div>
                </Cell>
              </Row>
            ))}
          </DataTable>
        </section>
      )}

      <div style={{ fontWeight: 600, fontSize: 14, marginBottom: 'var(--s3)' }}>My claims</div>
      {mine.length === 0 ? (
        <EmptyState title="No expenses yet" description="Submit your first claim above." />
      ) : (
        <DataTable columns={COLUMNS}>
          <Row columns={COLUMNS} head><Cell>Date</Cell><Cell>Description</Cell><Cell>Category</Cell><Cell align="right">Amount</Cell><Cell>Status</Cell><Cell></Cell></Row>
          {mine.map((e) => (
            <Row key={e.id} columns={COLUMNS}>
              <Cell><span className="num">{new Date(e.date).toLocaleDateString('en-GB')}</span></Cell>
              <Cell>{e.description}</Cell>
              <Cell>{e.category}</Cell>
              <Cell align="right"><span className="num">{gbp(e.gross)}</span></Cell>
              <Cell><StatusPill status={e.status} /></Cell>
              <Cell></Cell>
            </Row>
          ))}
        </DataTable>
      )}
    </>
  );
}
