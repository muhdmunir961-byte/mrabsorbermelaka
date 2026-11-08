import { createHash, randomBytes } from 'node:crypto';
import { prisma } from '../../db.js';
import { env } from '../../env.js';
import { conflict, notFound } from '../../errors.js';
import { requestOtp } from '../auth/service.js';

const TOKEN_TTL_MS = 10 * 60 * 1000;

function requireTelegramConfig(): { username: string; secret: string } {
  if (!env.TELEGRAM_BOT_USERNAME || !env.TELEGRAM_WEBHOOK_SECRET) {
    throw new Error('Telegram verification is not configured');
  }
  return { username: env.TELEGRAM_BOT_USERNAME, secret: env.TELEGRAM_WEBHOOK_SECRET };
}

function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

export async function createTelegramLink(
  employeeId: string,
): Promise<{ url: string; expiresAt: string }> {
  const { username } = requireTelegramConfig();
  if (!env.TELEGRAM_BOT_TOKEN) throw new Error('Telegram bot token is not configured');

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
  if (!env.TELEGRAM_BOT_TOKEN) throw new Error('Telegram bot token is not configured');
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

export async function consumeTelegramLink(token: string, telegramUserId: string): Promise<void> {
  const row = await prisma.telegramLinkToken.findUnique({ where: { tokenHash: hashToken(token) } });
  if (!row || row.usedAt || row.expiresAt <= new Date())
    throw conflict('Pautan Telegram sudah tidak sah.');
  if (!row.employeeId) throw conflict('Pautan Telegram belum dipadankan dengan employee.');

  const existing = await prisma.employee.findFirst({
    where: { telegramUserId, NOT: { id: row.employeeId } },
    select: { id: true },
  });
  if (existing) throw conflict('Akaun Telegram ini sudah dipautkan kepada pekerja lain.');

  await prisma.$transaction([
    prisma.employee.update({ where: { id: row.employeeId }, data: { telegramUserId } }),
    prisma.telegramLinkToken.update({ where: { id: row.id }, data: { usedAt: new Date() } }),
  ]);
}

export function telegramWebhookSecret(): string {
  return requireTelegramConfig().secret;
}

export async function registerTelegramWebhook(): Promise<void> {
  if (!env.TELEGRAM_BOT_TOKEN || !env.TELEGRAM_WEBHOOK_SECRET || !env.TELEGRAM_WEBHOOK_URL) {
    return;
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
}

export async function sendTelegramMessage(
  chatId: string,
  text: string,
  replyMarkup?: unknown,
): Promise<void> {
  if (!env.TELEGRAM_BOT_TOKEN) throw new Error('Telegram bot token is not configured');
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

export async function notifyApprovalPersonal(text: string): Promise<void> {
  const approvers = await prisma.employee.findMany({
    where: { role: { in: ['ADMIN_HR', 'OWNER'] }, status: 'ACTIVE', telegramUserId: { not: null } },
    select: { telegramUserId: true },
  });
  await Promise.allSettled(
    approvers.flatMap((row) =>
      row.telegramUserId ? [sendTelegramMessage(row.telegramUserId, text)] : [],
    ),
  );
}

export async function notifyLeaveApprovalPersonal(requestId: string, text: string): Promise<void> {
  const approvers = await prisma.employee.findMany({
    where: { role: { in: ['ADMIN_HR', 'OWNER'] }, status: 'ACTIVE', telegramUserId: { not: null } },
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
  if (env.TELEGRAM_APPROVAL_CHAT_ID) {
    await sendTelegramMessage(env.TELEGRAM_APPROVAL_CHAT_ID, text);
  }
}
