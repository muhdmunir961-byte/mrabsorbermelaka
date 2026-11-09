import { useState } from 'react';
import { Link } from 'react-router-dom';
import { z } from 'zod';
import { useSession } from '../lib/session';
import { ApiError, api } from '../lib/api';

const OtpIssuedSchema = z.object({
  challengeExpiresAt: z.string(),
  devCode: z.string().optional(),
  needsTelegramLink: z.boolean().optional(),
  telegramDelivery: z.enum(['sent', 'failed', 'not_linked']).optional(),
});
const TelegramLinkSchema = z.object({ url: z.url(), expiresAt: z.string() });
const PinStateSchema = z.object({ hasPin: z.boolean() });
const TELEGRAM_BOT_URL = 'https://t.me/mrabsorbermelaka_bot';

const SignedInSchema = z.object({
  employeeId: z.uuid(),
  role: z.enum(['STAFF', 'FOREMAN', 'ADMIN_HR', 'OWNER']),
  fullName: z.string(),
});

const DEMO_PHONE = '+60123456789';

function normalizePhone(value: string): string {
  const compact = value.replace(/[\s()-]/g, '');
  if (/^01\d{8,9}$/.test(compact)) return `+6${compact}`;
  if (/^601\d{8,9}$/.test(compact)) return `+${compact}`;
  return compact;
}

const fieldClass =
  'mt-1 w-full rounded-control border border-border-strong bg-surface px-3 py-2.5 text-sm';
const submitClass =
  'w-full rounded-control bg-accent px-4 py-2.5 text-sm font-bold text-accent-ink disabled:opacity-60';

