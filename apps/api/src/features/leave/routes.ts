/*
 * Fastify's plugin contract is Promise-based, so this registration is `async`
 * even though route declaration itself awaits nothing.
 */
/* eslint-disable @typescript-eslint/require-await */
import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { ApprovalInput, BatchApprovalInput, LeaveRequestInput, McRequestInput } from '@mr/shared';
import { ADMIN_ROLES, currentUser, requireRole } from '../../auth/guard.js';
import { parseInput } from '../../validate.js';
import {
  batchDecide,
  decideRequest,
  myBalance,
  myRequests,
  pendingQueue,
  submitLeave,
  submitMedicalCertificate,
} from './service.js';

const RequestIdParams = z.object({ requestId: z.uuid() }).strict();

export const leaveRoutes: FastifyPluginAsync = async (app) => {
  app.get('/balance', async (request) => {
    const user = currentUser(request);
    return myBalance(user);
  });

  app.get('/requests', async (request) => {
    const user = currentUser(request);
    return myRequests(user);
  });

  app.post('/requests', async (request, reply) => {
    const user = currentUser(request);
    const input = parseInput(LeaveRequestInput, request.body);
    return reply.code(201).send(await submitLeave(user, input));
  });

  app.post('/mc', async (request, reply) => {
    const user = currentUser(request);
    const input = parseInput(McRequestInput, request.body);
    return reply.code(201).send(await submitMedicalCertificate(user, input));
  });

  // Everything below is approver-only.
  app.get('/queue', async (request) => {
    requireRole(request, ADMIN_ROLES);
    return pendingQueue();
  });

  app.patch('/requests/:requestId/decision', async (request) => {
    const approver = requireRole(request, ADMIN_ROLES);
    const { requestId } = parseInput(RequestIdParams, request.params);
    const input = parseInput(ApprovalInput, request.body);
    return decideRequest(approver, requestId, input);
  });

  app.post('/requests/batch-decision', async (request) => {
    const approver = requireRole(request, ADMIN_ROLES);
    const input = parseInput(BatchApprovalInput, request.body);
    return batchDecide(approver, input);
  });
};
