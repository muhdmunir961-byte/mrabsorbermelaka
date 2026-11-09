import { createHmac, timingSafeEqual } from 'node:crypto';
import type { Role } from '@mr/shared';
import { env } from '../env.js';

export const SESSION_COOKIE = 'mr_session';
const MAX_AGE_SECONDS = 60 * 60 * 12;

export interface SessionUser {
  employeeId: string;
  role: Role;
  fullName: string;
  /** Unix seconds. */
  expiresAt: number;
}

const b64url = (input: Buffer | string): string => Buffer.from(input).toString('base64url');

function sign(payload: string): string {
  return createHmac('sha256', env.SESSION_SECRET).update(payload).digest('base64url');
}

export function encodeSession(user: Omit<SessionUser, 'expiresAt'>): string {
  const payload: SessionUser = {
    ...user,
    expiresAt: Math.floor(Date.now() / 1000) + MAX_AGE_SECONDS,
  };
  const body = b64url(JSON.stringify(payload));
  return `${body}.${sign(body)}`;
}

/**
 * Verify a session token. Returns null for anything tampered with, malformed,
 * or expired — the caller treats all three the same way.
 */
export function decodeSession(token: string | undefined): SessionUser | null {
  if (!token) return null;
  const separator = token.lastIndexOf('.');
  if (separator <= 0) return null;

  const body = token.slice(0, separator);
  const provided = token.slice(separator + 1);
  const expected = sign(body);

  const a = Buffer.from(provided);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;

  try {
    const parsed: unknown = JSON.parse(Buffer.from(body, 'base64url').toString('utf8'));
    if (typeof parsed !== 'object' || parsed === null) return null;
    const candidate = parsed as Partial<SessionUser>;
    if (
      typeof candidate.employeeId !== 'string' ||
      typeof candidate.role !== 'string' ||
      typeof candidate.fullName !== 'string' ||
      typeof candidate.expiresAt !== 'number'
    ) {
      return null;
    }
    if (candidate.expiresAt * 1000 <= Date.now()) return null;
    return candidate as SessionUser;
  } catch {
    return null;
  }
}

export const sessionCookieOptions = {
  httpOnly: true,
  // The web app reaches the API through its own origin (nginx in the container,
  // a Pages worker on Cloudflare), so the cookie is always first-party and 'lax'
  // is enough. It is also the stricter choice: 'none' would send this cookie on
  // cross-site requests, which nothing here needs.
  sameSite: 'lax' as const,
  secure: env.NODE_ENV === 'production',
  path: '/',
  maxAge: MAX_AGE_SECONDS,
};
