'use client';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { api, ApiRequestError } from '../../lib/api';
import { Button, Card, Cell, DataTable, EmptyState, ErrorBanner, Input, LoadingState, Row, Select, StatusPill } from '../../components/ui';
import { PageHead } from '../../components/shell';

const gbp = (p: string) => '£' + (Number(p) / 100).toFixed(2);
const COLUMNS = '100px 1fr 100px 100px 90px 70px';

export default function Products() {
  const [list, setList] = useState<any[] | null>(null);
  const [name, setName] = useState('');
  const [sku, setSku] = useState('');
  const [price, setPrice] = useState('');
  const [type, setType] = useState('SERVICE');
  const [error, setError] = useState('');
  const router = useRouter();

  async function load() {
    try {
      setList(await api('/products'));
    } catch (e) {
      if (e instanceof ApiRequestError && e.status === 401) { router.push('/login'); return; }
      setError(e instanceof ApiRequestError ? e.error.message : 'Failed to load products');
    }
  }
  useEffect(() => { load(); }, []);

  async function create() {
    try {
      await api('/products', {
        method: 'POST',
        body: JSON.stringify({ sku, name, type, unitPricePence: Math.round(Number(price) * 100) }),
      });
      setError('');
      setName(''); setSku(''); setPrice('');
      load();
    } catch (e) {
      setError(e instanceof ApiRequestError ? e.error.message : 'Failed to create product');
    }
  }

  async function archive(id: string) {
    try {
      await api(`/products/${id}/archive`, { method: 'POST' });
      load();
    } catch (e) {
      setError(e instanceof ApiRequestError ? e.error.message : 'Failed to archive product');
    }
  }

  return (
    <>
      <PageHead title="Products" subtitle="What you sell" />

      <Card className="mb-4">
        <div className="flex flex-wrap items-end gap-2">
          <div style={{ width: 110 }}><Input value={sku} onChange={(e) => setSku(e.target.value)} placeholder="SKU" /></div>
          <div className="flex-1" style={{ minWidth: 160 }}><Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Name" /></div>
          <Select value={type} onChange={(e) => setType(e.target.value)} style={{ width: 130 }}>
            <option value="SERVICE">Service</option>
            <option value="PRODUCT">Product</option>
          </Select>
          <div style={{ width: 110 }}><Input value={price} onChange={(e) => setPrice(e.target.value)} placeholder="Price £" inputMode="decimal" /></div>
          <Button variant="primary" onClick={create} disabled={!sku.trim() || !name.trim() || !price}>Add product</Button>
        </div>
      </Card>

      {error && <ErrorBanner message={error} />}

      {list === null ? (
        <LoadingState label="Loading products…" />
      ) : list.length === 0 ? (
        <EmptyState title="No products yet" description="Add your first product or service above." />
      ) : (
        <DataTable columns={COLUMNS}>
          <Row columns={COLUMNS} head>
            <Cell>SKU</Cell><Cell>Name</Cell><Cell>Type</Cell><Cell align="right">Price</Cell><Cell>Status</Cell><Cell></Cell>
          </Row>
          {list.map((p) => (
            <Row key={p.id} columns={COLUMNS}>
              <Cell><span className="ident">{p.sku}</span></Cell>
              <Cell>{p.name}</Cell>
              <Cell>{p.type}</Cell>
              <Cell align="right"><span className="num">{gbp(p.unitPrice)}</span></Cell>
              <Cell><StatusPill status={p.status} /></Cell>
              <Cell>
                {p.status === 'ACTIVE' && (
                  <button
                    onClick={(e) => { e.stopPropagation(); archive(p.id); }}
                    className="text-xs underline"
                    style={{ color: 'var(--muted)' }}
                  >
                    Archive
                  </button>
                )}
              </Cell>
            </Row>
          ))}
        </DataTable>
      )}
    </>
  );
}
