import type { AttendanceState } from '@mr/shared';
import { prisma } from '../../db.js';

export interface EmployeeWithBranch {
  id: string;
  fullName: string;
  role: string;
  pinHash: string | null;
  branchId: string;
  branchCode: string;
  branchName: string;
  latitude: number;
  longitude: number;
  geofenceRadiusM: number;
}

/** Date-only key in the workshop's timezone (Asia/Kuala_Lumpur). */
export function workDateFor(instant: Date): Date {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Kuala_Lumpur',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(instant);
  return new Date(`${parts}T00:00:00.000Z`);
}

export const attendanceRepository = {
  async findEmployee(employeeId: string): Promise<EmployeeWithBranch | null> {
    const employee = await prisma.employee.findUnique({
      where: { id: employeeId },
      include: { branch: true },
    });
    if (!employee) return null;
    return {
      id: employee.id,
      fullName: employee.fullName,
      role: employee.role,
      pinHash: employee.pinHash,
      branchId: employee.branchId,
      branchCode: employee.branch.code,
      branchName: employee.branch.name,
      latitude: Number(employee.branch.latitude),
      longitude: Number(employee.branch.longitude),
      geofenceRadiusM: employee.branch.geofenceRadiusM,
    };
  },

  findForDate(employeeId: string, workDate: Date) {
    return prisma.attendanceRecord.findUnique({
      where: { employeeId_workDate: { employeeId, workDate } },
    });
  },

  openForDate(employeeId: string, workDate: Date) {
    return prisma.attendanceRecord.findFirst({
      where: { employeeId, workDate, clockOutAt: null },
    });
  },

  create(data: {
    employeeId: string;
    workDate: Date;
    state: AttendanceState;
    method: 'FACE' | 'PIN' | 'MANUAL';
    clockInAt: Date;
    geofenceDistanceM: number | null;
    lateMinutes: number;
  }) {
    return prisma.attendanceRecord.create({ data });
  },

  close(recordId: string, clockOutAt: Date) {
    return prisma.attendanceRecord.update({ where: { id: recordId }, data: { clockOutAt } });
  },

  async countsForDate(workDate: Date, branchId?: string) {
    const [headcount, grouped] = await Promise.all([
      prisma.employee.count({
        where: { status: 'ACTIVE', ...(branchId ? { branchId } : {}) },
      }),
      prisma.attendanceRecord.groupBy({
        by: ['state'],
        where: { workDate, ...(branchId ? { employee: { branchId } } : {}) },
        _count: { _all: true },
      }),
    ]);
    const byState = new Map(grouped.map((row) => [row.state, row._count._all]));
    const present = (byState.get('PRESENT') ?? 0) + (byState.get('LATE') ?? 0);
    return {
      headcount,
      present,
      late: byState.get('LATE') ?? 0,
      onMc: byState.get('ON_MC') ?? 0,
      absent: Math.max(
        headcount - present - (byState.get('ON_MC') ?? 0) - (byState.get('LEAVE') ?? 0),
        0,
      ),
    };
  },
};
