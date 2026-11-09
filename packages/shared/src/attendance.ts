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

/**
 * A PIN that is trivial to guess is refused: this is the only thing between a
 * shared workshop tablet and another person's attendance record. Repeats
 * (111111) and runs (123456, 654321) are the first guesses anyone makes.
 */
function isWeakPin(pin: string): boolean {
  const digits = [...pin].map(Number);
  const allSame = digits.every((digit) => digit === digits[0]);

  let ascending = true;
  let descending = true;
  for (let index = 1; index < digits.length; index += 1) {
    const previous = digits[index - 1] ?? 0;
    const current = digits[index] ?? 0;
    if (current !== previous + 1) ascending = false;
    if (current !== previous - 1) descending = false;
  }

  return allSame || ascending || descending;
}

/**
 * Registering the PIN used to clock in. Sent right after the first successful
 * OTP sign-in, because an account without a PIN cannot record attendance.
 */
export const PinSetupInput = z
  .object({
    pin: z.string().regex(/^\d{6}$/, 'PIN mesti 6 digit'),
    /** Required only when replacing an existing PIN. */
    currentPin: z
      .string()
      .regex(/^\d{6}$/)
      .optional(),
  })
  .strict()
  .refine((value) => !isWeakPin(value.pin), {
    message: 'PIN terlalu mudah diteka',
    path: ['pin'],
  });
export type PinSetupInput = z.infer<typeof PinSetupInput>;

export const PinState = z.object({ hasPin: z.boolean() });
export type PinState = z.infer<typeof PinState>;

export const AttendanceSummary = z.object({
  present: z.int().nonnegative(),
  late: z.int().nonnegative(),
  onMc: z.int().nonnegative(),
  absent: z.int().nonnegative(),
  headcount: z.int().nonnegative(),
});
export type AttendanceSummary = z.infer<typeof AttendanceSummary>;
