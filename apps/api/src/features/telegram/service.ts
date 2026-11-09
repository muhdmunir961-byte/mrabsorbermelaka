import { createHash, randomBytes } from 'node:crypto';
import { z } from 'zod';
import { prisma } from '../../db.js';
import { env } from '../../env.js';
import { conflict, notFound } from '../../errors.js';
import { requestOtp } from '../auth/service.js';

const TOKEN_TTL_MS = 10 * 60 * 1000;

/**
 * Telegram is optional: a deployment can run without a bot. When it is missing
 * this is a configuration state the client can explain, not a server fault, so
 * it is raised as a conflict rather than an unhandled 500.
 */
function requireTelegramConfig(): { username: string; secret: string } {
  if (!env.TELEGRAM_BOT_USERNAME || !env.TELEGRAM_WEBHOOK_SECRET) {
    throw conflict('Telegram belum dikonfigurasi pada pelayan ini.');
  }
  return { username: env.TELEGRAM_BOT_USERNAME, secret: env.TELEGRAM_WEBHOOK_SECRET };
}

function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

interface LinkTokenRow {
  employeeId: string | null;
  phone: string;
  usedAt: Date | null;
  expiresAt: Date;
}

/**
 * A token created for a phone-only first login has no employeeId yet; the /start
 * link is the one the login page hands out, so it is resolved from the phone
 * number instead of being rejected. Extracted so the rule is testable without a
 * database.
 */
export function linkTokenStatus(
  row: LinkTokenRow | null,
  now: Date,
): 'unusable' | 'phone' | 'employee' {
  if (!row || row.usedAt || row.expiresAt <= now) return 'unusable';
  return row.employeeId ? 'employee' : 'phone';
}

export async function createTelegramLink(
  employeeId: string,
): Promise<{ url: string; expiresAt: string }> {
  const { username } = requireTelegramConfig();
  if (!env.TELEGRAM_BOT_TOKEN) throw conflict('Telegram belum dikonfigurasi pada pelayan ini.');

  const employee = await prisma.employee.findUnique({
    where: { id: employeeId },
    select: { id: true },
  });
  if (!employee) throw notFound('That employee does not exist');

  await prisma.telegramLinkToken.deleteMany({ where: { employeeId, usedAt: null } });
  const token = randomBytes(32).toString('base64url');
  const expiresAt = new Date(Date.now() + TOKEN_TTL_MS);
  await prisma.telegramLinkToken.create({
    data: { tokenHash: hashToken(token), employeeId, phone: '', expiresAt },
  });

  return { url: `https://t.me/${username}?start=${token}`, expiresAt: expiresAt.toISOString() };
}

export async function createTelegramLinkForPhone(
  phone: string,
): Promise<{ url: string; expiresAt: string }> {
  const { username } = requireTelegramConfig();
  if (!env.TELEGRAM_BOT_TOKEN) throw conflict('Telegram belum dikonfigurasi pada pelayan ini.');
  const token = randomBytes(32).toString('base64url');
  const expiresAt = new Date(Date.now() + TOKEN_TTL_MS);
  await prisma.telegramLinkToken.create({
    data: { tokenHash: hashToken(token), phone, expiresAt },
  });
  return { url: `https://t.me/${username}?start=${token}`, expiresAt: expiresAt.toISOString() };
}

export async function linkContactAndSendOtp(phone: string, telegramUserId: string): Promise<void> {
  const employee = await prisma.employee.findUnique({
    where: { phone },
    select: { id: true, telegramUserId: true },
  });
  if (!employee) throw notFound('Nombor telefon ini belum didaftarkan HR.');
  if (employee.telegramUserId && employee.telegramUserId !== telegramUserId) {
    throw conflict('Akaun Telegram untuk nombor ini sudah dipautkan.');
  }
  await prisma.employee.update({ where: { id: employee.id }, data: { telegramUserId } });
  await requestOtp(phone);
}

/**
 * Returns the employee's name for a phone number, or null when the number is not
 * registered. Approvers need the name to judge the request; the caller decides how
 * much of it to show.
 */
