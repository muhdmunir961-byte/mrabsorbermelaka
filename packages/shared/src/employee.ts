import { z } from 'zod';
import { BranchCode, EmploymentStatus, Role } from './enums.js';

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
