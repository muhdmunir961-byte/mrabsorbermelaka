import type {
  EmployeeDirectoryQuery,
  EmployeeProfileView,
  EmployeeSummary,
  EmploymentStatusInput,
  Page,
} from '@mr/shared';
import type { SessionUser } from '../../auth/session.js';
import { decryptField } from '../../crypto/field.js';
import { conflict, forbidden, notFound } from '../../errors.js';
import { employeeRepository as repo } from './repository.js';

export async function listDirectory(query: EmployeeDirectoryQuery): Promise<Page<EmployeeSummary>> {
  const { total, rows } = await repo.list(query);
  return {
    items: rows.map((row) => ({
      id: row.id,
      fullName: row.fullName,
      role: row.role,
      branchCode: row.branch.code,
      status: row.status,
      avatarUrl: row.avatarUrl,
    })),
    page: query.page,
    pageSize: query.pageSize,
    total,
  };
}

export async function getProfile(
  user: SessionUser,
  employeeId: string,
): Promise<EmployeeProfileView> {
  const isSelf = user.employeeId === employeeId;
  const canSeeOthers = user.role === 'ADMIN_HR' || user.role === 'OWNER';
  if (!isSelf && !canSeeOthers) {
    throw forbidden('You may only view your own profile');
  }

  const employee = await repo.findProfile(employeeId);
  if (!employee) throw notFound('That employee does not exist');

  const now = new Date();
  const year = now.getFullYear();

  const [
    balance,
    attendanceRatePct,
    jobsCompleted,
    mcDaysThisYear,
    commissionThisMonthSen,
    documents,
    recentLeave,
  ] = await Promise.all([
    repo.findLeaveBalance(employeeId, year),
    repo.attendanceRate(employeeId),
    repo.jobsCompleted(employeeId),
    repo.mcDays(year, employeeId),
    repo.commissionInMonth(employeeId, year, now.getMonth() + 1),
    repo.documents(employeeId),
    repo.recentLeave(employeeId),
  ]);

  const leaveRemainingDays = balance
    ? balance.entitlementDays - balance.usedDays - balance.pendingDays
    : employee.leaveEntitlementDays;

  return {
    id: employee.id,
    fullName: employee.fullName,
    role: employee.role,
    branchCode: employee.branch.code,
    status: employee.status,
    avatarUrl: employee.avatarUrl,
    phone: employee.phone,
    // Personal fields are stored encrypted; they are decrypted only here, on the
    // one route that is allowed to show them.
    identityCardNumber: decryptField(employee.identityCardEnc),
    address: decryptField(employee.addressEnc),
    emergencyContactName: employee.emergencyContactName,
    emergencyContactPhone: employee.emergencyContactPhoneEnc
      ? decryptField(employee.emergencyContactPhoneEnc)
      : '',
    maritalStatus: employee.maritalStatus,
    joinedOn: employee.joinedOn.toISOString().slice(0, 10),
    employmentStatus: employee.status,
    leaveRemainingDays,
    stats: { attendanceRatePct, jobsCompleted, mcDaysThisYear, commissionThisMonthSen },
    documents: documents.map((doc) => ({
      id: doc.id,
      kind: doc.kind,
      mimeType: doc.mimeType,
      sizeBytes: doc.sizeBytes,
      createdAt: doc.createdAt.toISOString(),
    })),
    recentLeave: recentLeave.map((row) => ({
      id: row.id,
      type: row.type,
      status: row.status,
      startDate: row.startDate.toISOString().slice(0, 10),
      endDate: row.endDate.toISOString().slice(0, 10),
      days: row.days,
    })),
  };
}

export async function changeEmploymentStatus(
  approver: SessionUser,
  employeeId: string,
  input: EmploymentStatusInput,
): Promise<{ id: string; status: string }> {
  if (input.status === 'ACTIVE') {
    throw conflict('Reactivating an employee is not supported by this endpoint');
  }

  const current = await repo.findStatus(employeeId);
  if (!current) throw notFound('That employee does not exist');

  if (current.status !== 'ACTIVE') {
    throw conflict(`That employee is already ${current.status.toLowerCase()}`);
  }

  // Nobody should be able to lock themselves out of administration.
  if (employeeId === approver.employeeId) {
    throw forbidden('You cannot change your own employment status');
  }

  const changed = await repo.changeStatus(employeeId, 'ACTIVE', input.status);
  if (!changed) throw conflict('That employee changed status a moment ago; reload and retry');

  return { id: employeeId, status: input.status };
}
