import { FormEvent, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../../shared/api';

type Setting = {
  id: string;
  key: string;
  value: Record<string, unknown>;
  description?: string | null;
};

export function SettingsPage() {
  const qc = useQueryClient();
  const [orgName, setOrgName] = useState('');
  const [defaultUnit, setDefaultUnit] = useState('pcs');

  const settings = useQuery({
    queryKey: ['settings'],
    queryFn: async () => {
      const rows = (await api<Setting[]>('/settings')).data;
      const org = rows.find((r) => r.key === 'org');
      if (org?.value) {
        setOrgName(String(org.value.name ?? ''));
        setDefaultUnit(String(org.value.defaultUnit ?? 'pcs'));
      }
      return rows;
    },
  });

  const save = useMutation({
    mutationFn: async () =>
      api('/settings', {
        method: 'PATCH',
        body: JSON.stringify({
          key: 'org',
          value: { name: orgName, defaultUnit, locale: 'en-IN' },
        }),
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['settings'] }),
  });

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    save.mutate();
  }

  return (
    <div className="stack">
      <div className="page-header">
        <div>
          <h2 className="page-title">Settings</h2>
          <p className="muted">Organization preferences.</p>
        </div>
      </div>
      <form className="card stack" onSubmit={onSubmit}>
        <label className="label">
          Organization name
          <input className="input" value={orgName} onChange={(e) => setOrgName(e.target.value)} />
        </label>
        <label className="label">
          Default unit
          <input
            className="input"
            value={defaultUnit}
            onChange={(e) => setDefaultUnit(e.target.value)}
          />
        </label>
        <div className="row actions">
          <button className="btn" type="submit">
            Save
          </button>
        </div>
      </form>
      <div className="card stack">
        <h3 className="page-title">All settings</h3>
        <pre className="pre-wrap">{JSON.stringify(settings.data ?? [], null, 2)}</pre>
      </div>
    </div>
  );
}
