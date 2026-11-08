import type {
  ApprovalInput,
  BatchApprovalInput,
  LeaveQueueItem,
  LeaveRequest,
  LeaveRequestInput,
  LeaveSubmission,
  LeaveType,
  McRequestInput,
  RequestStatus,
  Role,
} from '@mr/shared';
import type { SessionUser } from '../../auth/session.js';
import { conflict, notFound, validationFailed } from '../../errors.js';
import { leaveRepository as repo } from './repository.js';
import { notifyLeaveApprovalPersonal, notifyMonitoringGroup } from '../telegram/service.js';
import {
  consumesEntitlement,
  countLeaveDays,
  hasEnoughBalance,
  remainingLeaveDays,
  toDateOnly,
  yearOf,
} from './rules.js';

/** Only the columns a LeaveRequest needs, so callers do not have to load relations. */
interface RequestShape {
  id: string;
  employeeId: string;
  type: LeaveType;
  status: RequestStatus;
  startDate: Date;
  endDate: Date;
  days: number;
  reason: string;
  decidedById: string | null;
  decidedAt: Date | null;
}

function toLeaveRequest(row: RequestShape): LeaveRequest {
  return {
    id: row.id,
    employeeId: row.employeeId,
    type: row.type,
    status: row.status,
    startDate: row.startDate.toISOString().slice(0, 10),
    endDate: row.endDate.toISOString().slice(0, 10),
    days: row.days,
    reason: row.reason,
    decidedByEmployeeId: row.decidedById,
    decidedAt: row.decidedAt ? row.decidedAt.toISOString() : null,
  };
}

type Employee = { id: string; fullName: string; role: Role; leaveEntitlementDays: number };

interface SubmitArgs {
  type: LeaveType;
  startDate: string;
  endDate: string;
  reason: string;
  clinicName: string | null;
  documentId: string | null;
}

async function submit(employee: Employee, args: SubmitArgs): Promise<LeaveSubmission> {
  const days = countLeaveDays(args.startDate, args.endDate);
  if (days <= 0) {
    throw validationFailed([
      { path: 'endDate', message: 'The end date must not precede the start date' },
    ]);
  }

  const year = yearOf(args.startDate);
  const balance = await repo.balanceFor(employee.id, year, employee.leaveEntitlementDays);

  if (!hasEnoughBalance(balance, days, args.type)) {
    throw validationFailed(
      [
        {
          path: 'startDate',
          message: `Baki cuti tahunan tidak mencukupi: tinggal ${remainingLeaveDays(balance)} hari, diminta ${days}.`,
        },
      ],
      'Not enough annual leave',
    );
  }

  const overlaps = await repo.findOverlaps(
    employee.id,
    toDateOnly(args.startDate),
    toDateOnly(args.endDate),
  );

  const created = await repo.createWithBalance(
    {
      employeeId: employee.id,
      type: args.type,
      startDate: toDateOnly(args.startDate),
      endDate: toDateOnly(args.endDate),
      days,
      reason: args.reason,
      clinicName: args.clinicName,
      documentId: args.documentId,
    },
    employee.id,
    year,
    consumesEntitlement(args.type) ? days : 0,
  );

  const names = overlaps.map((row) => row.employee.fullName);

  void notifyLeaveApprovalPersonal(
    created.id,
    `Permohonan ${args.type} baharu\nPekerja: ${employee.fullName}\nTarikh: ${args.startDate} hingga ${args.endDate}\nHari: ${days}\nSebab: ${args.reason}`,
  );
  void notifyMonitoringGroup(
    `Permohonan ${args.type} baharu\nPekerja: ${employee.fullName}\nTarikh: ${args.startDate} hingga ${args.endDate}\nHari: ${days}`,
  );

  return {
    request: toLeaveRequest(created),
    conflict:
      names.length > 0
        ? {
            overlappingEmployeeNames: names,
            message: `${names.length} ahli pasukan bercuti pada tarikh yang sama: ${names.join(', ')}. Kelulusan mungkin lambat.`,
          }
        : null,
  };
}

