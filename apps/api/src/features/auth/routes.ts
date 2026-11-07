/*
 * Fastify's plugin contract is Promise-based, so this registration is `async`
 * even though route declaration itself awaits nothing.
 */
/* eslint-disable @typescript-eslint/require-await */
import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { MalaysianPhone } from '@mr/shared';
import { currentUser } from '../../auth/guard.js';
import { SESSION_COOKIE, encodeSession, sessionCookieOptions } from '../../auth/session.js';
import { parseInput } from '../../validate.js';
import { requestOtp, verifyOtp } from './service.js';

const RequestOtpBody = z.object({ phone: MalaysianPhone }).strict();
const VerifyOtpBody = z
  .object({ phone: MalaysianPhone, code: z.string().regex(/^\d{6}$/) })
  .strict();

export const authRoutes: FastifyPluginAsync = async (app) => {
  app.post(
    '/otp/request',
    { config: { rateLimit: { max: 5, timeWindow: '5 minutes' } } },
    async (request, reply) => {
      const { phone } = parseInput(RequestOtpBody, request.body);
      const issued = await requestOtp(phone);
      return reply.code(202).send(issued);
    },
  );

  app.post(
    '/otp/verify',
    { config: { rateLimit: { max: 10, timeWindow: '5 minutes' } } },
    async (request, reply) => {
      const { phone, code } = parseInput(VerifyOtpBody, request.body);
      const user = await verifyOtp(phone, code);
      const token = encodeSession({
        employeeId: user.employeeId,
        role: user.role,
        fullName: user.fullName,
      });
      return reply
        .setCookie(SESSION_COOKIE, token, sessionCookieOptions)
        .code(200)
        .send({ employeeId: user.employeeId, role: user.role, fullName: user.fullName });
    },
  );

  app.post('/logout', async (_request, reply) => {
    return reply.clearCookie(SESSION_COOKIE, { path: '/' }).code(204).send();
  });

  app.get('/me', async (request) => {
    const user = currentUser(request);
    return { employeeId: user.employeeId, role: user.role, fullName: user.fullName };
  });
};
