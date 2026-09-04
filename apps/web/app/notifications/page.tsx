'use client';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { api, ApiRequestError } from '../../lib/api';
import { Button, Card, EmptyState, ErrorBanner, LoadingState, StatusPill } from '../../components/ui';
import { PageHead } from '../../components/shell';

export default function Notifications() {
  const [list, setList] = useState<any[] | null>(null);
  const [error, setError] = useState('');
  const router = useRouter();

  async function load() {
    try {
      setList(await api('/notifications'));
    } catch (e) {
      if (e instanceof ApiRequestError && e.status === 401) { router.push('/login'); return; }
      setError(e instanceof ApiRequestError ? e.error.message : 'Failed to load notifications');
    }
  }
  useEffect(() => { load(); }, []);

  async function markRead(id: string) {
    try {
      await api(`/notifications/${id}/read`, { method: 'POST' });
      load();
    } catch (e) {
      setError(e instanceof ApiRequestError ? e.error.message : 'Failed to mark as read');
    }
  }

  return (
    <>
      <PageHead title="Notifications" subtitle="Platform events raised by every module" />

      {error && <ErrorBanner message={error} />}

      {list === null ? (
        <LoadingState label="Loading notifications…" />
      ) : list.length === 0 ? (
        <EmptyState title="No notifications yet" description="Issuing an invoice will notify you here." />
      ) : (
        <div className="grid gap-3">
          {list.map((n) => (
            <Card key={n.id} className="flex items-center justify-between gap-4">
              <div>
                <div style={{ fontSize: 14, fontWeight: 500 }}>{n.subject}</div>
                <div style={{ fontSize: 13, color: 'var(--slate)' }}>{n.body}</div>
              </div>
              <div className="flex items-center gap-2">
                <StatusPill status={n.status} />
                {n.status !== 'READ' && <Button onClick={() => markRead(n.id)}>Mark read</Button>}
              </div>
            </Card>
          ))}
        </div>
      )}
    </>
  );
}
