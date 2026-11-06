import { FormEvent, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { hasMinRole, type UserRole } from '@ims/shared';
import { api, toErrorMessage } from '../../shared/api';
import { useToast } from '../../shared/toast';
import { useConfirm } from '../../shared/confirm';
import { useAuth } from '../../shared/auth';
import { FormModal } from '../../shared/FormModal';
import { DataView, type Column } from '../../ui/DataView';
import { EmptyState } from '../../ui/EmptyState';

type InventoryType = {
  id: string;
  code: string;
  name: string;
  description?: string | null;
  isActive: boolean;
};

export function InventoryTypesPage() {
  const qc = useQueryClient();
  const toast = useToast();
  const confirm = useConfirm();
  const navigate = useNavigate();
  const { user } = useAuth();
  const canWrite = hasMinRole((user?.role ?? 'VIEWER') as UserRole, 'ADMIN');
  const [newType, setNewType] = useState({ code: '', name: '', description: '' });
  const [editingTypeId, setEditingTypeId] = useState<string | null>(null);
  const [typeDialogOpen, setTypeDialogOpen] = useState(false);
  const [typeDirty, setTypeDirty] = useState(false);
  const [typeErrors, setTypeErrors] = useState<Record<string, string>>({});

  const typesQuery = useQuery({
    queryKey: ['inventory-types'],
    queryFn: async () => (await api<InventoryType[]>('/inventory-types')).data,
  });

  const resetType = () => {
    setNewType({ code: '', name: '', description: '' });
    setEditingTypeId(null);
  };

  function changeType(patch: Partial<typeof newType>) {
    setTypeDirty(true);
    setNewType((t) => ({ ...t, ...patch }));
  }

  function openCreateType() {
    setEditingTypeId(null);
    setNewType({ code: '', name: '', description: '' });
    setTypeErrors({});
    setTypeDirty(false);
    setTypeDialogOpen(true);
  }

  function openEditType(t: InventoryType) {
    setEditingTypeId(t.id);
    setNewType({ code: t.code, name: t.name, description: t.description ?? '' });
    setTypeErrors({});
    setTypeDirty(false);
    setTypeDialogOpen(true);
  }

  function closeTypeDialog() {
    setTypeDialogOpen(false);
    resetType();
    setTypeErrors({});
    setTypeDirty(false);
  }

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
      closeTypeDialog();
    },
    onError: (e) => toast.error(toErrorMessage(e)),
  });

  const deleteType = useMutation({
    mutationFn: async (id: string) => api(`/inventory-types/${id}`, { method: 'DELETE' }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['inventory-types'] });
      toast.success('Inventory type deleted');
      resetType();
    },
    onError: (e) => toast.error(toErrorMessage(e)),
  });

  async function confirmDeleteType(t: InventoryType) {
    let count = 0;
    try {
      const res = await api<unknown[]>(`/inventory-items?inventoryTypeId=${t.id}&pageSize=1`);
      count = res.meta?.total ?? 0;
    } catch {
      /* ignore — show generic message */
    }
    const ok = await confirm({
      title: 'Delete inventory type',
      message:
        count > 0
          ? `"${t.name}" is used by ${count} item${count === 1 ? '' : 's'}. Deleting it will fail until those items are removed.`
          : `Delete type "${t.name}"? This cannot be undone.`,
      confirmLabel: 'Delete',
      danger: true,
    });
    if (ok) deleteType.mutate(t.id);
  }

  function onSaveType(e: FormEvent) {
    e.preventDefault();
    const errs: Record<string, string> = {};
    if (!editingTypeId && !newType.code.trim()) errs.code = 'Code is required.';
    if (!newType.name.trim()) errs.name = 'Name is required.';
    if (Object.keys(errs).length) {
      setTypeErrors(errs);
      return;
    }
    setTypeErrors({});
    saveType.mutate();
  }

  const columns: Column<InventoryType>[] = [
    {
      key: 'name',
      header: 'Name',
      cardLabel: 'Name',
      render: (t) => (
        <button
          type="button"
          className="type-name-btn"
          title={`Manage fields for ${t.name}`}
          onClick={() => navigate(`/inventory-types/${t.id}`)}
        >
          <span>{t.name}</span>
          {t.isActive === false ? <span className="type-inactive">(inactive)</span> : null}
        </button>
      ),
    },
    { key: 'code', header: 'Code', cardLabel: 'Code', render: (t) => <code>{t.code}</code> },
    {
      key: 'fields',
      header: 'Fields',
      cardLabel: 'Fields',
      render: (t) => (
        <button
          type="button"
          className="manage-fields-link"
          onClick={() => navigate(`/inventory-types/${t.id}`)}
        >
          Manage fields
          <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
            <path d="M9 18l6-6-6-6" />
          </svg>
        </button>
      ),
    },
  ];

  return (
    <div className="stack">
      <div className="page-header">
        <div>
          <h2 className="page-title">Inventory Types</h2>
          <p className="muted">Define types and their dynamic field schemas.</p>
        </div>
        {canWrite ? (
          <button className="btn" type="button" onClick={openCreateType}>
            + Add type
          </button>
        ) : null}
      </div>

      <div className="card stack">
        <DataView
          caption="Inventory types"
          columns={columns}
          rows={typesQuery.data ?? []}
          rowKey={(t) => t.id}
          loading={typesQuery.isLoading}
          actions={
            canWrite
              ? (t) => (
                  <>
                    <button type="button" className="btn secondary" onClick={() => openEditType(t)}>
                      Edit
                    </button>
                    <button
                      type="button"
                      className="btn secondary danger"
                      disabled={deleteType.isPending && deleteType.variables === t.id}
                      onClick={() => void confirmDeleteType(t)}
                    >
                      {deleteType.isPending && deleteType.variables === t.id ? 'Deleting…' : 'Delete'}
                    </button>
                  </>
                )
              : undefined
          }
          empty={
            <EmptyState
              title="No inventory types yet"
              message={canWrite ? 'Add your first with “+ Add type”.' : 'No types have been defined yet.'}
            />
          }
        />
      </div>

      <FormModal
        open={typeDialogOpen}
        title="Add type"
        editingLabel={editingTypeId ? newType.name || newType.code || 'type' : null}
        subtitle={
          editingTypeId
            ? 'Updating an existing inventory type — its code is fixed.'
            : 'Create a new inventory type, then add its fields.'
        }
        submitLabel={editingTypeId ? 'Save changes' : 'Add type'}
        submitting={saveType.isPending}
        dirty={typeDirty}
        onSubmit={onSaveType}
        onClose={closeTypeDialog}
      >
        <label className="label" htmlFor="type-code">
          <span>Code{!editingTypeId ? <span className="req-star" aria-hidden>*</span> : null}</span>
          <input
            id="type-code"
            className="input"
            value={newType.code}
            onChange={(e) => {
              changeType({ code: e.target.value });
              if (typeErrors.code) setTypeErrors((p) => ({ ...p, code: '' }));
            }}
            placeholder="raw_material"
            aria-invalid={Boolean(typeErrors.code)}
            disabled={Boolean(editingTypeId)}
          />
          {typeErrors.code ? <small className="field-error">{typeErrors.code}</small> : null}
        </label>
        <label className="label" htmlFor="type-name">
          <span>Name<span className="req-star" aria-hidden>*</span></span>
          <input
            id="type-name"
            className="input"
            value={newType.name}
            onChange={(e) => {
              changeType({ name: e.target.value });
              if (typeErrors.name) setTypeErrors((p) => ({ ...p, name: '' }));
            }}
            aria-invalid={Boolean(typeErrors.name)}
          />
          {typeErrors.name ? <small className="field-error">{typeErrors.name}</small> : null}
        </label>
      </FormModal>
    </div>
  );
}
