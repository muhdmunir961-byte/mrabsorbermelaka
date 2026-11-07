import type { EmployeeDirectoryQuery, EmployeeProfile, EmployeeSummary, Page } from '@mr/shared';
import type { SessionUser } from '../../auth/session.js';
import { decryptField } from '../../crypto/field.js';
import { forbidden, notFound } from '../../errors.js';
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
): Promise<EmployeeProfile & { leaveRemainingDays: number }> {
  const isSelf = user.employeeId === employeeId;
  const canSeeOthers = user.role === 'ADMIN_HR' || user.role === 'OWNER';
  if (!isSelf && !canSeeOthers) {
    throw forbidden('You may only view your own profile');
  }

  const employee = await repo.findProfile(employeeId);
  if (!employee) throw notFound('That employee does not exist');

  const balance = await repo.findLeaveBalance(employeeId, new Date().getFullYear());
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
  };
}
