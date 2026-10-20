import { FormEvent, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { hasMinRole, type UserRole } from '@ims/shared';
import { api, toErrorMessage } from '../../shared/api';
import { useToast } from '../../shared/toast';
import { useConfirm } from '../../shared/confirm';
import { useAuth } from '../../shared/auth';
import { SkeletonRows } from '../../shared/Skeleton';
import { SortableTh, sortRows, useClientSort } from '../../shared/SortHeader';

type PartyKey = 'code' | 'name' | 'email' | 'phone';

type Party = {
  id: string;
  code: string;
  name: string;
  email?: string | null;
  phone?: string | null;
  isActive: boolean;
};

const emptyForm = { code: '', name: '', email: '', phone: '' };

function PartyPage({
  title,
  resource,
}: {
  title: string;
  resource: 'suppliers' | 'buyers';
}) {
  const qc = useQueryClient();
  const toast = useToast();
  const confirm = useConfirm();
  const { user } = useAuth();
  const canWrite = hasMinRole((user?.role ?? 'VIEWER') as UserRole, 'ADMIN');
  const { sort, toggle } = useClientSort<PartyKey>();
  const [form, setForm] = useState({ ...emptyForm });
  const [editingId, setEditingId] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

  const list = useQuery({
    queryKey: [resource],
    queryFn: async () => (await api<Party[]>(`/${resource}?pageSize=100`)).data,
  });

  const reset = () => {
    setForm({ ...emptyForm });
    setEditingId(null);
    setFieldErrors({});
  };

  const singular = title.replace(/s$/, '');
  const save = useMutation({
    mutationFn: async () => {
      if (editingId) {
        // `code` is immutable on update — the API rejects it, so omit it.
        return api(`/${resource}/${editingId}`, {
          method: 'PATCH',
          body: JSON.stringify({
            name: form.name,
            email: form.email || null,
            phone: form.phone || null,
          }),
        });
      }
      return api(`/${resource}`, {
        method: 'POST',
        body: JSON.stringify({
          code: form.code,
          name: form.name,
          email: form.email || null,
          phone: form.phone || null,
        }),
      });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: [resource] });
      toast.success(editingId ? `${singular} updated` : `${singular} added`);
      reset();
    },
    onError: (e) => toast.error(toErrorMessage(e)),
  });

  const remove = useMutation({
    mutationFn: async (id: string) => api(`/${resource}/${id}`, { method: 'DELETE' }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: [resource] });
      toast.success('Removed');
      if (editingId) reset();
    },
    onError: (e) => toast.error(toErrorMessage(e)),
  });

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    // Client-side validation surfaces as the app's styled inline errors rather than
    // the native browser bubble (the form uses noValidate).
    const errs: Record<string, string> = {};
    if (!editingId && !form.code.trim()) errs.code = 'Code is required.';
    if (!form.name.trim()) errs.name = 'Name is required.';
    if (form.email.trim() && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email.trim())) {
      errs.email = 'Enter a valid email address.';
    }
    if (Object.keys(errs).length) {
      setFieldErrors(errs);
      return;
    }
    setFieldErrors({});
    save.mutate();
  }

  const rows = sortRows(list.data ?? [], sort, (r, k) => r[k as keyof Party]);

  return (
    <div className="stack">
      <div className="page-header">
        <div>
          <h2 className="page-title">{title}</h2>
          <p className="muted">Master data for catalog relationships.</p>
        </div>
      </div>
      {canWrite ? (
      <div className="card stack">
        <form className="grid cols-2" onSubmit={onSubmit} noValidate>
          <label className="label" htmlFor="party-code">
            Code
            <input
              id="party-code"
              className="input"
              value={form.code}
              onChange={(e) => {
                setForm({ ...form, code: e.target.value });
                if (fieldErrors.code) setFieldErrors((p) => ({ ...p, code: '' }));
              }}
              aria-invalid={Boolean(fieldErrors.code)}
              disabled={Boolean(editingId)}
            />
            {fieldErrors.code ? <small className="field-error">{fieldErrors.code}</small> : null}
          </label>
          <label className="label" htmlFor="party-name">
            Name
            <input
              id="party-name"
              className="input"
              value={form.name}
              onChange={(e) => {
                setForm({ ...form, name: e.target.value });
                if (fieldErrors.name) setFieldErrors((p) => ({ ...p, name: '' }));
              }}
              aria-invalid={Boolean(fieldErrors.name)}
            />
            {fieldErrors.name ? <small className="field-error">{fieldErrors.name}</small> : null}
          </label>
          <label className="label" htmlFor="party-email">
            Email
            <input
              id="party-email"
              className="input"
              type="email"
              value={form.email}
              onChange={(e) => {
                setForm({ ...form, email: e.target.value });
                if (fieldErrors.email) setFieldErrors((p) => ({ ...p, email: '' }));
              }}
              aria-invalid={Boolean(fieldErrors.email)}
            />
            {fieldErrors.email ? <small className="field-error">{fieldErrors.email}</small> : null}
          </label>
          <label className="label" htmlFor="party-phone">
            Phone
            <input
              id="party-phone"
              className="input"
              type="tel"
              value={form.phone}
              onChange={(e) => setForm({ ...form, phone: e.target.value })}
            />
          </label>
          <div className="row actions">
            <button className="btn" type="submit" disabled={save.isPending}>
              {editingId ? 'Save changes' : 'Add'}
            </button>
            {editingId ? (
              <button type="button" className="btn secondary" onClick={reset}>
                Cancel
              </button>
            ) : null}
          </div>
        </form>
      </div>
      ) : null}
      <div className="card">
        <div className="table-wrap">
          <table className="table cards" aria-label={title}>
            <thead>
              <tr>
                <SortableTh label="Code" sortKey="code" sort={sort} onSort={toggle} />
                <SortableTh label="Name" sortKey="name" sort={sort} onSort={toggle} />
                <SortableTh label="Email" sortKey="email" sort={sort} onSort={toggle} />
                <SortableTh label="Phone" sortKey="phone" sort={sort} onSort={toggle} />
                <th />
              </tr>
            </thead>
            <tbody>
              {list.isLoading ? <SkeletonRows rows={4} cols={5} /> : null}
              {rows.map((row) => (
                <tr key={row.id}>
                  <td data-label="Code">{row.code}</td>
                  <td data-label="Name"><span className="cell-ellipsis" title={row.name}>{row.name}</span></td>
                  <td data-label="Email"><span className="cell-ellipsis" title={row.email ?? ''}>{row.email ?? '—'}</span></td>
                  <td data-label="Phone">{row.phone ?? '—'}</td>
                  <td data-label="Actions">
                    {canWrite ? (
                    <div className="row">
                      <button
                        type="button"
                        className="btn secondary"
                        onClick={() => {
                          setEditingId(row.id);
                          setForm({
                            code: row.code,
                            name: row.name,
                            email: row.email ?? '',
                            phone: row.phone ?? '',
                          });
                        }}
                      >
                        Edit
                      </button>
                      <button
                        type="button"
                        className="btn secondary danger"
                        disabled={remove.isPending && remove.variables === row.id}
                        onClick={async () => {
                          const ok = await confirm({
                            title: `Delete ${singular.toLowerCase()}`,
                            message: `Delete "${row.name}"? This cannot be undone.`,
                            confirmLabel: 'Delete',
                            danger: true,
                          });
                          if (ok) remove.mutate(row.id);
                        }}
                      >
                        {remove.isPending && remove.variables === row.id ? 'Deleting…' : 'Delete'}
                      </button>
                    </div>
                    ) : null}
                  </td>
                </tr>
              ))}
              {!list.isLoading && rows.length === 0 ? (
                <tr>
                  <td colSpan={5} className="muted">
                    No {title.toLowerCase()} yet — add your first above.
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

export function SuppliersPage() {
  return <PartyPage title="Suppliers" resource="suppliers" />;
}

export function BuyersPage() {
  return <PartyPage title="Buyers" resource="buyers" />;
}
