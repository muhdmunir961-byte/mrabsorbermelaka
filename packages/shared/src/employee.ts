import { z } from 'zod';
import { BranchCode, EmploymentStatus, LeaveType, RequestStatus, Role } from './enums.js';
import { Sen } from './money.js';

/** Malaysian mobile in E.164 form, e.g. +60123456789. */
export const MalaysianPhone = z
  .string()
  .regex(/^\+60[0-9]{8,10}$/, 'Use a Malaysian number in E.164 form, e.g. +60123456789');

export const EmployeeSummary = z.object({
  id: z.uuid(),
  fullName: z.string().min(1).max(120),
  role: Role,
  branchCode: BranchCode,
  status: EmploymentStatus,
  avatarUrl: z.string().nullable(),
});
export type EmployeeSummary = z.infer<typeof EmployeeSummary>;

export const EmployeeProfile = EmployeeSummary.extend({
  phone: MalaysianPhone,
  identityCardNumber: z
    .string()
    .regex(/^\d{6}-\d{2}-\d{4}$/, 'Use the 12-digit MyKad format, e.g. 920412-04-5541'),
  address: z.string().min(1).max(400),
  emergencyContactName: z.string().min(1).max(120),
  emergencyContactPhone: MalaysianPhone,
  maritalStatus: z.string().max(80),
  joinedOn: z.iso.date(),
  employmentStatus: EmploymentStatus,
});
export type EmployeeProfile = z.infer<typeof EmployeeProfile>;

export const EmployeeDirectoryQuery = z
  .object({
    search: z.string().trim().max(80).optional(),
    branchCode: BranchCode.optional(),
    role: Role.optional(),
    status: EmploymentStatus.optional(),
    page: z.coerce.number().int().min(1).default(1),
    pageSize: z.coerce.number().int().min(1).max(100).default(20),
  })
  .strict();
export type EmployeeDirectoryQuery = z.infer<typeof EmployeeDirectoryQuery>;

/** Headline figures for the profile screen, each from a real query. */
export const EmployeeStats = z.object({
  attendanceRatePct: z.int().min(0).max(100),
  jobsCompleted: z.int().nonnegative(),
  mcDaysThisYear: z.int().nonnegative(),
  commissionThisMonthSen: Sen,
});
export type EmployeeStats = z.infer<typeof EmployeeStats>;

export const EmployeeDocument = z.object({
  id: z.uuid(),
  kind: z.string(),
  mimeType: z.string(),
  sizeBytes: z.int().nonnegative(),
  createdAt: z.iso.datetime({ offset: true }),
});
export type EmployeeDocument = z.infer<typeof EmployeeDocument>;

/** The full profile screen payload: identity, figures, documents, recent leave. */
export const EmployeeProfileView = EmployeeProfile.extend({
  stats: EmployeeStats,
  documents: z.array(EmployeeDocument),
  leaveRemainingDays: z.int(),
  recentLeave: z.array(
    z.object({
      id: z.uuid(),
      type: LeaveType,
      status: RequestStatus,
      startDate: z.iso.date(),
      endDate: z.iso.date(),
      days: z.int(),
    }),
  ),
});
export type EmployeeProfileView = z.infer<typeof EmployeeProfileView>;

/**
 * Employment status change. Terminating is destructive in effect, so it demands
 * a reason; suspending does too, because payroll must exclude both.
 */
export const EmploymentStatusInput = z
  .object({
    status: EmploymentStatus,
    reason: z.string().trim().min(3, 'State why').max(300),
  })
  .strict()
  .refine((value) => value.status !== 'ACTIVE', {
    message: 'Use this endpoint only to suspend or terminate',
    path: ['status'],
  });
export type EmploymentStatusInput = z.infer<typeof EmploymentStatusInput>;
