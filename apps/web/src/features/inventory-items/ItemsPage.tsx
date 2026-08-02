import { FormEvent, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../../shared/api';
import { DynamicForm, type FieldDefinition } from './DynamicForm';
import { DynamicTable } from './DynamicTable';

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

export function ItemsPage() {
  const qc = useQueryClient();
  const [typeId, setTypeId] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState({
    sku: '',
    name: '',
    quantity: 0,
    minQuantity: 0,
    attributes: {} as Record<string, unknown>,
  });

  const typesQuery = useQuery({
    queryKey: ['inventory-types'],
    queryFn: async () => (await api<InventoryType[]>('/inventory-types')).data,
  });

  const itemsQuery = useQuery({
    queryKey: ['items', typeId],
    queryFn: async () => {
      const qs = new URLSearchParams({ pageSize: '50' });
      if (typeId) qs.set('inventoryTypeId', typeId);
      return (await api<Item[]>(`/inventory-items?${qs}`)).data;
    },
  });

  const schemaQuery = useQuery({
    queryKey: ['schema', typeId],
    enabled: Boolean(typeId),
    queryFn: async () =>
      (await api<FieldDefinition[]>(`/inventory-types/${typeId}/fields/schema`)).data,
  });

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
        body: JSON.stringify({ ...form, inventoryTypeId: typeId }),
      });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['items'] });
      qc.invalidateQueries({ queryKey: ['dashboard'] });
      setEditingId(null);
      setForm({ sku: '', name: '', quantity: 0, minQuantity: 0, attributes: {} });
    },
  });

  const fields = schemaQuery.data ?? [];
  const canCreate = Boolean(typeId);

  async function loadItem(id: string) {
    const res = await api<Item>(`/inventory-items/${id}`);
    setEditingId(id);
    setTypeId(res.data.inventoryTypeId);
    setForm({
      sku: res.data.sku,
      name: res.data.name,
      quantity: Number(res.data.quantity),
      minQuantity: Number(res.data.minQuantity),
      attributes: (res.data.attributes as Record<string, unknown>) ?? {},
    });
  }

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    save.mutate();
  }

  const typeOptions = useMemo(() => typesQuery.data ?? [], [typesQuery.data]);

  return (
    <div className="stack">
      <div className="page-header">
        <div>
          <h2 className="page-title">Inventory Items</h2>
          <p className="muted">Core fields plus dynamic attributes from the type schema.</p>
        </div>
        <select
          className="select"
          value={typeId}
          onChange={(e) => {
            setTypeId(e.target.value);
            setEditingId(null);
            setForm({ sku: '', name: '', quantity: 0, minQuantity: 0, attributes: {} });
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

      <div className="card">
        <DynamicTable
          items={itemsQuery.data ?? []}
          fields={fields}
          onEdit={(id) => void loadItem(id)}
        />
      </div>

      <div className="card stack">
        <h3 className="page-title">{editingId ? 'Edit item' : 'Create item'}</h3>
        {!canCreate && !editingId ? (
          <p className="muted">Select an inventory type to create an item.</p>
        ) : (
          <form className="stack" onSubmit={onSubmit}>
            <div className="grid cols-2">
              <label className="label">
                SKU
                <input
                  className="input"
                  value={form.sku}
                  onChange={(e) => setForm({ ...form, sku: e.target.value })}
                  required
                />
              </label>
              <label className="label">
                Name
                <input
                  className="input"
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                  required
                />
              </label>
              <label className="label">
                Quantity
                <input
                  className="input"
                  type="number"
                  value={form.quantity}
                  onChange={(e) => setForm({ ...form, quantity: Number(e.target.value) })}
                />
              </label>
              <label className="label">
                Min quantity
                <input
                  className="input"
                  type="number"
                  value={form.minQuantity}
                  onChange={(e) => setForm({ ...form, minQuantity: Number(e.target.value) })}
                />
              </label>
            </div>
            {fields.length ? (
              <>
                <h4 className="page-title">Dynamic attributes</h4>
                <DynamicForm
                  fields={fields}
                  values={form.attributes}
                  onChange={(attributes) => setForm({ ...form, attributes })}
                />
              </>
            ) : null}
            {save.isError ? (
              <div className="error">{(save.error as Error).message}</div>
            ) : null}
            <div className="row actions">
              <button className="btn" type="submit" disabled={save.isPending}>
                {editingId ? 'Save changes' : 'Create item'}
              </button>
              {editingId ? (
                <button
                  type="button"
                  className="btn secondary"
                  onClick={() => {
                    setEditingId(null);
                    setForm({
                      sku: '',
                      name: '',
                      quantity: 0,
                      minQuantity: 0,
                      attributes: {},
                    });
                  }}
                >
                  Cancel
                </button>
              ) : null}
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
