import { z } from 'zod';
import { AttendanceState, ClockMethod } from './enums.js';

export const AttendanceRecord = z.object({
  id: z.uuid(),
  employeeId: z.uuid(),
  workDate: z.iso.date(),
  state: AttendanceState,
  clockInAt: z.iso.datetime({ offset: true }).nullable(),
  clockOutAt: z.iso.datetime({ offset: true }).nullable(),
  method: ClockMethod,
  /** Distance in metres from the branch geofence centre. */
  geofenceDistanceM: z.int().nonnegative().nullable(),
  lateMinutes: z.int().nonnegative(),
});
export type AttendanceRecord = z.infer<typeof AttendanceRecord>;

export const ClockInInput = z
  .object({
    method: ClockMethod,
    latitude: z.number().min(-90).max(90),
    longitude: z.number().min(-180).max(180),
    /** Only required when method is PIN. */
    pin: z
      .string()
      .regex(/^\d{6}$/, 'PIN is six digits')
      .optional(),
  })
  .strict()
  .refine((value) => value.method !== 'PIN' || value.pin !== undefined, {
    message: 'A PIN is required when clocking in by PIN',
    path: ['pin'],
  });
export type ClockInInput = z.infer<typeof ClockInInput>;

export const AttendanceSummary = z.object({
  present: z.int().nonnegative(),
  late: z.int().nonnegative(),
  onMc: z.int().nonnegative(),
  absent: z.int().nonnegative(),
  headcount: z.int().nonnegative(),
});
export type AttendanceSummary = z.infer<typeof AttendanceSummary>;
