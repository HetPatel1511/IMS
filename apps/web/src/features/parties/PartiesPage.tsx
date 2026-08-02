import { FormEvent, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../../shared/api';

type Party = {
  id: string;
  code: string;
  name: string;
  email?: string | null;
  phone?: string | null;
  isActive: boolean;
};

function PartyPage({
  title,
  resource,
}: {
  title: string;
  resource: 'suppliers' | 'buyers';
}) {
  const qc = useQueryClient();
  const [form, setForm] = useState({ code: '', name: '', email: '', phone: '' });

  const list = useQuery({
    queryKey: [resource],
    queryFn: async () => (await api<Party[]>(`/${resource}?pageSize=100`)).data,
  });

  const create = useMutation({
    mutationFn: async () =>
      api(`/${resource}`, { method: 'POST', body: JSON.stringify(form) }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: [resource] });
      setForm({ code: '', name: '', email: '', phone: '' });
    },
  });

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    create.mutate();
  }

  return (
    <div className="stack">
      <div className="page-header">
        <div>
          <h2 className="page-title">{title}</h2>
          <p className="muted">Master data for catalog relationships.</p>
        </div>
      </div>
      <div className="card stack">
        <form className="grid cols-2" onSubmit={onSubmit}>
          <label className="label">
            Code
            <input
              className="input"
              value={form.code}
              onChange={(e) => setForm({ ...form, code: e.target.value })}
              required
            />
          </label>
          <label className="label">
            Name
            <input
              className="input"
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              required
            />
          </label>
          <label className="label">
            Email
            <input
              className="input"
              value={form.email}
              onChange={(e) => setForm({ ...form, email: e.target.value })}
            />
          </label>
          <label className="label">
            Phone
            <input
              className="input"
              value={form.phone}
              onChange={(e) => setForm({ ...form, phone: e.target.value })}
            />
          </label>
          <div className="row actions">
            <button className="btn" type="submit">
              Add
            </button>
          </div>
        </form>
      </div>
      <div className="card">
        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr>
                <th>Code</th>
                <th>Name</th>
                <th>Email</th>
                <th>Phone</th>
              </tr>
            </thead>
            <tbody>
              {(list.data ?? []).map((row) => (
                <tr key={row.id}>
                  <td>{row.code}</td>
                  <td>{row.name}</td>
                  <td>{row.email ?? '—'}</td>
                  <td>{row.phone ?? '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

export function SuppliersPage() {
  return <PartyPage title="Suppliers" resource="suppliers" />;
}

export function BuyersPage() {
  return <PartyPage title="Buyers" resource="buyers" />;
}