export function LoginPage({ mode = 'login' }: { mode?: 'login' | 'register' }) {
  const { signIn } = useSession();
  const [phone, setPhone] = useState('');
  const [code, setCode] = useState('');
  const [stage, setStage] = useState<'phone' | 'code' | 'pin'>('phone');
  const [devCode, setDevCode] = useState<string | null>(null);
  const [awaitingApproval, setAwaitingApproval] = useState(false);
  const [pin, setPin] = useState('');
  const [pinConfirm, setPinConfirm] = useState('');
  const [pendingUser, setPendingUser] = useState<z.infer<typeof SignedInSchema> | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function requestCode(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setBusy(true);
    try {
      const normalizedPhone = normalizePhone(phone);
      const issued = await api('/auth/otp/request', OtpIssuedSchema, {
        method: 'POST',
        body: JSON.stringify({ phone: normalizedPhone }),
      });
      setPhone(normalizedPhone);
      setDevCode(issued.devCode ?? null);
      if (issued.telegramDelivery === 'failed') {
        // The code exists but never reached the chat, so say so instead of
        // showing a code screen that will never be filled in.
        setError(
          'Kod OTP tidak dapat dihantar ke Telegram. Buka bot dan tekan butang Kongsi nombor telefon, atau hubungi HR.',
        );
      }
      if (issued.needsTelegramLink) {
        // Not linked yet: the bot is where the number gets proven, and an HR admin
        // has to approve it before a code is sent. Opening the bot is the point of
        // this step, so it happens whether or not the deep link is available.
        setAwaitingApproval(true);
        try {
          const link = await api('/telegram/link-by-phone', TelegramLinkSchema, {
            method: 'POST',
            body: JSON.stringify({ phone: normalizedPhone }),
          });
          // The token in this URL is what pairs the chat with the phone number, so
          // opening the bare bot address instead would never complete the link.
          window.open(link.url, '_blank', 'noopener,noreferrer');
        } catch {
          window.open(TELEGRAM_BOT_URL, '_blank', 'noopener,noreferrer');
        }
      } else {
        setAwaitingApproval(false);
      }
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

      // Attendance needs a PIN and face verification is not available, so an
      // account without one cannot clock in. Ask for it now, while the person is
      // already proving who they are.
      const { hasPin } = await api('/auth/pin', PinStateSchema);
      if (hasPin) {
        signIn(user);
        return;
      }
      setPendingUser(user);
      setStage('pin');
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : 'Rangkaian tidak dapat dihubungi.');
    } finally {
      setBusy(false);
    }
  }

  async function submitPin(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    if (pin !== pinConfirm) {
      setError('PIN dan ulangannya tidak sama.');
      return;
    }
    setBusy(true);
    try {
      await api('/auth/pin', z.undefined(), {
        method: 'POST',
        body: JSON.stringify({ pin }),
      });
      if (pendingUser) signIn(pendingUser);
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : 'Rangkaian tidak dapat dihubungi.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="grid min-h-dvh bg-canvas lg:grid-cols-[minmax(22rem,0.9fr)_minmax(30rem,1.1fr)]">
      <section className="flex min-h-56 flex-col justify-between bg-ink px-6 py-6 text-white sm:px-10 sm:py-8 lg:min-h-dvh lg:p-10">
        <p className="text-xl font-black tracking-tight">
          <span className="text-accent">MR.</span> ABSORBER
          <span className="mt-1 block text-xs font-medium uppercase tracking-[0.2em] text-white/60">
            Melaka HR System
          </span>
        </p>

        <div className="hidden lg:block">
          <h1 className="max-w-md text-4xl font-black leading-tight">
            Pakar Absorber <span className="text-accent">Melaka Anda.</span>
          </h1>
          <p className="mt-4 max-w-sm text-sm leading-relaxed text-white/70">
            Sistem pengurusan HR bengkel Mr. Absorber. Efisien, cepat, dan mesra bengkel.
          </p>
        </div>

        <p className="text-xs text-white/50">Melaka Utama · Ayer Keroh</p>
      </section>

      <section className="flex items-start justify-center px-4 py-10 sm:px-8 sm:py-14 lg:items-center lg:px-12">
        <div className="w-full max-w-md">
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-ink-muted">
            {mode === 'register' ? 'Daftar Telegram' : 'Log masuk'}
          </p>
          <h2 className="mt-2 text-2xl font-bold">
            {mode === 'register' ? 'Pautkan akaun Telegram' : 'Selamat kembali'}
          </h2>
          <p className="mt-2 max-w-sm text-sm leading-relaxed text-ink-muted">
            {mode === 'register'
              ? 'Masukkan nombor telefon berdaftar, kemudian buka bot untuk pengesahan pertama.'
              : 'Gunakan nombor telefon anda untuk masuk ke sistem bengkel.'}
          </p>

          {stage === 'phone' ? (
            <form
              onSubmit={(event) => {
                void requestCode(event);
              }}
              className="mt-8 space-y-5"
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
                <p className="mt-2 text-xs text-ink-muted">
                  Untuk ujian:
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
              <a
                href={TELEGRAM_BOT_URL}
                target="_blank"
                rel="noreferrer"
                className="block w-full rounded-control border border-border-strong px-4 py-2.5 text-center text-sm font-semibold"
              >
                Buka bot Telegram
              </a>
            </form>
          ) : stage === 'pin' ? (
            <form
              onSubmit={(event) => {
                void submitPin(event);
              }}
              className="mt-8 space-y-5"
              noValidate
            >
              <p className="rounded-control border border-border-strong bg-surface px-3 py-3 text-sm leading-relaxed">
                Akaun anda belum ada PIN. PIN 6 digit ini digunakan untuk merekod kehadiran
                (clock-in / clock-out), jadi tetapkan sekarang.
              </p>
              <div>
                <label htmlFor="pin" className="block text-sm font-medium">
                  PIN baharu (6 digit)
                </label>
                <input
                  id="pin"
                  name="pin"
                  type="password"
                  inputMode="numeric"
                  autoComplete="new-password"
                  pattern="[0-9]{6}"
                  maxLength={6}
                  required
                  value={pin}
                  onChange={(event) => setPin(event.target.value)}
                  className={`${fieldClass} tabular text-center text-lg tracking-[0.4em]`}
                />
              </div>
              <div>
                <label htmlFor="pin-confirm" className="block text-sm font-medium">
                  Ulang PIN
                </label>
                <input
                  id="pin-confirm"
                  name="pin-confirm"
                  type="password"
                  inputMode="numeric"
                  autoComplete="new-password"
                  pattern="[0-9]{6}"
                  maxLength={6}
                  required
                  value={pinConfirm}
                  onChange={(event) => setPinConfirm(event.target.value)}
                  className={`${fieldClass} tabular text-center text-lg tracking-[0.4em]`}
                />
                <p className="mt-2 text-xs text-ink-muted">
                  Elakkan PIN mudah seperti 123456 atau 111111.
                </p>
              </div>
              <button type="submit" disabled={busy} className={submitClass}>
                {busy ? 'Menyimpan…' : 'Simpan PIN & Masuk'}
              </button>
            </form>
          ) : (
            <form
              onSubmit={(event) => {
                void submitCode(event);
              }}
              className="mt-8 space-y-5"
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

              {awaitingApproval ? (
                <p
                  role="status"
                  className="rounded-control border border-border-strong bg-surface px-3 py-3 text-sm leading-relaxed"
                >
                  <strong>Langkah seterusnya dalam Telegram:</strong> tekan{' '}
                  <em>Kongsi nombor telefon</em>, kemudian tunggu kelulusan admin HR. Kod OTP akan
                  sampai di chat bot.
                </p>
              ) : null}

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
            {mode === 'register' ? (
              <>
                Sudah dipautkan?{' '}
                <Link to="/login" className="font-medium text-ink underline">
                  Log masuk
                </Link>
                .
              </>
            ) : (
              <>
                Belum pernah daftar Telegram?{' '}
                <Link to="/register" className="font-medium text-ink underline">
                  Daftar di sini
                </Link>
                .
              </>
            )}
          </p>
        </div>
      </section>
    </div>
  );
}
