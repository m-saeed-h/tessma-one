'use client';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { api, ApiRequestError } from '../../lib/api';
import { Button, Card, EmptyState, ErrorBanner, Input, LoadingState, Table, Td, Th } from '../../components/ui';

export default function Customers() {
  const [list, setList] = useState<any[] | null>(null); // null = still loading
  const [name, setName] = useState('Acme Retail Ltd');
  const [error, setError] = useState('');
  const router = useRouter();

  async function load() {
    try {
      setList(await api('/customers'));
    } catch (e) {
      if (e instanceof ApiRequestError && e.status === 401) { router.push('/login'); return; }
      setError(e instanceof ApiRequestError ? e.error.message : 'Failed to load customers');
    }
  }
  useEffect(() => { load(); }, []);

  async function create() {
    try {
      await api('/customers', { method: 'POST', body: JSON.stringify({ legalName: name }) });
      setError('');
      setName('');
      load();
    } catch (e) {
      setError(e instanceof ApiRequestError ? e.error.message : 'Failed to create customer');
    }
  }

  return (
    <div className="grid gap-4">
      <Card>
        <div className="flex gap-2">
          <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Legal name" />
          <Button onClick={create} disabled={!name.trim()}>Add customer</Button>
        </div>
      </Card>

      {error && <ErrorBanner message={error} />}

      {list === null ? (
        <LoadingState label="Loading customers…" />
      ) : list.length === 0 ? (
        <EmptyState title="No customers yet" description="Add your first customer above to start raising invoices." />
      ) : (
        <Table>
          <thead><tr><Th>Legal name</Th><Th>ID</Th></tr></thead>
          <tbody>
            {list.map((p) => (
              <tr key={p.id} className="border-t border-slate-100">
                <Td>{p.legalName}</Td>
                <Td><span className="text-slate-400">{p.id.slice(0, 8)}</span></Td>
              </tr>
            ))}
          </tbody>
        </Table>
      )}
    </div>
  );
}
