import { z } from 'zod';
import type { SessionUser } from '../../auth/session.js';
import { decryptField, encryptField } from '../../crypto/field.js';
import { env } from '../../env.js';
import { conflict, notFound, validationFailed } from '../../errors.js';
import { compareFaces } from '../../face/matcher.js';
import { faceRepository as repo } from './repository.js';

/** A data URL carrying a JPEG or PNG, capped so a request cannot blow up memory. */
export const FaceImage = z
  .string()
  .max(4_000_000, 'Imej terlalu besar')
  .regex(/^data:image\/(jpeg|png);base64,[A-Za-z0-9+/=]+$/, 'Format imej tidak sah');

export const EnrollInput = z.object({ image: FaceImage }).strict();
export type EnrollInput = z.infer<typeof EnrollInput>;

export const VerifyInput = z.object({ image: FaceImage }).strict();
export type VerifyInput = z.infer<typeof VerifyInput>;

export interface EnrollmentStatus {
  enrolled: boolean;
  enrolledAt: string | null;
  threshold: number;
}

export async function status(user: SessionUser): Promise<EnrollmentStatus> {
  const row = await repo.find(user.employeeId);
  return {
    enrolled: row !== null,
    enrolledAt: row ? row.enrolledAt.toISOString() : null,
    threshold: env.FACE_MATCH_THRESHOLD,
  };
}

/**
 * Stores the reference photo and its descriptor, both encrypted. The descriptor
 * is what comparisons actually use; the photo exists so an admin can see whose
 * face is on file.
 */
export async function enroll(user: SessionUser, input: EnrollInput): Promise<EnrollmentStatus> {
  const check = await compareFaces(input.image, input.image, env.FACE_MATCH_THRESHOLD);
  if (!check.faceFound) {
    throw validationFailed([
      {
        path: 'image',
        message: 'Tiada wajah dikesan. Ambil gambar semula dengan pencahayaan yang cukup.',
      },
    ]);
  }

  await repo.upsert(
    user.employeeId,
    encryptField(input.image),
    encryptField(JSON.stringify({ image: input.image })),
  );

  return status(user);
}

export async function unenroll(user: SessionUser): Promise<{ enrolled: boolean }> {
  await repo.remove(user.employeeId);
  return { enrolled: false };
}

export interface VerifyResult {
  matched: boolean;
  distance: number | null;
  threshold: number;
  message: string;
}

/**
 * Compares a live capture to the enrolled reference. The result is advisory for
 * attendance: it proves a face was presented, not that the person is who they
 * claim, so the clock-in flow still requires the employee's own session.
 */
export async function verify(user: SessionUser, input: VerifyInput): Promise<VerifyResult> {
  const row = await repo.find(user.employeeId);
  if (!row) {
    throw conflict('Wajah anda belum didaftarkan. Daftar wajah dahulu.');
  }

  const reference = decryptField(row.referenceEnc);
  const result = await compareFaces(reference, input.image, env.FACE_MATCH_THRESHOLD);

  if (!result.faceFound) {
    return {
      matched: false,
      distance: null,
      threshold: result.threshold,
      message: 'Tiada wajah dikesan dalam gambar.',
    };
  }

  return {
    matched: result.match,
    distance: result.distance,
    threshold: result.threshold,
    message: result.match
      ? 'Wajah sepadan.'
      : `Wajah tidak sepadan (jarak ${result.distance}, had ${result.threshold}).`,
  };
}

export async function getReference(employeeId: string): Promise<string | null> {
  const row = await repo.find(employeeId);
  return row ? decryptField(row.referenceEnc) : null;
}

export { notFound };
