import { FormEvent, useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { api, toErrorMessage, type ApiEnvelope } from '../../shared/api';
import { useClientSort, sortRows } from '../../shared/SortHeader';
import { DataView, type Column } from '../../ui/DataView';
import { EmptyState } from '../../ui/EmptyState';

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

const ACTION_LABEL: Record<string, string> = {
  CREATE: 'Created',
  UPDATE: 'Updated',
  DELETE: 'Deleted',
  LOGIN: 'Signed in',
  LOGOUT: 'Signed out',
};

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

function recordName(row: AuditRow): string | null {
  const d = row.afterData ?? row.beforeData ?? null;
  if (!d) return null;
  const pick = (k: string) => (typeof d[k] === 'string' && d[k] ? (d[k] as string) : null);
  const sku = pick('sku');
  const name = pick('name') ?? pick('displayName');
  if (sku && name) return `${sku} · ${name}`;
  return sku ?? name ?? pick('code') ?? pick('key') ?? null;
}

function describe(row: AuditRow): string {
  if (row.summary) return row.summary;
  const verb = ACTION_LABEL[row.action] ?? row.action.toLowerCase();
  const label = entityLabel(row.entityType);
  const name = recordName(row);
  return name ? `${verb} ${label} “${name}”` : `${verb} ${label}`;
}

export function AuditPage() {
  // Sorting stays page-local (the audit API orders newest-first); DataView gives it
  // keyboard-operable headers (A2). Default view is newest-first, as before.
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

  const rows = useMemo(
    () =>
      sortRows(rowsData, sort, (r, k) =>
        k === 'actor' ? r.actor?.fullName ?? '' : k === 'createdAt' ? r.createdAt : (r[k] as string),
      ),
    [rowsData, sort],
  );

  // Quieter repeated actor + day grouping cues (C5): compute per-row flags over the
  // rendered order so the "Who" column and date don't repeat noisily down the list.
  const flags = useMemo(() => {
    const m = new Map<string, { newDay: boolean; repeatedActor: boolean }>();
    let prevDay = '';
    let prevActor = '';
    for (const r of rows) {
      const day = new Date(r.createdAt).toDateString();
      const actor = r.actor?.fullName ?? 'System';
      m.set(r.id, { newDay: day !== prevDay, repeatedActor: actor === prevActor });
      prevDay = day;
      prevActor = actor;
    }
    return m;
  }, [rows]);

  if (error) return <p className="error">{toErrorMessage(error)}</p>;

  const columns: Column<AuditRow>[] = [
    {
      key: 'createdAt',
      header: 'When',
      cardLabel: 'When',
      sortKey: 'createdAt',
      render: (row) => {
        const when = new Date(row.createdAt);
        const f = flags.get(row.id);
        return (
          <span className="cell-stack">
            <span className={f && !f.newDay ? 'muted' : undefined}>{when.toLocaleDateString()}</span>
            <span className="muted audit-time">{when.toLocaleTimeString()}</span>
          </span>
        );
      },
    },
    {
      key: 'actor',
      header: 'Who',
      cardLabel: 'Who',
      sortKey: 'actor',
      render: (row) => {
        const f = flags.get(row.id);
        const name = row.actor?.fullName ?? 'System';
        return <span className={f?.repeatedActor ? 'muted' : undefined}>{name}</span>;
      },
    },
    {
      key: 'action',
      header: 'Action',
      cardLabel: 'Action',
      sortKey: 'action',
      render: (row) => (
        <span className={`audit-badge audit-${row.action.toLowerCase()}`}>
          {ACTION_LABEL[row.action] ?? row.action}
        </span>
      ),
    },
    {
      key: 'entityType',
      header: 'Type',
      cardLabel: 'Type',
      sortKey: 'entityType',
      render: (row) => <span className="type-chip">{entityLabel(row.entityType)}</span>,
    },
    {
      key: 'what',
      header: 'What changed',
      cardLabel: 'What changed',
      render: (row) => (
        <>
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
        </>
      ),
    },
  ];

  return (
    <div className="stack">
      <div className="page-header">
        <div>
          <h2 className="page-title">Audit Log</h2>
          <p className="muted">A plain-language history of who changed what, and when.</p>
        </div>
      </div>
      <div className="card stack">
        <div className="log-toolbar">
          <form className="log-search" onSubmit={onSearch} role="search">
            <div className="search-field">
              <svg className="search-ico" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden>
                <circle cx="11" cy="11" r="7" />
                <path d="M21 21l-4.3-4.3" />
              </svg>
              <input
                className="input"
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder="Search summary, type, or who…"
                aria-label="Search audit log"
              />
            </div>
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

        <DataView
          caption="Audit log"
          columns={columns}
          rows={rows}
          rowKey={(r) => r.id}
          loading={isLoading}
          sort={sort}
          onSort={(k) => toggle(k as AuditKey)}
          rowClassName={(r) => (flags.get(r.id)?.newDay ? 'audit-newday' : undefined)}
          empty={<EmptyState title="No audit entries match" message="Try clearing a filter or search." />}
        />

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
