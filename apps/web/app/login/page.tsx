'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { api, ApiRequestError } from '../../lib/api';

export default function Login() {
  const [email, setEmail] = useState('demo@tessma.one');
  const [password, setPassword] = useState('demo1234');
  const [msg, setMsg] = useState('');
  const router = useRouter();

  async function submit() {
    try {
      // The API sets the session as an httpOnly cookie on the response —
      // there is nothing to store client-side any more.
      await api('/auth/login', { method: 'POST', body: JSON.stringify({ email, password }) });
      setMsg('Logged in. Redirecting…');
      router.push('/customers');
      router.refresh(); // re-run layout's server-side branding resolution now that we're authenticated
    } catch (e) {
      setMsg(e instanceof ApiRequestError ? e.error.message : 'Login failed');
    }
  }

  return (
    <div style={{ display: 'grid', gap: 8, maxWidth: 320 }}>
      <input value={email} onChange={(e) => setEmail(e.target.value)} placeholder="email" />
      <input value={password} onChange={(e) => setPassword(e.target.value)} type="password" placeholder="password" />
      <button onClick={submit}>Log in</button>
      <small>{msg}</small>
    </div>
  );
}
