import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { api, toErrorMessage } from '../../shared/api';
import { formatNumber } from '../../shared/format';
import { DataView, type Column } from '../../ui/DataView';
import { EmptyState } from '../../ui/EmptyState';

type Summary = {
  inventoryTypes: number;
  inventoryItems: number;
  lowStockItems: number;
  suppliers: number;
  buyers: number;
  itemsByType: Array<{
    count: number;
    type: { name: string; code: string } | null;
  }>;
};

type LowItem = {
  id: string;
  sku: string;
  name: string;
  quantity: number | string;
  minQuantity: number | string;
  inventoryType?: { name: string };
};

const STAT_ICONS: Record<string, string> = {
  types: 'M4 7h16M4 12h16M4 17h10',
  items: 'M3 7l9-4 9 4-9 4-9-4zm0 5l9 4 9-4M3 17l9 4 9-4',
  low: 'M12 9v4m0 4h.01M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z',
  suppliers: 'M3 21V9l9-6 9 6v12h-6v-7H9v7H3z',
  buyers: 'M6 2l1.5 4h9L18 2M5 6h14l-1 14H6L5 6z',
};

function StatIcon({ name }: { name: string }) {
  return (
    <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d={STAT_ICONS[name]} />
    </svg>
  );
}

export function DashboardPage() {
  const { data, isLoading, error } = useQuery({
    queryKey: ['dashboard'],
    queryFn: async () => (await api<Summary>('/dashboard/summary')).data,
  });

  const lowStockQuery = useQuery({
    queryKey: ['dashboard', 'low-stock'],
    enabled: (data?.lowStockItems ?? 0) > 0,
    queryFn: async () =>
      // Server-side low-stock filter (v3 A5) — no longer pulls every item to filter client-side.
      (await api<LowItem[]>('/inventory-items?belowReorder=1&pageSize=100')).data,
  });

  if (error) return <p className="error">{toErrorMessage(error)}</p>;

  const lowColumns: Column<LowItem>[] = [
    { key: 'sku', header: 'SKU', cardLabel: 'SKU', render: (it) => it.sku },
    {
      key: 'name',
      header: 'Name',
      cardLabel: 'Name',
      render: (it) => (
        <span className="cell-ellipsis" title={it.name}>
          {it.name}
        </span>
      ),
    },
    { key: 'type', header: 'Type', cardLabel: 'Type', render: (it) => it.inventoryType?.name ?? '—' },
    {
      key: 'qty',
      header: 'Qty',
      cardLabel: 'Qty',
      align: 'end',
      render: (it) => <span className="low-badge">{formatNumber(it.quantity)}</span>,
    },
    { key: 'min', header: 'Min', cardLabel: 'Min', align: 'end', render: (it) => formatNumber(it.minQuantity) },
  ];

  return (
    <div className="stack">
      <div className="page-header">
        <div>
          <h2 className="page-title">Dashboard</h2>
          <p className="muted">Live inventory posture across configurable types.</p>
        </div>
      </div>

      {isLoading ? (
        <>
          <div className="grid stats">
            {Array.from({ length: 5 }).map((_, i) => (
              <div className="card stat" key={i} aria-hidden>
                <span className="dv-skel-cell" style={{ width: '40%' }} />
                <span className="dv-skel-cell" style={{ width: '55%', height: 26 }} />
              </div>
            ))}
          </div>
          <div className="card stack">
            <span className="dv-skel-cell" style={{ width: '30%', height: 18 }} />
            {Array.from({ length: 4 }).map((_, i) => (
              <span className="dv-skel-cell" key={i} />
            ))}
          </div>
        </>
      ) : !data ? null : (
        <>
          <div className="grid stats">
            <Link className="card stat stat-link" to="/inventory-types">
              <span className="stat-label"><span className="stat-ico"><StatIcon name="types" /></span> Types</span>
              <strong>{formatNumber(data.inventoryTypes)}</strong>
            </Link>
            <Link className="card stat stat-link" to="/items">
              <span className="stat-label"><span className="stat-ico"><StatIcon name="items" /></span> Items</span>
              <strong>{formatNumber(data.inventoryItems)}</strong>
            </Link>
            <Link
              className={`card stat stat-link${data.lowStockItems > 0 ? ' stat-alert' : ''}`}
              to="/items"
            >
              <span className="stat-label"><span className="stat-ico"><StatIcon name="low" /></span> Low stock</span>
              <strong>{formatNumber(data.lowStockItems)}</strong>
            </Link>
            <Link className="card stat stat-link" to="/suppliers">
              <span className="stat-label"><span className="stat-ico"><StatIcon name="suppliers" /></span> Suppliers</span>
              <strong>{formatNumber(data.suppliers)}</strong>
            </Link>
            <Link className="card stat stat-link" to="/buyers">
              <span className="stat-label"><span className="stat-ico"><StatIcon name="buyers" /></span> Buyers</span>
              <strong>{formatNumber(data.buyers)}</strong>
            </Link>
          </div>

          {data.lowStockItems > 0 ? (
            <div className="card stack">
              <h3 className="page-title section-title">
                Low stock — reorder needed
                <span className="count-pill">{formatNumber(data.lowStockItems)}</span>
              </h3>
              <DataView
                caption="Low stock items"
                columns={lowColumns}
                rows={lowStockQuery.data ?? []}
                rowKey={(it) => it.id}
                loading={lowStockQuery.isLoading}
                skeletonRows={3}
                actions={(it) => (
                  <Link className="btn secondary btn-sm" to={`/stock?buy=${it.id}`}>
                    Restock
                  </Link>
                )}
                empty={<EmptyState title="Nothing low" message="All items are above their reorder level." />}
              />
            </div>
          ) : null}

          <div className="card stack">
            <h3 className="page-title section-title">
              Items by type
              <span className="count-pill">{formatNumber(data.itemsByType.length)}</span>
            </h3>
            {data.itemsByType.length === 0 ? (
              <EmptyState title="No items yet" message="Add items to see their distribution by type." />
            ) : (
              <div className="stack bar-list">
                {(() => {
                  const max = Math.max(1, ...data.itemsByType.map((r) => r.count));
                  return data.itemsByType.map((row, i) => (
                    <div key={i} className="bar-row">
                      <span className="bar-label" title={row.type?.name ?? 'Unknown'}>
                        {row.type?.name ?? 'Unknown'}
                      </span>
                      <span className="bar-track">
                        <span className="bar-fill" style={{ width: `${(row.count / max) * 100}%` }} />
                      </span>
                      <span className="num bar-count">{formatNumber(row.count)}</span>
                    </div>
                  ));
                })()}
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}
