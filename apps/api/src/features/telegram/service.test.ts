import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { canApprove, linkTokenStatus, parseWebhookInfo } from './service.js';

const now = new Date('2026-11-08T10:00:00.000Z');
const tomorrow = new Date('2026-11-09T10:00:00.000Z');
const yesterday = new Date('2026-11-07T10:00:00.000Z');

describe('linkTokenStatus', () => {
  it('accepts the phone-only token the login page hands out', () => {
    // This is the token createTelegramLinkForPhone creates: no employeeId yet.
    const status = linkTokenStatus(
      { employeeId: null, phone: '+60123456789', usedAt: null, expiresAt: tomorrow },
      now,
    );
    assert.equal(status, 'phone');
  });

  it('accepts a token that is already matched to an employee', () => {
    const status = linkTokenStatus(
      { employeeId: 'emp-1', phone: '', usedAt: null, expiresAt: tomorrow },
      now,
    );
    assert.equal(status, 'employee');
  });

  it('rejects a missing token', () => {
    assert.equal(linkTokenStatus(null, now), 'unusable');
  });

  it('rejects an expired token', () => {
    const status = linkTokenStatus(
      { employeeId: null, phone: '+60123456789', usedAt: null, expiresAt: yesterday },
      now,
    );
    assert.equal(status, 'unusable');
  });

  it('treats the expiry instant itself as expired', () => {
    const status = linkTokenStatus(
      { employeeId: 'emp-1', phone: '', usedAt: null, expiresAt: now },
      now,
    );
    assert.equal(status, 'unusable');
  });

  it('rejects a token that was already used', () => {
    const status = linkTokenStatus(
      { employeeId: 'emp-1', phone: '', usedAt: now, expiresAt: tomorrow },
      now,
    );
    assert.equal(status, 'unusable');
  });
});

describe('parseWebhookInfo', () => {
  const url = 'https://api.example.test/api/v1/telegram/webhook';

  it('reports a healthy webhook that matches this deployment', () => {
    const info = parseWebhookInfo({ ok: true, result: { url, pending_update_count: 0 } }, url);
    assert.equal(info.matchesConfigured, true);
    assert.equal(info.pendingUpdateCount, 0);
    assert.equal(info.lastErrorMessage, null);
    assert.equal(info.lastErrorDate, null);
  });

  it('flags an empty webhook url, which is why a bot never answers', () => {
    // This is the shape Telegram returns when setWebhook was never called.
    const info = parseWebhookInfo({ ok: true, result: { url: '', pending_update_count: 4 } }, url);
    assert.equal(info.url, '');
    assert.equal(info.matchesConfigured, false);
    assert.equal(info.pendingUpdateCount, 4);
  });

  it('flags a webhook that points somewhere else', () => {
    const info = parseWebhookInfo(
      { ok: true, result: { url: 'https://old.example.test/hook', pending_update_count: 2 } },
      url,
    );
    assert.equal(info.matchesConfigured, false);
  });

  it('surfaces the delivery error Telegram recorded', () => {
    const info = parseWebhookInfo(
      {
        ok: true,
        result: {
          url,
          pending_update_count: 7,
          last_error_date: 1_790_000_000,
          last_error_message: 'Wrong response from the webhook: 401 Unauthorized',
        },
      },
      url,
    );
    assert.equal(info.pendingUpdateCount, 7);
    assert.equal(info.lastErrorMessage, 'Wrong response from the webhook: 401 Unauthorized');
    assert.equal(info.lastErrorDate, new Date(1_790_000_000 * 1000).toISOString());
  });

  it('reports no configured url when the deployment has none', () => {
    const info = parseWebhookInfo({ ok: true, result: { url, pending_update_count: 0 } }, null);
    assert.equal(info.configuredUrl, null);
    assert.equal(info.matchesConfigured, false);
  });

  it('rejects a payload that is not a Telegram response', () => {
    assert.throws(() => parseWebhookInfo({ detail: 'nope' }, url), /unexpected webhook response/);
  });
});

describe('canApprove', () => {
  const allowList = ['111', '222'];

  it('lets a linked administrator decide without being listed', () => {
    assert.equal(canApprove('999', true, allowList), true);
  });

  it('lets an allow-listed id decide even without an employee record', () => {
    // This is the group-approval case: the person is not in Employee at all.
    assert.equal(canApprove('111', false, allowList), true);
  });

  it('refuses an ordinary group member', () => {
    // Joining the invitation link must not be enough to approve a sign-in.
    assert.equal(canApprove('333', false, allowList), false);
  });

  it('refuses everyone when the allow list is empty and nobody is linked', () => {
    assert.equal(canApprove('111', false, []), false);
  });
});
