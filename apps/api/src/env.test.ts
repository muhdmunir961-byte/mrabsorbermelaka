import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';

const run = promisify(execFile);
const probe = fileURLToPath(new URL('./env-probe.ts', import.meta.url));

/**
 * The probe is run as a separate process because env.ts reads process.env once at
 * import time. Each case therefore gets a clean environment.
 */
async function probeWith(extra: Record<string, string>): Promise<string> {
  try {
    const { stdout, stderr } = await run('node', ['--import', 'tsx', probe], {
      env: {
        PATH: process.env.PATH,
        DATABASE_URL: 'postgresql://user@localhost/db',
        SESSION_SECRET: 'a-secret-that-is-long-enough-for-the-schema-32',
        FIELD_ENCRYPTION_KEY: Buffer.alloc(32, 1).toString('base64'),
        FIELD_INDEX_KEY: 'an-index-key-that-is-at-least-32-characters',
        // The probe must not pick up apps/api/.env, which enables the dev code.
        DOTENV_CONFIG_PATH: '/nonexistent/.env',
        ...extra,
      },
      timeout: 30_000,
    });
    return `${stdout}${stderr}`.trim();
  } catch (error) {
    const failed = error as { stdout?: string; stderr?: string };
    return `${failed.stdout ?? ''}${failed.stderr ?? ''}`.trim();
  }
}

describe('production environment guards', () => {
  it('refuses to start when the OTP would be returned', async () => {
    const output = await probeWith({
      NODE_ENV: 'production',
      OTP_EXPOSE_DEV_CODE: 'true',
    });
    assert.match(output, /OTP_EXPOSE_DEV_CODE must be false in production/);
  });

  it('refuses to start with the development session secret', async () => {
    const output = await probeWith({
      NODE_ENV: 'production',
      OTP_EXPOSE_DEV_CODE: 'false',
      SESSION_SECRET: 'dev-only-not-a-real-secret-change-me-please-32+',
    });
    assert.match(output, /SESSION_SECRET still holds the development placeholder/);
  });

  it('starts with a sane production configuration', async () => {
    const output = await probeWith({
      NODE_ENV: 'production',
      OTP_EXPOSE_DEV_CODE: 'false',
    });
    assert.match(output, /ENV_OK nodeEnv=production devCode=false/);
  });

  it('keeps the OTP hidden by default outside production', async () => {
    const output = await probeWith({ NODE_ENV: 'test' });
    assert.match(output, /devCode=false/, 'the code must not be exposed unless asked for');
  });
});
