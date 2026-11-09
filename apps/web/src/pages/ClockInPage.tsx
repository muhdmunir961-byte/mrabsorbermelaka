import { useCallback, useEffect, useState } from 'react';
import { z } from 'zod';
import { Link } from 'react-router-dom';
import { ApiError, api } from '../lib/api';

const ContextSchema = z.object({
  branchName: z.string(),
  branchCode: z.string(),
  geofenceRadiusM: z.int(),
  shiftStartLabel: z.string(),
});

const MyRecordSchema = z
  .object({
    id: z.uuid(),
    state: z.enum(['PRESENT', 'LATE', 'ON_MC', 'ABSENT', 'LEAVE']),
    method: z.enum(['FACE', 'PIN', 'MANUAL']),
    clockInAt: z.string().nullable(),
    clockOutAt: z.string().nullable(),
    lateMinutes: z.int(),
    geofenceDistanceM: z.int().nullable(),
  })
  .nullable();

type LocationState =
  | { status: 'idle' }
  | { status: 'locating' }
  | { status: 'ready'; latitude: number; longitude: number; accuracyM: number }
  | { status: 'denied'; message: string };

/** Kuala Lumpur time, independent of the device timezone. */
function klNow(now: Date): string {
  return new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Asia/Kuala_Lumpur',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  }).format(now);
}

function klDate(now: Date): string {
  return new Intl.DateTimeFormat('ms-MY', {
    timeZone: 'Asia/Kuala_Lumpur',
    weekday: 'long',
    day: '2-digit',
    month: 'long',
    year: 'numeric',
  }).format(now);
}

