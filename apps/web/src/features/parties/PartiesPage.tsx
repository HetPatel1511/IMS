import { FormEvent, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { hasMinRole, type UserRole } from '@ims/shared';
import { api, toErrorMessage, type ApiEnvelope } from '../../shared/api';
import { useToast } from '../../shared/toast';
import { useConfirm } from '../../shared/confirm';
import { useAuth } from '../../shared/auth';
import { FormModal } from '../../shared/FormModal';
import { DataView, type Column, type DataSort } from '../../ui/DataView';
import { EmptyState } from '../../ui/EmptyState';

type Party = {
  id: string;
  code: string;
  name: string;
  email?: string | null;
  phone?: string | null;
  isActive: boolean;
};

const PAGE_SIZE = 20;
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
  // Sorting now spans the whole dataset via the server `sort` param (A1).
  const [sort, setSort] = useState<DataSort>(null);
  const singular = title.replace(/s$/, '');

  const [form, setForm] = useState({ ...emptyForm });
  const [editingId, setEditingId] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [dialogOpen, setDialogOpen] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [page, setPage] = useState(1);

  const list = useQuery({
    queryKey: [resource, page, sort],
    queryFn: async () => {
      const qs = new URLSearchParams({ page: String(page), pageSize: String(PAGE_SIZE) });
      if (sort) qs.set('sort', `${sort.key}:${sort.dir}`);
      return api<Party[]>(`/${resource}?${qs}`) as Promise<ApiEnvelope<Party[]>>;
    },
  });
  const rows = list.data?.data ?? [];
  const meta = list.data?.meta ?? null;

  function onSort(key: string) {
    setSort((prev) =>
      prev && prev.key === key ? { key, dir: prev.dir === 'asc' ? 'desc' : 'asc' } : { key, dir: 'asc' },
    );
    setPage(1);
  }

  function change(patch: Partial<typeof emptyForm>) {
    setDirty(true);
    setForm((f) => ({ ...f, ...patch }));
  }

  function openCreate() {
    setEditingId(null);
    setForm({ ...emptyForm });
    setFieldErrors({});
    setDirty(false);
    setDialogOpen(true);
  }

  function openEdit(row: Party) {
    setEditingId(row.id);
    setForm({
      code: row.code,
      name: row.name,
      email: row.email ?? '',
      phone: row.phone ?? '',
    });
    setFieldErrors({});
    setDirty(false);
    setDialogOpen(true);
  }

  function closeDialog() {
    setDialogOpen(false);
    setEditingId(null);
    setForm({ ...emptyForm });
    setFieldErrors({});
    setDirty(false);
  }

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
      closeDialog();
    },
    onError: (e) => toast.error(toErrorMessage(e)),
  });

  const remove = useMutation({
    mutationFn: async (id: string) => api(`/${resource}/${id}`, { method: 'DELETE' }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: [resource] });
      toast.success(`${singular} removed`);
    },
    onError: (e) => toast.error(toErrorMessage(e)),
  });

  function onSubmit(e: FormEvent) {
    e.preventDefault();
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

  const columns: Column<Party>[] = [
    { key: 'code', header: 'Code', sortKey: 'code', render: (r) => r.code },
    {
      key: 'name',
      header: 'Name',
      sortKey: 'name',
      render: (r) => (
        <span className="cell-ellipsis" title={r.name}>
          {r.name}
        </span>
      ),
    },
    {
      key: 'email',
      header: 'Email',
      sortKey: 'email',
      render: (r) => (
        <span className="cell-ellipsis" title={r.email ?? ''}>
          {r.email ?? '—'}
        </span>
      ),
    },
    { key: 'phone', header: 'Phone', sortKey: 'phone', render: (r) => r.phone ?? '—' },
  ];

  return (
    <div className="stack">
      <div className="page-header">
        <div>
          <h2 className="page-title">{title}</h2>
          <p className="muted">Master data for catalog relationships.</p>
        </div>
        {canWrite ? (
          <button className="btn" type="button" onClick={openCreate}>
            + Add {singular.toLowerCase()}
          </button>
        ) : null}
      </div>

      <div className="card stack">
        <DataView
          caption={title}
          columns={columns}
          rows={rows}
          rowKey={(r) => r.id}
          loading={list.isLoading}
          sort={sort}
          onSort={onSort}
          actions={
            canWrite
              ? (row) => (
                  <>
                    <button type="button" className="btn secondary" onClick={() => openEdit(row)}>
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
                  </>
                )
              : undefined
          }
          empty={
            <EmptyState
              title={`No ${title.toLowerCase()} yet`}
              message={
                canWrite
                  ? `Add your first with “+ Add ${singular.toLowerCase()}”.`
                  : 'Nothing has been added here yet.'
              }
            />
          }
        />

        {meta && meta.total > PAGE_SIZE ? (
          <div className="row spread pagination">
            <span className="muted">
              Page {meta.page} of {meta.totalPages} · {meta.total} {title.toLowerCase()}
            </span>
            <div className="row">
              <button
                type="button"
                className="btn secondary"
                disabled={page <= 1}
                onClick={() => setPage((p) => Math.max(1, p - 1))}
              >
                Previous
              </button>
              <button
                type="button"
                className="btn secondary"
                disabled={meta.totalPages != null && page >= meta.totalPages}
                onClick={() => setPage((p) => p + 1)}
              >
                Next
              </button>
            </div>
          </div>
        ) : null}
      </div>

      <FormModal
        open={dialogOpen}
        title={`Add ${singular.toLowerCase()}`}
        editingLabel={editingId ? form.code || singular : null}
        subtitle={
          editingId
            ? `Updating an existing ${singular.toLowerCase()} — its code is fixed.`
            : `Create a new ${singular.toLowerCase()}.`
        }
        submitLabel={editingId ? 'Save changes' : `Add ${singular.toLowerCase()}`}
        submitting={save.isPending}
        dirty={dirty}
        onSubmit={onSubmit}
        onClose={closeDialog}
      >
        <div className="grid cols-2">
          <label className="label" htmlFor="party-code">
            <span>Code{!editingId ? <span className="req-star" aria-hidden>*</span> : null}</span>
            <input
              id="party-code"
              className="input"
              value={form.code}
              onChange={(e) => {
                change({ code: e.target.value });
                if (fieldErrors.code) setFieldErrors((p) => ({ ...p, code: '' }));
              }}
              aria-invalid={Boolean(fieldErrors.code)}
              disabled={Boolean(editingId)}
            />
            {fieldErrors.code ? <small className="field-error">{fieldErrors.code}</small> : null}
          </label>
          <label className="label" htmlFor="party-name">
            <span>Name<span className="req-star" aria-hidden>*</span></span>
            <input
              id="party-name"
              className="input"
              value={form.name}
              onChange={(e) => {
                change({ name: e.target.value });
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
                change({ email: e.target.value });
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
              onChange={(e) => change({ phone: e.target.value })}
            />
          </label>
        </div>
      </FormModal>
    </div>
  );
}

export function SuppliersPage() {
  return <PartyPage title="Suppliers" resource="suppliers" />;
}

export function BuyersPage() {
  return <PartyPage title="Buyers" resource="buyers" />;
}
