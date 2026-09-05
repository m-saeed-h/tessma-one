'use client';
import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { api, ApiRequestError } from '../../../lib/api';
import {
  Cell, DataTable, DetailHead, DetailPanel, EmptyState, ErrorBanner, LoadingState,
  Metric, MetricStrip, Row,
} from '../../../components/ui';
import { PageHead } from '../../../components/shell';

const gbp = (pence: string | bigint) => '£' + (Number(pence) / 100).toFixed(2);
const COLUMNS = '1fr 110px 110px 110px 110px 110px 120px';

export default function AgedReceivables() {
  const [rows, setRows] = useState<any[] | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [error, setError] = useState('');
  const router = useRouter();

  useEffect(() => {
    api('/reports/aged-receivables')
      .then(setRows)
      .catch((e) => {
        if (e instanceof ApiRequestError && e.status === 401) { router.push('/login'); return; }
        setError(e instanceof ApiRequestError ? e.error.message : 'Failed to load aged receivables');
      });
  }, []);

  const selected = useMemo(() => rows?.find((r) => r.partyId === selectedId) ?? null, [rows, selectedId]);

  const totals = useMemo(() => {
    if (!rows) return null;
    const sum = (key: string) => rows.reduce((s, r) => s + BigInt(r[key]), 0n);
    return { current: sum('current'), d30: sum('d30'), d60: sum('d60'), d90: sum('d90'), d120plus: sum('d120plus'), total: sum('total') };
  }, [rows]);

  if (rows === null) return <LoadingState label="Loading aged receivables…" />;

  return (
    <>
      <PageHead title="Aged receivables" subtitle="Outstanding balance by customer, bucketed by days overdue" />

      {error && <ErrorBanner message={error} />}

      {totals && rows.length > 0 && (
        <MetricStrip>
          <Metric label="Current" value={gbp(totals.current)} />
          <Metric label="1–30 days" value={gbp(totals.d30)} />
          <Metric label="31–90 days" value={gbp(totals.d60 + totals.d90)} />
          <Metric label="90+ days" value={gbp(totals.d120plus)} />
        </MetricStrip>
      )}

      <div className="workspace-split">
        <section>
          {rows.length === 0 ? (
            <EmptyState title="Nothing outstanding" description="Every issued invoice has been paid in full." />
          ) : (
            <DataTable columns={COLUMNS}>
              <Row columns={COLUMNS} head>
                <Cell>Customer</Cell><Cell align="right">Current</Cell><Cell align="right">1–30</Cell>
                <Cell align="right">31–60</Cell><Cell align="right">61–90</Cell><Cell align="right">90+</Cell>
                <Cell align="right">Total</Cell>
              </Row>
              {rows.map((r) => (
                <Row key={r.partyId} columns={COLUMNS} selected={r.partyId === selectedId} onClick={() => setSelectedId(r.partyId)}>
                  <Cell>{r.legalName}</Cell>
                  <Cell align="right"><span className="num">{gbp(r.current)}</span></Cell>
                  <Cell align="right"><span className="num">{gbp(r.d30)}</span></Cell>
                  <Cell align="right"><span className="num">{gbp(r.d60)}</span></Cell>
                  <Cell align="right"><span className="num" style={{ color: r.d90 !== '0' ? 'var(--warning)' : undefined }}>{gbp(r.d90)}</span></Cell>
                  <Cell align="right"><span className="num" style={{ color: r.d120plus !== '0' ? 'var(--danger)' : undefined }}>{gbp(r.d120plus)}</span></Cell>
                  <Cell align="right"><span className="num" style={{ fontWeight: 600 }}>{gbp(r.total)}</span></Cell>
                </Row>
              ))}
            </DataTable>
          )}
        </section>

        <DetailPanel>
          {!selected ? (
            <EmptyState title="No customer selected" description="Click a row to see which invoices make up the balance." />
          ) : (
            <>
              <DetailHead title={selected.legalName} subtitle={`${gbp(selected.total)} outstanding across ${selected.invoices.length} invoice${selected.invoices.length === 1 ? '' : 's'}`} />
              <div className="detail-body">
                {selected.invoices
                  .slice()
                  .sort((a: any, b: any) => b.daysOverdue - a.daysOverdue)
                  .map((inv: any) => (
                    <div className="line" key={inv.id}>
                      <span className="desc">
                        {inv.number ?? 'Draft'}
                        <small>
                          {inv.dueDate ? `due ${new Date(inv.dueDate).toLocaleDateString('en-GB')}` : 'no due date'}
                          {inv.daysOverdue > 0 ? ` · ${inv.daysOverdue}d overdue` : ' · not yet due'}
                        </small>
                      </span>
                      <span className="num" style={{ fontWeight: 500, color: inv.daysOverdue > 0 ? 'var(--danger)' : undefined }}>
                        {gbp(inv.outstanding)}
                      </span>
                    </div>
                  ))}
              </div>
            </>
          )}
        </DetailPanel>
      </div>
    </>
  );
}
