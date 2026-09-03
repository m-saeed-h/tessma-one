'use client';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { api, ApiRequestError } from '../../lib/api';
import { Button, Card, EmptyState, ErrorBanner, LoadingState, StatusBadge } from '../../components/ui';

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

  if (list === null) return <LoadingState label="Loading notifications…" />;

  return (
    <div className="grid gap-3">
      {error && <ErrorBanner message={error} />}
      {list.length === 0 ? (
        <EmptyState title="No notifications yet" description="Issuing an invoice will notify you here." />
      ) : (
        list.map((n) => (
          <Card key={n.id} className="flex items-center justify-between gap-4">
            <div>
              <div className="text-sm font-medium">{n.subject}</div>
              <div className="text-sm text-slate-500">{n.body}</div>
            </div>
            <div className="flex items-center gap-2">
              <StatusBadge status={n.status} />
              {n.status !== 'READ' && (
                <Button variant="secondary" onClick={() => markRead(n.id)}>Mark read</Button>
              )}
            </div>
          </Card>
        ))
      )}
    </div>
  );
}
