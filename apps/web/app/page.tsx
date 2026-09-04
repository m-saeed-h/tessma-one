'use client';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { api, ApiRequestError } from '../lib/api';
import { Card, ErrorBanner, LoadingState, Metric, MetricStrip } from '../components/ui';
import { PageHead } from '../components/shell';

const gbp = (pence: string) => {
  const n = Number(pence) / 100;
  return { cur: '£' + Math.trunc(n).toLocaleString(), minor: '.' + Math.abs(Math.round((n % 1) * 100)).toString().padStart(2, '0') };
};

export default function Dashboard() {
  const [metrics, setMetrics] = useState<any | null>(null);
  const [error, setError] = useState('');
  const router = useRouter();

  useEffect(() => {
    api('/reports/invoice-metrics')
      .then(setMetrics)
      .catch((e) => {
        if (e instanceof ApiRequestError && e.status === 401) { router.push('/login'); return; }
        setError(e instanceof ApiRequestError ? e.error.message : 'Failed to load dashboard');
      });
  }, []);

  return (
    <>
      <PageHead title="Dashboard" subtitle="Finance at a glance" />

      {error && <ErrorBanner message={error} />}

      {metrics === null && !error ? (
        <LoadingState label="Loading dashboard…" />
      ) : metrics ? (
        <MetricStrip>
          <Metric label="Outstanding" value={gbp(metrics.outstandingPence).cur} minor={gbp(metrics.outstandingPence).minor} />
          <Metric
            label="Overdue"
            value={gbp(metrics.overduePence).cur}
            minor={gbp(metrics.overduePence).minor}
            delta={metrics.overduePence !== '0' ? 'Needs chasing' : 'Nothing overdue'}
            direction={metrics.overduePence !== '0' ? 'down' : 'up'}
          />
          <Metric label="Paid this month" value={gbp(metrics.paidThisMonthPence).cur} minor={gbp(metrics.paidThisMonthPence).minor} />
          <Metric
            label="Avg days to pay"
            value={metrics.avgDaysToPay === null ? '—' : String(metrics.avgDaysToPay)}
            minor={metrics.avgDaysToPay === null ? undefined : 'days'}
          />
        </MetricStrip>
      ) : null}

      <Card className="mt-2 grid gap-2 text-sm" style={{ color: 'var(--slate)' }}>
        <p>
          Demo slice: create a customer, raise an invoice, issue it, and watch it post to a
          balanced ledger. Issuing an invoice also raises an in-app notification.
        </p>
        <p>
          Start at <a href="/invoices" style={{ color: 'var(--primary)', fontWeight: 500, textDecoration: 'underline' }}>Invoices</a>.
        </p>
      </Card>
    </>
  );
}
