import { z } from 'zod';
import { BranchCode } from './enums.js';
import { Sen } from './money.js';

/**
 * Executive figures. Every field here is computed from a real query; an empty
 * dataset yields zeros, never an invented placeholder.
 */

export const BranchSnapshot = z.object({
  branchCode: BranchCode,
  branchName: z.string(),
  revenueTodaySen: Sen,
  present: z.int().nonnegative(),
  late: z.int().nonnegative(),
  headcount: z.int().nonnegative(),
});
export type BranchSnapshot = z.infer<typeof BranchSnapshot>;

export const AlertKind = z.enum(['MC_TREND', 'PENDING_APPROVALS', 'WORKSHOP_LOAD']);
export type AlertKind = z.infer<typeof AlertKind>;

export const OperationsAlert = z.object({
  kind: AlertKind,
  severity: z.enum(['INFO', 'WARNING', 'CRITICAL']),
  title: z.string(),
  detail: z.string(),
  /** Where the fix lives, so an alert is actionable rather than decorative. */
  href: z.string(),
});
export type OperationsAlert = z.infer<typeof OperationsAlert>;

export const DashboardSummary = z.object({
  asOf: z.iso.datetime({ offset: true }),
  /** Revenue recorded today across completed jobs. */
  revenueTodaySen: Sen,
  monthRevenueSen: Sen,
  pendingApprovals: z.int().nonnegative(),
  activeJobs: z.int().nonnegative(),
  attendance: z.object({
    headcount: z.int().nonnegative(),
    present: z.int().nonnegative(),
    late: z.int().nonnegative(),
    onMc: z.int().nonnegative(),
    absent: z.int().nonnegative(),
    presentPct: z.int().min(0).max(100),
  }),
  workshopLoad: z.object({
    inProgress: z.int().nonnegative(),
    waiting: z.int().nonnegative(),
    completedToday: z.int().nonnegative(),
  }),
  branches: z.array(BranchSnapshot),
  alerts: z.array(OperationsAlert),
});
export type DashboardSummary = z.infer<typeof DashboardSummary>;

/** One point on a monthly series. Months are 1-12. */
export const MonthlyPoint = z.object({
  year: z.int().min(2000).max(2100),
  month: z.int().min(1).max(12),
  value: z.int().nonnegative(),
});
export type MonthlyPoint = z.infer<typeof MonthlyPoint>;

export const TopPerformer = z.object({
  employeeId: z.uuid(),
  fullName: z.string(),
  roleLabel: z.string(),
  branchCode: BranchCode,
  commissionSen: Sen,
  jobsCompleted: z.int().nonnegative(),
});
export type TopPerformer = z.infer<typeof TopPerformer>;

export const AnalyticsReport = z.object({
  fromYear: z.int().min(2000).max(2100),
  toYear: z.int().min(2000).max(2100),
  revenueByMonth: z.array(MonthlyPoint),
  jobsByMonth: z.array(MonthlyPoint),
  /** Attendance state distribution as counts, not percentages. */
  attendanceDistribution: z.object({
    present: z.int().nonnegative(),
    late: z.int().nonnegative(),
    onMc: z.int().nonnegative(),
    absent: z.int().nonnegative(),
    leave: z.int().nonnegative(),
  }),
  topPerformers: z.array(TopPerformer),
  popularServices: z.array(
    z.object({
      serviceName: z.string(),
      jobsCompleted: z.int().nonnegative(),
      revenueSen: Sen,
    }),
  ),
});
export type AnalyticsReport = z.infer<typeof AnalyticsReport>;

export const AnalyticsQuery = z
  .object({
    year: z.coerce.number().int().min(2000).max(2100).optional(),
  })
  .strict();
export type AnalyticsQuery = z.infer<typeof AnalyticsQuery>;
