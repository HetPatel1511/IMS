import { FormEvent, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { hasMinRole, type UserRole } from '@ims/shared';
import { api, toErrorMessage } from '../../shared/api';
import { useToast } from '../../shared/toast';
import { useAuth } from '../../shared/auth';

type Setting = {
  id: string;
  key: string;
  value: Record<string, unknown>;
  description?: string | null;
};

export function SettingsPage() {
  const qc = useQueryClient();
  const toast = useToast();
  const { user } = useAuth();
  const canWrite = hasMinRole((user?.role ?? 'VIEWER') as UserRole, 'ADMIN');
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
        {canWrite ? (
          <div className="row actions">
            <button className="btn" type="submit" disabled={save.isPending}>
              Save
            </button>
          </div>
        ) : (
          <p className="muted">You need admin access to change settings.</p>
        )}
      </form>
      <div className="card stack">
        <h3 className="page-title">All settings</h3>
        <div className="table-wrap">
          <table className="table compact">
            <thead>
              <tr>
                <th>Key</th>
                <th>Value</th>
                <th>Description</th>
              </tr>
            </thead>
            <tbody>
              {(settings.data ?? []).map((row) => (
                <tr key={row.id}>
                  <td>{row.key}</td>
                  <td>
                    {Object.entries(row.value ?? {}).map(([k, v]) => (
                      <div key={k}>
                        <span className="muted">{k}:</span> {String(v)}
                      </div>
                    ))}
                  </td>
                  <td className="muted">{row.description ?? '—'}</td>
                </tr>
              ))}
              {settings.data && settings.data.length === 0 ? (
                <tr>
                  <td colSpan={3} className="muted">
                    No settings yet.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
