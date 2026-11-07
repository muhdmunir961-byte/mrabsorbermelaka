import { useEffect, useState } from 'react';
import type { z } from 'zod';
import { AttendanceSummary, JobBoard, formatRinggit } from '@mr/shared';
import type { JobCard } from '@mr/shared';
import { ApiError, api } from '../lib/api';

type Board = z.infer<typeof JobBoard>;
type Summary = z.infer<typeof AttendanceSummary>;

function Kpi({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="rounded-panel border border-border bg-surface p-4">
      <p className="text-xs font-semibold uppercase tracking-wide text-ink-muted">{label}</p>
      <p className="tabular mt-1 text-2xl font-bold">{value}</p>
      {hint ? <p className="mt-1 text-xs text-ink-muted">{hint}</p> : null}
    </div>
  );
}

function JobRow({ job }: { job: JobCard }) {
  return (
    <li className="rounded-panel border border-border bg-surface p-3">
      <p className="text-xs font-medium uppercase tracking-wide text-ink-muted">
        {job.plateNumber} · {job.vehicleModel}
      </p>
      <p className="mt-1 text-sm font-semibold">{job.serviceName}</p>
      <p className="mt-1 flex items-center justify-between text-xs text-ink-muted">
        <span className="tabular">{formatRinggit(job.commissionSen)}</span>
        <span>{job.progressPct}%</span>
      </p>
      <div
        className="mt-2 h-1.5 overflow-hidden rounded-full bg-border"
        role="progressbar"
        aria-valuenow={job.progressPct}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label={`Kemajuan ${job.serviceName}`}
      >
        <div className="h-full rounded-full bg-accent" style={{ width: `${job.progressPct}%` }} />
      </div>
    </li>
  );
}

export function OperationsPage() {
  const [summary, setSummary] = useState<Summary | null>(null);
  const [board, setBoard] = useState<Board | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    Promise.all([api('/attendance/today', AttendanceSummary), api('/jobs/board', JobBoard)])
      .then(([today, jobs]) => {
        if (!active) return;
        setSummary(today);
        setBoard(jobs);
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

  const presentRatio =
    summary && summary.headcount > 0 ? Math.round((summary.present / summary.headcount) * 100) : 0;

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-bold">Operasi Cawangan</h1>
        <p className="mt-1 text-sm text-ink-muted">
          Ringkasan kehadiran dan papan kerja untuk Melaka Utama.
        </p>
      </header>

      {error ? (
        <p
          role="alert"
          className="rounded-panel border border-border bg-surface p-4 text-sm text-accent"
        >
          {error}
        </p>
      ) : null}

      <section aria-label="Petunjuk kehadiran" className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Kpi
          label="Kehadiran"
          value={summary ? `${summary.present} / ${summary.headcount}` : '—'}
          hint={summary ? `${presentRatio}% hadir` : undefined}
        />
        <Kpi label="Lewat" value={summary ? String(summary.late) : '—'} hint="Selepas 09:00" />
        <Kpi label="Cuti sakit" value={summary ? String(summary.onMc) : '—'} hint="MC hari ini" />
        <Kpi label="Tidak hadir" value={summary ? String(summary.absent) : '—'} />
      </section>

      <div className="grid gap-4 lg:grid-cols-2">
        <section aria-labelledby="assigned-heading">
          <h2 id="assigned-heading" className="text-sm font-bold uppercase tracking-wide">
            Belum bermula {board ? `(${board.assigned.length})` : ''}
          </h2>
          <ul className="mt-2 space-y-2">
            {board?.assigned.map((job) => (
              <JobRow key={job.id} job={job} />
            ))}
            {board && board.assigned.length === 0 ? (
              <li className="rounded-panel border border-border bg-surface p-3 text-sm text-ink-muted">
                Tiada tugasan menunggu.
              </li>
            ) : null}
          </ul>
        </section>

        <section aria-labelledby="progress-heading">
          <h2 id="progress-heading" className="text-sm font-bold uppercase tracking-wide">
            Sedang dibuat {board ? `(${board.inProgress.length})` : ''}
          </h2>
          <ul className="mt-2 space-y-2">
            {board?.inProgress.map((job) => (
              <JobRow key={job.id} job={job} />
            ))}
            {board && board.inProgress.length === 0 ? (
              <li className="rounded-panel border border-border bg-surface p-3 text-sm text-ink-muted">
                Tiada kerja sedang berjalan.
              </li>
            ) : null}
          </ul>
        </section>
      </div>

      <p className="text-sm text-ink-muted">
        Siap hari ini: <strong className="tabular">{board ? board.completed.length : '—'}</strong>{' '}
        pekerjaan.
      </p>
    </div>
  );
}
