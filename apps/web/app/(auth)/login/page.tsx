'use client';
import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { api, ApiRequestError } from '../../../lib/api';
import { Button, ErrorBanner, FormField, Input } from '../../../components/ui';

export default function Login() {
  const [email, setEmail] = useState('demo@tessma.one');
  const [password, setPassword] = useState('demo1234');
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const router = useRouter();

  async function submit() {
    setSubmitting(true);
    setError('');
    try {
      // The API sets the session as an httpOnly cookie on the response —
      // there is nothing to store client-side any more.
      await api('/auth/login', { method: 'POST', body: JSON.stringify({ email, password }) });
      router.push('/invoices');
      router.refresh(); // re-run the (app) layout's server-side branding/me resolution now that we're authenticated
    } catch (e) {
      setError(e instanceof ApiRequestError ? e.error.message : 'Login failed');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <>
      <div className="auth-card-head">
        <h2>Welcome back</h2>
        <p>Log in to continue to your account.</p>
      </div>
      <form className="auth-form" onSubmit={(e) => { e.preventDefault(); submit(); }}>
        <FormField label="Email">
          <Input value={email} onChange={(e) => setEmail(e.target.value)} type="email" autoComplete="email" autoFocus />
        </FormField>
        <FormField label="Password">
          <Input value={password} onChange={(e) => setPassword(e.target.value)} type="password" autoComplete="current-password" />
        </FormField>
        {error && <ErrorBanner message={error} />}
        <Button type="submit" variant="primary" disabled={submitting} style={{ width: '100%', justifyContent: 'center' }}>
          {submitting ? 'Logging in…' : 'Log in'}
        </Button>
      </form>
      <div className="auth-switch">
        Don&rsquo;t have an account? <Link href="/register">Create one</Link>
      </div>
      <div className="auth-terms">Demo account: demo@tessma.one / demo1234</div>
    </>
  );
}
