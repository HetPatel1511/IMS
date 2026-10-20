import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { api, toErrorMessage } from '../../shared/api';
import { formatNumber } from '../../shared/format';

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

export function DashboardPage() {
  const { data, isLoading, error } = useQuery({
    queryKey: ['dashboard'],
    queryFn: async () => (await api<Summary>('/dashboard/summary')).data,
  });

  const lowStockQuery = useQuery({
    queryKey: ['dashboard', 'low-stock'],
    enabled: (data?.lowStockItems ?? 0) > 0,
    queryFn: async () => {
      const all = (await api<LowItem[]>('/inventory-items?pageSize=100')).data;
      return all
        .filter((i) => Number(i.quantity) <= Number(i.minQuantity))
        .sort((a, b) => Number(a.quantity) - Number(b.quantity));
    },
  });

  if (isLoading) return <p className="muted">Loading dashboard…</p>;
  if (error) return <p className="error">{toErrorMessage(error)}</p>;
  if (!data) return null;

  return (
    <div className="stack">
      <div className="page-header">
        <div>
          <h2 className="page-title">Dashboard</h2>
          <p className="muted">Live inventory posture across configurable types.</p>
        </div>
      </div>
      <div className="grid stats">
        <Link className="card stat stat-link" to="/inventory-types">
          <span className="muted">Types</span>
          <strong>{data.inventoryTypes}</strong>
        </Link>
        <Link className="card stat stat-link" to="/items">
          <span className="muted">Items</span>
          <strong>{data.inventoryItems}</strong>
        </Link>
        <Link
          className={`card stat stat-link${data.lowStockItems > 0 ? ' stat-alert' : ''}`}
          to="/items"
        >
          <span className="muted">Low stock</span>
          <strong>{data.lowStockItems}</strong>
        </Link>
        <Link className="card stat stat-link" to="/suppliers">
          <span className="muted">Suppliers</span>
          <strong>{data.suppliers}</strong>
        </Link>
        <Link className="card stat stat-link" to="/buyers">
          <span className="muted">Buyers</span>
          <strong>{data.buyers}</strong>
        </Link>
      </div>
      {data.lowStockItems > 0 ? (
        <div className="card stack">
          <h3 className="page-title">Low stock — reorder needed</h3>
          <div className="table-wrap">
            <table className="table cards" aria-label="Low stock items">
              <thead>
                <tr>
                  <th>SKU</th>
                  <th>Name</th>
                  <th>Type</th>
                  <th>Qty</th>
                  <th>Min</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {(lowStockQuery.data ?? []).map((it) => (
                  <tr key={it.id}>
                    <td data-label="SKU">{it.sku}</td>
                    <td data-label="Name">{it.name}</td>
                    <td data-label="Type">{it.inventoryType?.name ?? '—'}</td>
                    <td className="num" data-label="Qty">
                      <span className="low-badge">{formatNumber(it.quantity)}</span>
                    </td>
                    <td className="num" data-label="Min">{formatNumber(it.minQuantity)}</td>
                    <td data-label="Actions">
                      <Link className="btn secondary" to="/stock">
                        Restock
                      </Link>
                    </td>
                  </tr>
                ))}
                {lowStockQuery.isLoading ? (
                  <tr>
                    <td colSpan={6} className="muted">
                      Loading…
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>
        </div>
      ) : null}

      <div className="card">
        <h3 className="page-title">Items by type</h3>
        {data.itemsByType.length === 0 ? (
          <p className="muted">No items yet.</p>
        ) : (
          <div className="stack bar-list">
            {(() => {
              const max = Math.max(1, ...data.itemsByType.map((r) => r.count));
              return data.itemsByType.map((row, i) => (
                <div key={i} className="bar-row">
                  <span className="bar-label">{row.type?.name ?? 'Unknown'}</span>
                  <span className="bar-track">
                    <span
                      className="bar-fill"
                      style={{ width: `${(row.count / max) * 100}%` }}
                    />
                  </span>
                  <span className="num bar-count">{row.count}</span>
                </div>
              ));
            })()}
          </div>
        )}
      </div>
    </div>
  );
}
