import type { LeaveType, RequestStatus } from '@mr/shared';
import { prisma } from '../../db.js';

export const leaveRepository = {
  findEmployee(employeeId: string) {
    return prisma.employee.findUnique({
      where: { id: employeeId },
      select: { id: true, fullName: true, role: true, leaveEntitlementDays: true },
    });
  },

  /** Creates the year's balance row on first use, so a new hire can apply immediately. */
  async balanceFor(employeeId: string, year: number, entitlementDays: number) {
    return prisma.leaveBalance.upsert({
      where: { employeeId_year: { employeeId, year } },
      update: {},
      create: { employeeId, year, entitlementDays },
    });
  },

  findDocument(documentId: string, employeeId: string) {
    return prisma.attachment.findFirst({ where: { id: documentId, employeeId } });
  },

  findRequest(id: string) {
    return prisma.leaveRequest.findUnique({
      where: { id },
      include: {
        employee: {
          select: { fullName: true, role: true, id: true, leaveEntitlementDays: true },
        },
      },
    });
  },

  listForEmployee(employeeId: string) {
    return prisma.leaveRequest.findMany({
      where: { employeeId },
      orderBy: { createdAt: 'desc' },
      take: 50,
    });
  },

  listPending() {
    return prisma.leaveRequest.findMany({
      where: { status: 'PENDING' },
      include: { employee: { select: { fullName: true, role: true, id: true } } },
      orderBy: { createdAt: 'asc' },
      take: 100,
    });
  },

  /** Colleagues already booked over these dates, excluding the applicant. */
  findOverlaps(employeeId: string, startDate: Date, endDate: Date) {
    return prisma.leaveRequest.findMany({
      where: {
        employeeId: { not: employeeId },
        status: { in: ['PENDING', 'APPROVED'] },
        startDate: { lte: endDate },
        endDate: { gte: startDate },
      },
      select: { employee: { select: { fullName: true } } },
      distinct: ['employeeId'],
    });
  },

  /** Creates the request and reserves the days in one transaction. */
  async createWithBalance(
    requestData: {
      employeeId: string;
      type: LeaveType;
      startDate: Date;
      endDate: Date;
      days: number;
      reason: string;
      clinicName: string | null;
      documentId: string | null;
    },
    employeeId: string,
    year: number,
    pendingDays: number,
  ) {
    const [request] = await prisma.$transaction([
      prisma.leaveRequest.create({ data: requestData }),
      prisma.leaveBalance.update({
        where: { employeeId_year: { employeeId, year } },
        data: { pendingDays: { increment: pendingDays } },
      }),
    ]);
    return request;
  },

  /**
   * Approve or reject, guarded by `status: PENDING` so a double click or two
   * approvers cannot decide the same request twice.
   * Returns null when the request was already decided.
   */
  decideAtomically(params: {
    id: string;
    status: RequestStatus;
    decidedById: string;
    note: string | null;
    employeeId: string;
    year: number;
    pendingDelta: number;
    usedDelta: number;
  }) {
    return prisma.$transaction(async (tx) => {
      const updated = await tx.leaveRequest.updateMany({
        where: { id: params.id, status: 'PENDING' },
        data: {
          status: params.status,
          decidedById: params.decidedById,
          decidedAt: new Date(),
          decisionNote: params.note,
        },
      });

      if (updated.count === 0) return null;

      if (params.pendingDelta !== 0 || params.usedDelta !== 0) {
        await tx.leaveBalance.update({
          where: {
            employeeId_year: { employeeId: params.employeeId, year: params.year },
          },
          data: {
            pendingDays: { increment: params.pendingDelta },
            usedDays: { increment: params.usedDelta },
          },
        });
      }

      return tx.leaveRequest.findUnique({ where: { id: params.id } });
    });
  },
};
