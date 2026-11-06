import { FormEvent, useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { hasMinRole, type UserRole } from '@ims/shared';
import { api, toErrorMessage } from '../../shared/api';
import { useToast } from '../../shared/toast';
import { useAuth } from '../../shared/auth';
import { DataView, type Column } from '../../ui/DataView';
import { EmptyState } from '../../ui/EmptyState';

type Setting = {
  id: string;
  key: string;
  value: Record<string, unknown>;
  description?: string | null;
};

// Constrained choices for the Default unit picker (C6). An unexpected stored value is
// preserved by appending it as an extra option so saving never silently changes it.
const UNIT_OPTIONS = ['pcs', 'unit', 'kg', 'g', 'l', 'ml', 'm', 'cm', 'box', 'pack', 'roll', 'set'];
const LOCALE_OPTIONS: [string, string][] = [
  ['en-IN', 'English (India)'],
  ['en-US', 'English (United States)'],
  ['en-GB', 'English (United Kingdom)'],
  ['de-DE', 'German (Germany)'],
  ['fr-FR', 'French (France)'],
];

export function SettingsPage() {
  const qc = useQueryClient();
  const toast = useToast();
  const { user } = useAuth();
  const canWrite = hasMinRole((user?.role ?? 'VIEWER') as UserRole, 'ADMIN');
  const [orgName, setOrgName] = useState('');
  const [defaultUnit, setDefaultUnit] = useState('pcs');
  const [locale, setLocale] = useState('en-IN');

  const settings = useQuery({
    queryKey: ['settings'],
    queryFn: async () => (await api<Setting[]>('/settings')).data,
  });

  // Prefill the form from the loaded settings. Doing this in an effect (rather than
  // inside queryFn) ensures it runs even when the query is served from cache — e.g.
  // after AppLayout has already fetched /settings — so the fields are never left blank.
  useEffect(() => {
    const org = settings.data?.find((r) => r.key === 'org');
    if (org?.value) {
      setOrgName(String(org.value.name ?? ''));
      setDefaultUnit(String(org.value.defaultUnit ?? 'pcs'));
      setLocale(String(org.value.locale ?? 'en-IN'));
    }
  }, [settings.data]);

  const unitOptions = useMemo(
    () => (UNIT_OPTIONS.includes(defaultUnit) ? UNIT_OPTIONS : [defaultUnit, ...UNIT_OPTIONS]),
    [defaultUnit],
  );
  const localeOptions = useMemo(
    () =>
      LOCALE_OPTIONS.some(([v]) => v === locale)
        ? LOCALE_OPTIONS
        : [[locale, locale] as [string, string], ...LOCALE_OPTIONS],
    [locale],
  );

  const save = useMutation({
    mutationFn: async () =>
      api('/settings', {
        method: 'PATCH',
        body: JSON.stringify({
          key: 'org',
          value: { name: orgName, defaultUnit, locale },
        }),
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['settings'] });
      toast.success('Settings saved');
    },
    onError: (e) => toast.error(toErrorMessage(e)),
  });

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    save.mutate();
  }

  const columns: Column<Setting>[] = [
    { key: 'key', header: 'Key', cardLabel: 'Key', render: (row) => <code>{row.key}</code> },
    {
      key: 'value',
      header: 'Value',
      cardLabel: 'Value',
      render: (row) => (
        <span className="cell-stack">
          {Object.entries(row.value ?? {}).map(([k, v]) => (
            <span key={k}>
              <span className="muted">{k}:</span> {String(v)}
            </span>
          ))}
        </span>
      ),
    },
    {
      key: 'description',
      header: 'Description',
      cardLabel: 'Description',
      render: (row) => <span className="muted">{row.description ?? '—'}</span>,
    },
  ];

  return (
    <div className="stack">
      <div className="page-header">
        <div>
          <h2 className="page-title">Settings</h2>
          <p className="muted">Organization preferences.</p>
        </div>
      </div>
      <form className="card stack form-narrow" onSubmit={onSubmit}>
        <label className="label">
          Organization name
          <input className="input" value={orgName} onChange={(e) => setOrgName(e.target.value)} />
        </label>
        <label className="label">
          Default unit
          <select
            className="select"
            value={defaultUnit}
            onChange={(e) => setDefaultUnit(e.target.value)}
          >
            {unitOptions.map((u) => (
              <option key={u} value={u}>
                {u}
              </option>
            ))}
          </select>
        </label>
        <label className="label">
          Locale
          <select className="select" value={locale} onChange={(e) => setLocale(e.target.value)}>
            {localeOptions.map(([v, label]) => (
              <option key={v} value={v}>
                {label}
              </option>
            ))}
          </select>
        </label>
        {canWrite ? (
          <div className="row actions">
            <button className="btn" type="submit" disabled={save.isPending}>
              {save.isPending ? 'Saving…' : 'Save'}
            </button>
          </div>
        ) : (
          <p className="muted">You need admin access to change settings.</p>
        )}
      </form>
      <div className="card stack">
        <h3 className="page-title">All settings</h3>
        <DataView
          caption="All settings"
          columns={columns}
          rows={settings.data ?? []}
          rowKey={(row) => row.id}
          loading={settings.isLoading}
          empty={<EmptyState title="No settings yet" message="Organization settings will appear here." />}
        />
      </div>
    </div>
  );
}
