import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { config as loadEnv } from 'dotenv';
import { z } from 'zod';

const here = dirname(fileURLToPath(import.meta.url));
// An explicit path wins, so a test can point at an empty env and prove that
// defaults do not silently enable development behaviour.
const envPath = process.env.DOTENV_CONFIG_PATH ?? resolve(here, '../.env');
loadEnv({ path: envPath, quiet: true });

/**
 * Names the variables that arrived, never their values. When a deployment fails
 * on configuration this is the difference between "something is wrong" and
 * "the container received none of them", which are different fixes.
 */
const TRACKED = [
  'NODE_ENV',
  'DATABASE_URL',
  'SESSION_SECRET',
  'FIELD_ENCRYPTION_KEY',
  'FIELD_INDEX_KEY',
  'CORS_ORIGIN',
  'API_HOST',
  'API_PORT',
  'UPLOAD_DIR',
] as const;

function describeEnvironment(): string {
  const present = TRACKED.filter((name) => (process.env[name] ?? '') !== '');
  const missing = TRACKED.filter((name) => (process.env[name] ?? '') === '');
  return [
    `received ${present.length}/${TRACKED.length} tracked variables`,
    present.length > 0 ? `present: ${present.join(', ')}` : 'present: none',
    missing.length > 0 ? `missing: ${missing.join(', ')}` : 'missing: none',
    `dotenv file: ${envPath}`,
  ].join(' | ');
}

const EnvSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  DATABASE_URL: z.string().min(1, 'DATABASE_URL is required'),
  API_PORT: z.coerce.number().int().min(1).max(65535).default(4000),
  API_HOST: z.string().default('127.0.0.1'),
  /** Signs the session cookie. Must be at least 32 characters. */
  SESSION_SECRET: z.string().min(32, 'SESSION_SECRET must be at least 32 characters'),
  /** Comma-separated list of allowed browser origins. */
  CORS_ORIGIN: z.string().default('http://localhost:5173'),
  /** 32-byte AES-256 key, base64. Encrypts the PII columns at rest. */
  FIELD_ENCRYPTION_KEY: z
    .string()
    .min(1, 'FIELD_ENCRYPTION_KEY is required')
    .refine((value) => Buffer.from(value, 'base64').length === 32, {
      message: 'FIELD_ENCRYPTION_KEY must decode to exactly 32 bytes',
    }),
  /** Separate key for the deterministic blind index used by equality lookups. */
  FIELD_INDEX_KEY: z.string().min(32, 'FIELD_INDEX_KEY must be at least 32 characters'),
  /** Root directory for uploaded documents. Created on first write. */
  UPLOAD_DIR: z.string().default('./var/uploads'),
  /** Directory holding the face-api model files. Resolved from this file, not cwd. */
  FACE_MODEL_DIR: z.string().default('model'),
  /** Absolute path to a system Chromium. Empty means use the bundled browser. */
  PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH: z.string().optional(),
  /** Maximum Euclidean distance still treated as the same person. */
  FACE_MATCH_THRESHOLD: z.coerce.number().min(0.3).max(0.8).default(0.45),
  /**
   * Return the OTP in the API response. This is an account takeover if it is ever
   * on in production, so it defaults to off everywhere and the guard below
   * refuses to start with it enabled outside development.
   */
  OTP_EXPOSE_DEV_CODE: z
    .enum(['true', 'false'])
    .default('false')
    .transform((value) => value === 'true'),
  TELEGRAM_BOT_TOKEN: z.string().min(1).optional(),
  TELEGRAM_BOT_USERNAME: z
    .string()
    .regex(/^[A-Za-z0-9_]{5,32}$/)
    .optional(),
  TELEGRAM_WEBHOOK_SECRET: z.string().min(32).optional(),
  TELEGRAM_WEBHOOK_URL: z.string().url().optional(),
  TELEGRAM_APPROVAL_CHAT_ID: z
    .string()
    .regex(/^-?\d+$/)
    .optional(),
});

const parsed = EnvSchema.safeParse(process.env);

if (!parsed.success) {
  const problems = parsed.error.issues
    .map((issue) => `  - ${issue.path.join('.') || '(root)'}: ${issue.message}`)
    .join('\n');
  throw new Error(`Invalid environment configuration:\n${problems}\n${describeEnvironment()}`);
}

/**
 * Cross-field guards. A misconfigured deployment must fail at startup rather than
 * run in a state that hands out login codes or trusts a placeholder secret.
 */
if (parsed.data.NODE_ENV === 'production') {
  if (parsed.data.OTP_EXPOSE_DEV_CODE) {
    throw new Error(
      'OTP_EXPOSE_DEV_CODE must be false in production: it returns the login code in the response.',
    );
  }
  if (parsed.data.NODE_ENV === 'production' && parsed.data.SESSION_SECRET.includes('dev-only')) {
    throw new Error('SESSION_SECRET still holds the development placeholder.');
  }
  // A split deployment puts the web app on another origin, so the session cookie
  // becomes cross-site. Browsers refuse SameSite=None without Secure, and Secure
  // requires https, which is why this is a startup check rather than a comment.
  for (const origin of parsed.data.CORS_ORIGIN.split(',')) {
    const trimmed = origin.trim();
    if (
      trimmed !== '' &&
      !trimmed.startsWith('https://') &&
      !trimmed.startsWith('http://localhost') &&
      !trimmed.startsWith('http://127.0.0.1')
    ) {
      throw new Error(`CORS_ORIGIN must use https (got ${trimmed}).`);
    }
  }
}

export const env = parsed.data;
export type Env = typeof env;

export const allowedOrigins = env.CORS_ORIGIN.split(',')
  .map((origin) => origin.trim())
  .filter(Boolean);
