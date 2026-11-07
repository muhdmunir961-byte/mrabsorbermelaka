/*
 * Fastify's plugin contract is Promise-based, so this registration is `async`
 * even though route declaration itself awaits nothing.
 */
/* eslint-disable @typescript-eslint/require-await */
import type { FastifyPluginAsync } from 'fastify';
import { currentUser } from '../../auth/guard.js';
import { parseInput } from '../../validate.js';
import { EnrollInput, VerifyInput, enroll, status, unenroll, verify } from './service.js';

export const faceRoutes: FastifyPluginAsync = async (app) => {
  app.get('/status', async (request) => {
    const user = currentUser(request);
    return status(user);
  });

  // Matching is CPU-heavy, so both write paths are rate limited per route.
  app.post(
    '/enroll',
    { config: { rateLimit: { max: 5, timeWindow: '1 minute' } } },
    async (request) => {
      const user = currentUser(request);
      const input = parseInput(EnrollInput, request.body);
      return enroll(user, input);
    },
  );

  app.post(
    '/verify',
    { config: { rateLimit: { max: 20, timeWindow: '1 minute' } } },
    async (request) => {
      const user = currentUser(request);
      const input = parseInput(VerifyInput, request.body);
      return verify(user, input);
    },
  );

  app.delete('/', async (request) => {
    const user = currentUser(request);
    return unenroll(user);
  });
};
