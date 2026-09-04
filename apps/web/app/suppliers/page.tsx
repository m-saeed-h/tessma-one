'use client';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { api, ApiRequestError } from '../../lib/api';
import { Button, Card, Cell, DataTable, EmptyState, ErrorBanner, Input, LoadingState, Row } from '../../components/ui';
import { PageHead } from '../../components/shell';

const COLUMNS = '1fr 140px 140px';

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
    <>
      <PageHead title="Suppliers" subtitle="Who you owe" />

      <Card className="mb-4">
        <div className="flex gap-2">
          <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Legal name" />
          <Button variant="primary" onClick={create} disabled={!name.trim()}>Add supplier</Button>
        </div>
        <p className="mt-2 text-xs" style={{ color: 'var(--muted)' }}>
          Bank details can be added via the API (<code className="ident">POST /suppliers/:id/bank-details</code>) —
          encrypted at rest, re-authentication required to change. Not yet in this screen.
        </p>
      </Card>

      {error && <ErrorBanner message={error} />}

      {list === null ? (
        <LoadingState label="Loading suppliers…" />
      ) : list.length === 0 ? (
        <EmptyState title="No suppliers yet" description="Add your first supplier above." />
      ) : (
        <DataTable columns={COLUMNS}>
          <Row columns={COLUMNS} head><Cell>Legal name</Cell><Cell>Payment terms</Cell><Cell>Bank details</Cell></Row>
          {list.map((p) => (
            <Row key={p.id} columns={COLUMNS}>
              <Cell>{p.legalName}</Cell>
              <Cell>{p.supplier?.paymentTerms} days</Cell>
              <Cell>{p.supplier?.hasBankDetails ? 'On file' : '—'}</Cell>
            </Row>
          ))}
        </DataTable>
      )}
    </>
  );
}
