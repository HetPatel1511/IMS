import { useQuery } from '@tanstack/react-query';
import { api } from '../../shared/api';

type AuditRow = {
  id: string;
  action: string;
  entityType: string;
  entityId: string;
  summary?: string | null;
  createdAt: string;
  actor?: { email: string; fullName: string } | null;
};

export function AuditPage() {
  const { data, isLoading, error } = useQuery({
    queryKey: ['audit'],
    queryFn: async () => (await api<AuditRow[]>('/audit-logs?pageSize=50')).data,
  });

  if (isLoading) return <p className="muted">Loading audit log…</p>;
  if (error) return <p className="error">{(error as Error).message}</p>;

  return (
    <div className="stack">
      <div className="page-header">
        <div>
          <h2 className="page-title">Audit Logs</h2>
          <p className="muted">Append-only trail of metadata and inventory changes.</p>
        </div>
      </div>
      <div className="card">
        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr>
                <th>When</th>
                <th>Actor</th>
                <th>Action</th>
                <th>Entity</th>
                <th>Summary</th>
              </tr>
            </thead>
            <tbody>
              {(data ?? []).map((row) => (
                <tr key={row.id}>
                  <td>{new Date(row.createdAt).toLocaleString()}</td>
                  <td>{row.actor?.fullName ?? '—'}</td>
                  <td>{row.action}</td>
                  <td>
                    <span className="cell-stack">
                      {row.entityType}
                      <span className="muted entity-id">{row.entityId}</span>
                    </span>
                  </td>
                  <td>{row.summary ?? '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
