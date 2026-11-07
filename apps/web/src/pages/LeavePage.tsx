import { useCallback, useEffect, useState } from 'react';
import { z } from 'zod';
import { LeaveRequest as LeaveRequestSchema, LeaveSubmission, countLeaveDays } from '@mr/shared';
import type { LeaveRequest } from '@mr/shared';
import { ApiError, api } from '../lib/api';

const BalanceSchema = z.object({
  year: z.int(),
  entitlementDays: z.int(),
  usedDays: z.int(),
  pendingDays: z.int(),
  remainingDays: z.int(),
});

const MyRequestsSchema = z.array(LeaveRequestSchema);

const LEAVE_LABEL: Record<string, string> = {
  ANNUAL: 'Cuti tahunan',
  MEDICAL: 'Cuti sakit (MC)',
  EMERGENCY: 'Kecemasan',
  UNPAID: 'Tanpa gaji',
  MATERNITY: 'Bersalin',
};

const STATUS_LABEL: Record<string, string> = {
  PENDING: 'Menunggu',
  APPROVED: 'Diluluskan',
  REJECTED: 'Ditolak',
  CANCELLED: 'Dibatalkan',
};

const fieldClass =
  'mt-1 w-full rounded-control border border-border-strong bg-surface px-3 py-2.5 text-sm';

export function LeavePage() {
  const [balance, setBalance] = useState<z.infer<typeof BalanceSchema> | null>(null);
  const [mine, setMine] = useState<LeaveRequest[]>([]);
  const [type, setType] = useState('ANNUAL');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [reason, setReason] = useState('');
  const [conflict, setConflict] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [okMessage, setOkMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    const [nextBalance, requests] = await Promise.all([
      api('/leave/balance', BalanceSchema),
      api('/leave/requests', MyRequestsSchema),
    ]);
    setBalance(nextBalance);
    setMine(requests);
  }, []);

  useEffect(() => {
    void load().catch((caught: unknown) =>
      setError(caught instanceof ApiError ? caught.message : 'Data tidak dapat dimuatkan.'),
    );
  }, [load]);

  const requestedDays = startDate && endDate ? countLeaveDays(startDate, endDate) : 0;

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setOkMessage(null);
    setConflict(null);
    setBusy(true);
    try {
      const result = await api('/leave/requests', LeaveSubmission, {
        method: 'POST',
        body: JSON.stringify({ type, startDate, endDate, reason, attachmentId: null }),
      });
      setOkMessage(`Permohonan ${result.request.days} hari dihantar dan menunggu kelulusan.`);
      setConflict(result.conflict?.message ?? null);
      setReason('');
      await load();
    } catch (caught) {
      setError(
        caught instanceof ApiError
          ? (caught.details[0]?.message ?? caught.message)
          : 'Permohonan gagal dihantar.',
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-bold">Mohon Cuti</h1>
        <p className="mt-1 text-sm text-ink-muted">
          Baki dan permohonan anda untuk tahun {balance?.year ?? new Date().getFullYear()}.
        </p>
      </header>

      <section
        aria-labelledby="balance-heading"
        className="rounded-panel border border-border bg-surface p-5"
      >
        <h2
          id="balance-heading"
          className="text-xs font-semibold uppercase tracking-wide text-ink-muted"
        >
          Baki cuti tahunan
        </h2>
        <p className="tabular mt-2 text-3xl font-bold">
          {balance ? balance.remainingDays : '…'}
          <span className="ml-2 text-sm font-medium text-ink-muted">hari</span>
        </p>
        {balance ? (
          <p className="mt-1 text-xs text-ink-muted">
            {balance.usedDays} digunakan · {balance.pendingDays} menunggu · jumlah{' '}
            {balance.entitlementDays}
          </p>
        ) : null}
      </section>

      <form
        onSubmit={(event) => {
          void submit(event);
        }}
        className="space-y-4 rounded-panel border border-border bg-surface p-5"
        noValidate
      >
        <div>
          <label htmlFor="leave-type" className="block text-sm font-medium">
            Jenis cuti
          </label>
          <select
            id="leave-type"
            value={type}
            onChange={(event) => setType(event.target.value)}
            className={fieldClass}
          >
            {Object.entries(LEAVE_LABEL)
              .filter(([value]) => value !== 'MEDICAL')
              .map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
          </select>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label htmlFor="start-date" className="block text-sm font-medium">
              Mula
            </label>
            <input
              id="start-date"
              type="date"
              required
              value={startDate}
              onChange={(event) => setStartDate(event.target.value)}
              className={`${fieldClass} tabular`}
            />
          </div>
          <div>
            <label htmlFor="end-date" className="block text-sm font-medium">
              Tamat
            </label>
            <input
              id="end-date"
              type="date"
              required
              value={endDate}
              onChange={(event) => setEndDate(event.target.value)}
              className={`${fieldClass} tabular`}
            />
          </div>
        </div>

        {requestedDays > 0 ? (
          <p className="text-sm text-ink-muted">
            Diminta: <strong className="tabular text-ink">{requestedDays} hari</strong>
            {balance && type === 'ANNUAL' ? (
              <>
                {' · baki selepas: '}
                <strong className="tabular text-ink">
                  {balance.remainingDays - requestedDays} hari
                </strong>
              </>
            ) : null}
          </p>
        ) : null}

        <div>
          <label htmlFor="reason" className="block text-sm font-medium">
            Sebab
          </label>
          <textarea
            id="reason"
            required
            minLength={3}
            rows={3}
            value={reason}
            onChange={(event) => setReason(event.target.value)}
            placeholder="Contoh: Balik kampung untuk kenduri"
            className={fieldClass}
          />
        </div>

        <button
          type="submit"
          disabled={busy}
          className="rounded-control bg-accent px-4 py-2.5 text-sm font-bold text-accent-ink disabled:opacity-60"
        >
          {busy ? 'Menghantar…' : 'Hantar permohonan'}
        </button>

        {okMessage ? (
          <p role="status" className="text-sm font-medium text-success">
            {okMessage}
          </p>
        ) : null}

        {conflict ? (
          <p className="rounded-control bg-warning-soft px-3 py-2 text-xs text-warning">
            Amaran konflik: {conflict}
          </p>
        ) : null}

        <p role="alert" aria-live="polite" className="min-h-5 text-sm text-accent">
          {error}
        </p>
      </form>

      <section aria-labelledby="my-requests-heading">
        <h2 id="my-requests-heading" className="text-lg font-bold">
          Permohonan saya
        </h2>
        {mine.length === 0 ? (
          <p className="mt-2 rounded-panel border border-border bg-surface p-4 text-sm text-ink-muted">
            Belum ada permohonan.
          </p>
        ) : (
          <ul className="mt-3 space-y-2">
            {mine.map((request) => (
              <li
                key={request.id}
                className="rounded-panel border border-border bg-surface p-4 text-sm"
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="font-semibold">
                    {LEAVE_LABEL[request.type] ?? request.type} · {request.days} hari
                  </p>
                  <span className="rounded-full bg-accent-soft px-2 py-0.5 text-xs font-semibold text-accent-strong">
                    {STATUS_LABEL[request.status] ?? request.status}
                  </span>
                </div>
                <p className="tabular mt-1 text-xs text-ink-muted">
                  {request.startDate} → {request.endDate}
                </p>
                <p className="mt-1 text-xs text-ink-muted">{request.reason}</p>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
