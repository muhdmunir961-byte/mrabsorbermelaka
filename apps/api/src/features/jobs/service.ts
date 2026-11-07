import { type JobCard, type JobTransitionInput, type JobBoard } from '@mr/shared';
import type { SessionUser } from '../../auth/session.js';
import { conflict, forbidden, notFound } from '../../errors.js';
import { jobRepository as repo, type JobRow } from './repository.js';

/** Which status changes are legal. Anything else is a bug, not a request. */
const ALLOWED_TRANSITIONS: Record<string, readonly string[]> = {
  ASSIGNED: ['IN_PROGRESS', 'CANCELLED'],
  IN_PROGRESS: ['BLOCKED', 'COMPLETED', 'CANCELLED'],
  BLOCKED: ['IN_PROGRESS', 'CANCELLED'],
  COMPLETED: [],
  CANCELLED: [],
};

function toCard(row: JobRow): JobCard {
  return {
    id: row.id,
    plateNumber: row.vehicle.plateNumber,
    vehicleModel: row.vehicle.model,
    serviceName: row.serviceType.name,
    estimatedMinutes: row.estimatedMinutes,
    commissionSen: row.commissionSen,
    status: row.status,
    progressPct: row.progressPct,
    assigneeId: row.assigneeId,
    startedAt: row.startedAt ? row.startedAt.toISOString() : null,
  };
}

export async function getBoard(branchId?: string): Promise<JobBoard> {
  const [assigned, inProgress, completed] = await Promise.all([
    repo.listByStatus(['ASSIGNED'], branchId),
    repo.listByStatus(['IN_PROGRESS', 'BLOCKED'], branchId),
    repo.listByStatus(['COMPLETED'], branchId),
  ]);

  return {
    assigned: assigned.map(toCard),
    inProgress: inProgress.map(toCard),
    completed: completed.map(toCard),
  };
}

export async function transitionJob(user: SessionUser, jobId: string, input: JobTransitionInput) {
  const job = await repo.findById(jobId);
  if (!job) throw notFound('That job does not exist');

  const allowed = ALLOWED_TRANSITIONS[job.status] ?? [];
  if (!allowed.includes(input.status)) {
    throw conflict(`A job in ${job.status} cannot move to ${input.status}`);
  }

  // A mechanic may only move their own work; foremen and above may move any.
  const isOwnerOrForeman = user.role === 'FOREMAN' || user.role === 'OWNER';
  if (!isOwnerOrForeman && job.assigneeId !== user.employeeId) {
    throw forbidden('That job is assigned to another mechanic');
  }

  const now = new Date();
  const updated = await repo.update(jobId, {
    status: input.status,
    ...(input.progressPct !== undefined ? { progressPct: input.progressPct } : {}),
    ...(input.status === 'IN_PROGRESS' && !job.startedAt ? { startedAt: now } : {}),
    ...(input.status === 'COMPLETED'
      ? { completedAt: now, progressPct: input.progressPct ?? 100 }
      : {}),
  });

  return toCard(updated);
}

export async function commissionToday(user: SessionUser, now = new Date()): Promise<number> {
  const startOfDay = new Date(now);
  startOfDay.setUTCHours(0, 0, 0, 0);
  return repo.commissionSince(user.employeeId, startOfDay);
}
