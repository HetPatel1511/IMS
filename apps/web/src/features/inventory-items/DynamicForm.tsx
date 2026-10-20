import { useQuery } from '@tanstack/react-query';
import type { FieldType } from '@ims/shared';
import { api } from '../../shared/api';
import { getCurrencySymbol } from '../../shared/format';

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
  errors?: Record<string, string>;
};

function num(v: unknown): number | undefined {
  return typeof v === 'number' && Number.isFinite(v) ? v : undefined;
}

export function DynamicForm({ fields, values, onChange, errors }: Props) {
  const visible = fields.filter((f) => f.isActive !== false && f.isVisible !== false);

  function set(key: string, value: unknown) {
    onChange({ ...values, [key]: value });
  }

  return (
    <div className="grid cols-2">
      {visible.map((field) => {
        const spans = field.fieldType === 'LONG_TEXT' || field.fieldType === 'MULTI_SELECT';
        const inline = field.fieldType === 'BOOLEAN' || field.fieldType === 'CHECKBOX';
        return (
          <div key={field.id} className={`label${spans ? ' label-span' : ''}`}>
            <label className={inline ? 'row inline-label' : undefined} htmlFor={`fld-${field.key}`}>
              {!inline && (
                <span>
                  {field.displayName}
                  {field.isRequired ? ' *' : ''}
                </span>
              )}
              {renderControl(field, values[field.key], (v) => set(field.key, v))}
              {inline && (
                <span>
                  {field.displayName}
                  {field.isRequired ? ' *' : ''}
                </span>
              )}
            </label>
            {field.description ? <small className="field-help">{field.description}</small> : null}
            {errors?.[field.key] ? (
              <small className="field-error">{errors[field.key]}</small>
            ) : null}
          </div>
        );
      })}
    </div>
  );
}

