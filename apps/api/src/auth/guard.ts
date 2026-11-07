import type { FastifyRequest } from 'fastify';
import type { Role } from '@mr/shared';
import { forbidden, unauthenticated } from '../errors.js';
import { SESSION_COOKIE, decodeSession, type SessionUser } from './session.js';

/** Read and verify the session on every protected request. */
export function currentUser(request: FastifyRequest): SessionUser {
  const user = decodeSession(request.cookies[SESSION_COOKIE]);
  if (!user) throw unauthenticated();
  return user;
}

/** Deny by default: a handler that names no allowed role is reachable by any signed-in user. */
export function requireRole(request: FastifyRequest, allowed: readonly Role[]): SessionUser {
  const user = currentUser(request);
  if (!allowed.includes(user.role)) throw forbidden();
  return user;
}

export const ADMIN_ROLES: readonly Role[] = ['ADMIN_HR', 'OWNER'] as const;
export const OPERATIONS_ROLES: readonly Role[] = ['FOREMAN', 'ADMIN_HR', 'OWNER'] as const;
