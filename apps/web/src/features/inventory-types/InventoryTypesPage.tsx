import { FormEvent, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { FIELD_TYPES, type FieldType } from '@ims/shared';
import { api } from '../../shared/api';
import type { FieldDefinition } from '../inventory-items/DynamicForm';

type InventoryType = {
  id: string;
  code: string;
  name: string;
  description?: string | null;
  isActive: boolean;
};

export function InventoryTypesPage() {
  const qc = useQueryClient();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [newType, setNewType] = useState({ code: '', name: '', description: '' });
  const [newField, setNewField] = useState({
    key: '',
    displayName: '',
    fieldType: 'TEXT' as FieldType,
    isRequired: false,
    isFilterable: false,
  });

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

  const createType = useMutation({
    mutationFn: async () =>
      api('/inventory-types', { method: 'POST', body: JSON.stringify(newType) }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['inventory-types'] });
      setNewType({ code: '', name: '', description: '' });
    },
  });

  const createField = useMutation({
    mutationFn: async () =>
      api(`/inventory-types/${selectedId}/fields`, {
        method: 'POST',
        body: JSON.stringify(newField),
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['fields', selectedId] });
      setNewField({
        key: '',
        displayName: '',
        fieldType: 'TEXT',
        isRequired: false,
        isFilterable: false,
      });
    },
  });

  function onCreateType(e: FormEvent) {
    e.preventDefault();
    createType.mutate();
  }

  function onCreateField(e: FormEvent) {
    e.preventDefault();
    createField.mutate();
  }

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
          <form className="stack" onSubmit={onCreateType}>
            <label className="label">
              Code
              <input
                className="input"
                value={newType.code}
                onChange={(e) => setNewType({ ...newType, code: e.target.value })}
                placeholder="raw_material"
                required
              />
            </label>
            <label className="label">
              Name
              <input
                className="input"
                value={newType.name}
                onChange={(e) => setNewType({ ...newType, name: e.target.value })}
                required
              />
            </label>
            <button className="btn" type="submit">
              Add type
            </button>
          </form>
          <div className="table-wrap">
            <table className="table compact">
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Code</th>
                </tr>
              </thead>
              <tbody>
                {(typesQuery.data ?? []).map((t) => (
                  <tr key={t.id}>
                    <td>
                      <button
                        type="button"
                        className="btn secondary"
                        onClick={() => setSelectedId(t.id)}
                      >
                        {t.name}
                      </button>
                    </td>
                    <td>{t.code}</td>
                  </tr>
                ))}
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
              <form className="stack" onSubmit={onCreateField}>
                <label className="label">
                  Key
                  <input
                    className="input"
                    value={newField.key}
                    onChange={(e) => setNewField({ ...newField, key: e.target.value })}
                    placeholder="thickness"
                    required
                  />
                </label>
                <label className="label">
                  Display name
                  <input
                    className="input"
                    value={newField.displayName}
                    onChange={(e) =>
                      setNewField({ ...newField, displayName: e.target.value })
                    }
                    required
                  />
                </label>
                <label className="label">
                  Field type
                  <select
                    className="select"
                    value={newField.fieldType}
                    onChange={(e) =>
                      setNewField({
                        ...newField,
                        fieldType: e.target.value as FieldType,
                      })
                    }
                  >
                    {FIELD_TYPES.map((t) => (
                      <option key={t} value={t}>
                        {t}
                      </option>
                    ))}
                  </select>
                </label>
                <div className="row">
                  <label className="row">
                    <input
                      type="checkbox"
                      checked={newField.isRequired}
                      onChange={(e) =>
                        setNewField({ ...newField, isRequired: e.target.checked })
                      }
                    />
                    Required
                  </label>
                  <label className="row">
                    <input
                      type="checkbox"
                      checked={newField.isFilterable}
                      onChange={(e) =>
                        setNewField({ ...newField, isFilterable: e.target.checked })
                      }
                    />
                    Filterable
                  </label>
                </div>
                <button className="btn" type="submit">
                  Add field
                </button>
              </form>

              <div className="table-wrap">
                <table className="table">
                  <thead>
                    <tr>
                      <th>Order</th>
                      <th>Key</th>
                      <th>Label</th>
                      <th>Type</th>
                      <th>Flags</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(fieldsQuery.data ?? []).map((f) => (
                      <tr key={f.id}>
                        <td className="num">{f.sortOrder}</td>
                        <td>{f.key}</td>
                        <td>{f.displayName}</td>
                        <td>{f.fieldType}</td>
                        <td className="muted">
                          {[f.isRequired && 'required', f.isFilterable && 'filterable', f.isUnique && 'unique']
                            .filter(Boolean)
                            .join(', ') || '—'}
                        </td>
                      </tr>
                    ))}
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
