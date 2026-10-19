import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { api, toErrorMessage } from '../../shared/api';

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

export function DashboardPage() {
  const { data, isLoading, error } = useQuery({
    queryKey: ['dashboard'],
    queryFn: async () => (await api<Summary>('/dashboard/summary')).data,
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
