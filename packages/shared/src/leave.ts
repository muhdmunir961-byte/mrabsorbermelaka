import { z } from 'zod';
import { LeaveType, RequestStatus, Role } from './enums.js';

const MS_PER_DAY = 86_400_000;

/** Inclusive day count between two ISO dates (YYYY-MM-DD). Shared by API and web. */
export function countLeaveDays(startDate: string, endDate: string): number {
  const start = Date.parse(`${startDate}T00:00:00.000Z`);
  const end = Date.parse(`${endDate}T00:00:00.000Z`);
  if (Number.isNaN(start) || Number.isNaN(end) || end < start) return 0;
  return Math.floor((end - start) / MS_PER_DAY) + 1;
}

export const LeaveBalance = z.object({
  year: z.int().min(2000).max(2100),
  entitlementDays: z.int().nonnegative(),
  usedDays: z.int().nonnegative(),
  pendingDays: z.int().nonnegative(),
});
export type LeaveBalance = z.infer<typeof LeaveBalance>;

export function remainingLeaveDays(balance: LeaveBalance): number {
  return balance.entitlementDays - balance.usedDays - balance.pendingDays;
}

const DateRangeShape = {
  startDate: z.iso.date(),
  endDate: z.iso.date(),
} as const;

const endAfterStart = (value: { startDate: string; endDate: string }) =>
  value.endDate >= value.startDate;

export const LeaveRequestInput = z
  .object({
    type: LeaveType,
    reason: z.string().trim().min(3, 'Say briefly why').max(500),
    attachmentId: z.uuid().nullable(),
    ...DateRangeShape,
  })
  .strict()
  .refine(endAfterStart, {
    message: 'The end date cannot be before the start date',
    path: ['endDate'],
  });
export type LeaveRequestInput = z.infer<typeof LeaveRequestInput>;

/** Medical certificate submission: the clinic name is required because the
 *  approver checks it against the uploaded document. */
export const McRequestInput = z
  .object({
    clinicName: z.string().trim().min(1, 'Name the clinic').max(120),
    documentId: z.uuid(),
    ...DateRangeShape,
  })
  .strict()
  .refine(endAfterStart, {
    message: 'The end date cannot be before the start date',
    path: ['endDate'],
  });
export type McRequestInput = z.infer<typeof McRequestInput>;

export const LeaveRequest = z.object({
  id: z.uuid(),
  employeeId: z.uuid(),
  type: LeaveType,
  status: RequestStatus,
  startDate: z.iso.date(),
  endDate: z.iso.date(),
  days: z.int().positive(),
  reason: z.string(),
  decidedByEmployeeId: z.uuid().nullable(),
  decidedAt: z.iso.datetime({ offset: true }).nullable(),
});
export type LeaveRequest = z.infer<typeof LeaveRequest>;

export const ApprovalDecision = z.enum(['APPROVE', 'REJECT']);
export type ApprovalDecision = z.infer<typeof ApprovalDecision>;

export const ApprovalInput = z
  .object({
    decision: ApprovalDecision,
    note: z.string().trim().max(300).optional(),
  })
  .strict();
export type ApprovalInput = z.infer<typeof ApprovalInput>;

/** Who else is already away over the requested dates. Advisory, never blocking. */
export const LeaveConflict = z.object({
  overlappingEmployeeNames: z.array(z.string()),
  message: z.string(),
});
export type LeaveConflict = z.infer<typeof LeaveConflict>;

export const LeaveSubmission = z.object({
  request: LeaveRequest,
  conflict: LeaveConflict.nullable(),
});
export type LeaveSubmission = z.infer<typeof LeaveSubmission>;

/** A request as an approver sees it: the request plus who submitted it. */
export const LeaveQueueItem = LeaveRequest.extend({
  employeeName: z.string(),
  employeeRole: Role,
  clinicName: z.string().nullable(),
  documentId: z.uuid().nullable(),
});
export type LeaveQueueItem = z.infer<typeof LeaveQueueItem>;

export const BatchApprovalInput = z
  .object({
    requestIds: z.array(z.uuid()).min(1, 'Select at least one request').max(50),
    decision: ApprovalDecision,
    note: z.string().trim().max(300).optional(),
  })
  .strict();
export type BatchApprovalInput = z.infer<typeof BatchApprovalInput>;
