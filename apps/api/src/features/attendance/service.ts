import type { ClockInInput } from '@mr/shared';
import type { SessionUser } from '../../auth/session.js';
import { conflict, forbidden, notFound, unauthenticated, validationFailed } from '../../errors.js';
import { verifyPin } from '../../auth/pin.js';
import { attendanceRepository as repo, workDateFor } from './repository.js';
import { notifyMonitoringGroup } from '../telegram/service.js';

/** The workshop opens at 09:00 in Melaka; anything after that is late. */
const SHIFT_START_MINUTES = 9 * 60;

const EARTH_RADIUS_M = 6_371_000;

export function haversineMeters(
  fromLat: number,
  fromLon: number,
  toLat: number,
  toLon: number,
): number {
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const dLat = toRad(toLat - fromLat);
  const dLon = toRad(toLon - fromLon);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(fromLat)) * Math.cos(toRad(toLat)) * Math.sin(dLon / 2) ** 2;
  return Math.round(2 * EARTH_RADIUS_M * Math.asin(Math.sqrt(a)));
}

/** Minutes since midnight in the workshop's timezone, independent of server TZ. */
function localMinutesOfDay(instant: Date): number {
  const formatted = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Asia/Kuala_Lumpur',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(instant);
  const [hour = '0', minute = '0'] = formatted.split(':');
  return Number(hour) * 60 + Number(minute);
}

export async function clockIn(user: SessionUser, input: ClockInInput, now = new Date()) {
  const employee = await repo.findEmployee(user.employeeId);
  if (!employee) throw notFound('Your employee record could not be found');

  const workDate = workDateFor(now);
  const existing = await repo.findForDate(employee.id, workDate);
  if (existing?.clockInAt) throw conflict('You have already clocked in today');

  // Face verification is not implemented. Saying so is better than pretending a
  // camera check happened.
  if (input.method === 'FACE') {
    throw validationFailed(
      [{ path: 'method', message: 'Pengesahan wajah belum tersedia. Guna Kod PIN.' }],
      'Face verification is not available yet',
    );
  }

  // Only a foreman or above may record attendance on behalf of someone else.
  if (input.method === 'MANUAL') {
    throw forbidden('Manual attendance must be recorded by a foreman');
  }

  if (!verifyPin(input.pin ?? '', employee.pinHash)) {
    throw unauthenticated('That PIN is not valid');
  }

  const distance = haversineMeters(
    input.latitude,
    input.longitude,
    employee.latitude,
    employee.longitude,
  );

  if (distance > employee.geofenceRadiusM) {
    throw validationFailed(
      [
        {
          path: 'location',
          message: `You are ${distance} m from ${employee.branchName}. Clock in within ${employee.geofenceRadiusM} m.`,
        },
      ],
      'Outside the workshop geofence',
    );
  }

  const lateMinutes = Math.max(localMinutesOfDay(now) - SHIFT_START_MINUTES, 0);

  const record = await repo.create({
    employeeId: employee.id,
    workDate,
    state: lateMinutes > 0 ? 'LATE' : 'PRESENT',
    method: input.method,
    clockInAt: now,
    geofenceDistanceM: distance,
    lateMinutes,
  });
  void notifyMonitoringGroup(`Clock-in: ${employee.branchName} · ${employee.id} · ${record.state}`);
  return record;
}

export async function clockOut(user: SessionUser, now = new Date()) {
  const workDate = workDateFor(now);
  const open = await repo.openForDate(user.employeeId, workDate);
  if (!open) throw notFound('There is no open attendance record for today');
  const record = await repo.close(open.id, now);
  void notifyMonitoringGroup(`Clock-out: employee ${user.employeeId}`);
  return record;
}

export async function todaySummary(user: SessionUser, now = new Date()) {
  const employee = await repo.findEmployee(user.employeeId);
  const counts = await repo.countsForDate(workDateFor(now), employee?.branchId);
  return counts;
}

/** The signed-in employee's own record for today, or null if they have not clocked in. */
export async function myRecordToday(user: SessionUser, now = new Date()) {
  const record = await repo.findForDate(user.employeeId, workDateFor(now));
  if (!record) return null;
  return {
    id: record.id,
    state: record.state,
    method: record.method,
    clockInAt: record.clockInAt ? record.clockInAt.toISOString() : null,
    clockOutAt: record.clockOutAt ? record.clockOutAt.toISOString() : null,
    lateMinutes: record.lateMinutes,
    geofenceDistanceM: record.geofenceDistanceM,
  };
}

/**
 * What the clock-in screen needs before the employee acts: which branch they
 * belong to and how far the geofence reaches. No coordinates are exposed.
 */
export async function myClockContext(user: SessionUser) {
  const employee = await repo.findEmployee(user.employeeId);
  if (!employee) throw notFound('Your employee record could not be found');
  return {
    branchName: employee.branchName,
    branchCode: employee.branchCode,
    geofenceRadiusM: employee.geofenceRadiusM,
    shiftStartLabel: '09:00',
  };
}
