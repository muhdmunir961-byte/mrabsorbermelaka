import { z } from 'zod';

/**
 * Domain vocabulary shared by the API and the web app.
 * Every identifier the database stores is defined here once, so the runtime
 * check and the compile-time type cannot drift.
 */

export const ROLES = ['STAFF', 'FOREMAN', 'ADMIN_HR', 'OWNER'] as const;
export const Role = z.enum(ROLES);
export type Role = z.infer<typeof Role>;

export const EMPLOYMENT_STATUS = ['ACTIVE', 'SUSPENDED', 'TERMINATED'] as const;
export const EmploymentStatus = z.enum(EMPLOYMENT_STATUS);
export type EmploymentStatus = z.infer<typeof EmploymentStatus>;

export const BRANCH_CODES = ['MELAKA_UTAMA', 'AYER_KEROH'] as const;
export const BranchCode = z.enum(BRANCH_CODES);
export type BranchCode = z.infer<typeof BranchCode>;

export const ATTENDANCE_STATE = ['PRESENT', 'LATE', 'ON_MC', 'ABSENT', 'LEAVE'] as const;
export const AttendanceState = z.enum(ATTENDANCE_STATE);
export type AttendanceState = z.infer<typeof AttendanceState>;

/** How an attendance record was captured. PIN and MANUAL need an approver. */
export const CLOCK_METHOD = ['FACE', 'PIN', 'MANUAL'] as const;
export const ClockMethod = z.enum(CLOCK_METHOD);
export type ClockMethod = z.infer<typeof ClockMethod>;

export const JOB_STATUS = ['ASSIGNED', 'IN_PROGRESS', 'BLOCKED', 'COMPLETED', 'CANCELLED'] as const;
export const JobStatus = z.enum(JOB_STATUS);
export type JobStatus = z.infer<typeof JobStatus>;

export const LEAVE_TYPES = ['ANNUAL', 'EMERGENCY', 'UNPAID', 'MATERNITY'] as const;
export const LeaveType = z.enum(LEAVE_TYPES);
export type LeaveType = z.infer<typeof LeaveType>;

export const REQUEST_STATUS = ['PENDING', 'APPROVED', 'REJECTED', 'CANCELLED'] as const;
export const RequestStatus = z.enum(REQUEST_STATUS);
export type RequestStatus = z.infer<typeof RequestStatus>;

export const PAYROLL_STATUS = ['DRAFT', 'PENDING_APPROVAL', 'APPROVED', 'PAID'] as const;
export const PayrollStatus = z.enum(PAYROLL_STATUS);
export type PayrollStatus = z.infer<typeof PayrollStatus>;
