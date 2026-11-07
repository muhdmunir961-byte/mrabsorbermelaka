import { useCallback, useEffect, useState } from 'react';
import { z } from 'zod';
import { LeaveQueueItem } from '@mr/shared';
import { ApiError, api } from '../lib/api';

const QueueSchema = z.array(LeaveQueueItem);
const DecisionSchema = z.object({ id: z.uuid(), status: z.string() });
const BatchSchema = z.object({ decided: z.array(z.unknown()), skipped: z.array(z.string()) });

const LEAVE_LABEL: Record<string, string> = {
  ANNUAL: 'Cuti tahunan',
  MEDICAL: 'Cuti sakit (MC)',
  EMERGENCY: 'Kecemasan',
  UNPAID: 'Tanpa gaji',
  MATERNITY: 'Bersalin',
};

export function ApprovalsPage() {
  const [queue, setQueue] = useState<z.infer<typeof QueueSchema>>([]);
  const [selected, setSelected] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [loaded, setLoaded] = useState(false);

  const load = useCallback(async () => {
    const items = await api('/leave/queue', QueueSchema);
    setQueue(items);
    setSelected([]);
    setLoaded(true);
  }, []);

  useEffect(() => {
    void load().catch((caught: unknown) =>
      setError(caught instanceof ApiError ? caught.message : 'Data tidak dapat dimuatkan.'),
    );
  }, [load]);

  async function decide(requestId: string, approved: boolean) {
    setError(null);
    setNotice(null);
    setBusy(true);
    try {
      await api(`/leave/requests/${requestId}/decision`, DecisionSchema, {
        method: 'PATCH',
        body: JSON.stringify({ decision: approved ? 'APPROVE' : 'REJECT' }),
      });
      await load();
      setNotice(approved ? 'Permohonan diluluskan.' : 'Permohonan ditolak.');
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : 'Tindakan gagal.');
    } finally {
      setBusy(false);
    }
  }

  async function batchApprove() {
    if (selected.length === 0) return;
    setError(null);
    setNotice(null);
    setBusy(true);
    try {
      const result = await api('/leave/requests/batch-decision', BatchSchema, {
        method: 'POST',
        body: JSON.stringify({ requestIds: selected, decision: 'APPROVE' }),
      });
      setNotice(
        `${result.decided.length} permohonan diluluskan` +
          (result.skipped.length > 0 ? `, ${result.skipped.length} dilangkau.` : '.'),
      );
      await load();
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : 'Tindakan pukal gagal.');
    } finally {
      setBusy(false);
    }
  }

  const toggle = (id: string) =>
    setSelected((current) =>
      current.includes(id) ? current.filter((value) => value !== id) : [...current, id],
    );

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">Kelulusan</h1>
          <p className="mt-1 text-sm text-ink-muted">
            {loaded ? `${queue.length} permohonan menunggu tindakan` : 'Memuatkan…'}
          </p>
        </div>
        <button
          type="button"
          onClick={() => {
            void batchApprove();
          }}
          disabled={busy || selected.length === 0}
          className="rounded-control bg-accent px-4 py-2.5 text-sm font-bold text-accent-ink disabled:opacity-50"
        >
          Luluskan pilihan ({selected.length})
        </button>
      </header>

      {notice ? (
        <p role="status" className="text-sm font-medium text-success">
          {notice}
        </p>
      ) : null}

      <p role="alert" aria-live="polite" className="min-h-5 text-sm text-accent">
        {error}
      </p>

      {loaded && queue.length === 0 ? (
        <p className="rounded-panel border border-border bg-surface p-4 text-sm text-ink-muted">
          Tiada permohonan menunggu.
        </p>
      ) : (
        <ul className="space-y-3">
          {queue.map((item) => (
            <li key={item.id} className="rounded-panel border border-border bg-surface p-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="flex items-start gap-3">
                  <input
                    type="checkbox"
                    id={`pick-${item.id}`}
                    checked={selected.includes(item.id)}
                    onChange={() => toggle(item.id)}
                    className="mt-1 size-4"
                  />
                  <label htmlFor={`pick-${item.id}`} className="cursor-pointer">
                    <span className="block font-semibold">{item.employeeName}</span>
                    <span className="block text-xs text-ink-muted">
                      {LEAVE_LABEL[item.type] ?? item.type} · {item.days} hari ·{' '}
                      <span className="tabular">
                        {item.startDate} → {item.endDate}
                      </span>
                    </span>
                  </label>
                </div>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      void decide(item.id, false);
                    }}
                    disabled={busy}
                    className="rounded-control border border-border-strong px-3 py-2 text-sm font-medium disabled:opacity-50"
                  >
                    Tolak
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      void decide(item.id, true);
                    }}
                    disabled={busy}
                    className="rounded-control bg-accent px-3 py-2 text-sm font-bold text-accent-ink disabled:opacity-50"
                  >
                    Luluskan
                  </button>
                </div>
              </div>

              <p className="mt-3 text-sm">{item.reason}</p>
              {item.clinicName ? (
                <p className="mt-1 text-xs text-ink-muted">
                  Klinik: <span className="font-medium text-ink">{item.clinicName}</span>
                </p>
              ) : null}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
