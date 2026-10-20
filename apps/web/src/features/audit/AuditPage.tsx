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
  beforeData?: Record<string, unknown> | null;
  afterData?: Record<string, unknown> | null;
};

// Raw action enum → friendly verb.
const ACTION_LABEL: Record<string, string> = {
  CREATE: 'Created',
  UPDATE: 'Updated',
  DELETE: 'Deleted',
  LOGIN: 'Signed in',
  LOGOUT: 'Signed out',
};

// Raw table name → friendly, singular entity label.
const ENTITY_LABEL: Record<string, string> = {
  inventory_items: 'item',
  inventory_types: 'inventory type',
  field_definitions: 'field',
  stock_transactions: 'stock movement',
  suppliers: 'supplier',
  buyers: 'buyer',
  settings: 'setting',
  users: 'user',
  categories: 'category',
};

function entityLabel(entityType: string): string {
  return ENTITY_LABEL[entityType] ?? entityType.replace(/_/g, ' ');
}

// Pick the most human identifier available from the record snapshot.
function recordName(row: AuditRow): string | null {
  const d = row.afterData ?? row.beforeData ?? null;
  if (!d) return null;
  const pick = (k: string) => (typeof d[k] === 'string' && d[k] ? (d[k] as string) : null);
  const sku = pick('sku');
  const name = pick('name') ?? pick('displayName');
  if (sku && name) return `${sku} · ${name}`;
  return sku ?? name ?? pick('code') ?? pick('key') ?? null;
}

// A readable, full-sentence description of the change.
function describe(row: AuditRow): string {
  if (row.summary) return row.summary;
  const verb = ACTION_LABEL[row.action] ?? row.action.toLowerCase();
  const label = entityLabel(row.entityType);
  const name = recordName(row);
  return name ? `${verb} ${label} “${name}”` : `${verb} ${label}`;
}

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
          <p className="muted">A plain-language history of who changed what, and when.</p>
        </div>
      </div>
      <div className="card">
        <div className="table-wrap">
          <table className="table cards" aria-label="Audit log">
            <thead>
              <tr>
                <SortableTh label="When" sortKey="createdAt" sort={sort} onSort={toggle} />
                <SortableTh label="Who" sortKey="actor" sort={sort} onSort={toggle} />
                <SortableTh label="Action" sortKey="action" sort={sort} onSort={toggle} />
                <SortableTh label="Type" sortKey="entityType" sort={sort} onSort={toggle} />
                <th>What changed</th>
              </tr>
            </thead>
            <tbody>
              {isLoading ? (
                <SkeletonRows rows={6} cols={5} />
              ) : (
                rows.map((row) => {
                  const when = new Date(row.createdAt);
                  return (
                    <tr key={row.id}>
                      <td data-label="When">
                        <span className="cell-stack">
                          <span>{when.toLocaleDateString()}</span>
                          <span className="muted audit-time">{when.toLocaleTimeString()}</span>
                        </span>
                      </td>
                      <td data-label="Who">{row.actor?.fullName ?? 'System'}</td>
                      <td data-label="Action">
                        <span className={`audit-badge audit-${row.action.toLowerCase()}`}>
                          {ACTION_LABEL[row.action] ?? row.action}
                        </span>
                      </td>
                      <td data-label="Type" className="audit-type">
                        {entityLabel(row.entityType)}
                      </td>
                      <td data-label="What changed">
                        <span className="audit-change">{describe(row)}</span>
                        <button
                          type="button"
                          className="audit-ref"
                          title={`Copy record id (${row.entityId})`}
                          aria-label="Copy record id"
                          onClick={() => navigator.clipboard?.writeText(row.entityId)}
                        >
                          ⧉
                        </button>
                      </td>
                    </tr>
                  );
                })
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
