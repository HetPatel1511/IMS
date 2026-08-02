import type { FieldType } from '@ims/shared';

export type FieldOption = {
  id?: string;
  value: string;
  label: string;
  isActive?: boolean;
};

export type FieldDefinition = {
  id: string;
  key: string;
  displayName: string;
  description?: string | null;
  fieldType: FieldType;
  isRequired: boolean;
  isUnique: boolean;
  defaultValue?: unknown;
  validation?: Record<string, unknown>;
  ui?: Record<string, unknown>;
  sortOrder: number;
  isVisible: boolean;
  isFilterable: boolean;
  isSearchable: boolean;
  isActive: boolean;
  options?: FieldOption[];
};

type Props = {
  fields: FieldDefinition[];
  values: Record<string, unknown>;
  onChange: (values: Record<string, unknown>) => void;
};

export function DynamicForm({ fields, values, onChange }: Props) {
  const visible = fields.filter((f) => f.isActive !== false && f.isVisible !== false);

  function set(key: string, value: unknown) {
    onChange({ ...values, [key]: value });
  }

  return (
    <div className="grid cols-2">
      {visible.map((field) => (
        <label
          key={field.id}
          className={`label${field.fieldType === 'LONG_TEXT' || field.fieldType === 'MULTI_SELECT' ? ' label-span' : ''}`}
        >
          {field.displayName}
          {field.isRequired ? ' *' : ''}
          {renderControl(field, values[field.key], (v) => set(field.key, v))}
        </label>
      ))}
    </div>
  );
}

function renderControl(
  field: FieldDefinition,
  value: unknown,
  onChange: (v: unknown) => void,
) {
  const common = { className: 'input', id: field.key };

  switch (field.fieldType) {
    case 'LONG_TEXT':
      return (
        <textarea
          className="textarea"
          value={String(value ?? '')}
          onChange={(e) => onChange(e.target.value)}
        />
      );
    case 'NUMBER':
    case 'DECIMAL':
    case 'CURRENCY':
      return (
        <input
          {...common}
          type="number"
          step={field.fieldType === 'NUMBER' ? '1' : 'any'}
          value={value == null ? '' : String(value)}
          onChange={(e) =>
            onChange(e.target.value === '' ? null : Number(e.target.value))
          }
        />
      );
    case 'BOOLEAN':
    case 'CHECKBOX':
      return (
        <input
          type="checkbox"
          checked={Boolean(value)}
          onChange={(e) => onChange(e.target.checked)}
        />
      );
    case 'DATE':
      return (
        <input
          {...common}
          type="date"
          value={String(value ?? '')}
          onChange={(e) => onChange(e.target.value)}
        />
      );
    case 'DATETIME':
      return (
        <input
          {...common}
          type="datetime-local"
          value={String(value ?? '').slice(0, 16)}
          onChange={(e) =>
            onChange(e.target.value ? new Date(e.target.value).toISOString() : null)
          }
        />
      );
    case 'DROPDOWN':
    case 'RADIO':
      return (
        <select
          className="select"
          value={String(value ?? '')}
          onChange={(e) => onChange(e.target.value || null)}
        >
          <option value="">Select…</option>
          {(field.options ?? []).map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
      );
    case 'MULTI_SELECT': {
      const selected = Array.isArray(value) ? (value as string[]) : [];
      return (
        <select
          className="select"
          multiple
          value={selected}
          onChange={(e) =>
            onChange(Array.from(e.target.selectedOptions).map((o) => o.value))
          }
        >
          {(field.options ?? []).map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
      );
    }
    case 'COLOR':
      return (
        <input
          {...common}
          className="input input-color"
          type="color"
          value={String(value ?? '#2f6b4f')}
          onChange={(e) => onChange(e.target.value)}
        />
      );
    default:
      return (
        <input
          {...common}
          type={field.fieldType === 'EMAIL' ? 'email' : field.fieldType === 'URL' ? 'url' : 'text'}
          value={String(value ?? '')}
          onChange={(e) => onChange(e.target.value)}
        />
      );
  }
}
