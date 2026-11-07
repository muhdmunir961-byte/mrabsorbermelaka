import { useState } from 'react';
import { z } from 'zod';
import { useSession } from '../lib/session';
import { ApiError, api } from '../lib/api';

const OtpIssuedSchema = z.object({
  challengeExpiresAt: z.string(),
  devCode: z.string().optional(),
});

const SignedInSchema = z.object({
  employeeId: z.uuid(),
  role: z.enum(['STAFF', 'FOREMAN', 'ADMIN_HR', 'OWNER']),
  fullName: z.string(),
});

const DEMO_PHONE = '+60123456789';

const fieldClass =
  'mt-1 w-full rounded-control border border-border-strong bg-surface px-3 py-2.5 text-sm';
const submitClass =
  'w-full rounded-control bg-accent px-4 py-2.5 text-sm font-bold text-accent-ink disabled:opacity-60';

export function LoginPage() {
  const { signIn } = useSession();
  const [phone, setPhone] = useState('');
  const [code, setCode] = useState('');
  const [stage, setStage] = useState<'phone' | 'code'>('phone');
  const [devCode, setDevCode] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function requestCode(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setBusy(true);
    try {
      const issued = await api('/auth/otp/request', OtpIssuedSchema, {
        method: 'POST',
        body: JSON.stringify({ phone }),
      });
      setDevCode(issued.devCode ?? null);
      setStage('code');
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : 'Rangkaian tidak dapat dihubungi.');
    } finally {
      setBusy(false);
    }
  }

  async function submitCode(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setBusy(true);
    try {
      const user = await api('/auth/otp/verify', SignedInSchema, {
        method: 'POST',
        body: JSON.stringify({ phone, code }),
      });
      signIn(user);
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : 'Rangkaian tidak dapat dihubungi.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="grid min-h-dvh lg:grid-cols-2">
      <section className="hidden flex-col justify-between bg-ink p-10 text-white lg:flex">
        <p className="text-xl font-black tracking-tight">
          <span className="text-accent">MR.</span> ABSORBER
          <span className="mt-1 block text-xs font-medium uppercase tracking-[0.2em] text-white/60">
            Melaka HR System
          </span>
        </p>

        <div>
          <h1 className="max-w-md text-4xl font-black leading-tight">
            Pakar Absorber <span className="text-accent">Melaka Anda.</span>
          </h1>
          <p className="mt-4 max-w-sm text-sm leading-relaxed text-white/70">
            Sistem pengurusan HR bengkel Mr. Absorber. Efisien, cepat, dan mesra bengkel.
          </p>
        </div>

        <p className="text-xs text-white/40">Dua cawangan: Melaka Utama &amp; Ayer Keroh</p>
      </section>

      <section className="flex items-center justify-center px-4 py-12">
        <div className="w-full max-w-sm">
          <h2 className="text-2xl font-bold">Selamat Kembali!</h2>
          <p className="mt-1 text-sm text-ink-muted">
            Sila log masuk untuk menguruskan tugasan bengkel anda.
          </p>

          {stage === 'phone' ? (
            <form
              onSubmit={(event) => {
                void requestCode(event);
              }}
              className="mt-8 space-y-4"
              noValidate
            >
              <div>
                <label htmlFor="phone" className="block text-sm font-medium">
                  Nombor Telefon
                </label>
                <input
                  id="phone"
                  name="phone"
                  type="tel"
                  inputMode="tel"
                  autoComplete="tel"
                  required
                  placeholder="+60 12-345 6789"
                  value={phone}
                  onChange={(event) => setPhone(event.target.value)}
                  className={fieldClass}
                />
                <p className="mt-1 text-xs text-ink-muted">
                  Nombor demo:{' '}
                  <button
                    type="button"
                    className="font-medium text-accent underline"
                    onClick={() => setPhone(DEMO_PHONE)}
                  >
                    {DEMO_PHONE}
                  </button>
                </p>
              </div>
              <button type="submit" disabled={busy} className={submitClass}>
                {busy ? 'Menghantar…' : 'Hantar OTP'}
              </button>
            </form>
          ) : (
            <form
              onSubmit={(event) => {
                void submitCode(event);
              }}
              className="mt-8 space-y-4"
              noValidate
            >
              <div>
                <label htmlFor="code" className="block text-sm font-medium">
                  Kod OTP
                </label>
                <input
                  id="code"
                  name="code"
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  pattern="[0-9]{6}"
                  maxLength={6}
                  required
                  value={code}
                  onChange={(event) => setCode(event.target.value)}
                  className={`${fieldClass} tabular text-center text-lg tracking-[0.4em]`}
                />
              </div>

              {devCode ? (
                <p className="rounded-control bg-warning-soft px-3 py-2 text-xs text-warning">
                  Mod pembangunan: kod anda ialah <strong className="tabular">{devCode}</strong>.
                  SMS sebenar belum disambungkan.
                </p>
              ) : null}

              <button type="submit" disabled={busy} className={submitClass}>
                {busy ? 'Mengesahkan…' : 'Masuk'}
              </button>

              <button
                type="button"
                onClick={() => setStage('phone')}
                className="w-full text-sm font-medium text-ink-muted underline"
              >
                Tukar nombor telefon
              </button>
            </form>
          )}

          <p role="alert" aria-live="polite" className="mt-4 min-h-5 text-sm text-accent">
            {error}
          </p>

          <p className="mt-8 text-xs text-ink-muted">
            Bukan staf? <span className="font-medium text-ink">Hubungi HR</span>.
          </p>
        </div>
      </section>
    </div>
  );
}
