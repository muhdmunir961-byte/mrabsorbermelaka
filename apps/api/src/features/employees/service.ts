import type {
  EmployeeDirectoryQuery,
  EmployeeProfileView,
  EmployeeSummary,
  EmploymentStatusInput,
  Page,
} from '@mr/shared';
import type { SessionUser } from '../../auth/session.js';
import { ADMIN_ROLES } from '../../auth/guard.js';
import { decryptField, blindIndex, encryptField, encryptSen } from '../../crypto/field.js';
import { conflict, forbidden, notFound, validationFailed } from '../../errors.js';
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

/**
 * Who may change whose record. An ADMIN_HR runs the floor day to day, but an
 * OWNER outranks them: without this an HR admin could suspend or rename the owner
 * and take the account over.
 */
export function assertMayManage(
  actor: SessionUser,
  target: { id: string; role: 'STAFF' | 'FOREMAN' | 'ADMIN_HR' | 'OWNER' },
): void {
  if (!ADMIN_ROLES.includes(actor.role)) throw forbidden();
  if (target.role === 'OWNER' && actor.role !== 'OWNER') {
    throw forbidden('Hanya OWNER boleh mengubah rekod OWNER');
  }
}

/** Roles an actor is allowed to hand out. ADMIN_HR may not mint another OWNER. */
export function assertMayAssignRole(
  actor: SessionUser,
  role: 'STAFF' | 'FOREMAN' | 'ADMIN_HR' | 'OWNER',
): void {
  if (!ADMIN_ROLES.includes(actor.role)) throw forbidden();
  if ((role === 'OWNER' || role === 'ADMIN_HR') && actor.role !== 'OWNER') {
    throw forbidden('Hanya OWNER boleh mencipta akaun ADMIN_HR atau OWNER');
  }
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

  assertMayManage(approver, { id: employeeId, role: current.role });

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

/**
 * Corrects a misspelled or outdated name. Kept here rather than in the Telegram
 * module so the rule that only HR/owner may edit an employee record lives with the
 * rest of the employee rules.
 */
export async function renameEmployee(
  actor: SessionUser,
  employeeId: string,
  fullName: string,
): Promise<{ id: string; fullName: string }> {
  const target = await repo.findStatus(employeeId);
  if (!target) throw notFound('That employee does not exist');
  assertMayManage(actor, { id: employeeId, role: target.role });

  const name = fullName.trim().replace(/\s+/g, ' ');
  if (name.length < 3) {
    throw validationFailed([{ path: 'fullName', message: 'Nama terlalu pendek' }]);
  }
  if (name.length > 120) {
    throw validationFailed([{ path: 'fullName', message: 'Nama terlalu panjang' }]);
  }

  return repo.rename(employeeId, name);
}

/**
 * Creates an employee from a phone, a name and a role, so HR can onboard someone
 * without the web app. Identity number, address and salary are written as
 * placeholders because the schema requires them; HR fills them in afterwards.
 */
export async function createEmployee(
  actor: SessionUser,
  input: {
    phone: string;
    fullName: string;
    role: 'STAFF' | 'FOREMAN' | 'ADMIN_HR' | 'OWNER';
    branchCode: 'MELAKA_UTAMA' | 'AYER_KEROH';
  },
): Promise<{ id: string; fullName: string; phone: string; role: string }> {
  assertMayAssignRole(actor, input.role);

  const name = input.fullName.trim().replace(/\s+/g, ' ');
  if (name.length < 3) {
    throw validationFailed([{ path: 'fullName', message: 'Nama terlalu pendek' }]);
  }
  if (name.length > 120) {
    throw validationFailed([{ path: 'fullName', message: 'Nama terlalu panjang' }]);
  }

  const existing = await repo.findByPhone(input.phone);
  if (existing) {
    throw conflict(`Nombor ${input.phone} sudah didaftarkan untuk ${existing.fullName}`);
  }

  const branch = await repo.findBranchByCode(input.branchCode);
  if (!branch) throw notFound(`Cawangan ${input.branchCode} tidak wujud`);

  // Unique placeholder so the blind index does not collide between new records.
  const placeholderIc = `000000-00-${input.phone.slice(-6)}`;
  const identityCardIndex = blindIndex(placeholderIc);
  const clash = await repo.findByIdentityIndex(identityCardIndex);
  if (clash) {
    throw conflict(
      'Rekod placeholder bertembung; daftar pekerja ini melalui web dengan IC sebenar',
    );
  }

  return repo.create({
    fullName: name,
    phone: input.phone,
    role: input.role,
    branchId: branch.id,
    joinedOn: new Date(),
    maritalStatus: 'Belum Dikemaskini',
    emergencyContactName: 'Belum Dikemaskini',
    identityCardEnc: encryptField(placeholderIc),
    identityCardIndex,
    addressEnc: encryptField('Belum Dikemaskini'),
    emergencyContactPhoneEnc: encryptField(input.phone),
    baseSalaryEnc: encryptSen(0),
    hourlyRateEnc: encryptSen(0),
  });
}
