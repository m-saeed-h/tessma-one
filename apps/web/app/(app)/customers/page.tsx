'use client';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { api, ApiRequestError } from '../../../lib/api';
import { Button, Card, Cell, DataTable, EmptyState, ErrorBanner, Input, LoadingState, Row } from '../../../components/ui';
import { PageHead } from '../../../components/shell';

const COLUMNS = '1fr 200px';

export default function Customers() {
  const [list, setList] = useState<any[] | null>(null); // null = still loading
  const [name, setName] = useState('');
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
      // FR-PTY-008: a possible-duplicate warning is a 409, not a hard
      // failure — this slice auto-confirms rather than showing the
      // candidate list a fuller UI would (POST /customers already returns
      // them in error.details.possibleDuplicates for that future screen).
      if (e instanceof ApiRequestError && e.error.code === 'party.possible_duplicate') {
        try {
          await api('/customers', { method: 'POST', body: JSON.stringify({ legalName: name, confirmDuplicate: true }) });
          setName(''); setError(''); load();
        } catch (e2) {
          setError(e2 instanceof ApiRequestError ? e2.error.message : 'Failed to create customer');
        }
        return;
      }
      setError(e instanceof ApiRequestError ? e.error.message : 'Failed to create customer');
    }
  }

  return (
    <>
      <PageHead title="Customers" subtitle="Who you invoice" />

      <Card className="mb-4">
        <div className="flex gap-2">
          <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Legal name" />
          <Button variant="primary" onClick={create} disabled={!name.trim()}>Add customer</Button>
        </div>
      </Card>

      {error && <ErrorBanner message={error} />}

      {list === null ? (
        <LoadingState label="Loading customers…" />
      ) : list.length === 0 ? (
        <EmptyState title="No customers yet" description="Add your first customer above to start raising invoices." />
      ) : (
        <DataTable columns={COLUMNS}>
          <Row columns={COLUMNS} head><Cell>Legal name</Cell><Cell>ID</Cell></Row>
          {list.map((p) => (
            <Row key={p.id} columns={COLUMNS}>
              <Cell>{p.legalName}</Cell>
              <Cell><span className="ident" style={{ color: 'var(--muted)' }}>{p.id.slice(0, 8)}</span></Cell>
            </Row>
          ))}
        </DataTable>
      )}
    </>
  );
}
