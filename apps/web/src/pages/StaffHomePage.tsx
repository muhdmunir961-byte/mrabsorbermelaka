import { useCallback, useEffect, useState } from 'react';
import { z } from 'zod';
import { AttendanceSummary, JobBoard, formatRinggit } from '@mr/shared';
import type { JobCard } from '@mr/shared';
import { ApiError, api } from '../lib/api';
import { useSession } from '../lib/session';

const MyRecordSchema = z
  .object({
    id: z.uuid(),
    state: z.enum(['PRESENT', 'LATE', 'ON_MC', 'ABSENT', 'LEAVE']),
    method: z.enum(['FACE', 'PIN', 'MANUAL']),
    clockInAt: z.string().nullable(),
    clockOutAt: z.string().nullable(),
    lateMinutes: z.int(),
  })
  .nullable();

const CommissionSchema = z.object({ commissionSen: z.int() });

function position(): Promise<GeolocationPosition> {
  return new Promise((resolve, reject) => {
    if (!('geolocation' in navigator)) {
      reject(new Error('Peranti ini tiada akses lokasi.'));
      return;
    }
    navigator.geolocation.getCurrentPosition(resolve, () =>
      reject(new Error('Kebenaran lokasi ditolak. Benarkan akses lokasi untuk daftar masuk.')),
    );
  });
}

/** `nonce` exists so the caller can force a re-render every second. */
function elapsed(from: string, _nonce: number): string {
  const total = Math.max(Math.floor((Date.now() - new Date(from).getTime()) / 1000), 0);
  const h = String(Math.floor(total / 3600)).padStart(2, '0');
  const m = String(Math.floor((total % 3600) / 60)).padStart(2, '0');
  const s = String(total % 60).padStart(2, '0');
  return `${h}:${m}:${s}`;
}

