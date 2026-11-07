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
import { toErrorDetails } from './validate.js';
import { authRoutes } from './features/auth/routes.js';
import { attendanceRoutes } from './features/attendance/routes.js';
import { employeeRoutes } from './features/employees/routes.js';
import { jobRoutes } from './features/jobs/routes.js';
import { leaveRoutes } from './features/leave/routes.js';

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
    // Cookies and auth headers are the only trust inputs; keep the body limit small.
    bodyLimit: 256 * 1024,
  });

  // This process serves JSON, not HTML, so a document CSP would be theatre.
  // The header set that does matter here (nosniff, frameguard, HSTS) is kept.
  await app.register(helmet, { contentSecurityPolicy: false });
  await app.register(cors, { origin: allowedOrigins, credentials: true });
  await app.register(cookie, { secret: env.SESSION_SECRET });
  await app.register(rateLimit, { max: 120, timeWindow: '1 minute' });

  app.get('/health', () => ({
    status: 'ok',
    uptimeSeconds: Math.round(process.uptime()),
  }));

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
    },
    { prefix: '/api/v1' },
  );

  return app;
}
