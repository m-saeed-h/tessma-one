'use client';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { api, ApiRequestError } from '../../lib/api';
import { Button, Card, ErrorBanner, LoadingState, Select, StatusBadge, Table, Td, Th } from '../../components/ui';

const gbp = (p: string) => '£' + (Number(p) / 100).toFixed(2);

export default function Invoices() {
  const [customers, setCustomers] = useState<any[] | null>(null);
  const [partyId, setPartyId] = useState('');
  const [invoice, setInvoice] = useState<any>(null);
  const [tb, setTb] = useState<any>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const router = useRouter();

  useEffect(() => {
    api('/customers')
      .then((c) => { setCustomers(c); if (c[0]) setPartyId(c[0].id); })
      .catch((e) => {
        if (e instanceof ApiRequestError && e.status === 401) { router.push('/login'); return; }
        setError(e instanceof ApiRequestError ? e.error.message : 'Failed to load customers');
        setCustomers([]);
      });
  }, []);

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
      setInvoice(r);
      setTb(null);
      setError('');
    } catch (e) {
      setError(e instanceof ApiRequestError ? e.error.message : 'Failed to create draft');
    } finally {
      setBusy(false);
    }
  }

  async function issue() {
    setBusy(true);
    try {
      const r = await api(`/invoices/${invoice.id}/issue`, { method: 'POST' });
      setInvoice(r);
      setTb(await api('/invoices/trial-balance'));
      setError('');
    } catch (e) {
      setError(e instanceof ApiRequestError ? e.error.message : 'Failed to issue invoice');
    } finally {
      setBusy(false);
    }
  }

  if (customers === null) return <LoadingState label="Loading customers…" />;

  return (
    <div className="grid gap-4">
      <Card>
        <div className="flex flex-wrap items-center gap-2">
          <Select value={partyId} onChange={(e) => setPartyId(e.target.value)} className="max-w-xs">
            {customers.map((c) => <option key={c.id} value={c.id}>{c.legalName}</option>)}
          </Select>
          <Button onClick={draft} disabled={!partyId || busy} variant="secondary">Create draft</Button>
          <Button onClick={issue} disabled={!invoice || invoice.status !== 'DRAFT' || busy}>Issue</Button>
        </div>
      </Card>

      {error && <ErrorBanner message={error} />}

      {invoice && (
        <Card className="flex items-center justify-between">
          <div>
            <div className="font-medium">{invoice.number || 'Draft'}</div>
            <div className="text-sm text-slate-500">
              Net {gbp(invoice.netTotal)} · VAT {gbp(invoice.vatTotal)} ·{' '}
              <span className="font-medium text-slate-900">Gross {gbp(invoice.grossTotal)}</span>
            </div>
          </div>
          <StatusBadge status={invoice.status} />
        </Card>
      )}

      {tb && (
        <div>
          <h4 className="mb-2 text-sm font-medium text-slate-700">Trial balance — proves the books balance</h4>
          <Table>
            <thead><tr><Th>Account</Th><Th align="right">Debit</Th><Th align="right">Credit</Th></tr></thead>
            <tbody>
              {Object.entries(tb).map(([code, v]: any) => (
                <tr key={code} className="border-t border-slate-100">
                  <Td>{v.name}</Td>
                  <Td align="right">{gbp(v.debit)}</Td>
                  <Td align="right">{gbp(v.credit)}</Td>
                </tr>
              ))}
            </tbody>
          </Table>
        </div>
      )}
    </div>
  );
}
