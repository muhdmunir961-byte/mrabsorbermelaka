import type { JobStatus } from '@mr/shared';
import { prisma } from '../../db.js';

const withRelations = {
  vehicle: { select: { plateNumber: true, model: true } },
  serviceType: { select: { name: true } },
} as const;

export type JobRow = Awaited<ReturnType<typeof jobRepository.listByStatus>>[number];

export const jobRepository = {
  listByStatus(status: JobStatus[], branchId?: string) {
    return prisma.job.findMany({
      where: { status: { in: status }, ...(branchId ? { branchId } : {}) },
      include: withRelations,
      orderBy: { createdAt: 'asc' },
      take: 50,
    });
  },

  findById(id: string) {
    return prisma.job.findUnique({ where: { id }, include: withRelations });
  },

  update(
    id: string,
    data: { status?: JobStatus; progressPct?: number; startedAt?: Date; completedAt?: Date },
  ) {
    return prisma.job.update({ where: { id }, data, include: withRelations });
  },

  /** Commission earned by one employee since a given instant. */
  async commissionSince(employeeId: string, since: Date): Promise<number> {
    const result = await prisma.job.aggregate({
      where: { assigneeId: employeeId, status: 'COMPLETED', completedAt: { gte: since } },
      _sum: { commissionSen: true },
    });
    return result._sum.commissionSen ?? 0;
  },

  countAssigned(employeeId: string) {
    return prisma.job.count({
      where: { assigneeId: employeeId, status: { in: ['ASSIGNED', 'IN_PROGRESS', 'BLOCKED'] } },
    });
  },
};
