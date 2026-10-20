import { FormEvent, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { api, toErrorMessage, type ApiEnvelope } from '../../shared/api';
import { SkeletonRows } from '../../shared/Skeleton';
import { SortableTh, sortRows, useClientSort } from '../../shared/SortHeader';

const PAGE_SIZE = 25;

const ENTITY_OPTIONS: [string, string][] = [
  ['', 'All types'],
  ['inventory_items', 'Items'],
  ['inventory_types', 'Inventory types'],
  ['field_definitions', 'Fields'],
  ['stock_transactions', 'Stock movements'],
  ['suppliers', 'Suppliers'],
  ['buyers', 'Buyers'],
  ['settings', 'Settings'],
];

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
  const [page, setPage] = useState(1);
  const [action, setAction] = useState<'' | 'CREATE' | 'UPDATE' | 'DELETE'>('');
  const [entityType, setEntityType] = useState('');
  const [q, setQ] = useState('');
  const [appliedQ, setAppliedQ] = useState('');

  const params = new URLSearchParams({ page: String(page), pageSize: String(PAGE_SIZE) });
  if (action) params.set('action', action);
  if (entityType) params.set('entityType', entityType);
  if (appliedQ) params.set('q', appliedQ);

  const { data, isLoading, error } = useQuery({
    queryKey: ['audit', page, action, entityType, appliedQ],
    queryFn: async () =>
      api<AuditRow[]>(`/audit-logs?${params.toString()}`) as Promise<ApiEnvelope<AuditRow[]>>,
  });
  const rowsData = data?.data ?? [];
  const meta = data?.meta ?? null;

  function setFilter(fn: () => void) {
    fn();
    setPage(1);
  }
  function onSearch(e: FormEvent) {
    e.preventDefault();
    setFilter(() => setAppliedQ(q));
  }

  if (error) return <p className="error">{toErrorMessage(error)}</p>;

  const rows = sortRows(rowsData, sort, (r, k) =>
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
      <div className="card stack">
        <div className="log-toolbar">
          <form className="log-search" onSubmit={onSearch} role="search">
            <input
              className="input"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Search summary, type, or who…"
              aria-label="Search audit log"
            />
          </form>
          <div className="seg" role="group" aria-label="Filter by action">
            {([['', 'All'], ['CREATE', 'Created'], ['UPDATE', 'Updated'], ['DELETE', 'Deleted']] as const).map(
              ([val, label]) => (
                <button
                  key={val || 'all'}
                  type="button"
                  className={`seg-btn${action === val ? ' seg-on' : ''}`}
                  aria-pressed={action === val}
                  onClick={() => setFilter(() => setAction(val))}
                >
                  {label}
                </button>
              ),
            )}
          </div>
          <select
            className="select audit-entity-filter"
            value={entityType}
            onChange={(e) => setFilter(() => setEntityType(e.target.value))}
            aria-label="Filter by type"
          >
            {ENTITY_OPTIONS.map(([val, label]) => (
              <option key={val || 'all'} value={val}>
                {label}
              </option>
            ))}
          </select>
        </div>
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
              {!isLoading && rowsData.length === 0 ? (
                <tr>
                  <td colSpan={5} className="muted">
                    No audit entries match.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
        {meta && meta.total > PAGE_SIZE ? (
          <div className="row spread pagination">
            <span className="muted">
              Page {meta.page} of {meta.totalPages} · {meta.total} entries
            </span>
            <div className="row">
              <button
                type="button"
                className="btn secondary"
                disabled={page <= 1}
                onClick={() => setPage((p) => Math.max(1, p - 1))}
              >
                Previous
              </button>
              <button
                type="button"
                className="btn secondary"
                disabled={meta.totalPages != null && page >= meta.totalPages}
                onClick={() => setPage((p) => p + 1)}
              >
                Next
              </button>
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}
