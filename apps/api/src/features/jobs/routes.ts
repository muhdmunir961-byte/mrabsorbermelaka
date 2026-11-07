/*
 * Fastify's plugin contract is Promise-based, so these registrations are `async`
 * even though route declaration itself awaits nothing. The rule is about
 * accidentally un-awaited work, which cannot happen here.
 */
/* eslint-disable @typescript-eslint/require-await */
import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { BranchCode, JobTransitionInput } from '@mr/shared';
import { currentUser } from '../../auth/guard.js';
import { parseInput } from '../../validate.js';
import { commissionToday, getBoard, transitionJob } from './service.js';

const JobIdParams = z.object({ jobId: z.uuid() }).strict();
const BoardQuery = z.object({ branchCode: BranchCode.optional() }).strict();

export const jobRoutes: FastifyPluginAsync = async (app) => {
  app.get('/board', async (request) => {
    currentUser(request);
    const { branchCode } = parseInput(BoardQuery, request.query);
    const board = await getBoard();
    return branchCode ? { ...board, branchCode } : board;
  });

  app.post('/:jobId/transition', async (request, reply) => {
    const user = currentUser(request);
    const { jobId } = parseInput(JobIdParams, request.params);
    const input = parseInput(JobTransitionInput, request.body);
    return reply.code(200).send(await transitionJob(user, jobId, input));
  });

  app.get('/commission/today', async (request) => {
    const user = currentUser(request);
    return { commissionSen: await commissionToday(user) };
  });
};
