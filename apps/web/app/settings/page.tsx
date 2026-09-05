'use client';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { api, ApiRequestError } from '../../lib/api';
import { Button, Card, ErrorBanner, FormField, Input, LoadingState } from '../../components/ui';
import { PageHead } from '../../components/shell';

interface FinanceProfile {
  legalName: string | null; addressLine1: string | null; addressLine2: string | null;
  city: string | null; postcode: string | null; country: string | null;
  vatNumber: string | null; companyNumber: string | null; footerText: string | null;
  defaultPaymentTermsDays: number;
}

export default function FinanceSettings() {
  const [profile, setProfile] = useState<FinanceProfile | null>(null);
  const [error, setError] = useState('');
  const [saved, setSaved] = useState(false);
  const [saving, setSaving] = useState(false);
  const router = useRouter();

  useEffect(() => {
    api('/finance/settings')
      .then(setProfile)
      .catch((e) => {
        if (e instanceof ApiRequestError && e.status === 401) { router.push('/login'); return; }
        setError(e instanceof ApiRequestError ? e.error.message : 'Failed to load settings');
      });
  }, []);

  function set<K extends keyof FinanceProfile>(key: K, value: FinanceProfile[K]) {
    setProfile((p) => (p ? { ...p, [key]: value } : p));
    setSaved(false);
  }

  async function save() {
    if (!profile) return;
    setSaving(true);
    setError('');
    try {
      const { tenantId, ...rest } = profile as any;
      setProfile(await api('/finance/settings', { method: 'PUT', body: JSON.stringify(rest) }));
      setSaved(true);
    } catch (e) {
      setError(e instanceof ApiRequestError ? e.error.message : 'Failed to save settings');
    } finally {
      setSaving(false);
    }
  }

  if (!profile) return <LoadingState label="Loading finance settings…" />;

  return (
    <>
      <PageHead title="Finance settings" subtitle="Your legal identity, shown on every invoice PDF" />
      {error && <ErrorBanner message={error} />}
      <Card style={{ maxWidth: 560 }}>
        <div className="grid gap-4">
          <FormField label="Legal business name">
            <Input value={profile.legalName ?? ''} onChange={(e) => set('legalName', e.target.value)} placeholder="Falls back to your account name if left blank" />
          </FormField>
          <FormField label="Address line 1">
            <Input value={profile.addressLine1 ?? ''} onChange={(e) => set('addressLine1', e.target.value)} />
          </FormField>
          <FormField label="Address line 2">
            <Input value={profile.addressLine2 ?? ''} onChange={(e) => set('addressLine2', e.target.value)} />
          </FormField>
          <div className="flex gap-3">
            <div style={{ flex: 2 }}><FormField label="City"><Input value={profile.city ?? ''} onChange={(e) => set('city', e.target.value)} /></FormField></div>
            <div style={{ flex: 1 }}><FormField label="Postcode"><Input value={profile.postcode ?? ''} onChange={(e) => set('postcode', e.target.value)} /></FormField></div>
            <div style={{ flex: 1 }}><FormField label="Country"><Input value={profile.country ?? ''} onChange={(e) => set('country', e.target.value.toUpperCase())} maxLength={2} placeholder="GB" /></FormField></div>
          </div>
          <div className="flex gap-3">
            <div style={{ flex: 1 }}><FormField label="VAT registration number"><Input value={profile.vatNumber ?? ''} onChange={(e) => set('vatNumber', e.target.value)} /></FormField></div>
            <div style={{ flex: 1 }}><FormField label="Company number"><Input value={profile.companyNumber ?? ''} onChange={(e) => set('companyNumber', e.target.value)} /></FormField></div>
          </div>
          <FormField label="Invoice footer text">
            <Input value={profile.footerText ?? ''} onChange={(e) => set('footerText', e.target.value)} placeholder="e.g. Thank you for your business." />
          </FormField>
          <FormField label="Default payment terms (days)">
            <Input
              type="number" min={0} max={365} style={{ width: 120 }}
              value={profile.defaultPaymentTermsDays}
              onChange={(e) => set('defaultPaymentTermsDays', Number(e.target.value))}
            />
          </FormField>
          <div className="flex items-center gap-3">
            <Button variant="primary" onClick={save} disabled={saving}>{saving ? 'Saving…' : 'Save'}</Button>
            {saved && <span style={{ fontSize: 13, color: 'var(--success)' }}>Saved.</span>}
          </div>
        </div>
      </Card>
    </>
  );
}
