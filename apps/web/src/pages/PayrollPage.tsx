import { useCallback, useEffect, useState } from 'react';
import type { z } from 'zod';
import { PayrollPreview, PayrollRunDetail, formatRinggit } from '@mr/shared';
import { ApiError, api } from '../lib/api';
import { useSession } from '../lib/session';

const MONTHS = [
  'Januari',
  'Februari',
  'Mac',
  'April',
  'Mei',
  'Jun',
  'Julai',
  'Ogos',
  'September',
  'Oktober',
  'November',
  'Disember',
];

const STATUS_LABEL: Record<string, string> = {
  DRAFT: 'Draf',
  PENDING_APPROVAL: 'Menunggu kelulusan',
  APPROVED: 'Diluluskan',
  PAID: 'Dibayar',
};

export function PayrollPage() {
  const { user } = useSession();
  const now = new Date();
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth() + 1);
  const [preview, setPreview] = useState<z.infer<typeof PayrollPreview> | null>(null);
  const [run, setRun] = useState<z.infer<typeof PayrollRunDetail> | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [loaded, setLoaded] = useState(false);

  const load = useCallback(async () => {
    setLoaded(false);
    const data = await api(`/payroll/preview?year=${year}&month=${month}`, PayrollPreview);
    setPreview(data);
    setRun(null);
    setError(null);
    setLoaded(true);
  }, [year, month]);

  useEffect(() => {
    void load().catch((caught: unknown) => {
      setError(caught instanceof ApiError ? caught.message : 'Data tidak dapat dimuatkan.');
      setLoaded(true);
    });
  }, [load]);

  async function submitForApproval() {
    setError(null);
    setNotice(null);
    setBusy(true);
    try {
      const created = await api('/payroll/runs', PayrollRunDetail, {
        method: 'POST',
        body: JSON.stringify({ year, month }),
      });
      const submitted = await api(`/payroll/runs/${created.id}/submit`, PayrollRunDetail, {
        method: 'POST',
      });
      setRun(submitted);
      setNotice(`Payroll ${MONTHS[month - 1]} ${year} dihantar untuk kelulusan.`);
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : 'Gagal menghantar payroll.');
    } finally {
      setBusy(false);
    }
  }

  async function approve() {
    if (!run) return;
    setError(null);
    setBusy(true);
    try {
      setRun(await api(`/payroll/runs/${run.id}/approve`, PayrollRunDetail, { method: 'POST' }));
      setNotice('Payroll diluluskan.');
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : 'Gagal meluluskan payroll.');
    } finally {
      setBusy(false);
    }
  }

  const active = run ?? preview;
  const status = run?.status ?? 'DRAFT';

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">Payroll</h1>
          <p className="mt-1 text-sm text-ink-muted">
            {MONTHS[month - 1]} {year} · {STATUS_LABEL[status] ?? status}
          </p>
        </div>
        <div className="flex gap-2">
          <label className="sr-only" htmlFor="payroll-month">
            Bulan
          </label>
          <select
            id="payroll-month"
            value={month}
            onChange={(event) => setMonth(Number(event.target.value))}
            className="rounded-control border border-border-strong bg-surface px-3 py-2 text-sm"
          >
            {MONTHS.map((label, index) => (
              <option key={label} value={index + 1}>
                {label}
              </option>
            ))}
          </select>
          <label className="sr-only" htmlFor="payroll-year">
            Tahun
          </label>
          <input
            id="payroll-year"
            type="number"
            value={year}
            min={2000}
            max={2100}
            onChange={(event) => setYear(Number(event.target.value))}
            className="tabular w-24 rounded-control border border-border-strong bg-surface px-3 py-2 text-sm"
          />
        </div>
      </header>

      {notice ? (
        <p role="status" className="text-sm font-medium text-success">
          {notice}
        </p>
      ) : null}
      <p role="alert" aria-live="polite" className="min-h-5 text-sm text-accent">
        {error}
      </p>

      {active ? (
        <section
          aria-label="Ringkasan payroll"
          className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4"
        >
          <div className="rounded-panel border border-border bg-surface p-4">
            <p className="text-xs font-semibold uppercase tracking-wide text-ink-muted">
              Jumlah bersih
            </p>
            <p className="tabular mt-1 text-2xl font-bold">
              {formatRinggit(active.totalNetPaySen)}
            </p>
          </div>
          <div className="rounded-panel border border-border bg-surface p-4">
            <p className="text-xs font-semibold uppercase tracking-wide text-ink-muted">Pekerja</p>
            <p className="tabular mt-1 text-2xl font-bold">{active.employeeCount}</p>
          </div>
          <div className="rounded-panel border border-border bg-surface p-4">
            <p className="text-xs font-semibold uppercase tracking-wide text-ink-muted">Komisen</p>
            <p className="tabular mt-1 text-2xl font-bold text-success">
              {formatRinggit(active.totalCommissionSen)}
            </p>
          </div>
          <div className="rounded-panel border border-border bg-surface p-4">
            <p className="text-xs font-semibold uppercase tracking-wide text-ink-muted">Anomali</p>
            <p className="tabular mt-1 text-2xl font-bold">{active.anomalyCount}</p>
          </div>
        </section>
      ) : null}

      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => {
            void submitForApproval();
          }}
          disabled={busy || !loaded || run !== null}
          className="rounded-control bg-accent px-4 py-2.5 text-sm font-bold text-accent-ink disabled:opacity-50"
        >
          Hantar untuk kelulusan
        </button>
        {run && run.status === 'PENDING_APPROVAL' && user?.role === 'OWNER' ? (
          <button
            type="button"
            onClick={() => {
              void approve();
            }}
            disabled={busy}
            className="rounded-control border border-border-strong px-4 py-2.5 text-sm font-semibold disabled:opacity-50"
          >
            Luluskan payroll
          </button>
        ) : null}
      </div>

      <section aria-labelledby="payroll-table-heading">
        <h2 id="payroll-table-heading" className="text-lg font-bold">
          Butiran payroll
        </h2>
        {!loaded ? (
          <p className="mt-2 rounded-panel border border-border bg-surface p-4 text-sm text-ink-muted">
            Mengira…
          </p>
        ) : (
          <div className="mt-3 overflow-x-auto rounded-panel border border-border bg-surface">
            <table className="w-full text-left text-sm">
              <thead className="border-b border-border text-xs uppercase tracking-wide text-ink-muted">
                <tr>
                  <th scope="col" className="px-4 py-3">
                    Pekerja
                  </th>
                  <th scope="col" className="px-4 py-3 text-right">
                    Gaji asas
                  </th>
                  <th scope="col" className="px-4 py-3 text-right">
                    OT
                  </th>
                  <th scope="col" className="px-4 py-3 text-right">
                    Komisen
                  </th>
                  <th scope="col" className="px-4 py-3 text-right">
                    Potongan
                  </th>
                  <th scope="col" className="px-4 py-3 text-right">
                    Bersih
                  </th>
                </tr>
              </thead>
              <tbody>
                {(active?.lines ?? []).map((line) => (
                  <tr key={line.employeeId} className="border-b border-border last:border-0">
                    <td className="px-4 py-3">
                      <span className="font-medium">{line.fullName}</span>
                      <span className="block text-xs text-ink-muted">{line.roleLabel}</span>
                    </td>
                    <td className="tabular px-4 py-3 text-right">
                      {formatRinggit(line.baseSalarySen)}
                    </td>
                    <td className="tabular px-4 py-3 text-right">{line.overtimeHours}j</td>
                    <td className="tabular px-4 py-3 text-right text-success">
                      {formatRinggit(line.commissionSen)}
                    </td>
                    <td className="tabular px-4 py-3 text-right">
                      {line.deductionsSen === 0 ? '—' : `-${formatRinggit(line.deductionsSen)}`}
                    </td>
                    <td className="tabular px-4 py-3 text-right font-semibold">
                      {formatRinggit(line.netPaySen)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