export function StaffHomePage() {
  const { user } = useSession();
  const [record, setRecord] = useState<z.infer<typeof MyRecordSchema>>(null);
  const [commissionSen, setCommissionSen] = useState(0);
  const [board, setBoard] = useState<z.infer<typeof JobBoard> | null>(null);
  const [summary, setSummary] = useState<z.infer<typeof AttendanceSummary> | null>(null);
  const [pin, setPin] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [tick, setTick] = useState(0);

  const load = useCallback(async () => {
    const [mine, pay, jobs, today] = await Promise.all([
      api('/attendance/me', MyRecordSchema),
      api('/jobs/commission/today', CommissionSchema),
      api('/jobs/board', JobBoard),
      api('/attendance/today', AttendanceSummary),
    ]);
    setRecord(mine);
    setCommissionSen(pay.commissionSen);
    setBoard(jobs);
    setSummary(today);
  }, []);

  useEffect(() => {
    void load().catch((caught: unknown) =>
      setError(caught instanceof ApiError ? caught.message : 'Data tidak dapat dimuatkan.'),
    );
  }, [load]);

  useEffect(() => {
    if (!record?.clockInAt || record.clockOutAt) return;
    const timer = window.setInterval(() => setTick((value) => value + 1), 1000);
    return () => window.clearInterval(timer);
  }, [record?.clockInAt, record?.clockOutAt]);

  async function clockIn() {
    setError(null);
    setBusy(true);
    try {
      const pos = await position();
      await api('/attendance/clock-in', z.unknown(), {
        method: 'POST',
        body: JSON.stringify({
          method: 'PIN',
          pin,
          latitude: pos.coords.latitude,
          longitude: pos.coords.longitude,
        }),
      });
      await load();
    } catch (caught) {
      setError(
        caught instanceof ApiError
          ? (caught.details[0]?.message ?? caught.message)
          : caught instanceof Error
            ? caught.message
            : 'Daftar masuk gagal.',
      );
    } finally {
      setBusy(false);
    }
  }

  async function clockOut() {
    setError(null);
    setBusy(true);
    try {
      await api('/attendance/clock-out', z.unknown(), { method: 'POST' });
      await load();
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : 'Daftar keluar gagal.');
    } finally {
      setBusy(false);
    }
  }

  const mine: JobCard[] = board
    ? [...board.assigned, ...board.inProgress].filter((job) => job.assigneeId === user?.employeeId)
    : [];

  return (
    <div className="space-y-6">
      <section className="rounded-panel border border-border bg-surface p-5">
        <p className="text-xs font-semibold uppercase tracking-wide text-ink-muted">
          Selamat bertugas
        </p>
        <h1 className="mt-1 text-2xl font-bold">{user?.fullName}</h1>
      </section>

      <section
        aria-labelledby="attendance-heading"
        className="rounded-panel border border-border bg-surface p-5"
      >
        <h2
          id="attendance-heading"
          className="text-sm font-semibold uppercase tracking-wide text-ink-muted"
        >
          Kehadiran hari ini
        </h2>

        {record?.clockInAt && !record.clockOutAt ? (
          <div className="mt-3 flex flex-wrap items-center gap-4">
            <p className="tabular text-3xl font-bold">{elapsed(record.clockInAt, tick)}</p>
            <span className="rounded-full bg-accent-soft px-3 py-1 text-xs font-semibold text-accent-strong">
              {record.state === 'LATE' ? `Lewat ${record.lateMinutes} minit` : 'Tepat masa'}
            </span>
            <button
              type="button"
              onClick={() => void clockOut()}
              disabled={busy}
              className="ml-auto rounded-control bg-accent px-4 py-2.5 text-sm font-bold text-accent-ink disabled:opacity-60"
            >
              Daftar keluar
            </button>
          </div>
        ) : record?.clockOutAt ? (
          <p className="mt-3 text-sm text-ink-muted">Anda telah mendaftar keluar hari ini.</p>
        ) : (
          <form
            className="mt-3 flex flex-wrap items-end gap-3"
            onSubmit={(event) => {
              event.preventDefault();
              void clockIn();
            }}
          >
            <div>
              <label htmlFor="pin" className="block text-sm font-medium">
                Kod PIN (6 digit)
              </label>
              <input
                id="pin"
                name="pin"
                inputMode="numeric"
                autoComplete="off"
                pattern="[0-9]{6}"
                maxLength={6}
                required
                value={pin}
                onChange={(event) => setPin(event.target.value)}
                className="tabular mt-1 w-40 rounded-control border border-border-strong px-3 py-2.5 text-center text-lg tracking-[0.3em]"
              />
            </div>
            <button
              type="submit"
              disabled={busy}
              className="rounded-control bg-accent px-4 py-2.5 text-sm font-bold text-accent-ink disabled:opacity-60"
            >
              {busy ? 'Merekod…' : 'Daftar masuk'}
            </button>
            <p className="w-full text-xs text-ink-muted">
              Lokasi anda disemak terhadap kawasan bengkel. PIN demo: 123456.
            </p>
          </form>
        )}

        <p role="alert" aria-live="polite" className="mt-3 min-h-5 text-sm text-accent">
          {error}
        </p>
      </section>

      <div className="grid gap-4 sm:grid-cols-2">
        <section className="rounded-panel border border-border bg-surface p-5">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-ink-muted">
            Komisen hari ini
          </h2>
          <p className="tabular mt-2 text-2xl font-bold text-success">
            {formatRinggit(commissionSen)}
          </p>
        </section>

        <section className="rounded-panel border border-border bg-surface p-5">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-ink-muted">
            Kehadiran cawangan
          </h2>
          <p className="tabular mt-2 text-2xl font-bold">
            {summary ? `${summary.present} / ${summary.headcount}` : '—'}
            <span className="ml-2 text-sm font-medium text-ink-muted">hadir</span>
          </p>
          {summary ? (
            <p className="mt-1 text-xs text-ink-muted">
              {summary.late} lewat · {summary.onMc} MC · {summary.absent} tidak hadir
            </p>
          ) : null}
        </section>
      </div>

      <section aria-labelledby="tasks-heading">
        <h2 id="tasks-heading" className="text-lg font-bold">
          Tugasan saya{mine.length ? ` (${mine.length})` : ''}
        </h2>
        {mine.length === 0 ? (
          <p className="mt-2 rounded-panel border border-border bg-surface p-4 text-sm text-ink-muted">
            Tiada tugasan aktif untuk anda sekarang.
          </p>
        ) : (
          <ul className="mt-3 space-y-3">
            {mine.map((job) => (
              <li key={job.id} className="rounded-panel border border-border bg-surface p-4">
                <p className="text-xs font-medium uppercase tracking-wide text-ink-muted">
                  {job.plateNumber} · {job.vehicleModel}
                </p>
                <p className="mt-1 font-semibold">{job.serviceName}</p>
                <p className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-ink-muted">
                  <span>{job.estimatedMinutes} minit</span>
                  <span className="tabular">{formatRinggit(job.commissionSen)}</span>
                  <span className="rounded-full bg-accent-soft px-2 py-0.5 font-semibold text-accent-strong">
                    {job.status === 'IN_PROGRESS' ? 'Sedang dibuat' : 'Belum bermula'}
                  </span>
                </p>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
