/*
 * Fastify's plugin contract is Promise-based, so this registration is `async`
 * even though route declaration itself awaits nothing.
 */
/* eslint-disable @typescript-eslint/require-await */
import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { EmployeeDirectoryQuery } from '@mr/shared';
import { ADMIN_ROLES, currentUser, requireRole } from '../../auth/guard.js';
import { parseInput } from '../../validate.js';
import { getProfile, listDirectory } from './service.js';

const EmployeeIdParams = z.object({ employeeId: z.uuid() }).strict();

export const employeeRoutes: FastifyPluginAsync = async (app) => {
  app.get('/', async (request) => {
    requireRole(request, ADMIN_ROLES);
    const query = parseInput(EmployeeDirectoryQuery, request.query);
    return listDirectory(query);
  });

  app.get('/:employeeId', async (request) => {
    const user = currentUser(request);
    const { employeeId } = parseInput(EmployeeIdParams, request.params);
    return getProfile(user, employeeId);
  });
};
