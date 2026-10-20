import { FormEvent, useEffect, useMemo, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { hasMinRole, type UserRole } from '@ims/shared';
import { api, ApiRequestError, toErrorMessage, type ApiEnvelope } from '../../shared/api';
import { useToast } from '../../shared/toast';
import { useConfirm } from '../../shared/confirm';
import { useAuth } from '../../shared/auth';
import { useFocusTrap } from '../../shared/useFocusTrap';
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
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const dirtyRef = useRef(false);
  const trapRef = useFocusTrap<HTMLDivElement>(dialogOpen);

  // Mark the form dirty + update it (used by user-facing inputs).
  function change(patch: Partial<typeof emptyForm>) {
    dirtyRef.current = true;
    setForm((f) => ({ ...f, ...patch }));
  }

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
      forceClose();
    },
    onError: (e) => {
      // Map structured validation details onto the offending fields.
      if (e instanceof ApiRequestError && e.details?.length) {
        const errs: Record<string, string> = {};
        for (const d of e.details) {
          if (!d.path) continue;
          errs[d.path.replace(/^attributes\./, '')] = d.message;
        }
        setFieldErrors(errs);
      }
      toast.error(toErrorMessage(e));
    },
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
    setFieldErrors({});
    setForm({ ...emptyForm, attributes: {} });
    setFormTypeId(typeId || typesQuery.data?.[0]?.id || '');
    setDialogOpen(true);
    dirtyRef.current = false;
  }

  async function openEdit(id: string) {
    const res = await api<Item>(`/inventory-items/${id}`);
    setEditingId(id);
    setFieldErrors({});
    setFormTypeId(res.data.inventoryTypeId);
    setForm({
      sku: res.data.sku,
      name: res.data.name,
      quantity: Number(res.data.quantity),
      minQuantity: Number(res.data.minQuantity),
      attributes: (res.data.attributes as Record<string, unknown>) ?? {},
    });
    setDialogOpen(true);
    dirtyRef.current = false;
  }

  function forceClose() {
    setDialogOpen(false);
    setEditingId(null);
    setFieldErrors({});
    setForm({ ...emptyForm, attributes: {} });
    dirtyRef.current = false;
  }

  async function closeDialog() {
    if (dirtyRef.current) {
      const ok = await confirm({
        title: 'Discard changes?',
        message: 'You have unsaved changes. Close without saving?',
        confirmLabel: 'Discard',
        cancelLabel: 'Keep editing',
        danger: true,
      });
      if (!ok) return;
    }
    forceClose();
  }

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    // Validate client-side so required-field failures render as the app's styled
    // inline errors instead of the native browser bubble (the form uses noValidate).
    const errs: Record<string, string> = {};
    if (!form.sku.trim()) errs.sku = 'SKU is required.';
    if (!form.name.trim()) errs.name = 'Name is required.';
    for (const f of formFields) {
      if (!f.isRequired || f.isActive === false || f.isVisible === false) continue;
      const v = form.attributes[f.key];
      const missing =
        v === undefined ||
        v === null ||
        v === '' ||
        (Array.isArray(v) && v.length === 0) ||
        ((f.fieldType === 'BOOLEAN' || f.fieldType === 'CHECKBOX') && v === false);
      if (missing) errs[f.key] = `${f.displayName} is required.`;
    }
    if (Object.keys(errs).length) {
      setFieldErrors(errs);
      return;
    }
    setFieldErrors({});
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
            ref={trapRef}
            className={`modal card stack${editingId ? ' edit-mode' : ''}`}
            role="dialog"
            aria-modal="true"
            aria-label={editingId ? `Edit item ${form.sku}` : 'Add item'}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="row spread">
              <div>
                <h3 className="page-title">
                  {editingId ? (
                    <>
                      <span className="edit-badge">Editing</span> {form.sku || 'item'}
                    </>
                  ) : (
                    'Add item'
                  )}
                </h3>
                <p className="modal-subtitle">
                  {editingId
                    ? 'Updating an existing item — its inventory type is fixed.'
                    : 'Create a new item for a chosen inventory type.'}
                </p>
              </div>
              <button type="button" className="icon-btn" aria-label="Close" onClick={closeDialog}>
                ×
              </button>
            </div>

            <form className="stack" onSubmit={onSubmit} noValidate>
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
                        onChange={(e) => change({ sku: e.target.value })}
                        aria-invalid={Boolean(fieldErrors.sku)}
                        required
                      />
                      {fieldErrors.sku ? <small className="field-error">{fieldErrors.sku}</small> : null}
                    </label>
                    <label className="label" htmlFor="item-name">
                      Name
                      <input
                        id="item-name"
                        className="input"
                        value={form.name}
                        onChange={(e) => change({ name: e.target.value })}
                        aria-invalid={Boolean(fieldErrors.name)}
                        required
                      />
                      {fieldErrors.name ? <small className="field-error">{fieldErrors.name}</small> : null}
                    </label>
                    <label className="label" htmlFor="item-qty">
                      Quantity
                      <input
                        id="item-qty"
                        className="input"
                        type="number"
                        min="0"
                        step="any"
                        value={form.quantity}
                        onChange={(e) => change({ quantity: Number(e.target.value) })}
                      />
                    </label>
                    <label className="label" htmlFor="item-minqty">
                      Min quantity
                      <input
                        id="item-minqty"
                        className="input"
                        type="number"
                        min="0"
                        step="any"
                        value={form.minQuantity}
                        onChange={(e) => change({ minQuantity: Number(e.target.value) })}
                      />
                    </label>
                  </div>

                  {formFields.length ? (
                    <>
                      <h4 className="page-title">Attributes</h4>
                      <DynamicForm
                        fields={formFields}
                        values={form.attributes}
                        errors={fieldErrors}
                        onChange={(attributes) => change({ attributes })}
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
                  {save.isPending ? 'Saving…' : editingId ? 'Save changes' : 'Add item'}
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
