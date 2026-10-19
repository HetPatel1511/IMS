import type { FieldDefinition } from './DynamicForm';
import type { FieldType } from '@ims/shared';
import { SkeletonRows } from '../../shared/Skeleton';
import { formatNumber } from '../../shared/format';

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
  fields: FieldDefinition[];
  onEdit?: (id: string) => void;
  onDelete?: (id: string, label: string) => void;
  loading?: boolean;
  sort?: SortState;
  onSort?: (key: SortKey) => void;
};

const NUMERIC_FIELD_TYPES = new Set<FieldType>([
  'NUMBER',
  'DECIMAL',
  'CURRENCY',
]);

function sortItems(items: ItemRow[], sort: SortState): ItemRow[] {
  if (!sort) return items;
  const sign = sort.dir === 'asc' ? 1 : -1;
  return [...items].sort((a, b) => {
    if (sort.key === 'quantity') {
      return (Number(a.quantity) - Number(b.quantity)) * sign;
    }
    return String(a[sort.key]).localeCompare(String(b[sort.key])) * sign;
  });
}

export function DynamicTable({
  items,
  fields,
  onEdit,
  onDelete,
  loading,
  sort,
  onSort,
}: Props) {
  const cols = fields.filter((f) => f.isVisible && f.isActive).slice(0, 4);
  const rows = sortItems(items, sort ?? null);
  const totalCols = 4 + cols.length + 1;

  const header = (key: SortKey, label: string) =>
    onSort ? (
      <th
        className="sortable"
        onClick={() => onSort(key)}
        aria-sort={sort?.key === key ? (sort.dir === 'asc' ? 'ascending' : 'descending') : 'none'}
      >
        {label}
        {sort?.key === key ? (
          <span className="sort-ind"> {sort.dir === 'asc' ? '▲' : '▼'}</span>
        ) : null}
      </th>
    ) : (
      <th>{label}</th>
    );

  return (
    <div className="table-wrap">
      <table className="table">
        <thead>
          <tr>
            {header('sku', 'SKU')}
            {header('name', 'Name')}
            <th>Type</th>
            {header('quantity', 'Qty')}
            {cols.map((c) => (
              <th key={c.id}>{c.displayName}</th>
            ))}
            <th />
          </tr>
        </thead>
        <tbody>
          {loading ? (
            <SkeletonRows rows={5} cols={totalCols} />
          ) : (
            rows.map((item) => (
              <tr key={item.id}>
                <td>{item.sku}</td>
                <td>{item.name}</td>
                <td>{item.inventoryType?.name ?? '—'}</td>
                <td className="num">
                  <span className="qty">
                    <span>{formatNumber(item.quantity)}</span>
                    {Number(item.quantity) <= Number(item.minQuantity) ? (
                      <span className="error">low</span>
                    ) : null}
                  </span>
                </td>
                {cols.map((c) => (
                  <td
                    key={c.id}
                    className={NUMERIC_FIELD_TYPES.has(c.fieldType) ? 'num' : undefined}
                  >
                    {formatAttr(item.attributes?.[c.key], c.fieldType)}
                  </td>
                ))}
                <td>
                  <div className="row">
                    {onEdit ? (
                      <button type="button" className="btn secondary" onClick={() => onEdit(item.id)}>
                        Edit
                      </button>
                    ) : null}
                    {onDelete ? (
                      <button
                        type="button"
                        className="btn secondary"
                        onClick={() => onDelete(item.id, item.name)}
                      >
                        Delete
                      </button>
                    ) : null}
                  </div>
                </td>
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>
  );
}

function formatAttr(value: unknown, fieldType?: FieldType) {
  if (value == null) return '—';
  if (Array.isArray(value)) return value.join(', ');
  if (fieldType && NUMERIC_FIELD_TYPES.has(fieldType)) return formatNumber(value);
  if (typeof value === 'number') return formatNumber(value);
  return String(value);
}
