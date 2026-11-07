import { useCallback, useEffect, useRef, useState } from 'react';
import { z } from 'zod';
import { ApiError, api } from '../lib/api';

const StatusSchema = z.object({
  enrolled: z.boolean(),
  enrolledAt: z.string().nullable(),
  threshold: z.number(),
});

const VerifySchema = z.object({
  matched: z.boolean(),
  distance: z.number().nullable(),
  threshold: z.number(),
  message: z.string(),
});

type CameraState =
  | { status: 'idle' }
  | { status: 'starting' }
  | { status: 'live' }
  | { status: 'denied'; message: string };

export function FaceSetupPage() {
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);

  const [enrollment, setEnrollment] = useState<z.infer<typeof StatusSchema> | null>(null);
  const [camera, setCamera] = useState<CameraState>({ status: 'idle' });
  const [result, setResult] = useState<z.infer<typeof VerifySchema> | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    setEnrollment(await api('/face/status', StatusSchema));
  }, []);

  useEffect(() => {
    void load().catch((caught: unknown) =>
      setError(caught instanceof ApiError ? caught.message : 'Status tidak dapat dimuatkan.'),
    );
  }, [load]);

  // Release the camera whenever the page is left, including on unmount.
  useEffect(
    () => () => {
      streamRef.current?.getTracks().forEach((track) => track.stop());
    },
    [],
  );

  async function startCamera() {
    setError(null);
    setResult(null);
    if (!navigator.mediaDevices?.getUserMedia) {
      setCamera({ status: 'denied', message: 'Peranti ini tiada kamera yang boleh digunakan.' });
      return;
    }
    setCamera({ status: 'starting' });
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'user', width: { ideal: 640 }, height: { ideal: 480 } },
        audio: false,
      });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
      }
      setCamera({ status: 'live' });
    } catch {
      setCamera({
        status: 'denied',
        message: 'Kebenaran kamera ditolak. Benarkan akses kamera untuk meneruskan.',
      });
    }
  }

  function stopCamera() {
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    setCamera({ status: 'idle' });
  }

  /** Grabs one frame from the live video as a JPEG data URL. */
  function grabFrame(): string | null {
    const video = videoRef.current;
    if (!video || video.videoWidth === 0) return null;
    const canvas = document.createElement('canvas');
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const context = canvas.getContext('2d');
    if (!context) return null;
    context.drawImage(video, 0, 0, canvas.width, canvas.height);
    return canvas.toDataURL('image/jpeg', 0.85);
  }

  async function run(path: '/face/enroll' | '/face/verify') {
    setError(null);
    setNotice(null);
    setResult(null);

    const image = grabFrame();
    if (!image) {
      setError('Kamera belum sedia. Tekan "Buka kamera" dan cuba lagi.');
      return;
    }

    setBusy(true);
    try {
      if (path === '/face/enroll') {
        setEnrollment(
          await api('/face/enroll', StatusSchema, {
            method: 'POST',
            body: JSON.stringify({ image }),
          }),
        );
        setNotice('Wajah didaftarkan. Anda boleh uji pengesahan sekarang.');
      } else {
        const outcome = await api('/face/verify', VerifySchema, {
          method: 'POST',
          body: JSON.stringify({ image }),
        });
        setResult(outcome);
      }
    } catch (caught) {
      setError(
        caught instanceof ApiError
          ? (caught.details[0]?.message ?? caught.message)
          : 'Tindakan gagal.',
      );
    } finally {
      setBusy(false);
    }
  }

  const live = camera.status === 'live';

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-bold">Pendaftaran Wajah</h1>
        <p className="mt-1 text-sm text-ink-muted">
          Wajah anda disimpan terenkripsi dan hanya digunakan untuk mengesahkan kehadiran.
        </p>
      </header>

      <section className="rounded-panel border border-border bg-surface p-4">
        <p className="text-xs font-semibold uppercase tracking-wide text-ink-muted">Status</p>
        <p className="mt-1 text-sm">
          {enrollment === null
            ? 'Memuatkan…'
            : enrollment.enrolled
              ? `Wajah berdaftar sejak ${new Date(enrollment.enrolledAt ?? '').toLocaleDateString('ms-MY')}`
              : 'Wajah belum didaftarkan'}
        </p>
        {enrollment ? (
          <p className="mt-1 text-xs text-ink-muted">
            Had jarak {enrollment.threshold} (lebih rendah = lebih ketat)
          </p>
        ) : null}
      </section>

      <section className="rounded-panel border border-border bg-surface p-4">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-ink-muted">Kamera</h2>

        <div className="mt-3 overflow-hidden rounded-control border border-border bg-ink">
          <video
            ref={videoRef}
            muted
            playsInline
            aria-label="Pratonton kamera"
            className={`aspect-[4/3] w-full object-cover ${live ? '' : 'hidden'}`}
          />
          {!live ? (
            <p className="grid aspect-[4/3] w-full place-items-center px-4 text-center text-xs text-white/70">
              {camera.status === 'starting'
                ? 'Membuka kamera…'
                : camera.status === 'denied'
                  ? camera.message
                  : 'Kamera belum dibuka'}
            </p>
          ) : null}
        </div>

        <div className="mt-3 flex flex-wrap gap-2">
          {live ? (
            <button
              type="button"
              onClick={stopCamera}
              className="rounded-control border border-border-strong px-4 py-2.5 text-sm font-semibold"
            >
              Tutup kamera
            </button>
          ) : (
            <button
              type="button"
              onClick={() => {
                void startCamera();
              }}
              disabled={camera.status === 'starting'}
              className="rounded-control border border-border-strong px-4 py-2.5 text-sm font-semibold disabled:opacity-50"
            >
              Buka kamera
            </button>
          )}

          <button
            type="button"
            onClick={() => {
              void run('/face/enroll');
            }}
            disabled={busy || !live}
            className="rounded-control bg-accent px-4 py-2.5 text-sm font-bold text-accent-ink disabled:opacity-50"
          >
            {busy ? 'Memproses…' : enrollment?.enrolled ? 'Daftar semula' : 'Daftar wajah'}
          </button>

          <button
            type="button"
            onClick={() => {
              void run('/face/verify');
            }}
            disabled={busy || !live || !enrollment?.enrolled}
            className="rounded-control border border-border-strong px-4 py-2.5 text-sm font-semibold disabled:opacity-50"
          >
            Uji pengesahan
          </button>
        </div>

        <p className="mt-2 text-xs text-ink-muted">
          Gambar dihantar ke pelayan dan dibandingkan di sana; tiada gambar disimpan pada peranti.
        </p>

        {result ? (
          <div
            role="status"
            className={`mt-3 rounded-control px-3 py-2 text-sm ${
              result.matched
                ? 'bg-accent-soft font-semibold text-accent-strong'
                : 'bg-warning-soft text-warning'
            }`}
          >
            {result.message}
            {result.distance !== null ? (
              <span className="tabular ml-2 text-xs font-normal">
                jarak {result.distance} / had {result.threshold}
              </span>
            ) : null}
          </div>
        ) : null}
      </section>

      {notice ? (
        <p role="status" className="text-sm font-medium text-success">
          {notice}
        </p>
      ) : null}
      <p role="alert" aria-live="polite" className="min-h-5 text-sm text-accent">
        {error}
      </p>
    </div>
  );
}
