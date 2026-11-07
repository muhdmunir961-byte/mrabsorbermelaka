import { useCallback, useEffect, useState } from 'react';
import { z } from 'zod';
import { EmployeeProfileView, formatRinggit } from '@mr/shared';
import { Link, useParams } from 'react-router-dom';
import { ApiError, api } from '../lib/api';
import { useSession } from '../lib/session';

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

const LEAVE_LABEL: Record<string, string> = {
  ANNUAL: 'Cuti tahunan',
  MEDICAL: 'Cuti sakit (MC)',
  EMERGENCY: 'Kecemasan',
  UNPAID: 'Tanpa gaji',
  MATERNITY: 'Bersalin',
};

const DECISION_LABEL: Record<string, string> = {
  PENDING: 'Menunggu',
  APPROVED: 'Diluluskan',
  REJECTED: 'Ditolak',
  CANCELLED: 'Dibatalkan',
};

const StatusResult = z.object({ id: z.uuid(), status: z.string() });

export function EmployeeProfilePage() {
  const { employeeId } = useParams<{ employeeId: string }>();
  const { user } = useSession();
  const [profile, setProfile] = useState<z.infer<typeof EmployeeProfileView> | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [confirming, setConfirming] = useState<'SUSPENDED' | 'TERMINATED' | null>(null);
  const [reason, setReason] = useState('');

  const load = useCallback(async () => {
    if (!employeeId) return;
    setProfile(await api(`/employees/${employeeId}`, EmployeeProfileView));
  }, [employeeId]);

  useEffect(() => {
    void load().catch((caught: unknown) =>
      setError(caught instanceof ApiError ? caught.message : 'Profil tidak dapat dimuatkan.'),
    );
  }, [load]);

  async function changeStatus(next: 'SUSPENDED' | 'TERMINATED') {
    if (!employeeId) return;
    setError(null);
    setNotice(null);
    setBusy(true);
    try {
      await api(`/employees/${employeeId}/status`, StatusResult, {
        method: 'PATCH',
        body: JSON.stringify({ status: next, reason }),
      });
      setConfirming(null);
      setReason('');
      setNotice(next === 'SUSPENDED' ? 'Pekerja digantung.' : 'Pekerja ditamatkan.');
      await load();
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : 'Tindakan gagal.');
    } finally {
      setBusy(false);
    }
  }

  if (!profile) {
    return error ? (
      <div className="space-y-4">
        <p
          role="alert"
          className="rounded-panel border border-border bg-surface p-4 text-sm text-accent"
        >
          {error}
        </p>
        <Link to="/home" className="text-sm font-medium underline">
          Kembali
        </Link>
      </div>
    ) : (
      <p role="status" className="text-sm text-ink-muted">
        Memuatkan profil…
      </p>
    );
  }

  const isAdmin = user?.role === 'ADMIN_HR' || user?.role === 'OWNER';
  const isSelf = user?.employeeId === profile.id;

  return (
    <div className="space-y-6">
      <header className="rounded-panel border border-border bg-surface p-5">
        <p className="text-xs font-semibold uppercase tracking-wide text-ink-muted">
          Profil master pekerja
        </p>
        <h1 className="mt-1 text-2xl font-bold">{profile.fullName}</h1>
        <p className="mt-1 text-sm text-ink-muted">
          {ROLE_LABEL[profile.role] ?? profile.role} · {profile.branchCode.replace('_', ' ')} ·
          Sertai {profile.joinedOn}
        </p>
        <span className="mt-3 inline-block rounded-full bg-accent-soft px-3 py-1 text-xs font-semibold text-accent-strong">
          {STATUS_LABEL[profile.status] ?? profile.status}
        </span>
      </header>

      {notice ? (
        <p role="status" className="text-sm font-medium text-success">
          {notice}
        </p>
      ) : null}

      <section aria-label="Statistik" className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <div className="rounded-panel border border-border bg-surface p-4">
          <p className="text-xs font-semibold uppercase tracking-wide text-ink-muted">Kehadiran</p>
          <p className="tabular mt-1 text-2xl font-bold">{profile.stats.attendanceRatePct}%</p>
        </div>
        <div className="rounded-panel border border-border bg-surface p-4">
          <p className="text-xs font-semibold uppercase tracking-wide text-ink-muted">Kerja siap</p>
          <p className="tabular mt-1 text-2xl font-bold">{profile.stats.jobsCompleted}</p>
        </div>
        <div className="rounded-panel border border-border bg-surface p-4">
          <p className="text-xs font-semibold uppercase tracking-wide text-ink-muted">
            MC tahun ini
          </p>
          <p className="tabular mt-1 text-2xl font-bold">{profile.stats.mcDaysThisYear} hari</p>
        </div>
        <div className="rounded-panel border border-border bg-surface p-4">
          <p className="text-xs font-semibold uppercase tracking-wide text-ink-muted">
            Komisen bulan ini
          </p>
          <p className="tabular mt-1 text-2xl font-bold text-success">
            {formatRinggit(profile.stats.commissionThisMonthSen)}
          </p>
        </div>
      </section>

      <section
        aria-labelledby="personal-heading"
        className="rounded-panel border border-border bg-surface p-5"
      >
        <h2
          id="personal-heading"
          className="text-sm font-semibold uppercase tracking-wide text-ink-muted"
        >
          Maklumat peribadi
        </h2>
        <dl className="mt-3 grid gap-x-8 gap-y-3 sm:grid-cols-2">
          {[
            ['Nama penuh (seperti IC)', profile.fullName],
            ['No. kad pengenalan', profile.identityCardNumber],
            ['Alamat kediaman', profile.address],
            ['No. telefon', profile.phone],
            [
              'Hubungan kecemasan',
              `${profile.emergencyContactName} · ${profile.emergencyContactPhone}`,
            ],
            ['Status perkahwinan', profile.maritalStatus],
          ].map(([label, value]) => (
            <div key={label}>
              <dt className="text-xs uppercase tracking-wide text-ink-muted">{label}</dt>
              <dd className="mt-0.5 text-sm">{value}</dd>
            </div>
          ))}
        </dl>
        <p className="mt-4 text-xs text-ink-muted">
          Medan ini disimpan terenkripsi dan dinyahsulit hanya untuk paparan ini.
        </p>
      </section>

      <div className="grid gap-4 lg:grid-cols-2">
        <section
          aria-labelledby="leave-heading"
          className="rounded-panel border border-border bg-surface p-5"
        >
          <h2
            id="leave-heading"
            className="text-sm font-semibold uppercase tracking-wide text-ink-muted"
          >
            Cuti terkini
          </h2>
          <p className="tabular mt-2 text-2xl font-bold">
            {profile.leaveRemainingDays}
            <span className="ml-2 text-sm font-medium text-ink-muted">hari baki tahunan</span>
          </p>
          {profile.recentLeave.length === 0 ? (
            <p className="mt-3 text-sm text-ink-muted">Belum ada permohonan.</p>
          ) : (
            <ul className="mt-3 space-y-2 text-sm">
              {profile.recentLeave.map((row) => (
                <li
                  key={row.id}
                  className="flex flex-wrap justify-between gap-2 border-b border-border pb-2 last:border-0"
                >
                  <span>
                    {LEAVE_LABEL[row.type] ?? row.type} · {row.days} hari
                  </span>
                  <span className="tabular text-xs text-ink-muted">
                    {DECISION_LABEL[row.status] ?? row.status}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section
          aria-labelledby="docs-heading"
          className="rounded-panel border border-border bg-surface p-5"
        >
          <h2
            id="docs-heading"
            className="text-sm font-semibold uppercase tracking-wide text-ink-muted"
          >
            Peti dokumen
          </h2>
          {profile.documents.length === 0 ? (
            <p className="mt-3 text-sm text-ink-muted">
              Tiada dokumen dimuat naik. Muat naik fail belum dibuka.
            </p>
          ) : (
            <ul className="mt-3 space-y-2 text-sm">
              {profile.documents.map((doc) => (
                <li
                  key={doc.id}
                  className="flex justify-between border-b border-border pb-2 last:border-0"
                >
                  <span>{doc.kind}</span>
                  <span className="tabular text-xs text-ink-muted">
                    {Math.round(doc.sizeBytes / 1024)} KB
                  </span>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>

      {isAdmin && !isSelf && profile.status === 'ACTIVE' ? (
        <section
          aria-labelledby="status-heading"
          className="rounded-panel border border-border bg-surface p-5"
        >
          <h2
            id="status-heading"
            className="text-sm font-semibold uppercase tracking-wide text-ink-muted"
          >
            Status pekerjaan
          </h2>
          <p className="mt-2 text-xs text-ink-muted">
            Pekerja yang digantung atau ditamatkan dikecualikan daripada payroll seterusnya.
          </p>

          {confirming ? (
            <form
              className="mt-3 space-y-3"
              onSubmit={(event) => {
                event.preventDefault();
                void changeStatus(confirming);
              }}
            >
              <div>
                <label htmlFor="status-reason" className="block text-sm font-medium">
                  Sebab {confirming === 'SUSPENDED' ? 'penggantungan' : 'penamatan'}
                </label>
                <input
                  id="status-reason"
                  required
                  minLength={3}
                  value={reason}
                  onChange={(event) => setReason(event.target.value)}
                  className="mt-1 w-full rounded-control border border-border-strong bg-surface px-3 py-2.5 text-sm"
                />
              </div>
              <div className="flex gap-2">
                <button
                  type="submit"
                  disabled={busy}
                  className="rounded-control bg-accent px-4 py-2.5 text-sm font-bold text-accent-ink disabled:opacity-50"
                >
                  Sahkan
                </button>
                <button
                  type="button"
                  onClick={() => setConfirming(null)}
                  className="rounded-control border border-border-strong px-4 py-2.5 text-sm"
                >
                  Batal
                </button>
              </div>
            </form>
          ) : (
            <div className="mt-3 flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => setConfirming('SUSPENDED')}
                className="rounded-control border border-border-strong px-4 py-2.5 text-sm font-semibold"
              >
                Gantung
              </button>
              <button
                type="button"
                onClick={() => setConfirming('TERMINATED')}
                className="rounded-control bg-accent px-4 py-2.5 text-sm font-bold text-accent-ink"
              >
                Berhenti
              </button>
            </div>
          )}

          <p role="alert" aria-live="polite" className="mt-3 min-h-5 text-sm text-accent">
            {error}
          </p>
        </section>
      ) : null}
    </div>
  );
}
