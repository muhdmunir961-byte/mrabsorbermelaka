import { z } from 'zod';
import { JobStatus } from './enums.js';
import { Sen } from './money.js';

export const JobCard = z.object({
  id: z.uuid(),
  plateNumber: z.string().min(1).max(12),
  vehicleModel: z.string().min(1).max(80),
  serviceName: z.string().min(1).max(120),
  estimatedMinutes: z.int().positive(),
  commissionSen: Sen,
  status: JobStatus,
  progressPct: z.int().min(0).max(100),
  assigneeId: z.uuid().nullable(),
  startedAt: z.iso.datetime({ offset: true }).nullable(),
});
export type JobCard = z.infer<typeof JobCard>;

export const JobTransitionInput = z
  .object({
    status: JobStatus,
    progressPct: z.int().min(0).max(100).optional(),
  })
  .strict();
export type JobTransitionInput = z.infer<typeof JobTransitionInput>;

/** A job board column, exactly as the foreman screen renders it. */
export const JobBoard = z.object({
  assigned: z.array(JobCard),
  inProgress: z.array(JobCard),
  completed: z.array(JobCard),
});
export type JobBoard = z.infer<typeof JobBoard>;
