import type { FieldDefinition } from './DynamicForm';
import type { FieldType } from '@ims/shared';

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

type Props = {
  items: ItemRow[];
  fields: FieldDefinition[];
  onEdit?: (id: string) => void;
};

const NUMERIC_FIELD_TYPES = new Set<FieldType>([
  'NUMBER',
  'DECIMAL',
  'CURRENCY',
]);

export function DynamicTable({ items, fields, onEdit }: Props) {
  const cols = fields.filter((f) => f.isVisible && f.isActive).slice(0, 4);

  return (
    <div className="table-wrap">
      <table className="table">
        <thead>
          <tr>
            <th>SKU</th>
            <th>Name</th>
            <th>Type</th>
            <th>Qty</th>
            {cols.map((c) => (
              <th key={c.id}>{c.displayName}</th>
            ))}
            <th />
          </tr>
        </thead>
        <tbody>
          {items.map((item) => (
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
                {onEdit ? (
                  <button type="button" className="btn secondary" onClick={() => onEdit(item.id)}>
                    Edit
                  </button>
                ) : null}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function formatNumber(value: unknown) {
  if (value == null || value === '') return '—';
  const n = Number(value);
  if (!Number.isFinite(n)) return String(value);
  return new Intl.NumberFormat(undefined, {
    maximumFractionDigits: 4,
  }).format(n);
}

function formatAttr(value: unknown, fieldType?: FieldType) {
  if (value == null) return '—';
  if (Array.isArray(value)) return value.join(', ');
  if (fieldType && NUMERIC_FIELD_TYPES.has(fieldType)) return formatNumber(value);
  if (typeof value === 'number') return formatNumber(value);
  return String(value);
}
