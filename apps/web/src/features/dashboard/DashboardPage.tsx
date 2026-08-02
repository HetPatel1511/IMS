import { useQuery } from '@tanstack/react-query';
import { api } from '../../shared/api';

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
  if (error) return <p className="error">{(error as Error).message}</p>;
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
        <div className="card stat">
          <span className="muted">Types</span>
          <strong>{data.inventoryTypes}</strong>
        </div>
        <div className="card stat">
          <span className="muted">Items</span>
          <strong>{data.inventoryItems}</strong>
        </div>
        <div className="card stat">
          <span className="muted">Low stock</span>
          <strong>{data.lowStockItems}</strong>
        </div>
        <div className="card stat">
          <span className="muted">Suppliers</span>
          <strong>{data.suppliers}</strong>
        </div>
        <div className="card stat">
          <span className="muted">Buyers</span>
          <strong>{data.buyers}</strong>
        </div>
      </div>
      <div className="card">
        <h3 className="page-title">Items by type</h3>
        <div className="table-wrap">
          <table className="table compact">
            <thead>
              <tr>
                <th>Type</th>
                <th>Count</th>
              </tr>
            </thead>
            <tbody>
              {data.itemsByType.map((row, i) => (
                <tr key={i}>
                  <td>{row.type?.name ?? 'Unknown'}</td>
                  <td className="num">{row.count}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