export async function findEmployeeNameByPhone(phone: string): Promise<string | null> {
  const employee = await prisma.employee.findUnique({
    where: { phone },
    select: { fullName: true },
  });
  return employee?.fullName ?? null;
}

/**
 * Records that a phone number wants to sign in through the bot, so an
 * administrator can approve or refuse it. Repeating the request reuses the
 * pending row instead of piling up duplicates an approver has to wade through.
 */
export async function requestTelegramLogin(
  phone: string,
  telegramUserId: string,
): Promise<{ id: string; employeeId: string | null }> {
  const employee = await prisma.employee.findUnique({
    where: { phone },
    select: { id: true, telegramUserId: true },
  });

  // Someone else already owns this number; refuse without revealing which account
  // it belongs to.
  if (employee?.telegramUserId && employee.telegramUserId !== telegramUserId) {
    throw conflict('Nombor ini sudah dipautkan dengan akaun Telegram lain.');
  }

  const existing = await prisma.telegramLoginRequest.findFirst({
    where: { telegramUserId, phone, status: 'PENDING' },
    select: { id: true, employeeId: true },
  });
  if (existing) return existing;

  const created = await prisma.telegramLoginRequest.create({
    data: { telegramUserId, phone, employeeId: employee?.id ?? null },
    select: { id: true, employeeId: true },
  });
  return created;
}

/**
 * Whether a Telegram account may decide a sign-in request. Two routes qualify:
 * an employee record with an administrative role that has linked its Telegram, or
 * an id named in TELEGRAM_APPROVER_IDS. The second exists because the monitoring
 * group is invitation-linked, so being in the group proves nothing on its own.
 */
export function isApproverTelegramId(telegramUserId: string): boolean {
  return env.TELEGRAM_APPROVER_IDS.includes(telegramUserId);
}

/** Pure so the rule can be tested without the database or the environment. */
export function canApprove(
  telegramUserId: string,
  linkedAdmin: boolean,
  allowList: readonly string[],
): boolean {
  return linkedAdmin || allowList.includes(telegramUserId);
}

function assertCanApprove(telegramUserId: string, linkedAdmin: boolean): void {
  if (!canApprove(telegramUserId, linkedAdmin, env.TELEGRAM_APPROVER_IDS)) {
    throw conflict('Telegram anda bukan approver yang sah.');
  }
}

/**
 * Sends the pending request to every approver with a callback button. Approvers
 * are ADMIN_HR/OWNER accounts that are both active and reachable on Telegram.
 */
export async function notifyLoginApprovers(
  requestId: string,
  phone: string,
  fullName: string | null,
): Promise<{ approvers: number; delivered: number }> {
  const approvers = await prisma.employee.findMany({
    where: { role: { in: ['ADMIN_HR', 'OWNER'] }, status: 'ACTIVE', telegramUserId: { not: null } },
    select: { telegramUserId: true },
  });

  const targets = [
    ...new Set([
      // The shared approval group, when configured.
      ...(env.TELEGRAM_APPROVAL_CHAT_ID ? [env.TELEGRAM_APPROVAL_CHAT_ID] : []),
      // Every linked administrator, so a decision does not depend on one person
      // noticing the group.
      ...approvers.flatMap((row) => (row.telegramUserId ? [row.telegramUserId] : [])),
    ]),
  ];
  if (targets.length === 0) return { approvers: 0, delivered: 0 };

  const who = fullName ?? 'Nombor tidak berdaftar';
  const text = [
    'Permintaan masuk baharu',
    `Nama: ${who}`,
    `Telefon: ${phone}`,
    '',
    'Hanya admin yang disenaraikan boleh meluluskan, walaupun butang ini kelihatan kepada semua ahli group.',
  ].join('\n');

  const replyMarkup = {
    inline_keyboard: [
      [
        { text: 'Luluskan', callback_data: `login:APPROVE:${requestId}` },
        { text: 'Tolak', callback_data: `login:REJECT:${requestId}` },
      ],
    ],
  };

  const results = await Promise.allSettled(
    targets.map((chatId) => sendTelegramMessage(chatId, text, replyMarkup)),
  );
  return {
    approvers: targets.length,
    delivered: results.filter((r) => r.status === 'fulfilled').length,
  };
}

