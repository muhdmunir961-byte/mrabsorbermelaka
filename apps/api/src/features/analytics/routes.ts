/*
 * Fastify's plugin contract is Promise-based, so this registration is `async`
 * even though route declaration itself awaits nothing.
 */
/* eslint-disable @typescript-eslint/require-await */
import type { FastifyPluginAsync } from 'fastify';
import { AnalyticsQuery } from '@mr/shared';
import { ADMIN_ROLES, requireRole } from '../../auth/guard.js';
import { parseInput } from '../../validate.js';
import { buildAnalytics, buildDashboard } from './service.js';

export const analyticsRoutes: FastifyPluginAsync = async (app) => {
  // Executive figures are for the owner and the HR manager, not for the floor.
  app.get('/dashboard', async (request) => {
    requireRole(request, ADMIN_ROLES);
    return buildDashboard();
  });

  app.get('/report', async (request) => {
    requireRole(request, ADMIN_ROLES);
    const { year } = parseInput(AnalyticsQuery, request.query);
    return buildAnalytics(year ?? new Date().getUTCFullYear());
  });
};
