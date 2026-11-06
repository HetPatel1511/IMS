import { Link } from 'react-router-dom';
import type { FieldDefinition } from './DynamicForm';
import type { FieldType } from '@ims/shared';
import { formatNumber } from '../../shared/format';
import { DataView, type Column } from '../../ui/DataView';
import { EmptyState } from '../../ui/EmptyState';

type ItemRow = {
  id: string;
  sku: string;
  name: string;
  quantity: string | number;
  minQuantity: string | number;
  attributes?: Record<string, unknown>;
  inventoryType?: { name: string };
  category?: { name: string } | null;
};

export type SortKey = 'sku' | 'name' | 'quantity';
export type SortState = { key: SortKey; dir: 'asc' | 'desc' } | null;

type Props = {
  items: ItemRow[];
  /** attribute columns to show (already filtered/selected by the page's column picker) */
  fields: FieldDefinition[];
  onEdit?: (id: string) => void;
  onDelete?: (id: string, label: string) => void;
  onHistory?: (id: string, label: string) => void;
  deletingId?: string | null;
  loading?: boolean;
  sort?: SortState;
  onSort?: (key: SortKey) => void;
  emptyMessage?: string;
};

const NUMERIC_FIELD_TYPES = new Set<FieldType>(['NUMBER', 'DECIMAL', 'CURRENCY']);

function formatAttr(value: unknown, fieldType?: FieldType) {
  if (value == null) return '—';
  if (Array.isArray(value)) return value.join(', ');
  if (fieldType && NUMERIC_FIELD_TYPES.has(fieldType)) return formatNumber(value);
  if (typeof value === 'number') return formatNumber(value);
  return String(value);
}

export function DynamicTable({
  items,
  fields,
  onEdit,
  onDelete,
  onHistory,
  deletingId,
  loading,
  sort,
  onSort,
  emptyMessage,
}: Props) {
  const columns: Column<ItemRow>[] = [
    {
      key: 'sku',
      header: 'SKU',
      sortKey: 'sku',
      render: (it) => (
        <span className="cell-ellipsis" title={it.sku}>
          {it.sku}
        </span>
      ),
    },
    {
      key: 'name',
      header: 'Name',
      sortKey: 'name',
      render: (it) => (
        <span className="cell-ellipsis" title={it.name}>
          {it.name}
        </span>
      ),
    },
    { key: 'type', header: 'Type', render: (it) => it.inventoryType?.name ?? '—' },
    {
      key: 'quantity',
      header: 'On hand',
      sortKey: 'quantity',
      align: 'end',
      render: (it) => (
        <span className="qty">
          {/* On hand is owned by Stock (the movement ledger); this is a read-only
              reflection that links there rather than an editable cell. */}
          <Link className="qty-link" to={`/stock?buy=${it.id}`} title="Manage stock for this item">
            {formatNumber(it.quantity)}
          </Link>
          {Number(it.quantity) <= Number(it.minQuantity) ? (
            <span className="low-badge" title="At or below reorder level">
              <span aria-hidden>⚠</span> low
            </span>
          ) : null}
        </span>
      ),
    },
    ...fields.map<Column<ItemRow>>((c) => ({
      key: c.id,
      header: c.displayName,
      cardLabel: c.displayName,
      align: NUMERIC_FIELD_TYPES.has(c.fieldType) ? 'end' : 'start',
      render: (it) => formatAttr(it.attributes?.[c.key], c.fieldType),
    })),
  ];

  return (
    <DataView
      caption="Inventory items"
      columns={columns}
      rows={items}
      rowKey={(it) => it.id}
      loading={loading}
      sort={sort ?? null}
      onSort={onSort ? (k) => onSort(k as SortKey) : undefined}
      actions={
        onHistory || onEdit || onDelete
          ? (it) => (
              <>
                <Link className="btn secondary" to={`/stock?buy=${it.id}`}>
                  Manage stock
                </Link>
                {onHistory ? (
                  <button type="button" className="btn secondary" onClick={() => onHistory(it.id, it.name)}>
                    History
                  </button>
                ) : null}
                {onEdit ? (
                  <button type="button" className="btn secondary" onClick={() => onEdit(it.id)}>
                    Edit
                  </button>
                ) : null}
                {onDelete ? (
                  // Delete lives in an overflow menu so the destructive action no longer
                  // out-shouts Edit in every row (it turns danger-coloured on hover/open).
                  <details className="row-menu">
                    <summary className="btn secondary icon-only" aria-label="More actions" title="More actions">
                      <span aria-hidden>⋯</span>
                    </summary>
                    <div className="row-menu-pop">
                      <button
                        type="button"
                        className="menu-item danger"
                        disabled={deletingId === it.id}
                        onClick={(e) => {
                          (e.currentTarget.closest('details') as HTMLDetailsElement | null)?.removeAttribute('open');
                          onDelete(it.id, it.name);
                        }}
                      >
                        {deletingId === it.id ? 'Deleting…' : 'Delete'}
                      </button>
                    </div>
                  </details>
                ) : null}
              </>
            )
          : undefined
      }
      empty={<EmptyState title="No items match" message={emptyMessage ?? 'Try a different search or filter.'} />}
    />
  );
}
