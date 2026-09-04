'use client';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { api, ApiRequestError } from '../../lib/api';
import { Button, Card, EmptyState, ErrorBanner, Input, LoadingState, Table, Td, Th } from '../../components/ui';

export default function Suppliers() {
  const [list, setList] = useState<any[] | null>(null);
  const [name, setName] = useState('');
  const [error, setError] = useState('');
  const router = useRouter();

  async function load() {
    try {
      setList(await api('/suppliers'));
    } catch (e) {
      if (e instanceof ApiRequestError && e.status === 401) { router.push('/login'); return; }
      setError(e instanceof ApiRequestError ? e.error.message : 'Failed to load suppliers');
    }
  }
  useEffect(() => { load(); }, []);

  async function create() {
    try {
      await api('/suppliers', { method: 'POST', body: JSON.stringify({ legalName: name }) });
      setError('');
      setName('');
      load();
    } catch (e) {
      // FR-PTY-008: a possible-duplicate warning is a 409, not a hard
      // failure — this slice auto-confirms rather than showing the
      // candidate list a fuller UI would (POST /suppliers already returns
      // them in error.details.possibleDuplicates for that future screen).
      if (e instanceof ApiRequestError && e.error.code === 'party.possible_duplicate') {
        try {
          await api('/suppliers', { method: 'POST', body: JSON.stringify({ legalName: name, confirmDuplicate: true }) });
          setName(''); setError(''); load();
        } catch (e2) {
          setError(e2 instanceof ApiRequestError ? e2.error.message : 'Failed to create supplier');
        }
        return;
      }
      setError(e instanceof ApiRequestError ? e.error.message : 'Failed to create supplier');
    }
  }

  return (
    <div className="grid gap-4">
      <Card>
        <div className="flex gap-2">
          <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Legal name" />
          <Button onClick={create} disabled={!name.trim()}>Add supplier</Button>
        </div>
        <p className="mt-2 text-xs text-slate-500">
          Bank details can be added via the API (<code>POST /suppliers/:id/bank-details</code>) — encrypted at rest,
          re-authentication required to change. Not yet in this screen.
        </p>
      </Card>

      {error && <ErrorBanner message={error} />}

      {list === null ? (
        <LoadingState label="Loading suppliers…" />
      ) : list.length === 0 ? (
        <EmptyState title="No suppliers yet" description="Add your first supplier above." />
      ) : (
        <Table>
          <thead><tr><Th>Legal name</Th><Th>Payment terms</Th><Th>Bank details</Th></tr></thead>
          <tbody>
            {list.map((p) => (
              <tr key={p.id} className="border-t border-slate-100">
                <Td>{p.legalName}</Td>
                <Td>{p.supplier?.paymentTerms} days</Td>
                <Td>{p.supplier?.hasBankDetails ? 'On file' : '—'}</Td>
              </tr>
            ))}
          </tbody>
        </Table>
      )}
    </div>
  );
}
