/*
 * Fastify's plugin contract is Promise-based, so this registration is `async`
 * even though route declaration itself awaits nothing.
 */
/* eslint-disable @typescript-eslint/require-await */
import type { FastifyPluginAsync } from 'fastify';
import { ClockInInput } from '@mr/shared';
import { currentUser } from '../../auth/guard.js';
import { parseInput } from '../../validate.js';
import { clockIn, clockOut, myClockContext, myRecordToday, todaySummary } from './service.js';

export const attendanceRoutes: FastifyPluginAsync = async (app) => {
  app.post('/clock-in', async (request, reply) => {
    const user = currentUser(request);
    const input = parseInput(ClockInInput, request.body);
    const record = await clockIn(user, input);
    return reply.code(201).send(record);
  });

  app.post('/clock-out', async (request, reply) => {
    const user = currentUser(request);
    const record = await clockOut(user);
    return reply.code(200).send(record);
  });

  app.get('/today', async (request) => {
    const user = currentUser(request);
    return todaySummary(user);
  });

  app.get('/me', async (request) => {
    const user = currentUser(request);
    return myRecordToday(user);
  });

  app.get('/context', async (request) => {
    const user = currentUser(request);
    return myClockContext(user);
  });
};