function renderControl(
  field: FieldDefinition,
  value: unknown,
  onChange: (v: unknown) => void,
) {
  const v = field.validation ?? {};
  const common = { className: 'input', id: `fld-${field.key}` };
  const required = field.isRequired || undefined;

  switch (field.fieldType) {
    case 'LONG_TEXT':
      return (
        <textarea
          id={`fld-${field.key}`}
          className="textarea"
          maxLength={num(v.maxLength)}
          required={required}
          value={String(value ?? '')}
          onChange={(e) => onChange(e.target.value)}
        />
      );
    case 'NUMBER':
    case 'DECIMAL':
      return (
        <input
          {...common}
          type="number"
          step={field.fieldType === 'NUMBER' ? (num(v.step) ?? 1) : (num(v.step) ?? 'any')}
          min={num(v.min)}
          max={num(v.max)}
          required={required}
          value={value == null ? '' : String(value)}
          onChange={(e) => onChange(e.target.value === '' ? null : Number(e.target.value))}
        />
      );
    case 'CURRENCY': {
      const symbol =
        typeof field.ui?.currency === 'string' ? (field.ui.currency as string) : getCurrencySymbol();
      return (
        <div className="input-affix">
          <span className="affix">{symbol}</span>
          <input
            {...common}
            type="number"
            step="0.01"
            min={num(v.min)}
            max={num(v.max)}
            required={required}
            value={value == null ? '' : String(value)}
            onChange={(e) => onChange(e.target.value === '' ? null : Number(e.target.value))}
          />
        </div>
      );
    }
    case 'BOOLEAN':
    case 'CHECKBOX':
      return (
        <input
          id={`fld-${field.key}`}
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
          required={required}
          value={String(value ?? '')}
          onChange={(e) => onChange(e.target.value)}
        />
      );
    case 'DATETIME':
      return (
        <input
          {...common}
          type="datetime-local"
          required={required}
          value={String(value ?? '').slice(0, 16)}
          onChange={(e) =>
            onChange(e.target.value ? new Date(e.target.value).toISOString() : null)
          }
        />
      );
    case 'DROPDOWN':
      return (
        <select
          id={`fld-${field.key}`}
          className="select"
          required={required}
          value={String(value ?? '')}
          onChange={(e) => onChange(e.target.value || null)}
        >
          <option value="">Select…</option>
          {activeOptions(field).map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
      );
    case 'RADIO':
      return (
        <div className="radio-group" role="radiogroup" aria-label={field.displayName}>
          {activeOptions(field).map((o) => (
            <label key={o.value} className="row inline-label radio-option">
              <input
                type="radio"
                name={`fld-${field.key}`}
                checked={String(value ?? '') === o.value}
                onChange={() => onChange(o.value)}
              />
              <span>{o.label}</span>
            </label>
          ))}
        </div>
      );
    case 'MULTI_SELECT': {
      const selected = Array.isArray(value) ? (value as string[]) : [];
      return (
        <div className="chip-select">
          {activeOptions(field).map((o) => {
            const on = selected.includes(o.value);
            return (
              <button
                type="button"
                key={o.value}
                className={`chip${on ? ' chip-on' : ''}`}
                aria-pressed={on}
                onClick={() =>
                  onChange(
                    on ? selected.filter((s) => s !== o.value) : [...selected, o.value],
                  )
                }
              >
                {o.label}
              </button>
            );
          })}
          {activeOptions(field).length === 0 ? (
            <span className="muted">No options defined</span>
          ) : null}
        </div>
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
    case 'FILE':
    case 'IMAGE':
      return (
        <FileControl
          field={field}
          value={value as FileValue | null | undefined}
          onChange={onChange}
        />
      );
    case 'PHONE':
      return (
        <input
          {...common}
          type="tel"
          required={required}
          placeholder="+91 ..."
          value={String(value ?? '')}
          onChange={(e) => onChange(e.target.value)}
        />
      );
    case 'BARCODE':
    case 'QR_CODE':
      return (
        <input
          {...common}
          className="input input-code"
          inputMode="text"
          required={required}
          placeholder={field.fieldType === 'QR_CODE' ? 'Scan or enter QR value' : 'Scan or enter barcode'}
          value={String(value ?? '')}
          onChange={(e) => onChange(e.target.value)}
        />
      );
    case 'RELATIONSHIP':
      return (
        <RelationshipControl field={field} value={value} onChange={onChange} required={required} />
      );
    default:
      return (
        <input
          {...common}
          type={field.fieldType === 'EMAIL' ? 'email' : field.fieldType === 'URL' ? 'url' : 'text'}
          maxLength={num(v.maxLength)}
          pattern={typeof v.pattern === 'string' ? (v.pattern as string) : undefined}
          required={required}
          value={String(value ?? '')}
          onChange={(e) => onChange(e.target.value)}
        />
      );
  }
}

function activeOptions(field: FieldDefinition): FieldOption[] {
  return (field.options ?? []).filter((o) => o.isActive !== false);
}

type RelItem = { id: string; sku: string; name: string };

function RelationshipControl({
  field,
  value,
  onChange,
  required,
}: {
  field: FieldDefinition;
  value: unknown;
  onChange: (v: unknown) => void;
  required?: boolean;
}) {
  // Target type can be pinned via ui.targetTypeId; otherwise relate to any item.
  const targetTypeId =
    typeof field.ui?.targetTypeId === 'string' ? (field.ui.targetTypeId as string) : '';
  const { data } = useQuery({
    queryKey: ['rel-items', targetTypeId],
    queryFn: async () => {
      const qs = new URLSearchParams({ pageSize: '100' });
      if (targetTypeId) qs.set('inventoryTypeId', targetTypeId);
      return (await api<RelItem[]>(`/inventory-items?${qs}`)).data;
    },
  });
  return (
    <select
      id={`fld-${field.key}`}
      className="select"
      required={required}
      value={String(value ?? '')}
      onChange={(e) => onChange(e.target.value || null)}
    >
      <option value="">Select a record…</option>
      {(data ?? []).map((it) => (
        <option key={it.id} value={it.id}>
          {it.sku} — {it.name}
        </option>
      ))}
    </select>
  );
}

type FileValue = { id: string; name: string };

function FileControl({
  field,
  value,
  onChange,
}: {
  field: FieldDefinition;
  value: FileValue | null | undefined;
  onChange: (v: unknown) => void;
}) {
  const accept = field.fieldType === 'IMAGE' ? 'image/*' : undefined;

  async function upload(file: File) {
    // Request a presigned URL, PUT the bytes to storage, then store the file id.
    const presign = await api<{ id: string; uploadUrl: string }>(`/files/presign`, {
      method: 'POST',
      body: JSON.stringify({
        fileName: file.name,
        mimeType: file.type || 'application/octet-stream',
        sizeBytes: file.size,
      }),
    });
    await fetch(presign.data.uploadUrl, { method: 'PUT', body: file });
    onChange({ id: presign.data.id, name: file.name });
  }

  return (
    <div className="stack file-control">
      {value?.id ? (
        <div className="row spread">
          <span className="muted">{value.name}</span>
          <button type="button" className="btn secondary" onClick={() => onChange(null)}>
            Remove
          </button>
        </div>
      ) : null}
      <input
        id={`fld-${field.key}`}
        type="file"
        accept={accept}
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) void upload(f);
        }}
      />
    </div>
  );
}