/**
 * Applies an approver's decision. On approval the pairing is written and the
 * one-time code is sent to the requester's chat, which is the only place the code
 * ever appears.
 */
export async function decideTelegramLogin(
  requestId: string,
  approverTelegramId: string,
  decision: 'APPROVE' | 'REJECT',
): Promise<{ status: 'approved' | 'rejected' | 'already_decided'; codeSent: boolean }> {
  const approver = await prisma.employee.findFirst({
    where: {
      telegramUserId: approverTelegramId,
      status: 'ACTIVE',
      role: { in: ['ADMIN_HR', 'OWNER'] },
    },
    select: { id: true },
  });

  // A group member is not automatically an administrator: the group is joined by
  // invitation link, so the allow list is what makes a decision legitimate.
  assertCanApprove(approverTelegramId, approver !== null);

  const request = await prisma.telegramLoginRequest.findUnique({
    where: { id: requestId },
    select: { id: true, status: true, phone: true, telegramUserId: true, employeeId: true },
  });
  if (!request) throw notFound('Permintaan masuk itu tidak wujud.');
  if (request.status !== 'PENDING') return { status: 'already_decided', codeSent: false };

  // An allow-listed approver has no employee row, so the column stays null rather
  // than blocking a legitimate decision.
  const decidedById = approver?.id ?? null;

  if (decision === 'REJECT') {
    await prisma.telegramLoginRequest.update({
      where: { id: request.id },
      data: { status: 'REJECTED', decidedById, decidedAt: new Date() },
    });
    return { status: 'rejected', codeSent: false };
  }

  const employee = await prisma.employee.findUnique({
    where: { phone: request.phone },
    select: { id: true, telegramUserId: true },
  });
  if (!employee) throw notFound('Nombor telefon ini belum didaftarkan HR.');

  await prisma.$transaction([
    prisma.employee.update({
      where: { id: employee.id },
      data: { telegramUserId: request.telegramUserId },
    }),
    prisma.telegramLoginRequest.update({
      where: { id: request.id },
      data: {
        status: 'APPROVED',
        employeeId: employee.id,
        decidedById,
        decidedAt: new Date(),
      },
    }),
  ]);

  const issued = await requestOtp(request.phone);
  return { status: 'approved', codeSent: issued.telegramDelivery === 'sent' };
}

export async function consumeFirstLoginLink(phone: string, telegramUserId: string): Promise<void> {
  const row = await prisma.telegramLinkToken.findFirst({
    where: { phone, usedAt: null, expiresAt: { gt: new Date() } },
    orderBy: { createdAt: 'desc' },
  });
  const employee = await prisma.employee.findUnique({
    where: { phone },
    select: { id: true, telegramUserId: true },
  });
  if (!employee) throw notFound('Nombor telefon ini belum didaftarkan HR.');
  if (employee.telegramUserId && employee.telegramUserId !== telegramUserId) {
    throw conflict('Akaun Telegram untuk nombor ini sudah dipautkan.');
  }
  if (!row) {
    await prisma.employee.update({ where: { id: employee.id }, data: { telegramUserId } });
    await requestOtp(phone);
    return;
  }
  await prisma.$transaction([
    prisma.employee.update({ where: { id: employee.id }, data: { telegramUserId } }),
    prisma.telegramLinkToken.update({
      where: { id: row.id },
      data: { employeeId: employee.id, usedAt: new Date() },
    }),
  ]);
  await requestOtp(phone);
}

