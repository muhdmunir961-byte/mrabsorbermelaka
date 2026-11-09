#!/usr/bin/env node
/**
 * Exercises the login and register flow against a running API and prints a
 * PASS/FAIL report for each step. It reads no secrets: the bot token is only
 * used through the API, and the webhook secret comes from the environment the
 * caller supplies.
 *
 * Usage:
 *   node scripts/test-telegram-flow.mjs [--phone +60123456789] [--api http://127.0.0.1:4000]
 *
 * Exit codes: 0 all steps passed, 1 a step failed, 2 configuration missing.
 */

const args = process.argv.slice(2);
const readArg = (name, fallback) => {
  const index = args.indexOf(name);
  return index >= 0 && args[index + 1] ? args[index + 1] : fallback;
};

const API = readArg('--api', process.env.API_URL ?? 'http://127.0.0.1:4000');
const PHONE = readArg('--phone', '+60123456789');
const WEBHOOK_SECRET = process.env.TELEGRAM_WEBHOOK_SECRET ?? '';

const results = [];
let failed = false;

function record(name, ok, detail) {
  results.push({ name, ok, detail });
  if (!ok) failed = true;
}

async function call(method, path, body, headers = {}) {
  const response = await fetch(`${API}/api/v1${path}`, {
    method,
    headers: { 'content-type': 'application/json', ...headers },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await response.text();
  let json;
  try {
    json = JSON.parse(text);
  } catch {
    json = text;
  }
  return { status: response.status, body: json };
}

const mask = (value) =>
  typeof value === 'string' && value.length > 8 ? `${value.slice(0, 4)}…${value.slice(-4)}` : value;

async function main() {
  console.log(`API   : ${API}`);
  console.log(`Phone : ${PHONE}\n`);

  // --- health ---
  const health = await fetch(`${API}/health`).catch(() => null);
  record('API reachable', health?.ok === true, health ? `HTTP ${health.status}` : 'no response');
  if (!health?.ok) return report();

  // --- 1. login: request an OTP ---
  const requested = await call('POST', '/auth/otp/request', { phone: PHONE });
  const devCode = requested.body?.devCode;
  record(
    'login: OTP requested',
    requested.status === 202,
    `HTTP ${requested.status}, needsTelegramLink=${requested.body?.needsTelegramLink ?? false}` +
      (devCode ? ', devCode=' + mask(devCode) : ' (no devCode: check OTP_EXPOSE_DEV_CODE)'),
  );

  // --- 2. register: create the Telegram deep link ---
  const link = await call('POST', '/telegram/link-by-phone', { phone: PHONE });
  const linkOk = link.status === 201 || link.status === 200;
  record(
    'register: Telegram deep link issued',
    linkOk,
    linkOk
      ? `HTTP ${link.status}, url=${link.body?.url ? 'https://t.me/…?start=<token>' : 'missing'}`
      : `HTTP ${link.status} ${JSON.stringify(link.body)}`,
  );

  // --- 3. register: the /start token must resolve to the employee ---
  const token = typeof link.body?.url === 'string' ? link.body.url.split('start=')[1] : undefined;
  if (!token) {
    record('register: /start token consumed', false, 'no token in the issued link');
  } else if (!WEBHOOK_SECRET) {
    record(
      'register: /start token consumed',
      false,
      'TELEGRAM_WEBHOOK_SECRET is not set in this shell; cannot post a webhook update',
    );
  } else {
    // This is the exact update Telegram sends when the user presses the link.
    const update = await call(
      'POST',
      '/telegram/webhook',
      {
        update_id: 1,
        message: { from: { id: '999000111' }, text: `/start ${token}` },
      },
      { 'x-telegram-bot-api-secret-token': WEBHOOK_SECRET },
    );
    // 'linked_without_code' means the pairing was saved but Telegram refused the
    // OTP message (a fake chat id in this harness). That is still a saved link.
    const status = update.body?.status;
    const linked = status === 'linked' || status === 'linked_without_code';
    record(
      'register: /start token consumed',
      linked,
      `HTTP ${update.status} status=${status ?? JSON.stringify(update.body)}`,
    );
  }

  // --- 4. login: verify the OTP ---
  // Linking mints a new code, so ask for one now instead of reusing the code
  // from step 1, which the link has already replaced.
  const fresh = await call('POST', '/auth/otp/request', { phone: PHONE });
  const freshCode = fresh.body?.devCode;
  if (!freshCode) {
    record(
      'login: OTP verified',
      false,
      `HTTP ${fresh.status}, no devCode returned (check OTP_EXPOSE_DEV_CODE)`,
    );
  } else {
    const verified = await call('POST', '/auth/otp/verify', { phone: PHONE, code: freshCode });
    record(
      'login: OTP verified',
      verified.status === 200,
      `HTTP ${verified.status}` + (verified.body?.role ? `, role=${verified.body.role}` : ''),
    );
  }

  report();
}

function report() {
  console.log('');
  for (const { name, ok, detail } of results) {
    console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? ` — ${detail}` : ''}`);
  }
  const passed = results.filter((r) => r.ok).length;
  console.log(`\n${passed}/${results.length} steps passed`);
  process.exitCode = failed ? 1 : 0;
}

main().catch((error) => {
  console.error('harness error:', error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
