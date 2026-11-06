import { FormEvent, useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { FIELD_TYPES, hasMinRole, type FieldType, type UserRole } from '@ims/shared';
import { api, toErrorMessage } from '../../shared/api';
import { useToast } from '../../shared/toast';
import { useConfirm } from '../../shared/confirm';
import { useAuth } from '../../shared/auth';
import { FormModal } from '../../shared/FormModal';
import { usePageBreadcrumb } from '../../shared/breadcrumb';
import { EmptyState } from '../../ui/EmptyState';
import type { FieldDefinition, FieldOption } from '../inventory-items/DynamicForm';

type InventoryType = {
  id: string;
  code: string;
  name: string;
  description?: string | null;
  isActive: boolean;
};

const OPTION_TYPES = new Set<FieldType>(['DROPDOWN', 'RADIO', 'MULTI_SELECT']);
const NUMERIC_TYPES = new Set<FieldType>(['NUMBER', 'DECIMAL', 'CURRENCY']);
const TEXT_TYPES = new Set<FieldType>(['TEXT', 'LONG_TEXT', 'EMAIL', 'URL', 'PHONE']);
const FILE_TYPES = new Set<FieldType>(['FILE', 'IMAGE']);

type FieldFormState = {
  key: string;
  displayName: string;
  description: string;
  fieldType: FieldType;
  isRequired: boolean;
  isUnique: boolean;
  isFilterable: boolean;
  isSearchable: boolean;
  isVisible: boolean;
  defaultValue: string;
  min: string;
  max: string;
  step: string;
  maxLength: string;
  pattern: string;
  accept: string;
  maxSizeMb: string;
  currency: string;
  targetTypeId: string;
  options: FieldOption[];
};

const emptyField: FieldFormState = {
  key: '',
  displayName: '',
  description: '',
  fieldType: 'TEXT',
  isRequired: false,
  isUnique: false,
  isFilterable: false,
  isSearchable: false,
  isVisible: true,
  defaultValue: '',
  min: '',
  max: '',
  step: '',
  maxLength: '',
  pattern: '',
  accept: '',
  maxSizeMb: '',
  currency: '',
  targetTypeId: '',
  options: [],
};

function buildFieldPayload(f: FieldFormState) {
  const validation: Record<string, unknown> = {};
  if (NUMERIC_TYPES.has(f.fieldType)) {
    if (f.min !== '') validation.min = Number(f.min);
    if (f.max !== '') validation.max = Number(f.max);
    if (f.step !== '') validation.step = Number(f.step);
  }
  if (TEXT_TYPES.has(f.fieldType)) {
    if (f.maxLength !== '') validation.maxLength = Number(f.maxLength);
    if (f.pattern !== '') validation.pattern = f.pattern;
  }
  if (FILE_TYPES.has(f.fieldType) && f.maxSizeMb !== '') {
    validation.maxSizeMb = Number(f.maxSizeMb);
  }

  const ui: Record<string, unknown> = {};
  if (FILE_TYPES.has(f.fieldType) && f.accept !== '') ui.accept = f.accept;
  if (f.fieldType === 'CURRENCY' && f.currency !== '') ui.currency = f.currency;
  if (f.fieldType === 'RELATIONSHIP' && f.targetTypeId !== '') ui.targetTypeId = f.targetTypeId;

  let defaultValue: unknown;
  if (f.defaultValue !== '') {
    if (NUMERIC_TYPES.has(f.fieldType)) defaultValue = Number(f.defaultValue);
    else if (f.fieldType === 'BOOLEAN' || f.fieldType === 'CHECKBOX')
      defaultValue = f.defaultValue === 'true';
    else defaultValue = f.defaultValue;
  }

  return {
    key: f.key,
    displayName: f.displayName,
    description: f.description || undefined,
    fieldType: f.fieldType,
    isRequired: f.isRequired,
    isUnique: f.isUnique,
    isFilterable: f.isFilterable,
    isSearchable: f.isSearchable,
    isVisible: f.isVisible,
    defaultValue,
    validation: Object.keys(validation).length ? validation : undefined,
    ui: Object.keys(ui).length ? ui : undefined,
    // Send only the whitelisted option fields. When editing, f.options are full server
    // rows (id, fieldDefinitionId, createdAt, …); passing those back fails the API's
    // forbidNonWhitelisted validation ("options.0.property id should not exist").
    options: OPTION_TYPES.has(f.fieldType)
      ? f.options
          .filter((o) => o.value !== '')
          .map((o) => ({
            value: o.value,
            label: o.label,
            ...(typeof o.isActive === 'boolean' ? { isActive: o.isActive } : {}),
          }))
      : undefined,
  };
}

export function TypeSchemaPage() {
  const { typeId = '' } = useParams();
  const qc = useQueryClient();
  const toast = useToast();
  const confirm = useConfirm();
  const { user } = useAuth();
  const canWrite = hasMinRole((user?.role ?? 'VIEWER') as UserRole, 'ADMIN');

  const [field, setField] = useState<FieldFormState>(emptyField);
  const [editingFieldId, setEditingFieldId] = useState<string | null>(null);
  // Pointer-based drag reorder (works for mouse AND touch; the native HTML5 drag API
  // does not fire on touch screens). `from` is the field being dragged; `insert` is the
  // gap index (0..length) it would drop into.
  const [drag, setDrag] = useState<{ from: number; insert: number } | null>(null);
  const dragRef = useRef<{ from: number; insert: number } | null>(null);
  const listRef = useRef<HTMLUListElement>(null);
  const [fieldDialogOpen, setFieldDialogOpen] = useState(false);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const fieldSnapshotRef = useRef<string>('');

  const typesQuery = useQuery({
    queryKey: ['inventory-types'],
    queryFn: async () => (await api<InventoryType[]>('/inventory-types')).data,
  });
  const currentType = typesQuery.data?.find((t) => t.id === typeId) ?? null;
  const typeName = currentType?.name ?? '';
  usePageBreadcrumb(typeName || null);

  const fieldsQuery = useQuery({
    queryKey: ['fields', typeId],
    enabled: Boolean(typeId),
    queryFn: async () =>
      (await api<FieldDefinition[]>(`/inventory-types/${typeId}/fields`)).data,
  });
  const fields = fieldsQuery.data ?? [];

  const resetField = () => {
    setField(emptyField);
    setEditingFieldId(null);
  };

  function openCreateField() {
    setField(emptyField);
    setEditingFieldId(null);
    setFieldErrors({});
    fieldSnapshotRef.current = JSON.stringify(emptyField);
    setFieldDialogOpen(true);
  }

  function closeFieldDialog() {
    setFieldDialogOpen(false);
    resetField();
    setFieldErrors({});
  }

  const saveField = useMutation({
    mutationFn: async () => {
      const payload = buildFieldPayload(field);
      if (editingFieldId) {
        // key/fieldType are immutable on update
        const { key: _k, fieldType: _t, ...rest } = payload;
        return api(`/inventory-types/${typeId}/fields/${editingFieldId}`, {
          method: 'PATCH',
          body: JSON.stringify(rest),
        });
      }
      return api(`/inventory-types/${typeId}/fields`, {
        method: 'POST',
        body: JSON.stringify(payload),
      });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['fields', typeId] });
      qc.invalidateQueries({ queryKey: ['schema', typeId] });
      toast.success(editingFieldId ? 'Field updated' : 'Field added');
      closeFieldDialog();
    },
    onError: (e) => toast.error(toErrorMessage(e)),
  });

  const deleteField = useMutation({
    mutationFn: async (fieldId: string) =>
      api(`/inventory-types/${typeId}/fields/${fieldId}`, { method: 'DELETE' }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['fields', typeId] });
      toast.success('Field removed');
      resetField();
    },
    onError: (e) => toast.error(toErrorMessage(e)),
  });

  const reorderFields = useMutation({
    mutationFn: async (fieldIds: string[]) =>
      api(`/inventory-types/${typeId}/fields/reorder`, {
        method: 'POST',
        body: JSON.stringify({ fieldIds }),
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['fields', typeId] });
      qc.invalidateQueries({ queryKey: ['schema', typeId] });
    },
    onError: (e) => toast.error(toErrorMessage(e)),
  });

  // After a reorder, restore focus to the control the user acted on (B3): the list
  // refetches after reorder, so without this a keyboard/touch user loses their place.
  const pendingFocus = useRef<{ id: string; ctrl: 'up' | 'down' | 'handle' } | null>(null);
  useEffect(() => {
    const p = pendingFocus.current;
    if (!p) return;
    const pick = document.querySelector<HTMLButtonElement>(
      `[data-field-id="${p.id}"][data-reorder="${p.ctrl}"]`,
    );
    const target =
      pick && !pick.disabled
        ? pick
        : document.querySelector<HTMLButtonElement>(`[data-field-id="${p.id}"][data-reorder="handle"]`);
    if (target) {
      target.focus();
      pendingFocus.current = null;
    }
  }, [fieldsQuery.data]);

  function moveField(index: number, dir: -1 | 1, ctrl: 'up' | 'down' | 'handle' = 'handle') {
    const list = fieldsQuery.data ?? [];
    const target = index + dir;
    if (target < 0 || target >= list.length) return;
    pendingFocus.current = { id: list[index].id, ctrl };
    const ids = list.map((f) => f.id);
    [ids[index], ids[target]] = [ids[target], ids[index]];
    reorderFields.mutate(ids);
  }

  // Work out which gap (0..length) the pointer is hovering, by comparing its Y against
  // each field row's vertical midpoint.
  function insertIndexForY(clientY: number): number {
    const items = Array.from(listRef.current?.querySelectorAll<HTMLElement>('.field-item') ?? []);
    for (let i = 0; i < items.length; i++) {
      const r = items[i].getBoundingClientRect();
      if (clientY < r.top + r.height / 2) return i;
    }
    return items.length;
  }

  function startDrag(e: ReactPointerEvent, index: number) {
    if (!canWrite || reorderFields.isPending) return;
    e.preventDefault();
    (e.currentTarget as HTMLElement).setPointerCapture?.(e.pointerId);
    const st = { from: index, insert: index };
    dragRef.current = st;
    setDrag(st);
  }

  function moveDrag(e: ReactPointerEvent) {
    if (!dragRef.current) return;
    e.preventDefault();
    const insert = insertIndexForY(e.clientY);
    if (insert !== dragRef.current.insert) {
      const st = { ...dragRef.current, insert };
      dragRef.current = st;
      setDrag(st);
    }
  }

  function endDrag() {
    const st = dragRef.current;
    dragRef.current = null;
    setDrag(null);
    if (!st) return;
    const list = fieldsQuery.data ?? [];
    const ids = list.map((f) => f.id);
    const [moved] = ids.splice(st.from, 1);
    // Removing the dragged item shifts later rows up one, so adjust a downward drop.
    const adj = st.insert > st.from ? st.insert - 1 : st.insert;
    ids.splice(adj, 0, moved);
    if (ids.some((id, i) => id !== list[i]?.id)) {
      pendingFocus.current = { id: moved, ctrl: 'handle' };
      reorderFields.mutate(ids);
    }
  }

  async function confirmDeleteField(f: FieldDefinition) {
    const ok = await confirm({
      title: 'Delete field',
      message: `Delete field "${f.displayName}"? Existing item values for it stay in the data but the field is removed from the schema.`,
      confirmLabel: 'Delete',
      danger: true,
    });
    if (ok) deleteField.mutate(f.id);
  }

  function loadField(f: FieldDefinition) {
    setEditingFieldId(f.id);
    const v = f.validation ?? {};
    const next: FieldFormState = {
      key: f.key,
      displayName: f.displayName,
      description: f.description ?? '',
      fieldType: f.fieldType,
      isRequired: f.isRequired,
      isUnique: f.isUnique,
      isFilterable: f.isFilterable,
      isSearchable: f.isSearchable,
      isVisible: f.isVisible,
      defaultValue: f.defaultValue == null ? '' : String(f.defaultValue),
      min: v.min == null ? '' : String(v.min),
      max: v.max == null ? '' : String(v.max),
      step: v.step == null ? '' : String(v.step),
      maxLength: v.maxLength == null ? '' : String(v.maxLength),
      pattern: typeof v.pattern === 'string' ? v.pattern : '',
      accept: typeof f.ui?.accept === 'string' ? (f.ui.accept as string) : '',
      maxSizeMb: v.maxSizeMb == null ? '' : String(v.maxSizeMb),
      currency: typeof f.ui?.currency === 'string' ? (f.ui.currency as string) : '',
      targetTypeId: typeof f.ui?.targetTypeId === 'string' ? (f.ui.targetTypeId as string) : '',
      options: f.options ?? [],
    };
    setField(next);
    setFieldErrors({});
    fieldSnapshotRef.current = JSON.stringify(next);
    setFieldDialogOpen(true);
  }

  function onSaveField(e: FormEvent) {
    e.preventDefault();
    const errs: Record<string, string> = {};
    if (!field.key.trim()) errs.key = 'Key is required.';
    if (!field.displayName.trim()) errs.displayName = 'Display name is required.';
    if (OPTION_TYPES.has(field.fieldType) && field.options.filter((o) => o.value).length === 0) {
      errs.options = 'Add at least one option for this field type.';
    }
    if (Object.keys(errs).length) {
      setFieldErrors(errs);
      return;
    }
    setFieldErrors({});
    saveField.mutate();
  }

  const showOptions = OPTION_TYPES.has(field.fieldType);
  const showNumeric = NUMERIC_TYPES.has(field.fieldType);
  const showText = TEXT_TYPES.has(field.fieldType);
  const isBool = field.fieldType === 'BOOLEAN' || field.fieldType === 'CHECKBOX';
  const showFile = FILE_TYPES.has(field.fieldType);
  const isCurrency = field.fieldType === 'CURRENCY';
  const isRelationship = field.fieldType === 'RELATIONSHIP';

  // Loaded the types list but this id isn't among them.
  if (typesQuery.data && !currentType) {
    return (
      <div className="stack">
        <div className="page-header">
          <div>
            <h2 className="page-title">Type not found</h2>
            <p className="muted">This inventory type doesn’t exist or was deleted.</p>
          </div>
          <Link className="btn secondary" to="/inventory-types">
            ← Inventory Types
          </Link>
        </div>
      </div>
    );
  }

  const flagsText = (f: FieldDefinition) =>
    [
      f.isRequired && 'required',
      f.isUnique && 'unique',
      f.isFilterable && 'filterable',
      f.options?.length ? `${f.options.length} options` : null,
    ]
      .filter(Boolean)
      .join(', ') || '—';

  return (
    <div className="stack">
      <div className="page-header">
        <div>
          <h2 className="page-title">{typeName || 'Schema'}</h2>
          <p className="muted">
            Fields for <code>{currentType?.code ?? typeId}</code> — the attributes captured on
            every item of this type.
          </p>
        </div>
        {canWrite ? (
          <button className="btn" type="button" onClick={openCreateField}>
            + Add field
          </button>
        ) : null}
      </div>

      <div className="card stack">
        {canWrite && fields.length > 1 ? (
          <p className="muted field-list-hint">
            Drag the grip <span aria-hidden>⠿</span> to reorder (works on touch too), or focus it
            and press ↑/↓. Order sets how fields appear on the item form.
          </p>
        ) : null}

        {fieldsQuery.isLoading ? (
          <ul className="field-list" aria-hidden>
            {Array.from({ length: 4 }).map((_, i) => (
              <li className="field-item field-skel" key={i}>
                <span className="dv-skel-cell" style={{ width: '100%' }} />
              </li>
            ))}
          </ul>
        ) : fields.length === 0 ? (
          <EmptyState
            title="No fields yet"
            message={canWrite ? 'Add one with “+ Add field”.' : 'This type has no custom fields yet.'}
          />
        ) : (
          <ul className="field-list" ref={listRef}>
            {fields.map((f, idx) => (
              <li
                key={f.id}
                data-index={idx}
                className={[
                  'field-item',
                  drag?.from === idx ? 'dragging' : '',
                  drag && drag.insert === idx ? 'drop-before' : '',
                  drag && drag.insert === fields.length && idx === fields.length - 1
                    ? 'drop-after'
                    : '',
                ]
                  .filter(Boolean)
                  .join(' ')}
              >
                <div className="field-reorder">
                  {canWrite ? (
                    <button
                      type="button"
                      className="drag-handle"
                      data-field-id={f.id}
                      data-reorder="handle"
                      aria-label={`Reorder ${f.displayName}. Drag, or press arrow up or down.`}
                      aria-keyshortcuts="ArrowUp ArrowDown"
                      title="Drag to reorder (or press ↑/↓)"
                      disabled={reorderFields.isPending}
                      onPointerDown={(e) => startDrag(e, idx)}
                      onPointerMove={moveDrag}
                      onPointerUp={endDrag}
                      onPointerCancel={endDrag}
                      onKeyDown={(e) => {
                        if (e.key === 'ArrowUp') {
                          e.preventDefault();
                          moveField(idx, -1, 'handle');
                        } else if (e.key === 'ArrowDown') {
                          e.preventDefault();
                          moveField(idx, 1, 'handle');
                        }
                      }}
                    >
                      ⠿
                    </button>
                  ) : (
                    <span className="field-order-num">{f.sortOrder}</span>
                  )}
                </div>

                <div className="field-main">
                  <div className="field-head">
                    <span className="field-label">{f.displayName}</span>
                    <code className="field-key">{f.key}</code>
                    <span className="type-chip">{f.fieldType}</span>
                  </div>
                  <div className="field-flags muted">{flagsText(f)}</div>
                </div>

                {canWrite ? (
                  <div className="field-actions">
                    <button type="button" className="btn secondary" onClick={() => loadField(f)}>
                      Edit
                    </button>
                    <button
                      type="button"
                      className="btn secondary danger"
                      disabled={deleteField.isPending && deleteField.variables === f.id}
                      onClick={() => void confirmDeleteField(f)}
                    >
                      {deleteField.isPending && deleteField.variables === f.id ? 'Deleting…' : 'Delete'}
                    </button>
                  </div>
                ) : null}
              </li>
            ))}
          </ul>
        )}
      </div>

      <FormModal
        open={fieldDialogOpen}
        title="Add field"
        editingLabel={editingFieldId ? field.displayName || field.key || 'field' : null}
        subtitle={
          editingFieldId
            ? 'Updating an existing field — its key and type are fixed.'
            : 'Add a custom field to this type’s items.'
        }
        submitLabel={editingFieldId ? 'Save changes' : 'Add field'}
        submitting={saveField.isPending}
        dirty={fieldDialogOpen && JSON.stringify(field) !== fieldSnapshotRef.current}
        onSubmit={onSaveField}
        onClose={closeFieldDialog}
      >
        <div className="grid cols-2">
          <label className="label" htmlFor="field-key">
            <span>Key<span className="req-star" aria-hidden>*</span></span>
            <input
              id="field-key"
              className="input"
              value={field.key}
              onChange={(e) => {
                setField({ ...field, key: e.target.value });
                if (fieldErrors.key) setFieldErrors((p) => ({ ...p, key: '' }));
              }}
              placeholder="thickness"
              aria-invalid={Boolean(fieldErrors.key)}
              disabled={Boolean(editingFieldId)}
            />
            {fieldErrors.key ? <small className="field-error">{fieldErrors.key}</small> : null}
          </label>
          <label className="label" htmlFor="field-name">
            <span>Display name<span className="req-star" aria-hidden>*</span></span>
            <input
              id="field-name"
              className="input"
              value={field.displayName}
              onChange={(e) => {
                setField({ ...field, displayName: e.target.value });
                if (fieldErrors.displayName) setFieldErrors((p) => ({ ...p, displayName: '' }));
              }}
              aria-invalid={Boolean(fieldErrors.displayName)}
            />
            {fieldErrors.displayName ? (
              <small className="field-error">{fieldErrors.displayName}</small>
            ) : null}
          </label>
          <label className="label" htmlFor="field-type">
            Field type
            <select
              id="field-type"
              className="select"
              value={field.fieldType}
              disabled={Boolean(editingFieldId)}
              onChange={(e) => setField({ ...field, fieldType: e.target.value as FieldType })}
            >
              {FIELD_TYPES.map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </select>
          </label>
          <label className="label" htmlFor="field-default">
            Default value
            {isBool ? (
              <select
                id="field-default"
                className="select"
                value={field.defaultValue}
                onChange={(e) => setField({ ...field, defaultValue: e.target.value })}
              >
                <option value="">None</option>
                <option value="true">Checked</option>
                <option value="false">Unchecked</option>
              </select>
            ) : (
              <input
                id="field-default"
                className="input"
                value={field.defaultValue}
                onChange={(e) => setField({ ...field, defaultValue: e.target.value })}
              />
            )}
          </label>
        </div>

        <label className="label" htmlFor="field-desc">
          Help text (description)
          <input
            id="field-desc"
            className="input"
            value={field.description}
            onChange={(e) => setField({ ...field, description: e.target.value })}
            placeholder="Shown under the field on the item form"
          />
        </label>

        {showOptions ? (
          <div className="stack options-editor">
            <strong>Predefined values</strong>
            {field.options.filter((o) => o.value).length === 0 ? (
              <small className="field-error">
                Add at least one value — a required {field.fieldType.toLowerCase()} with no options
                can’t be filled on the item form.
              </small>
            ) : null}
            {field.options.map((opt, i) => (
              <div className="row" key={i}>
                <input
                  className="input"
                  placeholder="value"
                  value={opt.value}
                  onChange={(e) => {
                    const options = [...field.options];
                    options[i] = { ...opt, value: e.target.value };
                    setField({ ...field, options });
                  }}
                />
                <input
                  className="input"
                  placeholder="label"
                  value={opt.label}
                  onChange={(e) => {
                    const options = [...field.options];
                    options[i] = { ...opt, label: e.target.value };
                    setField({ ...field, options });
                  }}
                />
                <button
                  type="button"
                  className="btn secondary"
                  onClick={() =>
                    setField({ ...field, options: field.options.filter((_, j) => j !== i) })
                  }
                >
                  Remove
                </button>
              </div>
            ))}
            <button
              type="button"
              className="btn secondary"
              onClick={() =>
                setField({ ...field, options: [...field.options, { value: '', label: '' }] })
              }
            >
              + Add value
            </button>
          </div>
        ) : null}

        <details className="config-group">
          <summary>Validation &amp; advanced options</summary>
          <div className="group-body">
            {showNumeric ? (
              <div className="grid cols-2">
                <label className="label" htmlFor="field-min">
                  Min
                  <input
                    id="field-min"
                    className="input"
                    type="number"
                    value={field.min}
                    onChange={(e) => setField({ ...field, min: e.target.value })}
                  />
                </label>
                <label className="label" htmlFor="field-max">
                  Max
                  <input
                    id="field-max"
                    className="input"
                    type="number"
                    value={field.max}
                    onChange={(e) => setField({ ...field, max: e.target.value })}
                  />
                </label>
              </div>
            ) : null}

            {showText ? (
              <div className="grid cols-2">
                <label className="label" htmlFor="field-maxlen">
                  Max length
                  <input
                    id="field-maxlen"
                    className="input"
                    type="number"
                    value={field.maxLength}
                    onChange={(e) => setField({ ...field, maxLength: e.target.value })}
                  />
                </label>
                <label className="label" htmlFor="field-pattern">
                  Pattern (regex)
                  <input
                    id="field-pattern"
                    className="input"
                    value={field.pattern}
                    onChange={(e) => setField({ ...field, pattern: e.target.value })}
                  />
                </label>
              </div>
            ) : null}

            {showFile ? (
              <div className="grid cols-2">
                <label className="label" htmlFor="field-accept">
                  Accepted types (mime)
                  <input
                    id="field-accept"
                    className="input"
                    value={field.accept}
                    placeholder={field.fieldType === 'IMAGE' ? 'image/*' : 'application/pdf'}
                    onChange={(e) => setField({ ...field, accept: e.target.value })}
                  />
                </label>
                <label className="label" htmlFor="field-maxsize">
                  Max size (MB)
                  <input
                    id="field-maxsize"
                    className="input"
                    type="number"
                    value={field.maxSizeMb}
                    onChange={(e) => setField({ ...field, maxSizeMb: e.target.value })}
                  />
                </label>
              </div>
            ) : null}

            {isCurrency ? (
              <label className="label" htmlFor="field-currency">
                Currency symbol / code
                <input
                  id="field-currency"
                  className="input"
                  value={field.currency}
                  placeholder="₹"
                  onChange={(e) => setField({ ...field, currency: e.target.value })}
                />
              </label>
            ) : null}

            {isRelationship ? (
              <label className="label" htmlFor="field-target">
                Related inventory type
                <select
                  id="field-target"
                  className="select"
                  value={field.targetTypeId}
                  onChange={(e) => setField({ ...field, targetTypeId: e.target.value })}
                >
                  <option value="">Any type</option>
                  {(typesQuery.data ?? []).map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.name}
                    </option>
                  ))}
                </select>
              </label>
            ) : null}

            <div className="row field-flags">
              <label className="row inline-label">
                <input
                  type="checkbox"
                  checked={field.isRequired}
                  onChange={(e) => setField({ ...field, isRequired: e.target.checked })}
                />
                Required
              </label>
              <label className="row inline-label">
                <input
                  type="checkbox"
                  checked={field.isUnique}
                  onChange={(e) => setField({ ...field, isUnique: e.target.checked })}
                />
                Unique
              </label>
              <label className="row inline-label">
                <input
                  type="checkbox"
                  checked={field.isFilterable}
                  onChange={(e) => setField({ ...field, isFilterable: e.target.checked })}
                />
                Filterable
              </label>
              <label className="row inline-label">
                <input
                  type="checkbox"
                  checked={field.isSearchable}
                  onChange={(e) => setField({ ...field, isSearchable: e.target.checked })}
                />
                Searchable
              </label>
              <label className="row inline-label">
                <input
                  type="checkbox"
                  checked={field.isVisible}
                  onChange={(e) => setField({ ...field, isVisible: e.target.checked })}
                />
                Visible
              </label>
            </div>
          </div>
        </details>
      </FormModal>
    </div>
  );
}
