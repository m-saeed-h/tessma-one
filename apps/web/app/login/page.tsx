'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { api, ApiRequestError } from '../../lib/api';
import { Button, Card, ErrorBanner, FormField, Input } from '../../components/ui';
import { PageHead } from '../../components/shell';

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
      router.refresh(); // re-run layout's server-side branding/me resolution now that we're authenticated
    } catch (e) {
      setError(e instanceof ApiRequestError ? e.error.message : 'Login failed');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <>
      <PageHead title="Log in" subtitle="Demo account: demo@tessma.one / demo1234" />
      <Card style={{ maxWidth: 360 }}>
        <form className="grid gap-4" onSubmit={(e) => { e.preventDefault(); submit(); }}>
          <FormField label="Email">
            <Input value={email} onChange={(e) => setEmail(e.target.value)} type="email" autoComplete="email" />
          </FormField>
          <FormField label="Password">
            <Input value={password} onChange={(e) => setPassword(e.target.value)} type="password" autoComplete="current-password" />
          </FormField>
          {error && <ErrorBanner message={error} />}
          <Button type="submit" variant="primary" disabled={submitting}>{submitting ? 'Logging in…' : 'Log in'}</Button>
        </form>
      </Card>
    </>
  );
}
