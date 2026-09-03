'use client';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { api, ApiRequestError } from '../../lib/api';

export default function Customers() {
  const [list, setList] = useState<any[]>([]);
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
      load();
    } catch (e) {
      setError(e instanceof ApiRequestError ? e.error.message : 'Failed to create customer');
    }
  }

  return (
    <div>
      <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
        <input value={name} onChange={(e) => setName(e.target.value)} />
        <button onClick={create}>Add customer</button>
      </div>
      {error && <p style={{ color: '#b3261e' }}>{error}</p>}
      <ul>
        {list.map((p) => <li key={p.id}>{p.legalName} <small style={{ color: '#889' }}>({p.id.slice(0, 8)})</small></li>)}
      </ul>
    </div>
  );
}
