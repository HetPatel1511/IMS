import { FormEvent, useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { hasMinRole, type UserRole } from '@ims/shared';
import { api, toErrorMessage, type ApiEnvelope } from '../../shared/api';
import { useToast } from '../../shared/toast';
import { useConfirm } from '../../shared/confirm';
import { useAuth } from '../../shared/auth';
import { DynamicForm, type FieldDefinition } from './DynamicForm';
import { DynamicTable, type SortKey, type SortState } from './DynamicTable';

type InventoryType = { id: string; name: string; code: string };
type Item = {
  id: string;
  sku: string;
  name: string;
  quantity: number | string;
  minQuantity: number | string;
  inventoryTypeId: string;
  attributes?: Record<string, unknown>;
  inventoryType?: { name: string };
};

const PAGE_SIZE = 20;

const emptyForm = {
  sku: '',
  name: '',
  quantity: 0,
  minQuantity: 0,
  attributes: {} as Record<string, unknown>,
};

export function ItemsPage() {
  const qc = useQueryClient();
  const toast = useToast();
  const confirm = useConfirm();
  const { user } = useAuth();
  const canWrite = hasMinRole((user?.role ?? 'VIEWER') as UserRole, 'ADMIN');
  const [typeId, setTypeId] = useState('');
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [page, setPage] = useState(1);
  const [sort, setSort] = useState<SortState>(null);

  // Debounce the search box so we don't fire a request per keystroke.
  useEffect(() => {
    const t = window.setTimeout(() => {
      setDebouncedSearch(search);
      setPage(1);
    }, 300);
    return () => window.clearTimeout(t);
  }, [search]);

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [formTypeId, setFormTypeId] = useState('');
  const [form, setForm] = useState({ ...emptyForm });

  const typesQuery = useQuery({
    queryKey: ['inventory-types'],
    queryFn: async () => (await api<InventoryType[]>('/inventory-types')).data,
  });

  const itemsQuery = useQuery({
    queryKey: ['items', typeId, debouncedSearch, page],
    queryFn: async () => {
      const qs = new URLSearchParams({ pageSize: String(PAGE_SIZE), page: String(page) });
      if (typeId) qs.set('inventoryTypeId', typeId);
      if (debouncedSearch.trim()) qs.set('q', debouncedSearch.trim());
      return api<Item[]>(`/inventory-items?${qs}`) as Promise<ApiEnvelope<Item[]>>;
    },
  });

  // Schema for the dynamic columns in the table (based on the list filter type).
  const columnSchemaQuery = useQuery({
    queryKey: ['schema', typeId],
    enabled: Boolean(typeId),
    queryFn: async () =>
      (await api<FieldDefinition[]>(`/inventory-types/${typeId}/fields/schema`)).data,
  });

  // Schema for the form (based on the type chosen in the dialog).
  const formSchemaQuery = useQuery({
    queryKey: ['schema', formTypeId],
    enabled: Boolean(formTypeId),
    queryFn: async () =>
      (await api<FieldDefinition[]>(`/inventory-types/${formTypeId}/fields/schema`)).data,
  });

  // Prefill attribute defaults when creating a fresh item for a type.
  useEffect(() => {
    if (!dialogOpen || editingId || !formSchemaQuery.data) return;
    const defaults: Record<string, unknown> = {};
    for (const f of formSchemaQuery.data) {
      if (form.attributes[f.key] !== undefined) continue;
      if (f.defaultValue != null) {
        defaults[f.key] = f.defaultValue;
      } else if (f.fieldType === 'BOOLEAN' || f.fieldType === 'CHECKBOX') {
        // Checkboxes only emit a value on toggle; seed false so required ones submit.
        defaults[f.key] = false;
      }
    }
    if (Object.keys(defaults).length) {
      setForm((prev) => ({ ...prev, attributes: { ...defaults, ...prev.attributes } }));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [formSchemaQuery.data, dialogOpen, editingId]);

  // Close the modal on Escape.
  useEffect(() => {
    if (!dialogOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') closeDialog();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dialogOpen]);

  const save = useMutation({
    mutationFn: async () => {
      if (editingId) {
        return api(`/inventory-items/${editingId}`, {
          method: 'PATCH',
          body: JSON.stringify(form),
        });
      }
      return api('/inventory-items', {
        method: 'POST',
        body: JSON.stringify({ ...form, inventoryTypeId: formTypeId }),
      });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['items'] });
      qc.invalidateQueries({ queryKey: ['dashboard'] });
      toast.success(editingId ? 'Item updated' : 'Item created');
      closeDialog();
    },
    onError: (e) => toast.error(toErrorMessage(e)),
  });

  const remove = useMutation({
    mutationFn: async (id: string) =>
      api(`/inventory-items/${id}`, { method: 'DELETE' }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['items'] });
      qc.invalidateQueries({ queryKey: ['dashboard'] });
      toast.success('Item deleted');
    },
    onError: (e) => toast.error(toErrorMessage(e)),
  });

  function openCreate() {
    setEditingId(null);
    setForm({ ...emptyForm, attributes: {} });
    setFormTypeId(typeId || typesQuery.data?.[0]?.id || '');
    setDialogOpen(true);
  }

  async function openEdit(id: string) {
    const res = await api<Item>(`/inventory-items/${id}`);
    setEditingId(id);
    setFormTypeId(res.data.inventoryTypeId);
    setForm({
      sku: res.data.sku,
      name: res.data.name,
      quantity: Number(res.data.quantity),
      minQuantity: Number(res.data.minQuantity),
      attributes: (res.data.attributes as Record<string, unknown>) ?? {},
    });
    setDialogOpen(true);
  }

  function closeDialog() {
    setDialogOpen(false);
    setEditingId(null);
    setForm({ ...emptyForm, attributes: {} });
  }

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    save.mutate();
  }

  async function exportCsv() {
    try {
      // The API caps pageSize at 100, so page through all matches.
      const all: Item[] = [];
      let p = 1;
      for (;;) {
        const qs = new URLSearchParams({ pageSize: '100', page: String(p) });
        if (typeId) qs.set('inventoryTypeId', typeId);
        if (debouncedSearch.trim()) qs.set('q', debouncedSearch.trim());
        const res = (await api<Item[]>(`/inventory-items?${qs}`)) as ApiEnvelope<Item[]>;
        all.push(...res.data);
        const totalPages = res.meta?.totalPages ?? 1;
        if (p >= totalPages || res.data.length === 0) break;
        p += 1;
      }
      const attrKeys = columns.map((c) => c.key);
      const header = ['sku', 'name', 'type', 'quantity', 'minQuantity', ...attrKeys];
      const esc = (v: unknown) => `"${String(v ?? '').replace(/"/g, '""')}"`;
      const rows = all.map((it) =>
        [
          it.sku,
          it.name,
          it.inventoryType?.name ?? '',
          it.quantity,
          it.minQuantity,
          ...attrKeys.map((k) => {
            const v = it.attributes?.[k];
            return Array.isArray(v) ? v.join('; ') : v;
          }),
        ]
          .map(esc)
          .join(','),
      );
      const csv = [header.map(esc).join(','), ...rows].join('\r\n');
      const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }));
      const a = document.createElement('a');
      a.href = url;
      a.download = `inventory-items-${new Date().toISOString().slice(0, 10)}.csv`;
      a.click();
      URL.revokeObjectURL(url);
      toast.success(`Exported ${all.length} item${all.length === 1 ? '' : 's'}`);
    } catch (e) {
      toast.error(toErrorMessage(e));
    }
  }

  const typeOptions = useMemo(() => typesQuery.data ?? [], [typesQuery.data]);
  const formFields = formSchemaQuery.data ?? [];
  const columns = columnSchemaQuery.data ?? [];
  const meta = itemsQuery.data?.meta ?? null;
  const items = itemsQuery.data?.data ?? [];

  return (
    <div className="stack">
      <div className="page-header">
        <div>
          <h2 className="page-title">Inventory Items</h2>
          <p className="muted">Core fields plus dynamic attributes from the type schema.</p>
        </div>
        <div className="row">
          <button className="btn secondary" type="button" onClick={() => void exportCsv()}>
            Export CSV
          </button>
          {canWrite ? (
            <button className="btn" type="button" onClick={openCreate}>
              + Add Item
            </button>
          ) : null}
        </div>
      </div>

      <div className="card stack">
        <div className="row toolbar">
          <input
            className="input"
            placeholder="Search SKU or name…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          <select
            className="select"
            value={typeId}
            onChange={(e) => {
              setTypeId(e.target.value);
              setPage(1);
            }}
          >
            <option value="">All types</option>
            {typeOptions.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}
              </option>
            ))}
          </select>
        </div>

        <DynamicTable
          items={items}
          fields={columns}
          loading={itemsQuery.isLoading}
          sort={sort}
          onSort={(key: SortKey) =>
            setSort((prev) =>
              prev && prev.key === key
                ? { key, dir: prev.dir === 'asc' ? 'desc' : 'asc' }
                : { key, dir: 'asc' },
            )
          }
          onEdit={canWrite ? (id) => void openEdit(id) : undefined}
          onDelete={!canWrite ? undefined : async (id, label) => {
            const ok = await confirm({
              title: 'Delete item',
              message: `Delete "${label}"? This cannot be undone.`,
              confirmLabel: 'Delete',
              danger: true,
            });
            if (ok) remove.mutate(id);
          }}
        />

        {!itemsQuery.isLoading && items.length === 0 ? (
          <p className="muted">No items match. Add one with “+ Add Item”.</p>
        ) : null}

        {meta && meta.total > PAGE_SIZE ? (
          <div className="row spread pagination">
            <span className="muted">
              Page {meta.page} of {meta.totalPages} · {meta.total} items
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

      {dialogOpen ? (
        <div className="modal-backdrop" onClick={closeDialog}>
          <div
            className="modal card stack"
            role="dialog"
            aria-modal="true"
            aria-label={editingId ? 'Edit item' : 'Add item'}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="row spread">
              <h3 className="page-title">{editingId ? 'Edit item' : 'Add item'}</h3>
              <button type="button" className="icon-btn" aria-label="Close" onClick={closeDialog}>
                ×
              </button>
            </div>

            <form className="stack" onSubmit={onSubmit}>
              {!editingId ? (
                <label className="label" htmlFor="item-type">
                  Inventory type
                  <select
                    id="item-type"
                    className="select"
                    value={formTypeId}
                    onChange={(e) => {
                      setFormTypeId(e.target.value);
                      setForm((prev) => ({ ...prev, attributes: {} }));
                    }}
                    required
                  >
                    <option value="">Select a type…</option>
                    {typeOptions.map((t) => (
                      <option key={t.id} value={t.id}>
                        {t.name}
                      </option>
                    ))}
                  </select>
                </label>
              ) : null}

              {formTypeId ? (
                <>
                  <div className="grid cols-2">
                    <label className="label" htmlFor="item-sku">
                      SKU
                      <input
                        id="item-sku"
                        className="input"
                        value={form.sku}
                        onChange={(e) => setForm({ ...form, sku: e.target.value })}
                        required
                      />
                    </label>
                    <label className="label" htmlFor="item-name">
                      Name
                      <input
                        id="item-name"
                        className="input"
                        value={form.name}
                        onChange={(e) => setForm({ ...form, name: e.target.value })}
                        required
                      />
                    </label>
                    <label className="label" htmlFor="item-qty">
                      Quantity
                      <input
                        id="item-qty"
                        className="input"
                        type="number"
                        value={form.quantity}
                        onChange={(e) => setForm({ ...form, quantity: Number(e.target.value) })}
                      />
                    </label>
                    <label className="label" htmlFor="item-minqty">
                      Min quantity
                      <input
                        id="item-minqty"
                        className="input"
                        type="number"
                        value={form.minQuantity}
                        onChange={(e) =>
                          setForm({ ...form, minQuantity: Number(e.target.value) })
                        }
                      />
                    </label>
                  </div>

                  {formFields.length ? (
                    <>
                      <h4 className="page-title">Attributes</h4>
                      <DynamicForm
                        fields={formFields}
                        values={form.attributes}
                        onChange={(attributes) => setForm({ ...form, attributes })}
                      />
                    </>
                  ) : null}
                </>
              ) : (
                <p className="muted">Select an inventory type to continue.</p>
              )}

              <div className="row actions">
                <button
                  className="btn"
                  type="submit"
                  disabled={save.isPending || !formTypeId}
                >
                  {editingId ? 'Save changes' : 'Add item'}
                </button>
                <button type="button" className="btn secondary" onClick={closeDialog}>
                  Cancel
                </button>
              </div>
            </form>
          </div>
        </div>
      ) : null}
    </div>
  );
}
