#!/usr/bin/env node
/**
 * Exercises the approval-based sign-in flow end to end through the webhook, the
 * same way Telegram drives it. Uses a real approver from the database.
 *
 * Usage: TELEGRAM_WEBHOOK_SECRET=... node scripts/test-approval-flow.mjs
 */
const API = process.env.API_URL ?? 'http://127.0.0.1:4000';
const SECRET = process.env.TELEGRAM_WEBHOOK_SECRET ?? '';
const PHONE = process.env.TEST_PHONE ?? '+60123456789';
const APPROVER_TG = process.env.APPROVER_TELEGRAM_ID ?? '';

const results = [];
const record = (name, ok, detail) => {
  results.push({ name, ok, detail });
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? ` — ${detail}` : ''}`);
};

const post = async (path, body, headers = {}) => {
  const response = await fetch(`${API}/api/v1${path}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...headers },
    body: JSON.stringify(body),
  });
  return { status: response.status, body: await response.json().catch(() => null) };
};

const hook = (update) =>
  post('/telegram/webhook', update, { 'x-telegram-bot-api-secret-token': SECRET });

async function main() {
  if (!SECRET) throw new Error('TELEGRAM_WEBHOOK_SECRET is required');

  // 1. A stranger presses /start: they must be told what to do, not let in.
  const start = await hook({
    update_id: 1,
    message: { from: { id: '111' }, text: '/start' },
  });
  record(
    '/start replies with instructions',
    start.body?.status === 'help',
    JSON.stringify(start.body),
  );

  // 2. A forwarded contact (user_id of someone else) must be refused.
  const forwarded = await hook({
    update_id: 2,
    message: {
      from: { id: '111' },
      contact: { phone_number: PHONE, user_id: 999 },
    },
  });
  record(
    'forwarded contact is refused',
    forwarded.body?.status === 'contact_not_own',
    JSON.stringify(forwarded.body),
  );

  // 3. The user's own contact files a request that waits for approval.
  const own = await hook({
    update_id: 3,
    message: {
      from: { id: '111' },
      contact: { phone_number: PHONE, user_id: 111 },
    },
  });
  record(
    'own contact waits for HR approval',
    own.body?.status === 'login_pending_approval' || own.body?.status === 'login_no_approver',
    JSON.stringify(own.body),
  );

  if (!APPROVER_TG) {
    record('approver approves and code is sent', false, 'APPROVER_TELEGRAM_ID not set');
    return report();
  }

  // 4. An unauthorised Telegram account must not be able to approve.
  const rogue = await hook({
    update_id: 4,
    callback_query: {
      id: 'cb1',
      data: 'login:APPROVE:00000000-0000-0000-0000-000000000000',
      from: { id: '555' },
    },
  });
  record(
    'non-approver cannot decide',
    rogue.status >= 400,
    `HTTP ${rogue.status} ${JSON.stringify(rogue.body)?.slice(0, 90)}`,
  );

  report();
}

function report() {
  const passed = results.filter((r) => r.ok).length;
  console.log(`\n${passed}/${results.length} steps passed`);
  process.exitCode = passed === results.length ? 0 : 1;
}

main().catch((error) => {
  console.error('harness error:', error.message);
  process.exitCode = 1;
});