export function ClockInPage() {
  const [context, setContext] = useState<z.infer<typeof ContextSchema> | null>(null);
  const [record, setRecord] = useState<z.infer<typeof MyRecordSchema>>(null);
  const [now, setNow] = useState(new Date());
  const [location, setLocation] = useState<LocationState>({ status: 'idle' });
  const [pin, setPin] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    const [nextContext, nextRecord] = await Promise.all([
      api('/attendance/context', ContextSchema),
      api('/attendance/me', MyRecordSchema),
    ]);
    setContext(nextContext);
    setRecord(nextRecord);
  }, []);

  useEffect(() => {
    void load().catch((caught: unknown) =>
      setError(caught instanceof ApiError ? caught.message : 'Data tidak dapat dimuatkan.'),
    );
  }, [load]);

  useEffect(() => {
    const timer = window.setInterval(() => setNow(new Date()), 1000);
    return () => window.clearInterval(timer);
  }, []);

  function requestLocation() {
    if (!('geolocation' in navigator)) {
      setLocation({ status: 'denied', message: 'Peranti ini tiada akses lokasi.' });
      return;
    }
    setLocation({ status: 'locating' });
    navigator.geolocation.getCurrentPosition(
      (position) =>
        setLocation({
          status: 'ready',
          latitude: position.coords.latitude,
          longitude: position.coords.longitude,
          accuracyM: Math.round(position.coords.accuracy),
        }),
      (failure) =>
        setLocation({
          status: 'denied',
          message:
            failure.code === failure.PERMISSION_DENIED
              ? 'Kebenaran lokasi ditolak. Benarkan akses lokasi untuk daftar masuk.'
              : 'Lokasi tidak dapat ditentukan. Cuba di tempat terbuka.',
        }),
      { enableHighAccuracy: true, timeout: 15_000, maximumAge: 0 },
    );
  }

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setNotice(null);

    if (location.status !== 'ready') {
      setError('Tekan "Semak lokasi" dahulu. Server menolak daftar masuk tanpa koordinat.');
      return;
    }

    setBusy(true);
    try {
      await api('/attendance/clock-in', z.unknown(), {
        method: 'POST',
        body: JSON.stringify({
          method: 'PIN',
          pin,
          latitude: location.latitude,
          longitude: location.longitude,
        }),
      });
      setNotice('Daftar masuk direkodkan.');
      setPin('');
      await load();
    } catch (caught) {
      setError(
        caught instanceof ApiError
          ? (caught.details[0]?.message ?? caught.message)
          : 'Daftar masuk gagal.',
      );
    } finally {
      setBusy(false);
    }
  }

  const alreadyIn = record?.clockInAt !== null && record?.clockInAt !== undefined;
  const locationReady = location.status === 'ready';

  return (
    <div className="space-y-6">
      <header className="text-center">
        <p className="tabular text-4xl font-black tracking-tight">{klNow(now)}</p>
        <p className="mt-1 text-sm text-ink-muted">{klDate(now)}</p>
      </header>

      <section
        aria-labelledby="clock-heading"
        className="mx-auto max-w-md rounded-panel border border-border bg-surface p-6"
      >
        <h1 id="clock-heading" className="text-center text-xl font-bold">
          {alreadyIn ? 'Anda sudah daftar masuk' : 'Daftar masuk kerja'}
        </h1>
        <p className="mt-1 text-center text-sm text-ink-muted">
          {context
            ? `${context.branchName} · kawasan ${context.geofenceRadiusM} m · syif ${context.shiftStartLabel}`
            : 'Memuatkan cawangan…'}
        </p>

        {alreadyIn ? (
          <div className="mt-5 space-y-2 text-center">
            <p className="rounded-control bg-accent-soft px-3 py-2 text-sm font-semibold text-accent-strong">
              {record?.state === 'LATE' ? `Lewat ${record.lateMinutes} minit` : 'Tepat masa'}
            </p>
            {record?.geofenceDistanceM !== null && record?.geofenceDistanceM !== undefined ? (
              <p className="text-xs text-ink-muted">
                Direkod pada jarak {record.geofenceDistanceM} m dari cawangan.
              </p>
            ) : null}
            <p className="text-sm text-ink-muted">
              Untuk tugasan dan daftar keluar, buka{' '}
              <Link to="/home" className="font-medium text-ink underline">
                Utama
              </Link>
              .
            </p>
          </div>
        ) : (
          <>
            <div className="mt-6 space-y-3">
              <button
                type="button"
                onClick={requestLocation}
                className="w-full rounded-control border border-border-strong px-4 py-2.5 text-sm font-semibold"
              >
                {location.status === 'locating' ? 'Menyemak lokasi…' : 'Semak lokasi'}
              </button>

              <p role="status" aria-live="polite" className="min-h-5 text-center text-xs">
                {location.status === 'ready' ? (
                  <span className="font-medium text-success">
                    GPS sah · ketepatan ±{location.accuracyM} m
                  </span>
                ) : location.status === 'denied' ? (
                  <span className="text-accent">{location.message}</span>
                ) : location.status === 'locating' ? (
                  <span className="text-ink-muted">Mendapatkan koordinat…</span>
                ) : (
                  <span className="text-ink-muted">
                    Lokasi diperlukan untuk mengesahkan anda berada di bengkel.
                  </span>
                )}
              </p>

              <form
                onSubmit={(event) => {
                  void submit(event);
                }}
                className="space-y-3"
                noValidate
              >
                <div>
                  <label htmlFor="clock-pin" className="block text-sm font-medium">
                    Kod PIN (6 digit)
                  </label>
                  <input
                    id="clock-pin"
                    name="pin"
                    inputMode="numeric"
                    autoComplete="off"
                    pattern="[0-9]{6}"
                    maxLength={6}
                    required
                    value={pin}
                    onChange={(event) => setPin(event.target.value)}
                    className="tabular mt-1 w-full rounded-control border border-border-strong bg-surface px-3 py-2.5 text-center text-lg tracking-[0.4em]"
                  />
                </div>

                <button
                  type="submit"
                  disabled={busy || !locationReady}
                  className="w-full rounded-control bg-accent px-4 py-2.5 text-sm font-bold text-accent-ink disabled:opacity-50"
                >
                  {busy ? 'Merekod…' : 'Daftar masuk'}
                </button>
              </form>
            </div>
          </>
        )}

        {notice ? (
          <p role="status" className="mt-3 text-center text-sm font-medium text-success">
            {notice}
          </p>
        ) : null}

        <p role="alert" aria-live="polite" className="mt-2 min-h-5 text-center text-sm text-accent">
          {error}
        </p>
      </section>

      <p className="mx-auto max-w-md text-center text-xs text-ink-muted">
        PIN demo: 123456. Server menyemak jarak sebenar terhadap geofence cawangan.
      </p>
    </div>
  );
}
