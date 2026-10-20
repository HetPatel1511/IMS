import { useQuery } from '@tanstack/react-query';
import { api, toErrorMessage } from '../../shared/api';
import { SkeletonRows } from '../../shared/Skeleton';
import { SortableTh, sortRows, useClientSort } from '../../shared/SortHeader';

type AuditKey = 'createdAt' | 'actor' | 'action' | 'entityType';

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
  const { sort, toggle } = useClientSort<AuditKey>({ key: 'createdAt', dir: 'desc' });
  const { data, isLoading, error } = useQuery({
    queryKey: ['audit'],
    queryFn: async () => (await api<AuditRow[]>('/audit-logs?pageSize=50')).data,
  });

  if (error) return <p className="error">{toErrorMessage(error)}</p>;

  const rows = sortRows(data ?? [], sort, (r, k) =>
    k === 'actor' ? r.actor?.fullName ?? '' : k === 'createdAt' ? r.createdAt : (r[k] as string),
  );

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
          <table className="table cards" aria-label="Audit log">
            <thead>
              <tr>
                <SortableTh label="When" sortKey="createdAt" sort={sort} onSort={toggle} />
                <SortableTh label="Actor" sortKey="actor" sort={sort} onSort={toggle} />
                <SortableTh label="Action" sortKey="action" sort={sort} onSort={toggle} />
                <SortableTh label="Entity" sortKey="entityType" sort={sort} onSort={toggle} />
                <th>Summary</th>
              </tr>
            </thead>
            <tbody>
              {isLoading ? (
                <SkeletonRows rows={6} cols={5} />
              ) : (
                rows.map((row) => (
                  <tr key={row.id}>
                    <td data-label="When">{new Date(row.createdAt).toLocaleString()}</td>
                    <td data-label="Actor">{row.actor?.fullName ?? '—'}</td>
                    <td data-label="Action">{row.action}</td>
                    <td data-label="Entity">
                      <span className="cell-stack">
                        {row.entityType}
                        <span className="muted entity-id" title={row.entityId}>
                          {row.entityId.slice(0, 8)}…
                        </span>
                        <button
                          type="button"
                          className="copy-id"
                          title="Copy full id"
                          aria-label="Copy entity id"
                          onClick={() => navigator.clipboard?.writeText(row.entityId)}
                        >
                          ⧉
                        </button>
                      </span>
                    </td>
                    <td data-label="Summary">{row.summary ?? '—'}</td>
                  </tr>
                ))
              )}
              {!isLoading && (data ?? []).length === 0 ? (
                <tr>
                  <td colSpan={5} className="muted">
                    No audit entries yet.
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
