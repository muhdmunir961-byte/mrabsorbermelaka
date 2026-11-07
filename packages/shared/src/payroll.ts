import { z } from 'zod';
import { PayrollStatus } from './enums.js';
import { Sen } from './money.js';

/** Overtime is tracked in hours to one decimal, e.g. 12.5. */
export const OvertimeHours = z.number().min(0).max(744).multipleOf(0.5);

export const PayrollLine = z.object({
  employeeId: z.uuid(),
  fullName: z.string(),
  roleLabel: z.string(),
  baseSalarySen: Sen,
  overtimeHours: OvertimeHours,
  commissionSen: Sen,
  deductionsSen: Sen,
  netPaySen: Sen,
  /** Set when the line needs a human look before approval. */
  anomaly: z.string().nullable(),
});
export type PayrollLine = z.infer<typeof PayrollLine>;

/** net = base + commission - deductions. Overtime is paid on top by policy. */
export function computeNetPay(line: {
  baseSalarySen: number;
  overtimeHours: number;
  commissionSen: number;
  deductionsSen: number;
  hourlyRateSen: number;
}): number {
  const overtimeSen = Math.round(line.overtimeHours * line.hourlyRateSen);
  return line.baseSalarySen + overtimeSen + line.commissionSen - line.deductionsSen;
}

export const PayrollRun = z.object({
  id: z.uuid(),
  periodYear: z.int().min(2000).max(2100),
  periodMonth: z.int().min(1).max(12),
  status: PayrollStatus,
  totalNetPaySen: Sen,
  totalCommissionSen: Sen,
  totalDeductionsSen: Sen,
  employeeCount: z.int().nonnegative(),
  anomalyCount: z.int().nonnegative(),
});
export type PayrollRun = z.infer<typeof PayrollRun>;

export const PayrollPeriodQuery = z
  .object({
    year: z.coerce.number().int().min(2000).max(2100),
    month: z.coerce.number().int().min(1).max(12),
  })
  .strict();
export type PayrollPeriodQuery = z.infer<typeof PayrollPeriodQuery>;
