'use client';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { api, ApiRequestError } from '../../lib/api';

const gbp = (p: string) => '£' + (Number(p) / 100).toFixed(2);

export default function Invoices() {
  const [customers, setCustomers] = useState<any[]>([]);
  const [partyId, setPartyId] = useState('');
  const [invoice, setInvoice] = useState<any>(null);
  const [tb, setTb] = useState<any>(null);
  const [error, setError] = useState('');
  const router = useRouter();

  useEffect(() => {
    api('/customers')
      .then((c) => { setCustomers(c); if (c[0]) setPartyId(c[0].id); })
      .catch((e) => {
        if (e instanceof ApiRequestError && e.status === 401) { router.push('/login'); return; }
        setError(e instanceof ApiRequestError ? e.error.message : 'Failed to load customers');
      });
  }, []);

  async function draft() {
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
      setError('');
    } catch (e) {
      setError(e instanceof ApiRequestError ? e.error.message : 'Failed to create draft');
    }
  }
  async function issue() {
    try {
      const r = await api(`/invoices/${invoice.id}/issue`, { method: 'POST' });
      setInvoice(r);
      setTb(await api('/invoices/trial-balance'));
      setError('');
    } catch (e) {
      setError(e instanceof ApiRequestError ? e.error.message : 'Failed to issue invoice');
    }
  }

  return (
    <div>
      <div style={{ display: 'flex', gap: 8 }}>
        <select value={partyId} onChange={(e) => setPartyId(e.target.value)}>
          {customers.map((c) => <option key={c.id} value={c.id}>{c.legalName}</option>)}
        </select>
        <button onClick={draft} disabled={!partyId}>Create draft</button>
        <button onClick={issue} disabled={!invoice || invoice.status !== 'DRAFT'}>Issue</button>
      </div>

      {error && <p style={{ color: '#b3261e' }}>{error}</p>}

      {invoice && (
        <div style={{ marginTop: 16, padding: 12, border: '1px solid #e3e7ec', borderRadius: 8 }}>
          <strong>{invoice.number || 'DRAFT'}</strong> — status {invoice.status}<br />
          Net {gbp(invoice.netTotal)} · VAT {gbp(invoice.vatTotal)} · <strong>Gross {gbp(invoice.grossTotal)}</strong>
        </div>
      )}

      {tb && (
        <div style={{ marginTop: 16 }}>
          <h4>Trial balance (proves the books balance)</h4>
          <table cellPadding={6} style={{ borderCollapse: 'collapse' }}>
            <thead><tr><th align="left">Account</th><th align="right">Debit</th><th align="right">Credit</th></tr></thead>
            <tbody>
              {Object.entries(tb).map(([code, v]: any) => (
                <tr key={code}><td>{v.name}</td><td align="right">{gbp(v.debit)}</td><td align="right">{gbp(v.credit)}</td></tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
