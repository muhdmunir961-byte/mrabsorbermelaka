import { z } from 'zod';

/** What the workshop actually accepts for a medical certificate. */
export const DOCUMENT_KINDS = ['MC', 'LEAVE_SUPPORT', 'IDENTITY', 'OTHER'] as const;
export const DocumentKind = z.enum(DOCUMENT_KINDS);
export type DocumentKind = z.infer<typeof DocumentKind>;

/**
 * Allowed content types. SVG is deliberately excluded: an uploaded SVG served
 * from the same origin is a script execution vector.
 */
export const ALLOWED_MIME_TYPES = [
  'image/jpeg',
  'image/png',
  'image/webp',
  'application/pdf',
] as const;
export const AllowedMimeType = z.enum(ALLOWED_MIME_TYPES);
export type AllowedMimeType = z.infer<typeof AllowedMimeType>;

/** 5 MiB. A phone photo of a clinic slip is well under this. */
export const MAX_UPLOAD_BYTES = 5 * 1024 * 1024;

export const UploadMetadata = z
  .object({
    kind: DocumentKind,
    mimeType: AllowedMimeType,
    sizeBytes: z.int().positive().max(MAX_UPLOAD_BYTES, 'Fail melebihi 5 MB'),
  })
  .strict();
export type UploadMetadata = z.infer<typeof UploadMetadata>;

export const StoredDocument = z.object({
  id: z.uuid(),
  kind: DocumentKind,
  mimeType: AllowedMimeType,
  sizeBytes: z.int().nonnegative(),
  createdAt: z.iso.datetime({ offset: true }),
});
export type StoredDocument = z.infer<typeof StoredDocument>;
