import type { EmployeeDirectoryQuery } from '@mr/shared';
import { prisma } from '../../db.js';

const summarySelect = {
  id: true,
  fullName: true,
  role: true,
  status: true,
  avatarUrl: true,
  branch: { select: { code: true } },
} as const;

export const employeeRepository = {
  async list(query: EmployeeDirectoryQuery) {
    const where = {
      ...(query.branchCode ? { branch: { code: query.branchCode } } : {}),
      ...(query.role ? { role: query.role } : {}),
      ...(query.status ? { status: query.status } : {}),
      ...(query.search
        ? { fullName: { contains: query.search, mode: 'insensitive' as const } }
        : {}),
    };

    const [total, rows] = await Promise.all([
      prisma.employee.count({ where }),
      prisma.employee.findMany({
        where,
        select: summarySelect,
        orderBy: { fullName: 'asc' },
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
      }),
    ]);

    return { total, rows };
  },

  findProfile(id: string) {
    return prisma.employee.findUnique({
      where: { id },
      include: { branch: { select: { code: true } } },
    });
  },

  findLeaveBalance(employeeId: string, year: number) {
    return prisma.leaveBalance.findUnique({ where: { employeeId_year: { employeeId, year } } });
  },

  /** Present + late days over all recorded days, as a percentage of the year so far. */
  async attendanceRate(employeeId: string): Promise<number> {
    const [total, present] = await Promise.all([
      prisma.attendanceRecord.count({ where: { employeeId } }),
      prisma.attendanceRecord.count({
        where: { employeeId, state: { in: ['PRESENT', 'LATE'] } },
      }),
    ]);
    if (total === 0) return 0;
    return Math.round((present / total) * 100);
  },

  jobsCompleted(employeeId: string) {
    return prisma.job.count({ where: { assigneeId: employeeId, status: 'COMPLETED' } });
  },

  /** Medical leave days approved or pending in a calendar year. */
  async mcDays(year: number, employeeId: string): Promise<number> {
    const result = await prisma.leaveRequest.aggregate({
      where: {
        employeeId,
        type: 'MEDICAL',
        status: { in: ['APPROVED', 'PENDING'] },
        startDate: { gte: new Date(Date.UTC(year, 0, 1)) },
        endDate: { lt: new Date(Date.UTC(year + 1, 0, 1)) },
      },
      _sum: { days: true },
    });
    return result._sum.days ?? 0;
  },

  async commissionInMonth(employeeId: string, year: number, month: number): Promise<number> {
    const result = await prisma.job.aggregate({
      where: {
        assigneeId: employeeId,
        status: 'COMPLETED',
        completedAt: {
          gte: new Date(Date.UTC(year, month - 1, 1)),
          lt: new Date(Date.UTC(year, month, 1)),
        },
      },
      _sum: { commissionSen: true },
    });
    return result._sum.commissionSen ?? 0;
  },

  documents(employeeId: string) {
    return prisma.attachment.findMany({
      where: { employeeId },
      orderBy: { createdAt: 'desc' },
      take: 50,
    });
  },

  recentLeave(employeeId: string) {
    return prisma.leaveRequest.findMany({
      where: { employeeId },
      orderBy: { createdAt: 'desc' },
      take: 5,
    });
  },

  /** Status changes are guarded on the current status so two admins cannot race. */
  async changeStatus(id: string, from: 'ACTIVE', to: 'SUSPENDED' | 'TERMINATED'): Promise<boolean> {
    const result = await prisma.employee.updateMany({
      where: { id, status: from },
      data: { status: to },
    });
    return result.count === 1;
  },

  findStatus(id: string) {
    return prisma.employee.findUnique({ where: { id }, select: { status: true } });
  },
};
