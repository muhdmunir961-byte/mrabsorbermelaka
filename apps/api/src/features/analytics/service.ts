import type {
  AnalyticsReport,
  DashboardSummary,
  MonthlyPoint,
  OperationsAlert,
  TopPerformer,
} from '@mr/shared';
import {
  analyticsRepository as analyticsRepo,
  dashboardRepository as dashboardRepo,
} from './repository.js';

const ROLE_LABEL: Record<string, string> = {
  STAFF: 'Mekanik',
  FOREMAN: 'Foreman',
  ADMIN_HR: 'Admin / HR',
  OWNER: 'Pemilik',
};

const MONTHS = [
  'Jan',
  'Feb',
  'Mac',
  'Apr',
  'Mei',
  'Jun',
  'Jul',
  'Ogos',
  'Sep',
  'Okt',
  'Nov',
  'Dis',
];

/** Every month of the year, with zero where nothing happened. */
function emptyYear(year: number): MonthlyPoint[] {
  return Array.from({ length: 12 }, (_, index) => ({ year, month: index + 1, value: 0 }));
}

export async function buildDashboard(now = new Date()): Promise<DashboardSummary> {
  const dayStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));

  const [revenueTodaySen, monthRevenueSen, pendingApprovals, counts, attendance, branches, longMc] =
    await Promise.all([
      dashboardRepo.revenueBetween(dayStart, new Date(dayStart.getTime() + 86_400_000)),
      dashboardRepo.monthRevenue(now),
      dashboardRepo.pendingApprovals(),
      dashboardRepo.jobCountsByStatus(now),
      dashboardRepo.attendanceToday(now),
      dashboardRepo.branchSnapshots(now),
      dashboardRepo.longMcCases(now, 3),
    ]);

  const byStatus = new Map(counts.map((row) => [row.status, row._count._all]));
  const inProgress = (byStatus.get('IN_PROGRESS') ?? 0) + (byStatus.get('BLOCKED') ?? 0);
  const waiting = byStatus.get('ASSIGNED') ?? 0;
  const completedToday = byStatus.get('COMPLETED') ?? 0;
  const activeJobs = inProgress + waiting;

  const presentPct =
    attendance.headcount > 0 ? Math.round((attendance.present / attendance.headcount) * 100) : 0;

  const alerts: OperationsAlert[] = [];

  if (longMc.length > 0) {
    const names = longMc.map((row) => row.employee.fullName).join(', ');
    alerts.push({
      kind: 'MC_TREND',
      severity: 'CRITICAL',
      title: `${longMc.length} pekerja MC melebihi 3 hari`,
      detail: `${names}. Semak sama ada surat sakit dan ganti tugas diperlukan.`,
      href: '/approvals',
    });
  }

  if (pendingApprovals > 0) {
    alerts.push({
      kind: 'PENDING_APPROVALS',
      severity: pendingApprovals > 5 ? 'WARNING' : 'INFO',
      title: `${pendingApprovals} permohonan menunggu kelulusan`,
      detail: 'Permohonan cuti/MC yang belum diputuskan menyekat perancangan tenaga kerja.',
      href: '/approvals',
    });
  }

  if (waiting > 10) {
    alerts.push({
      kind: 'WORKSHOP_LOAD',
      severity: 'WARNING',
      title: `${waiting} pekerjaan menunggu`,
      detail: 'Barisan kerja melebihi 10. Pertimbangkan penugasan semula.',
      href: '/operations',
    });
  }

  return {
    asOf: now.toISOString(),
    revenueTodaySen,
    monthRevenueSen,
    pendingApprovals,
    activeJobs,
    attendance: { ...attendance, presentPct },
    workshopLoad: { inProgress, waiting, completedToday },
    branches,
    alerts,
  };
}

export async function buildAnalytics(year: number): Promise<AnalyticsReport> {
  const [jobs, attendanceCounts] = await Promise.all([
    analyticsRepo.completedJobsInYear(year),
    analyticsRepo.attendanceInYear(year),
  ]);

  const revenueByMonth = emptyYear(year);
  const jobsByMonth = emptyYear(year);
  const perEmployee = new Map<string, { row: TopPerformer }>();
  const perService = new Map<string, { jobsCompleted: number; revenueSen: number }>();

  for (const job of jobs) {
    const month = (job.completedAt ?? new Date()).getUTCMonth() + 1;
    const revenuePoint = revenueByMonth[month - 1];
    const jobsPoint = jobsByMonth[month - 1];
    if (revenuePoint) revenuePoint.value += job.commissionSen;
    if (jobsPoint) jobsPoint.value += 1;

    const service = perService.get(job.serviceType.name) ?? { jobsCompleted: 0, revenueSen: 0 };
    service.jobsCompleted += 1;
    service.revenueSen += job.commissionSen;
    perService.set(job.serviceType.name, service);

    if (job.assignee) {
      const existing = perEmployee.get(job.assignee.id);
      if (existing) {
        existing.row.commissionSen += job.commissionSen;
        existing.row.jobsCompleted += 1;
      } else {
        perEmployee.set(job.assignee.id, {
          row: {
            employeeId: job.assignee.id,
            fullName: job.assignee.fullName,
            roleLabel: ROLE_LABEL[job.assignee.role] ?? job.assignee.role,
            branchCode: job.assignee.branch.code,
            commissionSen: job.commissionSen,
            jobsCompleted: 1,
          },
        });
      }
    }
  }

  const byState = new Map(attendanceCounts.map((row) => [row.state, row._count._all]));

  return {
    fromYear: year,
    toYear: year,
    revenueByMonth,
    jobsByMonth,
    attendanceDistribution: {
      present: byState.get('PRESENT') ?? 0,
      late: byState.get('LATE') ?? 0,
      onMc: byState.get('ON_MC') ?? 0,
      absent: byState.get('ABSENT') ?? 0,
      leave: byState.get('LEAVE') ?? 0,
    },
    topPerformers: [...perEmployee.values()]
      .map((entry) => entry.row)
      .sort((a, b) => b.commissionSen - a.commissionSen)
      .slice(0, 5),
    popularServices: [...perService.entries()]
      .map(([serviceName, value]) => ({ serviceName, ...value }))
      .sort((a, b) => b.revenueSen - a.revenueSen)
      .slice(0, 5),
  };
}

export { MONTHS };