export async function consumeTelegramLink(
  token: string,
  telegramUserId: string,
): Promise<{ otpSent: boolean }> {
  const row = await prisma.telegramLinkToken.findUnique({ where: { tokenHash: hashToken(token) } });
  const status = linkTokenStatus(row, new Date());
  if (status === 'unusable' || !row) throw conflict('Pautan Telegram sudah tidak sah.');

  let employeeId = row.employeeId;
  if (status === 'phone') {
    const employee = await prisma.employee.findUnique({
      where: { phone: row.phone },
      select: { id: true },
    });
    if (!employee) throw notFound('Nombor telefon ini belum didaftarkan HR.');
    employeeId = employee.id;
  }
  if (!employeeId) throw conflict('Pautan Telegram sudah tidak sah.');

  const existing = await prisma.employee.findFirst({
    where: { telegramUserId, NOT: { id: employeeId } },
    select: { id: true },
  });
  if (existing) throw conflict('Akaun Telegram ini sudah dipautkan kepada pekerja lain.');

  await prisma.$transaction([
    prisma.employee.update({ where: { id: employeeId }, data: { telegramUserId } }),
    prisma.telegramLinkToken.update({
      where: { id: row.id },
      data: { employeeId, usedAt: new Date() },
    }),
  ]);

  // The pairing above is already committed, so a delivery failure must not become
  // a 500: Telegram would retry the update and hit a spent token. requestOtp
  // reports whether the code actually reached the chat instead of throwing.
  const issued = await requestOtp(row.phone);
  return { otpSent: issued.telegramDelivery === 'sent' };
}

export function telegramWebhookSecret(): string {
  return requireTelegramConfig().secret;
}

/**
 * Returns whether the webhook was actually registered. A deployment without
 * Telegram configured is not an error, but it must not be logged as success:
 * "registered" and "skipped because nothing is configured" are different states
 * and only one of them means the bot will receive updates.
 */
export async function registerTelegramWebhook(): Promise<'registered' | 'skipped'> {
  if (!env.TELEGRAM_BOT_TOKEN || !env.TELEGRAM_WEBHOOK_SECRET || !env.TELEGRAM_WEBHOOK_URL) {
    return 'skipped';
  }
  const response = await fetch(`https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}/setWebhook`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      url: env.TELEGRAM_WEBHOOK_URL,
      secret_token: env.TELEGRAM_WEBHOOK_SECRET,
      allowed_updates: ['message', 'callback_query'],
    }),
    signal: AbortSignal.timeout(10_000),
  });
  if (!response.ok) throw new Error(`Telegram setWebhook failed with ${response.status}`);
  return 'registered';
}

/**
 * What Telegram actually thinks the webhook is. A silent bot has several
 * possible causes and they look identical from the outside, so this asks
 * Telegram instead of guessing: a pending count that keeps rising means nothing
 * is being delivered, and last_error_message names the reason.
 */
const WebhookInfoResponse = z.object({
  ok: z.boolean(),
  result: z
    .object({
      url: z.string().default(''),
      pending_update_count: z.number().default(0),
      last_error_date: z.number().optional(),
      last_error_message: z.string().optional(),
    })
    .passthrough(),
});

export interface TelegramWebhookInfo {
  /** The URL Telegram currently posts updates to; empty means no webhook. */
  url: string;
  /** Updates Telegram has queued because delivery keeps failing. */
  pendingUpdateCount: number;
  lastErrorDate: string | null;
  lastErrorMessage: string | null;
  /** The URL this deployment is configured to register, for comparison. */
  configuredUrl: string | null;
  /** True only when Telegram's URL is exactly what this deployment registered. */
  matchesConfigured: boolean;
}

/** Pure so the mapping can be tested without calling Telegram. */
export function parseWebhookInfo(
  payload: unknown,
  configuredUrl: string | null,
): TelegramWebhookInfo {
  const parsed = WebhookInfoResponse.safeParse(payload);
  if (!parsed.success) throw conflict('Telegram returned an unexpected webhook response.');
  const { result } = parsed.data;
  return {
    url: result.url,
    pendingUpdateCount: result.pending_update_count,
    lastErrorDate: result.last_error_date
      ? new Date(result.last_error_date * 1000).toISOString()
      : null,
    lastErrorMessage: result.last_error_message ?? null,
    configuredUrl,
    matchesConfigured: configuredUrl !== null && configuredUrl === result.url,
  };
}

