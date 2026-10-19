import { FormEvent, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { FIELD_TYPES, hasMinRole, type FieldType, type UserRole } from '@ims/shared';
import { api, toErrorMessage } from '../../shared/api';
import { useToast } from '../../shared/toast';
import { useConfirm } from '../../shared/confirm';
import { useAuth } from '../../shared/auth';
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

const FILE_TYPES = new Set<FieldType>(['FILE', 'IMAGE']);

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
    options: OPTION_TYPES.has(f.fieldType)
      ? f.options.filter((o) => o.value !== '')
      : undefined,
  };
}

export function InventoryTypesPage() {
  const qc = useQueryClient();
  const toast = useToast();
  const confirm = useConfirm();
  const { user } = useAuth();
  const canWrite = hasMinRole((user?.role ?? 'VIEWER') as UserRole, 'ADMIN');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [newType, setNewType] = useState({ code: '', name: '', description: '' });
  const [editingTypeId, setEditingTypeId] = useState<string | null>(null);
  const [field, setField] = useState<FieldFormState>(emptyField);
  const [editingFieldId, setEditingFieldId] = useState<string | null>(null);

  const typesQuery = useQuery({
    queryKey: ['inventory-types'],
    queryFn: async () => (await api<InventoryType[]>('/inventory-types')).data,
  });

  const fieldsQuery = useQuery({
    queryKey: ['fields', selectedId],
    enabled: Boolean(selectedId),
    queryFn: async () =>
      (await api<FieldDefinition[]>(`/inventory-types/${selectedId}/fields`)).data,
  });

  const resetType = () => {
    setNewType({ code: '', name: '', description: '' });
    setEditingTypeId(null);
  };

  const saveType = useMutation({
    mutationFn: async () => {
      if (editingTypeId) {
        // code is immutable on update
        return api(`/inventory-types/${editingTypeId}`, {
          method: 'PATCH',
          body: JSON.stringify({ name: newType.name, description: newType.description }),
        });
      }
      return api('/inventory-types', { method: 'POST', body: JSON.stringify(newType) });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['inventory-types'] });
      toast.success(editingTypeId ? 'Inventory type updated' : 'Inventory type created');
      resetType();
    },
    onError: (e) => toast.error(toErrorMessage(e)),
  });

  const deleteType = useMutation({
    mutationFn: async (id: string) => api(`/inventory-types/${id}`, { method: 'DELETE' }),
    onSuccess: (_d, id) => {
      qc.invalidateQueries({ queryKey: ['inventory-types'] });
      toast.success('Inventory type deleted');
      if (selectedId === id) setSelectedId(null);
      resetType();
    },
    onError: (e) => toast.error(toErrorMessage(e)),
  });

  const resetField = () => {
    setField(emptyField);
    setEditingFieldId(null);
  };

  const saveField = useMutation({
    mutationFn: async () => {
      const payload = buildFieldPayload(field);
      if (editingFieldId) {
        // key/fieldType are immutable on update
        const { key: _k, fieldType: _t, ...rest } = payload;
        return api(`/inventory-types/${selectedId}/fields/${editingFieldId}`, {
          method: 'PATCH',
          body: JSON.stringify(rest),
        });
      }
      return api(`/inventory-types/${selectedId}/fields`, {
        method: 'POST',
        body: JSON.stringify(payload),
      });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['fields', selectedId] });
      qc.invalidateQueries({ queryKey: ['schema', selectedId] });
      toast.success(editingFieldId ? 'Field updated' : 'Field added');
      resetField();
    },
    onError: (e) => toast.error(toErrorMessage(e)),
  });

  const deleteField = useMutation({
    mutationFn: async (fieldId: string) =>
      api(`/inventory-types/${selectedId}/fields/${fieldId}`, { method: 'DELETE' }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['fields', selectedId] });
      toast.success('Field removed');
      resetField();
    },
    onError: (e) => toast.error(toErrorMessage(e)),
  });

  const reorderFields = useMutation({
    mutationFn: async (fieldIds: string[]) =>
      api(`/inventory-types/${selectedId}/fields/reorder`, {
        method: 'POST',
        body: JSON.stringify({ fieldIds }),
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['fields', selectedId] });
      qc.invalidateQueries({ queryKey: ['schema', selectedId] });
    },
    onError: (e) => toast.error(toErrorMessage(e)),
  });

  function moveField(index: number, dir: -1 | 1) {
    const list = fieldsQuery.data ?? [];
    const target = index + dir;
    if (target < 0 || target >= list.length) return;
    const ids = list.map((f) => f.id);
    [ids[index], ids[target]] = [ids[target], ids[index]];
    reorderFields.mutate(ids);
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

  async function confirmDeleteType(t: InventoryType) {
    const ok = await confirm({
      title: 'Delete inventory type',
      message: `Delete type "${t.name}"? This cannot be undone and fails if items still use it.`,
      confirmLabel: 'Delete',
      danger: true,
    });
    if (ok) deleteType.mutate(t.id);
  }

  function loadField(f: FieldDefinition) {
    setEditingFieldId(f.id);
    const v = f.validation ?? {};
    setField({
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
    });
  }

  function onSaveType(e: FormEvent) {
    e.preventDefault();
    saveType.mutate();
  }

  function onSaveField(e: FormEvent) {
    e.preventDefault();
    if (OPTION_TYPES.has(field.fieldType) && field.options.filter((o) => o.value).length === 0) {
      toast.error('Add at least one option for this field type');
      return;
    }
    saveField.mutate();
  }

  const showOptions = OPTION_TYPES.has(field.fieldType);
  const showNumeric = NUMERIC_TYPES.has(field.fieldType);
  const showText = TEXT_TYPES.has(field.fieldType);
  const isBool = field.fieldType === 'BOOLEAN' || field.fieldType === 'CHECKBOX';
  const showFile = FILE_TYPES.has(field.fieldType);
  const isCurrency = field.fieldType === 'CURRENCY';
  const isRelationship = field.fieldType === 'RELATIONSHIP';

  return (
    <div className="stack">
      <div className="page-header">
        <div>
          <h2 className="page-title">Inventory Types</h2>
          <p className="muted">Define types and their dynamic field schemas.</p>
        </div>
      </div>

      <div className="grid split">
        <div className="card stack">
          <h3 className="page-title">Types</h3>
          {canWrite ? (
          <form className="stack" onSubmit={onSaveType}>
            <label className="label" htmlFor="type-code">
              Code
              <input
                id="type-code"
                className="input"
                value={newType.code}
                onChange={(e) => setNewType({ ...newType, code: e.target.value })}
                placeholder="raw_material"
                required
                disabled={Boolean(editingTypeId)}
              />
            </label>
            <label className="label" htmlFor="type-name">
              Name
              <input
                id="type-name"
                className="input"
                value={newType.name}
                onChange={(e) => setNewType({ ...newType, name: e.target.value })}
                required
              />
            </label>
            <div className="row actions">
              <button className="btn" type="submit" disabled={saveType.isPending}>
                {editingTypeId ? 'Save type' : 'Add type'}
              </button>
              {editingTypeId ? (
                <button type="button" className="btn secondary" onClick={resetType}>
                  Cancel
                </button>
              ) : null}
            </div>
          </form>
          ) : null}
          <div className="table-wrap">
            <table className="table compact">
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Code</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {(typesQuery.data ?? []).map((t) => (
                  <tr key={t.id} className={selectedId === t.id ? 'row-selected' : undefined}>
                    <td>
                      <button
                        type="button"
                        className="btn secondary"
                        onClick={() => {
                          setSelectedId(t.id);
                          resetField();
                        }}
                      >
                        {t.name}
                        {t.isActive === false ? ' (inactive)' : ''}
                      </button>
                    </td>
                    <td>{t.code}</td>
                    <td>
                      {canWrite ? (
                      <div className="row">
                        <button
                          type="button"
                          className="btn secondary"
                          onClick={() => {
                            setEditingTypeId(t.id);
                            setNewType({
                              code: t.code,
                              name: t.name,
                              description: t.description ?? '',
                            });
                          }}
                        >
                          Edit
                        </button>
                        <button
                          type="button"
                          className="btn secondary"
                          onClick={() => void confirmDeleteType(t)}
                        >
                          Delete
                        </button>
                      </div>
                      ) : null}
                    </td>
                  </tr>
                ))}
                {typesQuery.data && typesQuery.data.length === 0 ? (
                  <tr>
                    <td colSpan={3} className="muted">
                      No types yet — add your first above.
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>
        </div>

        <div className="card stack">
          <h3 className="page-title">Schema builder</h3>
          {!selectedId ? (
            <p className="muted">Select a type to manage fields.</p>
          ) : (
            <>
              {canWrite ? (
              <form className="stack" onSubmit={onSaveField}>
                <div className="grid cols-2">
                  <label className="label" htmlFor="field-key">
                    Key
                    <input
                      id="field-key"
                      className="input"
                      value={field.key}
                      onChange={(e) => setField({ ...field, key: e.target.value })}
                      placeholder="thickness"
                      required
                      disabled={Boolean(editingFieldId)}
                    />
                  </label>
                  <label className="label" htmlFor="field-name">
                    Display name
                    <input
                      id="field-name"
                      className="input"
                      value={field.displayName}
                      onChange={(e) => setField({ ...field, displayName: e.target.value })}
                      required
                    />
                  </label>
                  <label className="label" htmlFor="field-type">
                    Field type
                    <select
                      id="field-type"
                      className="select"
                      value={field.fieldType}
                      disabled={Boolean(editingFieldId)}
                      onChange={(e) =>
                        setField({ ...field, fieldType: e.target.value as FieldType })
                      }
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
                            setField({
                              ...field,
                              options: field.options.filter((_, j) => j !== i),
                            })
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
                        setField({
                          ...field,
                          options: [...field.options, { value: '', label: '' }],
                        })
                      }
                    >
                      + Add value
                    </button>
                  </div>
                ) : null}

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

                <div className="row actions">
                  <button className="btn" type="submit" disabled={saveField.isPending}>
                    {editingFieldId ? 'Save field' : 'Add field'}
                  </button>
                  {editingFieldId ? (
                    <button type="button" className="btn secondary" onClick={resetField}>
                      Cancel
                    </button>
                  ) : null}
                </div>
              </form>
              ) : null}

              <div className="table-wrap">
                <table className="table">
                  <thead>
                    <tr>
                      <th>Order</th>
                      <th>Key</th>
                      <th>Label</th>
                      <th>Type</th>
                      <th>Flags</th>
                      <th />
                    </tr>
                  </thead>
                  <tbody>
                    {(fieldsQuery.data ?? []).map((f, idx) => (
                      <tr key={f.id}>
                        <td className="num">
                          {canWrite ? (
                          <div className="reorder">
                            <button
                              type="button"
                              className="icon-btn-sm"
                              aria-label="Move up"
                              disabled={idx === 0 || reorderFields.isPending}
                              onClick={() => moveField(idx, -1)}
                            >
                              ▲
                            </button>
                            <button
                              type="button"
                              className="icon-btn-sm"
                              aria-label="Move down"
                              disabled={
                                idx === (fieldsQuery.data?.length ?? 0) - 1 ||
                                reorderFields.isPending
                              }
                              onClick={() => moveField(idx, 1)}
                            >
                              ▼
                            </button>
                          </div>
                          ) : (
                            f.sortOrder
                          )}
                        </td>
                        <td>{f.key}</td>
                        <td>{f.displayName}</td>
                        <td>{f.fieldType}</td>
                        <td className="muted">
                          {[
                            f.isRequired && 'required',
                            f.isUnique && 'unique',
                            f.isFilterable && 'filterable',
                            f.options?.length ? `${f.options.length} options` : null,
                          ]
                            .filter(Boolean)
                            .join(', ') || '—'}
                        </td>
                        <td>
                          {canWrite ? (
                          <div className="row">
                            <button
                              type="button"
                              className="btn secondary"
                              onClick={() => loadField(f)}
                            >
                              Edit
                            </button>
                            <button
                              type="button"
                              className="btn secondary"
                              onClick={() => void confirmDeleteField(f)}
                            >
                              Delete
                            </button>
                          </div>
                          ) : null}
                        </td>
                      </tr>
                    ))}
                    {fieldsQuery.data && fieldsQuery.data.length === 0 ? (
                      <tr>
                        <td colSpan={6} className="muted">
                          No fields yet — add one above.
                        </td>
                      </tr>
                    ) : null}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
