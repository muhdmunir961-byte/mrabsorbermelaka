import type { PayrollStatus } from '@mr/shared';
import { prisma } from '../../db.js';

export const payrollRepository = {
  /** Active staff with the two encrypted salary fields, newest joiners last. */
  listEmployees() {
    return prisma.employee.findMany({
      where: { status: 'ACTIVE' },
      select: {
        id: true,
        fullName: true,
        role: true,
        baseSalaryEnc: true,
        hourlyRateEnc: true,
      },
      orderBy: { fullName: 'asc' },
    });
  },

  /** Commission earned per employee from jobs completed inside the period. */
  async commissionByEmployee(from: Date, to: Date) {
    const grouped = await prisma.job.groupBy({
      by: ['assigneeId'],
      where: {
        status: 'COMPLETED',
        completedAt: { gte: from, lt: to },
        assigneeId: { not: null },
      },
      _sum: { commissionSen: true },
    });

    const map = new Map<string, number>();
    for (const row of grouped) {
      if (row.assigneeId) map.set(row.assigneeId, row._sum.commissionSen ?? 0);
    }
    return map;
  },

  findRunByPeriod(periodYear: number, periodMonth: number) {
    return prisma.payrollRun.findUnique({
      where: { periodYear_periodMonth: { periodYear, periodMonth } },
      include: { lines: { include: { employee: { select: { fullName: true, role: true } } } } },
    });
  },

  findRunById(id: string) {
    return prisma.payrollRun.findUnique({
      where: { id },
      include: { lines: { include: { employee: { select: { fullName: true, role: true } } } } },
    });
  },

  createRun(
    periodYear: number,
    periodMonth: number,
    lines: {
      employeeId: string;
      baseSalarySen: number;
      overtimeHours: number;
      commissionSen: number;
      deductionsSen: number;
      netPaySen: number;
      anomaly: string | null;
    }[],
  ) {
    return prisma.payrollRun.create({
      data: {
        periodYear,
        periodMonth,
        status: 'DRAFT',
        lines: { createMany: { data: lines } },
      },
      include: { lines: { include: { employee: { select: { fullName: true, role: true } } } } },
    });
  },

  updateLine(
    lineId: string,
    data: {
      overtimeHours: number;
      deductionsSen: number;
      netPaySen: number;
      anomaly: string | null;
    },
  ) {
    return prisma.payrollLine.update({ where: { id: lineId }, data });
  },

  findLine(lineId: string) {
    return prisma.payrollLine.findUnique({
      where: { id: lineId },
      include: {
        run: { select: { id: true, status: true } },
        employee: { select: { id: true, fullName: true, role: true, hourlyRateEnc: true } },
      },
    });
  },

  setStatus(id: string, status: PayrollStatus, approvedById?: string) {
    return prisma.payrollRun.update({
      where: { id },
      data: {
        status,
        ...(status === 'APPROVED'
          ? { approvedById: approvedById ?? null, approvedAt: new Date() }
          : {}),
      },
      include: { lines: { include: { employee: { select: { fullName: true, role: true } } } } },
    });
  },
};
