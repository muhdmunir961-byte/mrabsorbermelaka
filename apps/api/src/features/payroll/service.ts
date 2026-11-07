import { computeNetPay } from '@mr/shared';
import type { PayrollLine, PayrollLineInput, PayrollPreview, PayrollRunDetail } from '@mr/shared';
import type { SessionUser } from '../../auth/session.js';
import { decryptSen } from '../../crypto/field.js';
import { conflict, forbidden, notFound } from '../../errors.js';
import { payrollRepository as repo } from './repository.js';

const ROLE_LABEL: Record<string, string> = {
  STAFF: 'Mekanik',
  FOREMAN: 'Foreman',
  ADMIN_HR: 'Admin / HR',
  OWNER: 'Pemilik',
};

/** First instant of the month and of the next one, in UTC. */
function periodBounds(year: number, month: number): { from: Date; to: Date } {
  return {
    from: new Date(Date.UTC(year, month - 1, 1, 0, 0, 0, 0)),
    to: new Date(Date.UTC(year, month, 1, 0, 0, 0, 0)),
  };
}

function anomalyFor(line: { netPaySen: number; overtimeHours: number }): string | null {
  if (line.netPaySen < 0) return 'Net pay negatif';
  if (line.overtimeHours > 120) return 'OT melebihi 120 jam';
  return null;
}

interface LineMeta {
  fullName: string;
  role: string;
}

function toPayrollLine(
  row: {
    employeeId: string;
    baseSalarySen: number;
    overtimeHours: unknown;
    commissionSen: number;
    deductionsSen: number;
    netPaySen: number;
    anomaly: string | null;
  },
  meta: LineMeta,
): PayrollLine {
  return {
    employeeId: row.employeeId,
    fullName: meta.fullName,
    roleLabel: ROLE_LABEL[meta.role] ?? meta.role,
    baseSalarySen: row.baseSalarySen,
    overtimeHours: Number(row.overtimeHours),
    commissionSen: row.commissionSen,
    deductionsSen: row.deductionsSen,
    netPaySen: row.netPaySen,
    anomaly: row.anomaly,
  };
}

function totalsOf(lines: PayrollLine[]) {
  return {
    totalNetPaySen: lines.reduce((sum, line) => sum + line.netPaySen, 0),
    totalCommissionSen: lines.reduce((sum, line) => sum + line.commissionSen, 0),
    totalDeductionsSen: lines.reduce((sum, line) => sum + line.deductionsSen, 0),
    employeeCount: lines.length,
    anomalyCount: lines.filter((line) => line.anomaly !== null).length,
  };
}

/**
 * Computes the month's payroll from stored data: decrypted base salary plus the
 * commission on jobs actually completed inside the period. Overtime and
 * deductions start at zero and are entered by an admin before approval.
 */
export async function buildPreview(year: number, month: number): Promise<PayrollPreview> {
  const { from, to } = periodBounds(year, month);
  const [employees, commission] = await Promise.all([
    repo.listEmployees(),
    repo.commissionByEmployee(from, to),
  ]);

  const lines: PayrollLine[] = employees.map((employee) => {
    const baseSalarySen = decryptSen(employee.baseSalaryEnc);
    const hourlyRateSen = decryptSen(employee.hourlyRateEnc);
    const commissionSen = commission.get(employee.id) ?? 0;
    const overtimeHours = 0;
    const deductionsSen = 0;
    const netPaySen = computeNetPay({
      baseSalarySen,
      overtimeHours,
      commissionSen,
      deductionsSen,
      hourlyRateSen,
    });

    return {
      employeeId: employee.id,
      fullName: employee.fullName,
      roleLabel: ROLE_LABEL[employee.role] ?? employee.role,
      baseSalarySen,
      overtimeHours,
      commissionSen,
      deductionsSen,
      netPaySen,
      anomaly: anomalyFor({ netPaySen, overtimeHours }),
    };
  });

  return { periodYear: year, periodMonth: month, lines, ...totalsOf(lines) };
}

type RunRow = NonNullable<Awaited<ReturnType<typeof repo.findRunById>>>;

function toRunDetail(run: RunRow): PayrollRunDetail {
  const lines = run.lines.map((row) =>
    toPayrollLine(row, { fullName: row.employee.fullName, role: row.employee.role }),
  );
  return {
    id: run.id,
    periodYear: run.periodYear,
    periodMonth: run.periodMonth,
    status: run.status,
    ...totalsOf(lines),
    lines,
  };
}

export async function createRun(year: number, month: number): Promise<PayrollRunDetail> {
  const existing = await repo.findRunByPeriod(year, month);
  if (existing) throw conflict('A payroll run already exists for that period');

  const preview = await buildPreview(year, month);
  if (preview.lines.length === 0) throw conflict('There are no active employees to pay');

  const run = await repo.createRun(
    year,
    month,
    preview.lines.map((line) => ({
      employeeId: line.employeeId,
      baseSalarySen: line.baseSalarySen,
      overtimeHours: line.overtimeHours,
      commissionSen: line.commissionSen,
      deductionsSen: line.deductionsSen,
      netPaySen: line.netPaySen,
      anomaly: line.anomaly,
    })),
  );

  return toRunDetail(run);
}

export async function getRun(id: string): Promise<PayrollRunDetail> {
  const run = await repo.findRunById(id);
  if (!run) throw notFound('That payroll run does not exist');
  return toRunDetail(run);
}

export async function updateLine(lineId: string, input: PayrollLineInput): Promise<PayrollLine> {
  const line = await repo.findLine(lineId);
  if (!line) throw notFound('That payroll line does not exist');
  if (line.run.status !== 'DRAFT') throw conflict('Only a draft run can be edited');

  const hourlyRateSen = decryptSen(line.employee.hourlyRateEnc);
  const netPaySen = computeNetPay({
    baseSalarySen: line.baseSalarySen,
    overtimeHours: input.overtimeHours,
    commissionSen: line.commissionSen,
    deductionsSen: input.deductionsSen,
    hourlyRateSen,
  });

  const updated = await repo.updateLine(lineId, {
    overtimeHours: input.overtimeHours,
    deductionsSen: input.deductionsSen,
    netPaySen,
    anomaly: anomalyFor({ netPaySen, overtimeHours: input.overtimeHours }),
  });

  return toPayrollLine(updated, {
    fullName: line.employee.fullName,
    role: line.employee.role,
  });
}

export async function submitRun(id: string): Promise<PayrollRunDetail> {
  const run = await repo.findRunById(id);
  if (!run) throw notFound('That payroll run does not exist');
  if (run.status !== 'DRAFT') throw conflict('Only a draft run can be submitted');

  const detail = toRunDetail(run);
  if (detail.anomalyCount > 0) {
    throw conflict(`Selesaikan ${detail.anomalyCount} anomali sebelum menghantar untuk kelulusan`);
  }

  return toRunDetail(await repo.setStatus(id, 'PENDING_APPROVAL'));
}

export async function approveRun(user: SessionUser, id: string): Promise<PayrollRunDetail> {
  if (user.role !== 'OWNER') throw forbidden('Only the owner can approve payroll');

  const run = await repo.findRunById(id);
  if (!run) throw notFound('That payroll run does not exist');
  if (run.status !== 'PENDING_APPROVAL') {
    throw conflict('Only a submitted run can be approved');
  }

  return toRunDetail(await repo.setStatus(id, 'APPROVED', user.employeeId));
}
