import { prisma } from '../../db.js';

/** Start of a UTC day, 0..6 days back from `now`. */
function startOfUtcDay(now: Date, daysAgo = 0): Date {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() - daysAgo));
}

function startOfUtcMonth(now: Date): Date {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
}

export const dashboardRepository = {
  async revenueBetween(from: Date, to: Date): Promise<number> {
    const result = await prisma.job.aggregate({
      where: { status: 'COMPLETED', completedAt: { gte: from, lt: to } },
      _sum: { commissionSen: true },
    });
    // Revenue is tracked as charged commission on completed jobs until invoicing
    // exists; this is the only money figure the workshop records today.
    return result._sum.commissionSen ?? 0;
  },

  pendingApprovals() {
    return prisma.leaveRequest.count({ where: { status: 'PENDING' } });
  },

  jobCountsByStatus(now: Date) {
    return prisma.job.groupBy({
      by: ['status'],
      where: {
        OR: [
          { status: { in: ['ASSIGNED', 'IN_PROGRESS', 'BLOCKED'] } },
          { completedAt: { gte: startOfUtcDay(now) } },
        ],
      },
      _count: { _all: true },
    });
  },

  async attendanceToday(now: Date) {
    const workDate = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
    const [headcount, grouped] = await Promise.all([
      prisma.employee.count({ where: { status: 'ACTIVE' } }),
      prisma.attendanceRecord.groupBy({
        by: ['state'],
        where: { workDate },
        _count: { _all: true },
      }),
    ]);
    const byState = new Map(grouped.map((row) => [row.state, row._count._all]));
    return {
      headcount,
      present: (byState.get('PRESENT') ?? 0) + (byState.get('LATE') ?? 0),
      late: byState.get('LATE') ?? 0,
      onMc: byState.get('ON_MC') ?? 0,
      absent: byState.get('ABSENT') ?? 0,
      leave: byState.get('LEAVE') ?? 0,
    };
  },

  /** Per-branch snapshot for today: headcount, attendance and revenue. */
  async branchSnapshots(now: Date) {
    const workDate = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
    const branches = await prisma.branch.findMany({ orderBy: { code: 'asc' } });
    const dayStart = startOfUtcDay(now);

    return Promise.all(
      branches.map(async (branch) => {
        const [headcount, records, revenue] = await Promise.all([
          prisma.employee.count({ where: { branchId: branch.id, status: 'ACTIVE' } }),
          prisma.attendanceRecord.groupBy({
            by: ['state'],
            where: { workDate, employee: { branchId: branch.id } },
            _count: { _all: true },
          }),
          prisma.job.aggregate({
            where: { branchId: branch.id, status: 'COMPLETED', completedAt: { gte: dayStart } },
            _sum: { commissionSen: true },
          }),
        ]);

        const byState = new Map(records.map((row) => [row.state, row._count._all]));
        return {
          branchCode: branch.code,
          branchName: branch.name,
          revenueTodaySen: revenue._sum.commissionSen ?? 0,
          present: (byState.get('PRESENT') ?? 0) + (byState.get('LATE') ?? 0),
          late: byState.get('LATE') ?? 0,
          headcount,
        };
      }),
    );
  },

  /** Employees on approved MC that started more than `days` ago and has not ended. */
  longMcCases(now: Date, days = 3) {
    const threshold = startOfUtcDay(now, days);
    return prisma.leaveRequest.findMany({
      where: {
        type: 'MEDICAL',
        status: 'APPROVED',
        startDate: { lte: threshold },
        endDate: { gte: startOfUtcDay(now) },
      },
      select: { id: true, startDate: true, employee: { select: { fullName: true } } },
      take: 10,
    });
  },

  monthRevenue(now: Date) {
    return dashboardRepository.revenueBetween(
      startOfUtcMonth(now),
      new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1)),
    );
  },
};

export const analyticsRepository = {
  /** Completed jobs within a UTC year, with the money and service attached. */
  completedJobsInYear(year: number) {
    return prisma.job.findMany({
      where: {
        status: 'COMPLETED',
        completedAt: {
          gte: new Date(Date.UTC(year, 0, 1)),
          lt: new Date(Date.UTC(year + 1, 0, 1)),
        },
      },
      select: {
        completedAt: true,
        commissionSen: true,
        assignee: {
          select: { id: true, fullName: true, role: true, branch: { select: { code: true } } },
        },
        serviceType: { select: { name: true } },
      },
      take: 5000,
    });
  },

  attendanceInYear(year: number) {
    return prisma.attendanceRecord.groupBy({
      by: ['state'],
      where: {
        workDate: {
          gte: new Date(Date.UTC(year, 0, 1)),
          lt: new Date(Date.UTC(year + 1, 0, 1)),
        },
      },
      _count: { _all: true },
    });
  },
};