export async function submitLeave(
  user: SessionUser,
  input: LeaveRequestInput,
): Promise<LeaveSubmission> {
  const employee = await repo.findEmployee(user.employeeId);
  if (!employee) throw notFound('Your employee record could not be found');

  return submit(employee, {
    type: input.type,
    startDate: input.startDate,
    endDate: input.endDate,
    reason: input.reason,
    clinicName: null,
    documentId: input.attachmentId,
  });
}

export async function submitMedicalCertificate(
  user: SessionUser,
  input: McRequestInput,
): Promise<LeaveSubmission> {
  const employee = await repo.findEmployee(user.employeeId);
  if (!employee) throw notFound('Your employee record could not be found');

  const document = await repo.findDocument(input.documentId, employee.id);
  if (!document) {
    throw validationFailed([
      { path: 'documentId', message: 'Upload the medical certificate first, then submit.' },
    ]);
  }

  return submit(employee, {
    type: 'MEDICAL',
    startDate: input.startDate,
    endDate: input.endDate,
    reason: `MC — ${input.clinicName}`,
    clinicName: input.clinicName,
    documentId: input.documentId,
  });
}

export async function myRequests(user: SessionUser): Promise<LeaveRequest[]> {
  const employee = await repo.findEmployee(user.employeeId);
  if (!employee) throw notFound('Your employee record could not be found');

  const rows = await repo.listForEmployee(user.employeeId);
  return rows.map((row) => toLeaveRequest(row));
}

export async function pendingQueue(): Promise<LeaveQueueItem[]> {
  const rows = await repo.listPending();
  return rows.map((row) => ({
    ...toLeaveRequest(row),
    employeeName: row.employee.fullName,
    employeeRole: row.employee.role,
    clinicName: row.clinicName,
    documentId: row.documentId,
  }));
}

async function decideOne(
  approver: SessionUser,
  id: string,
  input: ApprovalInput,
): Promise<LeaveRequest> {
  const request = await repo.findRequest(id);
  if (!request) throw notFound('That request does not exist');
  if (request.status !== 'PENDING') throw conflict('That request has already been decided');

  const draws = consumesEntitlement(request.type);
  const year = yearOf(request.startDate.toISOString().slice(0, 10));

  // Make sure the year's row exists before it is incremented.
  await repo.balanceFor(request.employeeId, year, request.employee.leaveEntitlementDays);

  const updated = await repo.decideAtomically({
    id,
    status: input.decision === 'APPROVE' ? 'APPROVED' : 'REJECTED',
    decidedById: approver.employeeId,
    note: input.note ?? null,
    employeeId: request.employeeId,
    year,
    pendingDelta: draws ? -request.days : 0,
    usedDelta: draws && input.decision === 'APPROVE' ? request.days : 0,
  });

  if (!updated) throw conflict('That request was already decided by someone else');
  void notifyMonitoringGroup(
    `Permohonan ${request.type} ${input.decision === 'APPROVE' ? 'diluluskan' : 'ditolak'}\nPekerja: ${request.employee.fullName}\nOleh: ${approver.fullName}`,
  );
  return toLeaveRequest(updated);
}

export function decideRequest(user: SessionUser, id: string, input: ApprovalInput) {
  return decideOne(user, id, input);
}

export async function batchDecide(user: SessionUser, input: BatchApprovalInput) {
  const decided: LeaveRequest[] = [];
  const skipped: string[] = [];

  for (const id of input.requestIds) {
    try {
      decided.push(await decideOne(user, id, { decision: input.decision, note: input.note }));
    } catch {
      // One already-handled row must not fail the whole batch.
      skipped.push(id);
    }
  }

  return { decided, skipped };
}

export async function myBalance(user: SessionUser) {
  const employee = await repo.findEmployee(user.employeeId);
  if (!employee) throw notFound('Your employee record could not be found');

  const year = new Date().getFullYear();
  const balance = await repo.balanceFor(employee.id, year, employee.leaveEntitlementDays);
  return {
    year,
    entitlementDays: balance.entitlementDays,
    usedDays: balance.usedDays,
    pendingDays: balance.pendingDays,
    remainingDays: remainingLeaveDays(balance),
  };
}
