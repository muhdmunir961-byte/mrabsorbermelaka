import { randomUUID } from 'node:crypto';
import Fastify, { type FastifyError, type FastifyInstance } from 'fastify';
import cookie from '@fastify/cookie';
import cors from '@fastify/cors';
import helmet from '@fastify/helmet';
import rateLimit from '@fastify/rate-limit';
import { ZodError } from 'zod';
import type { ApiErrorBody } from '@mr/shared';
import { allowedOrigins, env } from './env.js';
import { AppError } from './errors.js';
import { prisma } from './db.js';
import { toErrorDetails } from './validate.js';
import { analyticsRoutes } from './features/analytics/routes.js';
import { authRoutes } from './features/auth/routes.js';
import { documentRoutes } from './features/documents/routes.js';
import { faceRoutes } from './features/face/routes.js';
import { attendanceRoutes } from './features/attendance/routes.js';
import { employeeRoutes } from './features/employees/routes.js';
import { jobRoutes } from './features/jobs/routes.js';
import { leaveRoutes } from './features/leave/routes.js';
import { payrollRoutes } from './features/payroll/routes.js';
import { telegramRoutes } from './features/telegram/routes.js';

function errorBody(
  code: ApiErrorBody['error']['code'],
  message: string,
  correlationId: string,
  details?: { path: string; message: string }[],
): ApiErrorBody {
  return {
    error: { code, message, correlationId, ...(details ? { details } : {}) },
  };
}

export async function buildApp(): Promise<FastifyInstance> {
  const app = Fastify({
    genReqId: () => randomUUID(),
    logger: { level: env.NODE_ENV === 'development' ? 'info' : 'warn' },
    // The API always sits behind a proxy (Coolify's router, Cloudflare, or the
    // Pages worker). Without this, request.ip is the proxy's address and every
    // user shares one rate-limit bucket, so one person's OTP requests would lock
    // out everyone else.
    trustProxy: true,
    // Cookies and auth headers are the only trust inputs; keep the body limit small.
    bodyLimit: 256 * 1024,
  });

  // The API serves JSON, not documents, so the CSP here is strict rather than a
  // page policy: nothing may be framed, nothing may load, and the only accepted
  // source is the API itself. The web app ships its own CSP from Vite/Vercel.
  await app.register(helmet, {
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'none'"],
        frameAncestors: ["'none'"],
        baseUri: ["'none'"],
        formAction: ["'none'"],
      },
    },
    crossOriginResourcePolicy: { policy: 'same-site' },
    referrerPolicy: { policy: 'no-referrer' },
  });
  await app.register(cors, { origin: allowedOrigins, credentials: true });
  await app.register(cookie, { secret: env.SESSION_SECRET });
  await app.register(rateLimit, { max: 120, timeWindow: '1 minute' });

  // Documents arrive as a raw buffer, so only this route needs a larger limit and
  // a buffer parser. Everything else stays JSON at 256 KB.
  app.addContentTypeParser(
    ['image/jpeg', 'image/png', 'image/webp', 'application/pdf'],
    { parseAs: 'buffer', bodyLimit: 6 * 1024 * 1024 },
    (_request, body, done) => {
      done(null, body);
    },
  );

  /**
   * Liveness and readiness in one place, and honest about the difference: a
   * process that answers but cannot reach its database is not healthy.
   */
  app.get('/health', () => ({ status: 'ok', uptimeSeconds: Math.round(process.uptime()) }));

  app.get('/health/ready', async (_request, reply) => {
    try {
      await prisma.$queryRaw`SELECT 1`;
      return { status: 'ready', database: 'reachable' };
    } catch {
      return reply.code(503).send({ status: 'unavailable', database: 'unreachable' });
    }
  });

  app.setNotFoundHandler((request, reply) =>
    reply.code(404).send(errorBody('NOT_FOUND', 'No such endpoint', String(request.id))),
  );

  app.setErrorHandler((error: FastifyError, request, reply) => {
    const correlationId = String(request.id);

    if (error instanceof AppError) {
      request.log.warn({ code: error.code, correlationId }, error.message);
      return reply
        .code(error.status)
        .send(errorBody(error.code, error.message, correlationId, error.details));
    }

    if (error instanceof ZodError) {
      const details = toErrorDetails(error);
      return reply
        .code(422)
        .send(errorBody('VALIDATION_FAILED', 'The request was rejected', correlationId, details));
    }

    if (error.statusCode === 429) {
      return reply
        .code(429)
        .send(errorBody('RATE_LIMITED', 'Too many requests. Slow down.', correlationId));
    }

    // Anything unexpected: log the detail, tell the client nothing.
    request.log.error({ err: error, correlationId }, 'unhandled error');
    return reply
      .code(500)
      .send(errorBody('INTERNAL', 'Something went wrong on our side.', correlationId));
  });

  // Registered after the handlers above so every route inherits them. Registering
  // routes first left Fastify's default serializer in place for scoped errors.
  await app.register(
    async (scope) => {
      await scope.register(authRoutes, { prefix: '/auth' });
      await scope.register(attendanceRoutes, { prefix: '/attendance' });
      await scope.register(jobRoutes, { prefix: '/jobs' });
      await scope.register(employeeRoutes, { prefix: '/employees' });
      await scope.register(leaveRoutes, { prefix: '/leave' });
      await scope.register(payrollRoutes, { prefix: '/payroll' });
      await scope.register(telegramRoutes, { prefix: '/telegram' });
      await scope.register(analyticsRoutes, { prefix: '/analytics' });
      await scope.register(documentRoutes, { prefix: '/documents' });
      await scope.register(faceRoutes, { prefix: '/face' });
    },
    { prefix: '/api/v1' },
  );

  return app;
}
