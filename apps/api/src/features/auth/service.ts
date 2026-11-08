import { randomInt, timingSafeEqual } from 'node:crypto';
import { prisma } from '../../db.js';
import { env } from '../../env.js';
import { unauthenticated } from '../../errors.js';
import type { SessionUser } from '../../auth/session.js';
import { sendOtpToTelegram } from '../telegram/service.js';

const CODE_TTL_MS = 5 * 60 * 1000;
const MAX_ATTEMPTS = 5;

interface Challenge {
  code: string;
  expiresAt: number;
  attempts: number;
}

/**
 * Development stand-in for an SMS gateway. A real deployment swaps this map for
 * a provider call plus a persistent store; the rest of the flow stays identical.
 */
const challenges = new Map<string, Challenge>();

export interface OtpIssued {
  challengeExpiresAt: string;
  /** Only present outside production, so the flow is testable without an SMS provider. */
  devCode?: string;
}

/**
 * Returning the code is a development convenience that is catastrophic in
 * production. It is therefore gated on an explicit allow flag, not on NODE_ENV
 * alone: a deployment that forgets to set NODE_ENV stays closed rather than open.
 */
const exposeDevCode = env.NODE_ENV === 'development' && env.OTP_EXPOSE_DEV_CODE;

export async function requestOtp(phone: string): Promise<OtpIssued> {
  const code = String(randomInt(0, 1_000_000)).padStart(6, '0');
  const expiresAt = Date.now() + CODE_TTL_MS;
  challenges.set(phone, { code, expiresAt, attempts: 0 });

  // The result is deliberately ignored: a caller must not learn whether a number
  // belongs to a staff member.
  const employee = await prisma.employee
    .findUnique({ where: { phone }, select: { id: true, telegramUserId: true } })
    .catch(() => null);

  if (employee?.telegramUserId) {
    await sendOtpToTelegram(employee.telegramUserId, code);
  }

  const issued: OtpIssued = { challengeExpiresAt: new Date(expiresAt).toISOString() };
  if (exposeDevCode) {
    issued.devCode = code;
  }
  return issued;
}

function codesMatch(expected: string, provided: string): boolean {
  const a = Buffer.from(expected);
  const b = Buffer.from(provided);
  return a.length === b.length && timingSafeEqual(a, b);
}

export async function verifyOtp(phone: string, code: string): Promise<SessionUser> {
  const challenge = challenges.get(phone);

  if (!challenge || challenge.expiresAt <= Date.now()) {
    challenges.delete(phone);
    throw unauthenticated('That code is no longer valid. Request a new one.');
  }

  challenge.attempts += 1;
  if (challenge.attempts > MAX_ATTEMPTS) {
    challenges.delete(phone);
    throw unauthenticated('Too many attempts. Request a new code.');
  }

  if (!codesMatch(challenge.code, code)) {
    throw unauthenticated('That code is not valid');
  }

  const employee = await prisma.employee.findUnique({
    where: { phone },
    select: { id: true, fullName: true, role: true, status: true },
  });

  if (!employee || employee.status !== 'ACTIVE') {
    challenges.delete(phone);
    throw unauthenticated('That code is not valid');
  }

  challenges.delete(phone);

  return {
    employeeId: employee.id,
    role: employee.role,
    fullName: employee.fullName,
    expiresAt: Math.floor(Date.now() / 1000) + 12 * 60 * 60,
  };
}
