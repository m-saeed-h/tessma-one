'use client';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { api, ApiRequestError } from '../../lib/api';
import { Button, Card, EmptyState, ErrorBanner, Input, LoadingState, Select, StatusBadge, Table, Td, Th } from '../../components/ui';

const gbp = (p: string) => '£' + (Number(p) / 100).toFixed(2);

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
    <div className="grid gap-4">
      <Card>
        <div className="flex flex-wrap items-end gap-2">
          <div className="w-28">
            <Input value={sku} onChange={(e) => setSku(e.target.value)} placeholder="SKU" />
          </div>
          <div className="flex-1 min-w-[160px]">
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Name" />
          </div>
          <Select value={type} onChange={(e) => setType(e.target.value)} className="w-32">
            <option value="SERVICE">Service</option>
            <option value="PRODUCT">Product</option>
          </Select>
          <div className="w-28">
            <Input value={price} onChange={(e) => setPrice(e.target.value)} placeholder="Price £" inputMode="decimal" />
          </div>
          <Button onClick={create} disabled={!sku.trim() || !name.trim() || !price}>Add product</Button>
        </div>
      </Card>

      {error && <ErrorBanner message={error} />}

      {list === null ? (
        <LoadingState label="Loading products…" />
      ) : list.length === 0 ? (
        <EmptyState title="No products yet" description="Add your first product or service above." />
      ) : (
        <Table>
          <thead><tr><Th>SKU</Th><Th>Name</Th><Th>Type</Th><Th align="right">Price</Th><Th>Status</Th><Th></Th></tr></thead>
          <tbody>
            {list.map((p) => (
              <tr key={p.id} className="border-t border-slate-100">
                <Td>{p.sku}</Td>
                <Td>{p.name}</Td>
                <Td>{p.type}</Td>
                <Td align="right">{gbp(p.unitPrice)}</Td>
                <Td><StatusBadge status={p.status} /></Td>
                <Td>
                  {p.status === 'ACTIVE' && (
                    <button onClick={() => archive(p.id)} className="text-xs text-slate-500 hover:text-red-600 underline">
                      Archive
                    </button>
                  )}
                </Td>
              </tr>
            ))}
          </tbody>
        </Table>
      )}
    </div>
  );
}
