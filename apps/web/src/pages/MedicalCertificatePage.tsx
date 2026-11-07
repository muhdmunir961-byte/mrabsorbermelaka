import { useCallback, useEffect, useRef, useState } from 'react';
import { z } from 'zod';
import { ALLOWED_MIME_TYPES, MAX_UPLOAD_BYTES, StoredDocument } from '@mr/shared';
import { ApiError, api, apiUpload } from '../lib/api';
import { apiUrl } from '../lib/config';

const MyDocuments = z.array(StoredDocument);

const LEAVE_LABEL: Record<string, string> = {
  MEDICAL: 'Cuti sakit (MC)',
  ANNUAL: 'Cuti tahunan',
};

/** Client-side pre-check only. The server decides with magic bytes. */
function precheck(file: File): string | null {
  if (!(ALLOWED_MIME_TYPES as readonly string[]).includes(file.type)) {
    return 'Hanya JPEG, PNG, WebP atau PDF diterima.';
  }
  if (file.size > MAX_UPLOAD_BYTES) return 'Fail melebihi 5 MB.';
  return null;
}

export function MedicalCertificatePage() {
  const inputRef = useRef<HTMLInputElement>(null);
  const [documents, setDocuments] = useState<z.infer<typeof MyDocuments>>([]);
  const [preview, setPreview] = useState<{ url: string; name: string } | null>(null);
  const [uploaded, setUploaded] = useState<z.infer<typeof StoredDocument> | null>(null);

  const [clinicName, setClinicName] = useState('');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');

  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    setDocuments(await api('/documents', MyDocuments));
  }, []);

  useEffect(() => {
    void load().catch(() => {
      // An empty vault is the same as a failed list here; the form still works.
    });
  }, [load]);

  useEffect(
    () => () => {
      if (preview) URL.revokeObjectURL(preview.url);
    },
    [preview],
  );

  async function onFileChosen(file: File) {
    setError(null);
    setNotice(null);
    const problem = precheck(file);
    if (problem) {
      setError(problem);
      return;
    }

    if (preview) URL.revokeObjectURL(preview.url);
    setPreview({ url: URL.createObjectURL(file), name: file.name });

    setBusy(true);
    try {
      const stored = await apiUpload('/documents/upload', file, 'MC', StoredDocument);
      setUploaded(stored);
      setNotice('Gambar MC dimuat naik.');
      await load();
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : 'Muat naik gagal.');
    } finally {
      setBusy(false);
    }
  }

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setNotice(null);

    if (!uploaded) {
      setError('Muat naik gambar MC dahulu.');
      return;
    }

    setBusy(true);
    try {
      await api('/leave/mc', z.unknown(), {
        method: 'POST',
        body: JSON.stringify({
          clinicName,
          documentId: uploaded.id,
          startDate,
          endDate,
        }),
      });
      setNotice('Permohonan MC dihantar dan menunggu kelulusan.');
      setClinicName('');
      setStartDate('');
      setEndDate('');
      setUploaded(null);
      if (preview) URL.revokeObjectURL(preview.url);
      setPreview(null);
      if (inputRef.current) inputRef.current.value = '';
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
        <h1 className="text-2xl font-bold">Hantar MC</h1>
        <p className="mt-1 text-sm text-ink-muted">
          Muat naik gambar surat sakit, kemudian hantar untuk kelulusan.
        </p>
      </header>

      <form onSubmit={(event) => void submit(event)} className="space-y-5" noValidate>
        <section className="rounded-panel border border-border bg-surface p-5">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-ink-muted">
            Gambar MC
          </h2>

          <input
            ref={inputRef}
            id="mc-file"
            type="file"
            accept={ALLOWED_MIME_TYPES.join(',')}
            capture="environment"
            onChange={(event) => {
              const file = event.target.files?.[0];
              if (file) void onFileChosen(file);
            }}
            className="mt-3 block w-full text-sm file:mr-3 file:rounded-control file:border-0 file:bg-accent file:px-4 file:py-2.5 file:text-sm file:font-bold file:text-accent-ink"
          />
          <p className="mt-2 text-xs text-ink-muted">
            JPEG, PNG, WebP atau PDF · maksimum 5 MB. Pada telefon, butang ini membuka kamera.
          </p>

          {preview ? (
            <figure className="mt-4">
              <img
                src={preview.url}
                alt="Pratonton gambar MC yang dipilih"
                className="max-h-64 w-full rounded-control border border-border object-contain"
              />
              <figcaption className="mt-2 text-xs text-ink-muted">{preview.name}</figcaption>
            </figure>
          ) : null}

          {busy ? (
            <p role="status" className="mt-3 text-sm text-ink-muted">
              Memuat naik…
            </p>
          ) : null}
        </section>

        <section className="space-y-4 rounded-panel border border-border bg-surface p-5">
          <div>
            <label htmlFor="clinic" className="block text-sm font-medium">
              Nama klinik
            </label>
            <input
              id="clinic"
              required
              maxLength={120}
              value={clinicName}
              onChange={(event) => setClinicName(event.target.value)}
              placeholder="Contoh: Poliklinik Melaka Sentral"
              className="mt-1 w-full rounded-control border border-border-strong bg-surface px-3 py-2.5 text-sm"
            />
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label htmlFor="mc-start" className="block text-sm font-medium">
                Mula
              </label>
              <input
                id="mc-start"
                type="date"
                required
                value={startDate}
                onChange={(event) => setStartDate(event.target.value)}
                className="tabular mt-1 w-full rounded-control border border-border-strong bg-surface px-3 py-2.5 text-sm"
              />
            </div>
            <div>
              <label htmlFor="mc-end" className="block text-sm font-medium">
                Tamat
              </label>
              <input
                id="mc-end"
                type="date"
                required
                value={endDate}
                onChange={(event) => setEndDate(event.target.value)}
                className="tabular mt-1 w-full rounded-control border border-border-strong bg-surface px-3 py-2.5 text-sm"
              />
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <button
              type="submit"
              disabled={busy || uploaded === null}
              className="rounded-control bg-accent px-4 py-2.5 text-sm font-bold text-accent-ink disabled:opacity-50"
            >
              {busy ? 'Menghantar…' : 'Hantar MC'}
            </button>
            {uploaded === null ? (
              <p className="text-xs text-ink-muted">
                Aktif selepas gambar berjaya dimuat naik ke pelayan.
              </p>
            ) : null}
          </div>
        </section>

        {notice ? (
          <p role="status" className="text-sm font-medium text-success">
            {notice}
          </p>
        ) : null}
        {error ? (
          <p role="alert" aria-live="polite" className="text-sm text-accent">
            {error}
          </p>
        ) : null}
      </form>

      <section aria-labelledby="vault-heading">
        <h2 id="vault-heading" className="text-lg font-bold">
          Dokumen saya
        </h2>
        {documents.length === 0 ? (
          <p className="mt-2 rounded-panel border border-border bg-surface p-4 text-sm text-ink-muted">
            Belum ada dokumen dimuat naik.
          </p>
        ) : (
          <ul className="mt-3 space-y-2">
            {documents.map((doc) => (
              <li
                key={doc.id}
                className="flex flex-wrap items-center justify-between gap-2 rounded-panel border border-border bg-surface p-3 text-sm"
              >
                <span>
                  <span className="font-medium">{LEAVE_LABEL[doc.kind] ?? doc.kind}</span>
                  <span className="block text-xs text-ink-muted">
                    {doc.mimeType} · {Math.round(doc.sizeBytes / 1024)} KB
                  </span>
                </span>
                <a
                  href={apiUrl(`/documents/${doc.id}`)}
                  className="text-sm font-medium underline"
                  download
                >
                  Muat turun
                </a>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
