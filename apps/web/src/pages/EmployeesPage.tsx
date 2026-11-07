import { useCallback, useEffect, useState } from 'react';
import type { z } from 'zod';
import { EmployeeSummary, pageOf } from '@mr/shared';
import { Link } from 'react-router-dom';
import { ApiError, api } from '../lib/api';

const DirectorySchema = pageOf(EmployeeSummary);

const ROLE_LABEL: Record<string, string> = {
  STAFF: 'Mekanik',
  FOREMAN: 'Foreman',
  ADMIN_HR: 'Admin / HR',
  OWNER: 'Pemilik',
};

const STATUS_LABEL: Record<string, string> = {
  ACTIVE: 'Aktif',
  SUSPENDED: 'Digantung',
  TERMINATED: 'Berhenti',
};

export function EmployeesPage() {
  const [items, setItems] = useState<z.infer<typeof DirectorySchema>['items']>([]);
  const [total, setTotal] = useState(0);
  const [search, setSearch] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);

  const load = useCallback(async () => {
    setLoaded(false);
    const query = new URLSearchParams({ pageSize: '50' });
    if (search.trim()) query.set('search', search.trim());
    const data = await api(`/employees?${query.toString()}`, DirectorySchema);
    setItems(data.items);
    setTotal(data.total);
    setLoaded(true);
  }, [search]);

  useEffect(() => {
    void load().catch((caught: unknown) => {
      setError(caught instanceof ApiError ? caught.message : 'Direktori tidak dapat dimuatkan.');
      setLoaded(true);
    });
  }, [load]);

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">Pekerja</h1>
          <p className="mt-1 text-sm text-ink-muted">
            {loaded ? `${total} pekerja berdaftar` : 'Memuatkan…'}
          </p>
        </div>
        <div>
          <label htmlFor="employee-search" className="sr-only">
            Cari pekerja
          </label>
          <input
            id="employee-search"
            type="search"
            placeholder="Cari nama…"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            className="w-56 rounded-control border border-border-strong bg-surface px-3 py-2 text-sm"
          />
        </div>
      </header>

      <p role="alert" aria-live="polite" className="min-h-5 text-sm text-accent">
        {error}
      </p>

      {!loaded ? (
        <p className="rounded-panel border border-border bg-surface p-4 text-sm text-ink-muted">
          Memuatkan…
        </p>
      ) : items.length === 0 ? (
        <p className="rounded-panel border border-border bg-surface p-4 text-sm text-ink-muted">
          Tiada pekerja sepadan dengan carian itu.
        </p>
      ) : (
        <ul className="space-y-2">
          {items.map((person) => (
            <li key={person.id}>
              <Link
                to={`/employees/${person.id}`}
                className="flex flex-wrap items-center justify-between gap-3 rounded-panel border border-border bg-surface p-4 hover:bg-canvas"
              >
                <span>
                  <span className="block font-semibold">{person.fullName}</span>
                  <span className="block text-xs text-ink-muted">
                    {ROLE_LABEL[person.role] ?? person.role} · {person.branchCode.replace('_', ' ')}
                  </span>
                </span>
                <span className="rounded-full bg-accent-soft px-2 py-0.5 text-xs font-semibold text-accent-strong">
                  {STATUS_LABEL[person.status] ?? person.status}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
