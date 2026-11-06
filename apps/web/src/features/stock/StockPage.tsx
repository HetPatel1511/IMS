import { FormEvent, useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { hasMinRole, type UserRole } from '@ims/shared';
import { api, toErrorMessage } from '../../shared/api';
import { useToast } from '../../shared/toast';
import { useAuth } from '../../shared/auth';
import { FormModal } from '../../shared/FormModal';
import { formatNumber } from '../../shared/format';
import { useClientSort } from '../../shared/SortHeader';
import { useSearchParams } from 'react-router-dom';
import { DataView, type Column } from '../../ui/DataView';
import { EmptyState } from '../../ui/EmptyState';

type TxSortKey = 'createdAt' | 'type' | 'item' | 'inventoryType' | 'quantity' | 'quantityAfter';

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
  type: 'PURCHASE' | 'SALE' | 'ADJUSTMENT';
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

type StockSummary = {
  onHandValue: number;
  totalUnits: number;
  lowStockCount: number;
  outOfStockCount: number;
  movementsToday: number;
  movementsTodayByType: { purchase: number; sale: number; adjustment: number };
  netQtyThisWeek: number;
};

type LevelStatus = 'OK' | 'LOW' | 'OUT';

type LevelRow = {
  id: string;
  sku: string;
  name: string;
  quantity: string | number;
  minQuantity: string | number;
  inventoryType: { id: string; code: string; name: string };
  status: LevelStatus;
  unitPrice: number | null;
  onHandValue: number | null;
  lastMovementAt: string | null;
};

type LevelSortKey = 'sku' | 'name' | 'quantity';

type Filters = {
  type: '' | 'PURCHASE' | 'SALE' | 'ADJUSTMENT';
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

const TX_META: Record<StockTx['type'], { label: string; cls: string }> = {
  PURCHASE: { label: 'Buy', cls: 'tx-buy' },
  SALE: { label: 'Sell', cls: 'tx-sell' },
  ADJUSTMENT: { label: 'Adjust', cls: 'tx-adjust' },
};

const STATUS_META: Record<LevelStatus, { label: string; cls: string }> = {
  OK: { label: 'OK', cls: 'st-ok' },
  LOW: { label: 'Low', cls: 'st-low' },
  OUT: { label: 'Out', cls: 'st-out' },
};

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
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [mode, setMode] = useState<'buy' | 'sell' | 'adjust'>('buy');
  // The Buy/Sell/Adjust form lives in a modal (opened from the header button, a
  // Levels/Items "Manage stock" action, or the dashboard ?buy=<id> deep-link) rather
  // than an always-open card, so the log and levels are visible on landing.
  const [modalOpen, setModalOpen] = useState(() => Boolean(searchParams.get('buy')));
  const [dirty, setDirty] = useState(false);
  // Sub-view: the current-state "Levels" table vs. the "Movements" ledger. Kept in local
  // state (not the URL) so it doesn't collide with the log's filter query-string.
  const [view, setView] = useState<'levels' | 'movements'>('levels');
  const [levelSearch, setLevelSearch] = useState('');
  const [levelSearchDebounced, setLevelSearchDebounced] = useState('');
  const [levelType, setLevelType] = useState('');
  const [levelStatus, setLevelStatus] = useState<'' | 'low' | 'out'>('');
  const [levelPage, setLevelPage] = useState(1);
  const { sort: levelSort, toggle: toggleLevelSort } = useClientSort<LevelSortKey>({
    key: 'quantity',
    dir: 'asc',
  });
  const LEVEL_PAGE_SIZE = 20;
  const [filters, setFilters] = useState<Filters>(() => filtersFromParams(searchParams));
  const [applied, setApplied] = useState<Filters>(() => filtersFromParams(searchParams));
  const [txPage, setTxPage] = useState(1);
  const { sort: txSort, toggle: toggleTxSort } = useClientSort<TxSortKey>({
    key: 'createdAt',
    dir: 'desc',
  });
  const TX_PAGE_SIZE = 25;
  // Deep-link from the dashboard "Restock" action (/stock?buy=<itemId>) preselects the item
  // in the Buy form (mode defaults to 'buy').
  const [form, setForm] = useState({
    inventoryItemId: searchParams.get('buy') ?? '',
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
    // Always refetch so a just-created item appears in the Buy/Sell dropdown (E3).
    staleTime: 0,
    refetchOnMount: 'always',
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

  const txQueryKey = useMemo(
    () => ['stock-transactions', applied, txPage, txSort],
    [applied, txPage, txSort],
  );

  const txQuery = useQuery({
    queryKey: txQueryKey,
    queryFn: async () => {
      const qs = new URLSearchParams({ pageSize: String(TX_PAGE_SIZE), page: String(txPage) });
      if (txSort) qs.set('sort', `${txSort.key}:${txSort.dir}`);
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

  const summaryQuery = useQuery({
    queryKey: ['stock-summary'],
    queryFn: async () => (await api<StockSummary>('/stock/summary')).data,
  });

  // Debounce the Levels search so we don't fire a request per keystroke.
  useEffect(() => {
    const t = window.setTimeout(() => {
      setLevelSearchDebounced(levelSearch);
      setLevelPage(1);
    }, 300);
    return () => window.clearTimeout(t);
  }, [levelSearch]);

  const levelsQuery = useQuery({
    queryKey: ['stock-levels', levelSearchDebounced, levelType, levelStatus, levelPage, levelSort],
    enabled: view === 'levels',
    queryFn: async () => {
      const qs = new URLSearchParams({ pageSize: String(LEVEL_PAGE_SIZE), page: String(levelPage) });
      if (levelSort) qs.set('sort', `${levelSort.key}:${levelSort.dir}`);
      if (levelType) qs.set('inventoryTypeId', levelType);
      if (levelStatus) qs.set('status', levelStatus);
      if (levelSearchDebounced.trim()) qs.set('q', levelSearchDebounced.trim());
      return api<LevelRow[]>(`/stock/levels?${qs}`);
    },
  });

  const selectedItem = itemsQuery.data?.find((i) => i.id === form.inventoryItemId);

  const mutate = useMutation({
    mutationFn: async () => {
      if (mode === 'adjust') {
        return api('/stock-transactions/adjust', {
          method: 'POST',
          body: JSON.stringify({
            inventoryItemId: form.inventoryItemId,
            newQuantity: Number(form.quantity),
            reason: form.notes,
          }),
        });
      }
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
      qc.invalidateQueries({ queryKey: ['stock-levels'] });
      qc.invalidateQueries({ queryKey: ['stock-summary'] });
      qc.invalidateQueries({ queryKey: ['items'] });
      qc.invalidateQueries({ queryKey: ['dashboard'] });
      toast.success(
        mode === 'buy' ? 'Purchase recorded' : mode === 'sell' ? 'Sale recorded' : 'Stock adjusted',
      );
      resetForm();
      setModalOpen(false);
    },
    onError: (e) => toast.error(toErrorMessage(e)),
  });

  function resetForm() {
    setForm({ inventoryItemId: '', partyId: '', quantity: '', unitPrice: '', notes: '' });
    setDirty(false);
  }

  // Update a form field and mark the modal dirty (drives the unsaved-changes guard).
  function change(patch: Partial<typeof form>) {
    setDirty(true);
    setForm((f) => ({ ...f, ...patch }));
  }

  function openModal(next?: { mode?: 'buy' | 'sell' | 'adjust'; inventoryItemId?: string }) {
    if (next?.mode) setMode(next.mode);
    if (next?.inventoryItemId) setForm((f) => ({ ...f, inventoryItemId: next.inventoryItemId! }));
    mutate.reset();
    setModalOpen(true);
  }

  function closeModal() {
    resetForm();
    mutate.reset();
    setModalOpen(false);
  }

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    mutate.mutate();
  }

  function applyFilters(e: FormEvent) {
    e.preventDefault();
    setApplied({ ...filters });
    setTxPage(1);
    setSearchParams(paramsFromFilters(filters), { replace: true });
  }

  // Apply a partial change immediately (used by the Type pills and the chip × buttons).
  function applyPatch(patch: Partial<Filters>) {
    const next = { ...filters, ...patch };
    setFilters(next);
    setApplied(next);
    setTxPage(1);
    setSearchParams(paramsFromFilters(next), { replace: true });
  }

  function clearAllFilters() {
    setFilters(emptyFilters);
    setApplied(emptyFilters);
    setTxPage(1);
    setSearchParams(new URLSearchParams(), { replace: true });
  }

  const filteredItemsForForm = useMemo(() => {
    return itemsQuery.data ?? [];
  }, [itemsQuery.data]);

  const filterItems = useMemo(() => {
    const items = itemsQuery.data ?? [];
    if (!filters.inventoryTypeId) return items;
    return items.filter((i) => i.inventoryTypeId === filters.inventoryTypeId);
  }, [itemsQuery.data, filters.inventoryTypeId]);

  // Human-readable chips for the currently-applied filters (each removable).
  const TYPE_NAMES: Record<string, string> = {
    PURCHASE: 'Purchase',
    SALE: 'Sale',
    ADJUSTMENT: 'Adjustment',
  };
  const nameOf = {
    inventoryTypeId: (id: string) => (typesQuery.data ?? []).find((t) => t.id === id)?.name ?? id,
    inventoryItemId: (id: string) => (itemsQuery.data ?? []).find((i) => i.id === id)?.sku ?? id,
    supplierId: (id: string) => (suppliersQuery.data ?? []).find((s) => s.id === id)?.name ?? id,
    buyerId: (id: string) => (buyersQuery.data ?? []).find((b) => b.id === id)?.name ?? id,
  };
  const chipDefs: { key: keyof Filters; label: string }[] = [];
  if (applied.type) chipDefs.push({ key: 'type', label: `Type: ${TYPE_NAMES[applied.type]}` });
  if (applied.inventoryTypeId)
    chipDefs.push({ key: 'inventoryTypeId', label: `Item type: ${nameOf.inventoryTypeId(applied.inventoryTypeId)}` });
  if (applied.inventoryItemId)
    chipDefs.push({ key: 'inventoryItemId', label: `Item: ${nameOf.inventoryItemId(applied.inventoryItemId)}` });
  if (applied.supplierId)
    chipDefs.push({ key: 'supplierId', label: `Supplier: ${nameOf.supplierId(applied.supplierId)}` });
  if (applied.buyerId)
    chipDefs.push({ key: 'buyerId', label: `Buyer: ${nameOf.buyerId(applied.buyerId)}` });
  if (applied.quantity) chipDefs.push({ key: 'quantity', label: `Qty = ${applied.quantity}` });
  if (applied.quantityMin) chipDefs.push({ key: 'quantityMin', label: `Qty ≥ ${applied.quantityMin}` });
  if (applied.quantityMax) chipDefs.push({ key: 'quantityMax', label: `Qty ≤ ${applied.quantityMax}` });
  if (applied.q) chipDefs.push({ key: 'q', label: `“${applied.q}”` });
  const advancedActive = (
    ['inventoryTypeId', 'inventoryItemId', 'supplierId', 'buyerId', 'quantity', 'quantityMin', 'quantityMax'] as (keyof Filters)[]
  ).filter((k) => applied[k]).length;

  const columns: Column<StockTx>[] = [
    {
      key: 'createdAt',
      header: 'When',
      cardLabel: 'When',
      sortKey: 'createdAt',
      render: (row) => new Date(row.createdAt).toLocaleString(),
    },
    {
      key: 'type',
      header: 'Type',
      cardLabel: 'Type',
      sortKey: 'type',
      render: (row) => <span className={`tx-badge ${TX_META[row.type].cls}`}>{TX_META[row.type].label}</span>,
    },
    {
      key: 'item',
      header: 'Item',
      cardLabel: 'Item',
      sortKey: 'item',
      render: (row) => (
        <span className="cell-stack">
          <span>{row.inventoryItem.sku}</span>
          <span className="muted">{row.inventoryItem.name}</span>
        </span>
      ),
    },
    {
      key: 'inventoryType',
      header: 'Item type',
      cardLabel: 'Item type',
      sortKey: 'inventoryType',
      render: (row) => <span className="type-chip">{row.inventoryType.name}</span>,
    },
    {
      key: 'party',
      header: 'Party',
      cardLabel: 'Party',
      render: (row) =>
        row.type === 'PURCHASE' ? row.supplier?.name ?? '—' : row.type === 'SALE' ? row.buyer?.name ?? '—' : '—',
    },
    { key: 'quantity', header: 'Qty', cardLabel: 'Qty', sortKey: 'quantity', align: 'end', render: (row) => formatNum(row.quantity) },
    { key: 'before', header: 'Before', cardLabel: 'Before', align: 'end', render: (row) => formatNum(row.quantityBefore) },
    { key: 'after', header: 'After', cardLabel: 'After', sortKey: 'quantityAfter', align: 'end', render: (row) => formatNum(row.quantityAfter) },
    {
      key: 'value',
      header: 'Value',
      cardLabel: 'Value',
      align: 'end',
      render: (row) =>
        row.unitPrice != null && row.unitPrice !== ''
          ? formatNum(Number(row.quantity) * Number(row.unitPrice))
          : '—',
    },
    { key: 'by', header: 'By', cardLabel: 'By', render: (row) => row.createdBy?.fullName ?? '—' },
  ];

  const levelColumns: Column<LevelRow>[] = [
    {
      key: 'sku',
      header: 'SKU',
      cardLabel: 'SKU',
      sortKey: 'sku',
      render: (row) => <span className="cell-ellipsis" title={row.sku}>{row.sku}</span>,
    },
    {
      key: 'name',
      header: 'Name',
      cardLabel: 'Name',
      sortKey: 'name',
      render: (row) => <span className="cell-ellipsis" title={row.name}>{row.name}</span>,
    },
    {
      key: 'type',
      header: 'Type',
      cardLabel: 'Type',
      render: (row) => <span className="type-chip">{row.inventoryType.name}</span>,
    },
    {
      key: 'onHand',
      header: 'On hand',
      cardLabel: 'On hand',
      sortKey: 'quantity',
      align: 'end',
      render: (row) => formatNum(row.quantity),
    },
    {
      key: 'reorder',
      header: 'Reorder @',
      cardLabel: 'Reorder @',
      align: 'end',
      render: (row) => formatNum(row.minQuantity),
    },
    {
      key: 'status',
      header: 'Status',
      cardLabel: 'Status',
      render: (row) => (
        <span className={`st-badge ${STATUS_META[row.status].cls}`}>{STATUS_META[row.status].label}</span>
      ),
    },
    {
      key: 'value',
      header: 'Value',
      cardLabel: 'Value',
      align: 'end',
      render: (row) => (row.onHandValue != null ? formatNum(row.onHandValue) : '—'),
    },
  ];

  return (
    <div className="stack">
      <div className="page-header">
        <div>
          <h2 className="page-title">Stock</h2>
          <p className="muted">Buy from suppliers, sell to buyers, and review movement logs.</p>
        </div>
        {canWrite ? (
          <div className="row">
            <button className="btn" type="button" onClick={() => openModal()}>
              + Record movement
            </button>
          </div>
        ) : null}
      </div>

      {canWrite ? (
        <FormModal
          open={modalOpen}
          title="Record movement"
          subtitle="Record a purchase, sale, or stock adjustment — it posts to the movement log."
          submitLabel={
            mode === 'buy' ? 'Confirm purchase' : mode === 'sell' ? 'Confirm sale' : 'Apply adjustment'
          }
          submitting={mutate.isPending}
          dirty={dirty}
          onSubmit={onSubmit}
          onClose={closeModal}
        >
          <div className="seg" role="group" aria-label="Transaction mode">
            <button
              type="button"
              className={`seg-btn${mode === 'buy' ? ' seg-on' : ''}`}
              aria-pressed={mode === 'buy'}
              onClick={() => {
                setMode('buy');
                change({ partyId: '' });
              }}
            >
              Buy stock
            </button>
            <button
              type="button"
              className={`seg-btn${mode === 'sell' ? ' seg-on' : ''}`}
              aria-pressed={mode === 'sell'}
              onClick={() => {
                setMode('sell');
                change({ partyId: '' });
              }}
            >
              Sell stock
            </button>
            <button
              type="button"
              className={`seg-btn${mode === 'adjust' ? ' seg-on' : ''}`}
              aria-pressed={mode === 'adjust'}
              onClick={() => {
                setMode('adjust');
                change({ partyId: '', unitPrice: '' });
              }}
            >
              Adjust stock
            </button>
          </div>

          <div className="grid cols-2">
            <label className="label">
              <span>Item<span className="req-star" aria-hidden>*</span></span>
              <select
                className="select"
                value={form.inventoryItemId}
                onChange={(e) => change({ inventoryItemId: e.target.value })}
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

            {mode !== 'adjust' ? (
              <label className="label">
                <span>{mode === 'buy' ? 'Supplier' : 'Buyer'}<span className="req-star" aria-hidden>*</span></span>
                <select
                  className="select"
                  value={form.partyId}
                  onChange={(e) => change({ partyId: e.target.value })}
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
            ) : null}

            <label className="label">
              <span>{mode === 'adjust' ? 'New quantity' : 'Quantity'}<span className="req-star" aria-hidden>*</span></span>
              <input
                className="input"
                type="number"
                min="0"
                step="any"
                value={form.quantity}
                onChange={(e) => change({ quantity: e.target.value })}
                required
              />
            </label>

            {mode !== 'adjust' ? (
              <label className="label">
                Unit price (optional)
                <input
                  className="input"
                  type="number"
                  min="0"
                  step="any"
                  value={form.unitPrice}
                  onChange={(e) => change({ unitPrice: e.target.value })}
                />
              </label>
            ) : null}

            <label className="label label-span">
              <span>{mode === 'adjust' ? 'Reason' : 'Notes'}{mode === 'adjust' ? <span className="req-star" aria-hidden>*</span> : null}</span>
              <textarea
                className="textarea"
                value={form.notes}
                onChange={(e) => change({ notes: e.target.value })}
                required={mode === 'adjust'}
                placeholder={mode === 'adjust' ? 'e.g. cycle count correction, damage, found stock…' : undefined}
              />
            </label>

            {selectedItem ? (
              <p className="muted label-span stock-preview">
                {mode === 'adjust' ? (
                  <>
                    Current stock: <span className="num">{formatNum(selectedItem.quantity)}</span>
                    {form.quantity !== '' ? (
                      <> → After: <span className="num preview-after">{formatNum(Number(form.quantity))}</span></>
                    ) : null}
                  </>
                ) : (
                  <>
                    Current stock: <span className="num">{formatNum(selectedItem.quantity)}</span>
                    {form.quantity !== '' ? (
                      <> → After: <span className="num preview-after">{formatNum(
                        mode === 'buy'
                          ? Number(selectedItem.quantity) + Number(form.quantity)
                          : Number(selectedItem.quantity) - Number(form.quantity),
                      )}</span></>
                    ) : null}
                  </>
                )}
              </p>
            ) : null}

            {mutate.isError ? (
              <div className="error label-span">{toErrorMessage(mutate.error)}</div>
            ) : null}
          </div>
        </FormModal>
      ) : null}

      <div className="grid stats kpi-strip">
        <button
          type="button"
          className="card stat stat-link"
          onClick={() => setView('levels')}
        >
          <span className="stat-label">On-hand value</span>
          <strong>{summaryQuery.data ? formatNum(summaryQuery.data.onHandValue) : '—'}</strong>
          <span className="stat-sub">at latest purchase cost</span>
        </button>
        <button type="button" className="card stat stat-link" onClick={() => setView('levels')}>
          <span className="stat-label">Stock units</span>
          <strong>{summaryQuery.data ? formatNum(summaryQuery.data.totalUnits) : '—'}</strong>
          <span className="stat-sub">on hand across items</span>
        </button>
        <button
          type="button"
          className={`card stat stat-link${summaryQuery.data && summaryQuery.data.lowStockCount > 0 ? ' stat-alert' : ''}`}
          onClick={() => {
            setView('levels');
            setLevelStatus('low');
            setLevelPage(1);
          }}
        >
          <span className="stat-label">Low / out of stock</span>
          <strong>{summaryQuery.data ? formatNum(summaryQuery.data.lowStockCount) : '—'}</strong>
          <span className="stat-sub">
            {summaryQuery.data ? `${formatNum(summaryQuery.data.outOfStockCount)} out of stock` : 'needs reorder'}
          </span>
        </button>
        <button type="button" className="card stat stat-link" onClick={() => setView('movements')}>
          <span className="stat-label">Movements today</span>
          <strong>{summaryQuery.data ? formatNum(summaryQuery.data.movementsToday) : '—'}</strong>
          <span className="stat-sub">
            {summaryQuery.data
              ? `${summaryQuery.data.movementsTodayByType.purchase} buy · ${summaryQuery.data.movementsTodayByType.sale} sell`
              : ' '}
          </span>
        </button>
        <div className="card stat">
          <span className="stat-label">Net qty this week</span>
          <strong className={summaryQuery.data && summaryQuery.data.netQtyThisWeek > 0 ? 'net-up' : undefined}>
            {summaryQuery.data
              ? `${summaryQuery.data.netQtyThisWeek > 0 ? '+' : ''}${formatNum(summaryQuery.data.netQtyThisWeek)}`
              : '—'}
          </strong>
          <span className="stat-sub">purchased − sold</span>
        </div>
      </div>

      <div className="subtabs" role="tablist" aria-label="Stock view">
        <button
          type="button"
          role="tab"
          aria-selected={view === 'levels'}
          className={`subtab${view === 'levels' ? ' subtab-on' : ''}`}
          onClick={() => setView('levels')}
        >
          Levels
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={view === 'movements'}
          className={`subtab${view === 'movements' ? ' subtab-on' : ''}`}
          onClick={() => setView('movements')}
        >
          Movements
        </button>
      </div>

      {view === 'levels' ? (
        <div className="card stack">
          <div className="log-toolbar">
            <form className="log-search" onSubmit={(e) => e.preventDefault()} role="search">
              <div className="search-field">
                <svg className="search-ico" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden>
                  <circle cx="11" cy="11" r="7" />
                  <path d="M21 21l-4.3-4.3" />
                </svg>
                <input
                  className="input"
                  value={levelSearch}
                  onChange={(e) => setLevelSearch(e.target.value)}
                  placeholder="Search SKU or name…"
                  aria-label="Search stock levels"
                />
              </div>
            </form>
            <select
              className="select"
              value={levelType}
              onChange={(e) => {
                setLevelType(e.target.value);
                setLevelPage(1);
              }}
              aria-label="Filter by item type"
            >
              <option value="">All types</option>
              {(typesQuery.data ?? []).map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                </option>
              ))}
            </select>
            <div className="seg" role="group" aria-label="Filter by status">
              {([['', 'All'], ['low', 'Low'], ['out', 'Out']] as const).map(([val, label]) => (
                <button
                  key={val || 'all'}
                  type="button"
                  className={`seg-btn${levelStatus === val ? ' seg-on' : ''}`}
                  aria-pressed={levelStatus === val}
                  onClick={() => {
                    setLevelStatus(val);
                    setLevelPage(1);
                  }}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>

          {levelsQuery.isError ? <p className="error">{toErrorMessage(levelsQuery.error)}</p> : null}

          <DataView
            caption="Stock levels"
            columns={levelColumns}
            rows={levelsQuery.data?.data ?? []}
            rowKey={(r) => r.id}
            loading={levelsQuery.isLoading}
            sort={levelSort}
            onSort={(k) => toggleLevelSort(k as LevelSortKey)}
            actions={
              canWrite
                ? (row) => (
                    <div className="row">
                      <button
                        type="button"
                        className="btn secondary btn-sm"
                        onClick={() => openModal({ mode: 'buy', inventoryItemId: row.id })}
                      >
                        Buy
                      </button>
                      <button
                        type="button"
                        className="btn secondary btn-sm"
                        onClick={() => openModal({ mode: 'sell', inventoryItemId: row.id })}
                      >
                        Sell
                      </button>
                      <button
                        type="button"
                        className="btn secondary btn-sm"
                        onClick={() => openModal({ mode: 'adjust', inventoryItemId: row.id })}
                      >
                        Adjust
                      </button>
                    </div>
                  )
                : undefined
            }
            empty={
              <EmptyState
                title="No items match"
                message={levelStatus ? 'No items match this status filter.' : 'Add items to see their stock levels.'}
              />
            }
          />

          {levelsQuery.data?.meta && (levelsQuery.data.meta.totalPages ?? 1) > 1 ? (
            <div className="row spread pagination">
              <span className="muted">
                Page {levelsQuery.data.meta.page} of {levelsQuery.data.meta.totalPages} ·{' '}
                {levelsQuery.data.meta.total} items
              </span>
              <div className="row">
                <button
                  type="button"
                  className="btn secondary"
                  disabled={levelPage <= 1}
                  onClick={() => setLevelPage((p) => Math.max(1, p - 1))}
                >
                  Previous
                </button>
                <button
                  type="button"
                  className="btn secondary"
                  disabled={levelPage >= (levelsQuery.data.meta.totalPages ?? 1)}
                  onClick={() => setLevelPage((p) => p + 1)}
                >
                  Next
                </button>
              </div>
            </div>
          ) : null}
        </div>
      ) : (
      <div className="card stack">
        <h3 className="page-title">Transaction log</h3>
        <div className="log-toolbar">
          <form className="log-search" onSubmit={applyFilters} role="search">
            <div className="search-field">
              <svg className="search-ico" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden>
                <circle cx="11" cy="11" r="7" />
                <path d="M21 21l-4.3-4.3" />
              </svg>
              <input
                className="input"
                value={filters.q}
                onChange={(e) => setFilters({ ...filters, q: e.target.value })}
                placeholder="Search SKU, item, party, notes…"
                aria-label="Search transactions"
              />
            </div>
          </form>
          <div className="seg" role="group" aria-label="Filter by type">
            {([['', 'All'], ['PURCHASE', 'Purchases'], ['SALE', 'Sales'], ['ADJUSTMENT', 'Adjustments']] as const).map(
              ([val, label]) => (
                <button
                  key={val || 'all'}
                  type="button"
                  className={`seg-btn${applied.type === val ? ' seg-on' : ''}`}
                  aria-pressed={applied.type === val}
                  onClick={() => applyPatch({ type: val as Filters['type'] })}
                >
                  {label}
                </button>
              ),
            )}
          </div>
          <button
            type="button"
            className="btn secondary"
            aria-expanded={filtersOpen}
            onClick={() => setFiltersOpen((o) => !o)}
          >
            Filters{advancedActive ? ` (${advancedActive})` : ''}
          </button>
        </div>

        {chipDefs.length ? (
          <div className="filter-chips">
            {chipDefs.map((c) => (
              <button
                key={c.key}
                type="button"
                className="chip-filter"
                onClick={() => applyPatch({ [c.key]: '' } as Partial<Filters>)}
                aria-label={`Remove filter ${c.label}`}
              >
                {c.label} <span className="chip-x" aria-hidden>×</span>
              </button>
            ))}
            <button type="button" className="chip-clear" onClick={clearAllFilters}>
              Clear all
            </button>
          </div>
        ) : null}

        {filtersOpen ? (
        <form className="grid cols-2 filters" onSubmit={applyFilters}>
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
        ) : null}

        {txQuery.isError ? (
          <p className="error">{toErrorMessage(txQuery.error)}</p>
        ) : null}

        <DataView
          caption="Stock transactions"
          columns={columns}
          rows={txQuery.data?.data ?? []}
          rowKey={(r) => r.id}
          loading={txQuery.isLoading}
          sort={txSort}
          onSort={(k) => toggleTxSort(k as TxSortKey)}
          empty={<EmptyState title="No transactions match" message="No stock movements match these filters yet." />}
        />

        {txQuery.data?.meta && (txQuery.data.meta.totalPages ?? 1) > 1 ? (
          <div className="row spread pagination">
            <span className="muted">
              Page {txQuery.data.meta.page} of {txQuery.data.meta.totalPages} ·{' '}
              {txQuery.data.meta.total} transactions
            </span>
            <div className="row">
              <button
                type="button"
                className="btn secondary"
                disabled={txPage <= 1}
                onClick={() => setTxPage((p) => Math.max(1, p - 1))}
              >
                Previous
              </button>
              <button
                type="button"
                className="btn secondary"
                disabled={txPage >= (txQuery.data.meta.totalPages ?? 1)}
                onClick={() => setTxPage((p) => p + 1)}
              >
                Next
              </button>
            </div>
          </div>
        ) : null}
      </div>
      )}
    </div>
  );
}
