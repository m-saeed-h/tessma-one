'use client';
import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { api, ApiRequestError } from '../../../lib/api';
import { Button, ErrorBanner, FormField, Input } from '../../../components/ui';

export default function Register() {
  const [company, setCompany] = useState('');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const router = useRouter();

  const passwordTooShort = password.length > 0 && password.length < 8;
  const passwordsMismatch = confirmPassword.length > 0 && password !== confirmPassword;
  const canSubmit = company.trim() && name.trim() && email.trim() && password.length >= 8 && password === confirmPassword;

  async function submit() {
    if (!canSubmit) return;
    setSubmitting(true);
    setError('');
    try {
      // Registration creates the tenant + owner user AND signs you in — the
      // API sets the same session cookies /auth/login would, so there's no
      // separate "log in after signing up" step.
      await api('/auth/register', { method: 'POST', body: JSON.stringify({ company, name, email, password }) });
      router.push('/invoices');
      router.refresh(); // re-run the (app) layout's server-side branding/me resolution now that we're authenticated
    } catch (e) {
      setError(e instanceof ApiRequestError ? e.error.message : 'Could not create your account');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <>
      <div className="auth-card-head">
        <h2>Create your account</h2>
        <p>Set up your organisation in under a minute.</p>
      </div>
      <form className="auth-form" onSubmit={(e) => { e.preventDefault(); submit(); }}>
        <FormField label="Company name">
          <Input value={company} onChange={(e) => setCompany(e.target.value)} placeholder="Acme Trading Ltd" autoComplete="organization" autoFocus />
        </FormField>
        <FormField label="Your name">
          <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Jordan Smith" autoComplete="name" />
        </FormField>
        <FormField label="Email">
          <Input value={email} onChange={(e) => setEmail(e.target.value)} type="email" placeholder="you@company.com" autoComplete="email" />
        </FormField>
        <FormField label="Password" error={passwordTooShort ? 'At least 8 characters' : undefined}>
          <Input value={password} onChange={(e) => setPassword(e.target.value)} type="password" autoComplete="new-password" />
        </FormField>
        <FormField label="Confirm password" error={passwordsMismatch ? 'Passwords don’t match' : undefined}>
          <Input value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} type="password" autoComplete="new-password" />
        </FormField>
        {error && <ErrorBanner message={error} />}
        <Button type="submit" variant="primary" disabled={submitting || !canSubmit} style={{ width: '100%', justifyContent: 'center' }}>
          {submitting ? 'Creating account…' : 'Create account'}
        </Button>
      </form>
      <div className="auth-switch">
        Already have an account? <Link href="/login">Log in</Link>
      </div>
      <div className="auth-terms">By creating an account you agree this is a demo environment.</div>
    </>
  );
}
