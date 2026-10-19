import { FormEvent, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { hasMinRole, type UserRole } from '@ims/shared';
import { api, toErrorMessage } from '../../shared/api';
import { useToast } from '../../shared/toast';
import { useAuth } from '../../shared/auth';
import { SkeletonRows } from '../../shared/Skeleton';
import { formatNumber } from '../../shared/format';
import { useSearchParams } from 'react-router-dom';

type Party = { id: string; code: string; name: string };
type InventoryType = { id: string; code: string; name: string };
type Item = {
  id: string;
  sku: string;
  name: string;
  quantity: string | number;
  inventoryTypeId: string;
};

type StockTx = {
  id: string;
  type: 'PURCHASE' | 'SALE';
  quantity: string | number;
  quantityBefore: string | number;
  quantityAfter: string | number;
  unitPrice?: string | number | null;
  notes?: string | null;
  createdAt: string;
  inventoryItem: { id: string; sku: string; name: string };
  inventoryType: { id: string; code: string; name: string };
  supplier?: { id: string; name: string } | null;
  buyer?: { id: string; name: string } | null;
  createdBy?: { fullName: string } | null;
};

type Filters = {
  type: '' | 'PURCHASE' | 'SALE';
  inventoryTypeId: string;
  inventoryItemId: string;
  supplierId: string;
  buyerId: string;
  quantity: string;
  quantityMin: string;
  quantityMax: string;
  q: string;
};

const emptyFilters: Filters = {
  type: '',
  inventoryTypeId: '',
  inventoryItemId: '',
  supplierId: '',
  buyerId: '',
  quantity: '',
  quantityMin: '',
  quantityMax: '',
  q: '',
};

const formatNum = formatNumber;

function filtersFromParams(sp: URLSearchParams): Filters {
  const f = { ...emptyFilters };
  for (const key of Object.keys(emptyFilters) as (keyof Filters)[]) {
    const v = sp.get(key);
    if (v != null) (f[key] as string) = v;
  }
  return f;
}

function paramsFromFilters(f: Filters): URLSearchParams {
  const sp = new URLSearchParams();
  for (const [k, v] of Object.entries(f)) if (v) sp.set(k, v);
  return sp;
}

export function StockPage() {
  const qc = useQueryClient();
  const toast = useToast();
  const { user } = useAuth();
  const canWrite = hasMinRole((user?.role ?? 'VIEWER') as UserRole, 'ADMIN');
  const [searchParams, setSearchParams] = useSearchParams();
  const [mode, setMode] = useState<'buy' | 'sell'>('buy');
  const [filters, setFilters] = useState<Filters>(() => filtersFromParams(searchParams));
  const [applied, setApplied] = useState<Filters>(() => filtersFromParams(searchParams));
  const [form, setForm] = useState({
    inventoryItemId: '',
    partyId: '',
    quantity: '',
    unitPrice: '',
    notes: '',
  });

  const typesQuery = useQuery({
    queryKey: ['inventory-types'],
    queryFn: async () => (await api<InventoryType[]>('/inventory-types')).data,
  });

  const itemsQuery = useQuery({
    queryKey: ['items', 'stock'],
    queryFn: async () =>
      (await api<Item[]>('/inventory-items?pageSize=100')).data,
  });

  const suppliersQuery = useQuery({
    queryKey: ['suppliers'],
    queryFn: async () => (await api<Party[]>('/suppliers?pageSize=100')).data,
  });

  const buyersQuery = useQuery({
    queryKey: ['buyers'],
    queryFn: async () => (await api<Party[]>('/buyers?pageSize=100')).data,
  });

  const txQueryKey = useMemo(() => ['stock-transactions', applied], [applied]);

  const txQuery = useQuery({
    queryKey: txQueryKey,
    queryFn: async () => {
      const qs = new URLSearchParams({ pageSize: '50' });
      if (applied.type) qs.set('type', applied.type);
      if (applied.inventoryTypeId) qs.set('inventoryTypeId', applied.inventoryTypeId);
      if (applied.inventoryItemId) qs.set('inventoryItemId', applied.inventoryItemId);
      if (applied.supplierId) qs.set('supplierId', applied.supplierId);
      if (applied.buyerId) qs.set('buyerId', applied.buyerId);
      if (applied.quantity) qs.set('quantity', applied.quantity);
      if (applied.quantityMin) qs.set('quantityMin', applied.quantityMin);
      if (applied.quantityMax) qs.set('quantityMax', applied.quantityMax);
      if (applied.q) qs.set('q', applied.q);
      return api<StockTx[]>(`/stock-transactions?${qs}`);
    },
  });

  const selectedItem = itemsQuery.data?.find((i) => i.id === form.inventoryItemId);

  const mutate = useMutation({
    mutationFn: async () => {
      const payload = {
        inventoryItemId: form.inventoryItemId,
        quantity: Number(form.quantity),
        unitPrice: form.unitPrice === '' ? undefined : Number(form.unitPrice),
        notes: form.notes || undefined,
        ...(mode === 'buy'
          ? { supplierId: form.partyId }
          : { buyerId: form.partyId }),
      };
      return api(`/stock-transactions/${mode}`, {
        method: 'POST',
        body: JSON.stringify(payload),
      });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['stock-transactions'] });
      qc.invalidateQueries({ queryKey: ['items'] });
      qc.invalidateQueries({ queryKey: ['dashboard'] });
      toast.success(mode === 'buy' ? 'Purchase recorded' : 'Sale recorded');
      setForm({
        inventoryItemId: '',
        partyId: '',
        quantity: '',
        unitPrice: '',
        notes: '',
      });
    },
    onError: (e) => toast.error(toErrorMessage(e)),
  });

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    mutate.mutate();
  }

  function applyFilters(e: FormEvent) {
    e.preventDefault();
    setApplied({ ...filters });
    setSearchParams(paramsFromFilters(filters), { replace: true });
  }

  const filteredItemsForForm = useMemo(() => {
    return itemsQuery.data ?? [];
  }, [itemsQuery.data]);

  const filterItems = useMemo(() => {
    const items = itemsQuery.data ?? [];
    if (!filters.inventoryTypeId) return items;
    return items.filter((i) => i.inventoryTypeId === filters.inventoryTypeId);
  }, [itemsQuery.data, filters.inventoryTypeId]);

  return (
    <div className="stack">
      <div className="page-header">
        <div>
          <h2 className="page-title">Stock</h2>
          <p className="muted">Buy from suppliers, sell to buyers, and review movement logs.</p>
        </div>
      </div>

      {canWrite ? (
      <div className="card stack">
        <div className="row">
          <button
            type="button"
            className={`btn${mode === 'buy' ? '' : ' secondary'}`}
            onClick={() => {
              setMode('buy');
              setForm((f) => ({ ...f, partyId: '' }));
            }}
          >
            Buy stock
          </button>
          <button
            type="button"
            className={`btn${mode === 'sell' ? '' : ' secondary'}`}
            onClick={() => {
              setMode('sell');
              setForm((f) => ({ ...f, partyId: '' }));
            }}
          >
            Sell stock
          </button>
        </div>

        <form className="grid cols-2" onSubmit={onSubmit}>
          <label className="label">
            Item
            <select
              className="select"
              value={form.inventoryItemId}
              onChange={(e) => setForm({ ...form, inventoryItemId: e.target.value })}
              required
            >
              <option value="">Select item…</option>
              {filteredItemsForForm.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.sku} — {item.name} (qty {formatNum(item.quantity)})
                </option>
              ))}
            </select>
          </label>

          <label className="label">
            {mode === 'buy' ? 'Supplier' : 'Buyer'}
            <select
              className="select"
              value={form.partyId}
              onChange={(e) => setForm({ ...form, partyId: e.target.value })}
              required
            >
              <option value="">Select…</option>
              {(mode === 'buy' ? suppliersQuery.data : buyersQuery.data)?.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.code} — {p.name}
                </option>
              ))}
            </select>
          </label>

          <label className="label">
            Quantity
            <input
              className="input"
              type="number"
              min="0.0001"
              step="any"
              value={form.quantity}
              onChange={(e) => setForm({ ...form, quantity: e.target.value })}
              required
            />
          </label>

          <label className="label">
            Unit price (optional)
            <input
              className="input"
              type="number"
              min="0"
              step="any"
              value={form.unitPrice}
              onChange={(e) => setForm({ ...form, unitPrice: e.target.value })}
            />
          </label>

          <label className="label label-span">
            Notes
            <textarea
              className="textarea"
              value={form.notes}
              onChange={(e) => setForm({ ...form, notes: e.target.value })}
            />
          </label>

          {selectedItem ? (
            <p className="muted label-span">
              Current stock: <span className="num">{formatNum(selectedItem.quantity)}</span>
            </p>
          ) : null}

          {mutate.isError ? (
            <div className="error label-span">{toErrorMessage(mutate.error)}</div>
          ) : null}

          <div className="row actions label-span">
            <button className="btn" type="submit" disabled={mutate.isPending}>
              {mode === 'buy' ? 'Confirm purchase' : 'Confirm sale'}
            </button>
          </div>
        </form>
      </div>
      ) : null}

      <div className="card stack">
        <h3 className="page-title">Transaction logs</h3>
        <form className="grid cols-2 filters" onSubmit={applyFilters}>
          <label className="label">
            Type
            <select
              className="select"
              value={filters.type}
              onChange={(e) =>
                setFilters({ ...filters, type: e.target.value as Filters['type'] })
              }
            >
              <option value="">All</option>
              <option value="PURCHASE">Purchase</option>
              <option value="SALE">Sale</option>
            </select>
          </label>

          <label className="label">
            Item type
            <select
              className="select"
              value={filters.inventoryTypeId}
              onChange={(e) =>
                setFilters({
                  ...filters,
                  inventoryTypeId: e.target.value,
                  inventoryItemId: '',
                })
              }
            >
              <option value="">All types</option>
              {(typesQuery.data ?? []).map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                </option>
              ))}
            </select>
          </label>

          <label className="label">
            Item
            <select
              className="select"
              value={filters.inventoryItemId}
              onChange={(e) => setFilters({ ...filters, inventoryItemId: e.target.value })}
            >
              <option value="">All items</option>
              {filterItems.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.sku} — {item.name}
                </option>
              ))}
            </select>
          </label>

          <label className="label">
            Supplier
            <select
              className="select"
              value={filters.supplierId}
              onChange={(e) => setFilters({ ...filters, supplierId: e.target.value })}
            >
              <option value="">All suppliers</option>
              {(suppliersQuery.data ?? []).map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
          </label>

          <label className="label">
            Buyer
            <select
              className="select"
              value={filters.buyerId}
              onChange={(e) => setFilters({ ...filters, buyerId: e.target.value })}
            >
              <option value="">All buyers</option>
              {(buyersQuery.data ?? []).map((b) => (
                <option key={b.id} value={b.id}>
                  {b.name}
                </option>
              ))}
            </select>
          </label>

          <label className="label">
            Exact qty
            <input
              className="input"
              type="number"
              min="0"
              step="any"
              value={filters.quantity}
              onChange={(e) => setFilters({ ...filters, quantity: e.target.value })}
            />
          </label>

          <label className="label">
            Qty min
            <input
              className="input"
              type="number"
              min="0"
              step="any"
              value={filters.quantityMin}
              onChange={(e) => setFilters({ ...filters, quantityMin: e.target.value })}
            />
          </label>

          <label className="label">
            Qty max
            <input
              className="input"
              type="number"
              min="0"
              step="any"
              value={filters.quantityMax}
              onChange={(e) => setFilters({ ...filters, quantityMax: e.target.value })}
            />
          </label>

          <label className="label label-span">
            Search
            <input
              className="input"
              value={filters.q}
              onChange={(e) => setFilters({ ...filters, q: e.target.value })}
              placeholder="SKU, item, supplier, buyer, notes…"
            />
          </label>

          <div className="row actions label-span">
            <button className="btn" type="submit">
              Apply filters
            </button>
            <button
              type="button"
              className="btn secondary"
              onClick={() => {
                setFilters(emptyFilters);
                setApplied(emptyFilters);
                setSearchParams(new URLSearchParams(), { replace: true });
              }}
            >
              Clear
            </button>
          </div>
        </form>

        {txQuery.isLoading ? <p className="muted">Loading transactions…</p> : null}
        {txQuery.isError ? (
          <p className="error">{toErrorMessage(txQuery.error)}</p>
        ) : null}

        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr>
                <th>When</th>
                <th>Type</th>
                <th>Item</th>
                <th>Item type</th>
                <th>Party</th>
                <th>Qty</th>
                <th>Before</th>
                <th>After</th>
                <th>Value</th>
                <th>By</th>
              </tr>
            </thead>
            <tbody>
              {txQuery.isLoading ? <SkeletonRows rows={6} cols={10} /> : null}
              {(txQuery.data?.data ?? []).map((row) => (
                <tr key={row.id}>
                  <td className="num">{new Date(row.createdAt).toLocaleString()}</td>
                  <td>{row.type === 'PURCHASE' ? 'Buy' : 'Sell'}</td>
                  <td>
                    <span className="cell-stack">
                      {row.inventoryItem.sku}
                      <span className="muted">{row.inventoryItem.name}</span>
                    </span>
                  </td>
                  <td>{row.inventoryType.name}</td>
                  <td>
                    {row.type === 'PURCHASE'
                      ? row.supplier?.name ?? '—'
                      : row.buyer?.name ?? '—'}
                  </td>
                  <td className="num">{formatNum(row.quantity)}</td>
                  <td className="num">{formatNum(row.quantityBefore)}</td>
                  <td className="num">{formatNum(row.quantityAfter)}</td>
                  <td className="num">
                    {row.unitPrice != null && row.unitPrice !== ''
                      ? formatNum(Number(row.quantity) * Number(row.unitPrice))
                      : '—'}
                  </td>
                  <td>{row.createdBy?.fullName ?? '—'}</td>
                </tr>
              ))}
              {!txQuery.isLoading && !(txQuery.data?.data?.length ?? 0) ? (
                <tr>
                  <td colSpan={10} className="muted">
                    No transactions match these filters.
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
