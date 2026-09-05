'use client';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { api, ApiRequestError } from '../../../lib/api';
import { Button, Card, ErrorBanner, FormField, Input, LoadingState, Select } from '../../../components/ui';
import { PageHead } from '../../../components/shell';

interface FinanceProfile {
  legalName: string | null; addressLine1: string | null; addressLine2: string | null;
  city: string | null; postcode: string | null; country: string | null;
  vatNumber: string | null; companyNumber: string | null; footerText: string | null;
  defaultPaymentTermsDays: number;
  baseCurrency: string; baseCurrencyLockedAt: string | null;
  accountingBasis: 'ACCRUAL' | 'CASH';
  financialYearStartMonth: number; financialYearStartDay: number;
}

interface NumberingScheme {
  docType: string; prefix: string; suffix: string; useYearToken: boolean; padding: number; next: number;
}

const DOC_TYPE_LABEL: Record<string, string> = {
  INVOICE: 'Invoices', QUOTE: 'Quotations', CREDIT_NOTE: 'Credit notes',
};

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

export default function FinanceSettings() {
  const [profile, setProfile] = useState<FinanceProfile | null>(null);
  const [schemes, setSchemes] = useState<NumberingScheme[] | null>(null);
  const [error, setError] = useState('');
  const [saved, setSaved] = useState(false);
  const [saving, setSaving] = useState(false);
  const [savingScheme, setSavingScheme] = useState<string | null>(null);
  const router = useRouter();

  useEffect(() => {
    Promise.all([api('/finance/settings'), api('/finance/settings/numbering')])
      .then(([p, s]) => { setProfile(p); setSchemes(s); })
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
      const { tenantId, baseCurrencyLockedAt, ...rest } = profile as any;
      setProfile({ ...(await api('/finance/settings', { method: 'PUT', body: JSON.stringify(rest) })), baseCurrencyLockedAt });
      setSaved(true);
    } catch (e) {
      setError(e instanceof ApiRequestError ? e.error.message : 'Failed to save settings');
    } finally {
      setSaving(false);
    }
  }

  function setScheme(docType: string, patch: Partial<NumberingScheme>) {
    setSchemes((list) => list?.map((s) => (s.docType === docType ? { ...s, ...patch } : s)) ?? list);
  }

  async function saveScheme(docType: string) {
    const scheme = schemes?.find((s) => s.docType === docType);
    if (!scheme) return;
    setSavingScheme(docType);
    setError('');
    try {
      const updated = await api(`/finance/settings/numbering/${docType}`, {
        method: 'PUT',
        body: JSON.stringify({ prefix: scheme.prefix, suffix: scheme.suffix, useYearToken: scheme.useYearToken, padding: scheme.padding }),
      });
      setScheme(docType, updated);
    } catch (e) {
      setError(e instanceof ApiRequestError ? e.error.message : 'Failed to save numbering scheme');
    } finally {
      setSavingScheme(null);
    }
  }

  if (!profile || !schemes) return <LoadingState label="Loading finance settings…" />;

  const preview = (s: NumberingScheme) => `${s.prefix || 'DOC'}-${s.useYearToken ? new Date().getFullYear() + '-' : ''}${String(s.next).padStart(s.padding, '0')}${s.suffix}`;

  return (
    <>
      <PageHead title="Finance settings" subtitle="Legal identity, accounting configuration and document numbering" />
      {error && <ErrorBanner message={error} />}

      <div className="grid gap-5" style={{ maxWidth: 560 }}>
        <Card>
          <div style={{ fontWeight: 600, fontSize: 14, marginBottom: 'var(--s4)' }}>Legal identity</div>
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
          </div>
        </Card>

        <Card>
          <div style={{ fontWeight: 600, fontSize: 14, marginBottom: 'var(--s4)' }}>Accounting configuration</div>
          <div className="grid gap-4">
            <div className="flex gap-3">
              <div style={{ flex: 1 }}>
                <FormField label="Base currency" error={profile.baseCurrencyLockedAt ? 'Locked — a transaction has already posted' : undefined}>
                  <Input
                    value={profile.baseCurrency} maxLength={3} disabled={!!profile.baseCurrencyLockedAt}
                    onChange={(e) => set('baseCurrency', e.target.value.toUpperCase())}
                  />
                </FormField>
              </div>
              <div style={{ flex: 1 }}>
                <FormField label="Accounting basis">
                  <Select value={profile.accountingBasis} onChange={(e) => set('accountingBasis', e.target.value as 'ACCRUAL' | 'CASH')}>
                    <option value="ACCRUAL">Accrual</option>
                    <option value="CASH">Cash</option>
                  </Select>
                </FormField>
              </div>
            </div>
            <div className="flex gap-3">
              <div style={{ flex: 1 }}>
                <FormField label="Financial year starts">
                  <Select value={profile.financialYearStartMonth} onChange={(e) => set('financialYearStartMonth', Number(e.target.value))}>
                    {MONTHS.map((m, i) => <option key={m} value={i + 1}>{m}</option>)}
                  </Select>
                </FormField>
              </div>
              <div style={{ width: 100 }}>
                <FormField label="Day">
                  <Input type="number" min={1} max={31} value={profile.financialYearStartDay} onChange={(e) => set('financialYearStartDay', Number(e.target.value))} />
                </FormField>
              </div>
            </div>
            <FormField label="Default payment terms (days)">
              <Input
                type="number" min={0} max={365} style={{ width: 120 }}
                value={profile.defaultPaymentTermsDays}
                onChange={(e) => set('defaultPaymentTermsDays', Number(e.target.value))}
              />
            </FormField>
          </div>
        </Card>

        <div className="flex items-center gap-3">
          <Button variant="primary" onClick={save} disabled={saving}>{saving ? 'Saving…' : 'Save'}</Button>
          {saved && <span style={{ fontSize: 13, color: 'var(--success)' }}>Saved.</span>}
        </div>

        <Card>
          <div style={{ fontWeight: 600, fontSize: 14, marginBottom: 2 }}>Document numbering</div>
          <div style={{ fontSize: 13, color: 'var(--slate)', marginBottom: 'var(--s4)' }}>Numbers are allocated at issue, never reused, and this can only make future numbers wider — not roll them back.</div>
          <div className="grid gap-4">
            {schemes.map((s) => (
              <div key={s.docType} style={{ borderTop: '1px solid var(--line)', paddingTop: 'var(--s4)' }}>
                <div style={{ fontWeight: 500, fontSize: 13, marginBottom: 8 }}>{DOC_TYPE_LABEL[s.docType] ?? s.docType}</div>
                <div className="flex gap-3 items-end">
                  <div style={{ width: 90 }}><FormField label="Prefix"><Input value={s.prefix} onChange={(e) => setScheme(s.docType, { prefix: e.target.value.toUpperCase() })} /></FormField></div>
                  <div style={{ width: 70 }}><FormField label="Suffix"><Input value={s.suffix} onChange={(e) => setScheme(s.docType, { suffix: e.target.value })} /></FormField></div>
                  <div style={{ width: 70 }}><FormField label="Padding"><Input type="number" min={1} max={10} value={s.padding} onChange={(e) => setScheme(s.docType, { padding: Number(e.target.value) })} /></FormField></div>
                  <div style={{ width: 100 }}>
                    <FormField label="Year token">
                      <Select value={s.useYearToken ? '1' : '0'} onChange={(e) => setScheme(s.docType, { useYearToken: e.target.value === '1' })}>
                        <option value="0">Off</option>
                        <option value="1">On</option>
                      </Select>
                    </FormField>
                  </div>
                  <Button onClick={() => saveScheme(s.docType)} disabled={savingScheme === s.docType}>{savingScheme === s.docType ? 'Saving…' : 'Save'}</Button>
                  <span className="ident" style={{ marginLeft: 'auto', color: 'var(--slate)' }}>Next: {preview(s)}</span>
                </div>
              </div>
            ))}
          </div>
        </Card>
      </div>
    </>
  );
}
