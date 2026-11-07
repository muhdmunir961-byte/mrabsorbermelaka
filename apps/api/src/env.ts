import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { config as loadEnv } from 'dotenv';
import { z } from 'zod';

const here = dirname(fileURLToPath(import.meta.url));
loadEnv({ path: resolve(here, '../.env'), quiet: true });

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
});

const parsed = EnvSchema.safeParse(process.env);

if (!parsed.success) {
  const problems = parsed.error.issues
    .map((issue) => `  - ${issue.path.join('.') || '(root)'}: ${issue.message}`)
    .join('\n');
  throw new Error(`Invalid environment configuration:\n${problems}`);
}

export const env = parsed.data;
export type Env = typeof env;

export const allowedOrigins = env.CORS_ORIGIN.split(',')
  .map((origin) => origin.trim())
  .filter(Boolean);