export async function getTelegramWebhookInfo(): Promise<TelegramWebhookInfo> {
  if (!env.TELEGRAM_BOT_TOKEN) throw conflict('Telegram belum dikonfigurasi pada pelayan ini.');
  const response = await fetch(
    `https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}/getWebhookInfo`,
    { signal: AbortSignal.timeout(10_000) },
  );
  if (!response.ok) {
    throw conflict(`Telegram getWebhookInfo failed with ${response.status}.`);
  }
  return parseWebhookInfo(await response.json(), env.TELEGRAM_WEBHOOK_URL ?? null);
}

export async function sendTelegramMessage(
  chatId: string,
  text: string,
  replyMarkup?: unknown,
): Promise<void> {
  if (!env.TELEGRAM_BOT_TOKEN) throw conflict('Telegram belum dikonfigurasi pada pelayan ini.');
  const response = await fetch(
    `https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}/sendMessage`,
    {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        chat_id: chatId,
        text,
        ...(replyMarkup ? { reply_markup: replyMarkup } : {}),
      }),
      signal: AbortSignal.timeout(10_000),
    },
  );
  if (!response.ok) throw new Error(`Telegram sendMessage failed with ${response.status}`);
}

export async function sendOtpToTelegram(telegramUserId: string, code: string): Promise<void> {
  await sendTelegramMessage(
    telegramUserId,
    `Kod masuk Mr. Absorber: ${code}\nKod ini tamat dalam 5 minit.`,
  );
}

/**
 * Notifications are best effort, and every caller fires them with `void`. An
 * error that escapes therefore becomes an unhandled rejection and takes the whole
 * API down — which is exactly what a bot that was not in the monitoring group
 * did on every clock-in. Loud, but never fatal.
 */
function reportFailure(context: string, error: unknown): void {
  const message = error instanceof Error ? error.message : String(error);
  console.warn(`[telegram] ${context} failed: ${message}`);
}

export async function notifyApprovalPersonal(text: string): Promise<void> {
  try {
    const approvers = await prisma.employee.findMany({
      where: {
        role: { in: ['ADMIN_HR', 'OWNER'] },
        status: 'ACTIVE',
        telegramUserId: { not: null },
      },
      select: { telegramUserId: true },
    });
    await Promise.allSettled(
      approvers.flatMap((row) =>
        row.telegramUserId ? [sendTelegramMessage(row.telegramUserId, text)] : [],
      ),
    );
  } catch (error) {
    reportFailure('personal approval notification', error);
  }
}

export async function notifyLeaveApprovalPersonal(requestId: string, text: string): Promise<void> {
  try {
    const approvers = await prisma.employee.findMany({
      where: {
        role: { in: ['ADMIN_HR', 'OWNER'] },
        status: 'ACTIVE',
        telegramUserId: { not: null },
      },
      select: { telegramUserId: true },
    });
    const replyMarkup = {
      inline_keyboard: [
        [
          { text: 'Lulus', callback_data: `leave:APPROVE:${requestId}` },
          { text: 'Tolak', callback_data: `leave:REJECT:${requestId}` },
        ],
      ],
    };
    await Promise.allSettled(
      approvers.flatMap((row) =>
        row.telegramUserId ? [sendTelegramMessage(row.telegramUserId, text, replyMarkup)] : [],
      ),
    );
  } catch (error) {
    reportFailure('leave approval notification', error);
  }
}

export async function decideTelegramLeave(
  telegramUserId: string,
  requestId: string,
  decision: 'APPROVE' | 'REJECT',
) {
  const approver = await prisma.employee.findFirst({
    where: { telegramUserId, status: 'ACTIVE', role: { in: ['ADMIN_HR', 'OWNER'] } },
    select: { id: true, role: true, fullName: true },
  });
  if (!approver) throw conflict('Telegram anda bukan approver yang sah.');
  const { decideRequest } = await import('../leave/service.js');
  return decideRequest(
    { employeeId: approver.id, role: approver.role, fullName: approver.fullName, expiresAt: 0 },
    requestId,
    { decision },
  );
}

export async function notifyMonitoringGroup(text: string): Promise<void> {
  if (!env.TELEGRAM_APPROVAL_CHAT_ID) return;
  try {
    await sendTelegramMessage(env.TELEGRAM_APPROVAL_CHAT_ID, text);
  } catch (error) {
    reportFailure('monitoring group notification', error);
  }
}
