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
};
