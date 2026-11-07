/*
 * Fastify's plugin contract is Promise-based, so this registration is `async`
 * even though route declaration itself awaits nothing.
 */
/* eslint-disable @typescript-eslint/require-await */
import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { PayrollLineInput, PayrollPeriodQuery } from '@mr/shared';
import { ADMIN_ROLES, currentUser, requireRole } from '../../auth/guard.js';
import { parseInput } from '../../validate.js';
import { approveRun, buildPreview, createRun, getRun, submitRun, updateLine } from './service.js';

const RunIdParams = z.object({ runId: z.uuid() }).strict();
const LineIdParams = z.object({ lineId: z.uuid() }).strict();
const CreateRunBody = PayrollPeriodQuery;

export const payrollRoutes: FastifyPluginAsync = async (app) => {
  app.get('/preview', async (request) => {
    requireRole(request, ADMIN_ROLES);
    const { year, month } = parseInput(PayrollPeriodQuery, request.query);
    return buildPreview(year, month);
  });

  app.post('/runs', async (request, reply) => {
    requireRole(request, ADMIN_ROLES);
    const { year, month } = parseInput(CreateRunBody, request.body);
    return reply.code(201).send(await createRun(year, month));
  });

  app.get('/runs/:runId', async (request) => {
    requireRole(request, ADMIN_ROLES);
    const { runId } = parseInput(RunIdParams, request.params);
    return getRun(runId);
  });

  app.patch('/lines/:lineId', async (request) => {
    requireRole(request, ADMIN_ROLES);
    const { lineId } = parseInput(LineIdParams, request.params);
    const input = parseInput(PayrollLineInput, request.body);
    return updateLine(lineId, input);
  });

  app.post('/runs/:runId/submit', async (request) => {
    requireRole(request, ADMIN_ROLES);
    const { runId } = parseInput(RunIdParams, request.params);
    return submitRun(runId);
  });

  app.post('/runs/:runId/approve', async (request) => {
    const user = currentUser(request);
    const { runId } = parseInput(RunIdParams, request.params);
    return approveRun(user, runId);
  });
};
