import { useEffect, useState } from 'react';
import { DashboardSummary, formatRinggit } from '@mr/shared';
import { Link } from 'react-router-dom';
import { ApiError, api } from '../lib/api';

const SEVERITY_CLASS: Record<string, string> = {
  CRITICAL: 'bg-accent-soft text-accent-strong',
  WARNING: 'bg-warning-soft text-warning',
  INFO: 'bg-canvas text-ink-muted',
};

function Figure({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="rounded-panel border border-border bg-surface p-4">
      <p className="text-xs font-semibold uppercase tracking-wide text-ink-muted">{label}</p>
      <p className="tabular mt-1 text-2xl font-bold">{value}</p>
      {hint ? <p className="mt-1 text-xs text-ink-muted">{hint}</p> : null}
    </div>
  );
}

export function DashboardPage() {
  const [data, setData] = useState<DashboardSummary | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    api('/analytics/dashboard', DashboardSummary)
      .then((next) => {
        if (active) setData(next);
      })
      .catch((caught: unknown) => {
        if (active) {
          setError(caught instanceof ApiError ? caught.message : 'Data tidak dapat dimuatkan.');
        }
      });
    return () => {
      active = false;
    };
  }, []);

  if (error) {
    return (
      <p
        role="alert"
        className="rounded-panel border border-border bg-surface p-4 text-sm text-accent"
      >
        {error}
      </p>
    );
  }

  if (!data) {
    return (
      <p role="status" className="text-sm text-ink-muted">
        Memuatkan…
      </p>
    );
  }

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-bold">Executive Dashboard</h1>
        <p className="mt-1 text-sm text-ink-muted">
          Ringkasan prestasi hari ini ·{' '}
          <span className="tabular">
            {new Date(data.asOf).toLocaleDateString('ms-MY', {
              day: '2-digit',
              month: 'short',
              year: 'numeric',
            })}
          </span>
        </p>
      </header>

      <section aria-label="Petunjuk utama" className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Figure
          label="Hasil hari ini"
          value={formatRinggit(data.revenueTodaySen)}
          hint={`Bulan ini ${formatRinggit(data.monthRevenueSen)}`}
        />
        <Figure
          label="Kehadiran"
          value={`${data.attendance.present} / ${data.attendance.headcount}`}
          hint={`${data.attendance.presentPct}% hadir · ${data.attendance.onMc} MC`}
        />
        <Figure
          label="Kerja aktif"
          value={String(data.activeJobs)}
          hint={`${data.workshopLoad.inProgress} sedang dibuat · ${data.workshopLoad.waiting} menunggu`}
        />
        <Figure
          label="Menunggu kelulusan"
          value={String(data.pendingApprovals)}
          hint={`${data.workshopLoad.completedToday} siap hari ini`}
        />
      </section>

      <section aria-labelledby="alerts-heading">
        <h2 id="alerts-heading" className="text-lg font-bold">
          Amaran &amp; notifikasi
        </h2>
        {data.alerts.length === 0 ? (
          <p className="mt-2 rounded-panel border border-border bg-surface p-4 text-sm text-ink-muted">
            Tiada amaran. Semua indikator dalam julat biasa.
          </p>
        ) : (
          <ul className="mt-3 space-y-2">
            {data.alerts.map((alert) => (
              <li
                key={alert.kind + alert.title}
                className="rounded-panel border border-border bg-surface p-4"
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="font-semibold">{alert.title}</p>
                  <span
                    className={`rounded-full px-2 py-0.5 text-xs font-semibold ${SEVERITY_CLASS[alert.severity] ?? ''}`}
                  >
                    {alert.severity}
                  </span>
                </div>
                <p className="mt-1 text-sm text-ink-muted">{alert.detail}</p>
                <Link to={alert.href} className="mt-2 inline-block text-sm font-medium underline">
                  Buka
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section aria-labelledby="branches-heading">
        <h2 id="branches-heading" className="text-lg font-bold">
          Prestasi cawangan
        </h2>
        <div className="mt-3 overflow-x-auto rounded-panel border border-border bg-surface">
          <table className="w-full text-left text-sm">
            <thead className="border-b border-border text-xs uppercase tracking-wide text-ink-muted">
              <tr>
                <th scope="col" className="px-4 py-3">
                  Cawangan
                </th>
                <th scope="col" className="px-4 py-3 text-right">
                  Hadir
                </th>
                <th scope="col" className="px-4 py-3 text-right">
                  Lewat
                </th>
                <th scope="col" className="px-4 py-3 text-right">
                  Hasil hari ini
                </th>
              </tr>
            </thead>
            <tbody>
              {data.branches.map((branch) => (
                <tr key={branch.branchCode} className="border-b border-border last:border-0">
                  <td className="px-4 py-3 font-medium">{branch.branchName}</td>
                  <td className="tabular px-4 py-3 text-right">
                    {branch.present} / {branch.headcount}
                  </td>
                  <td className="tabular px-4 py-3 text-right">{branch.late}</td>
                  <td className="tabular px-4 py-3 text-right">
                    {formatRinggit(branch.revenueTodaySen)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
