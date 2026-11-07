import type { AllowedMimeType, DocumentKind, StoredDocument, UploadMetadata } from '@mr/shared';
import type { SessionUser } from '../../auth/session.js';
import { forbidden, notFound, validationFailed } from '../../errors.js';
import { newStorageKey, storage } from '../../storage/documents.js';
import { documentRepository as repo } from './repository.js';

/**
 * Magic-number check. The client's Content-Type is a claim, not evidence, so the
 * first bytes of the payload are what actually decide whether a file is allowed.
 */
function sniffMime(body: Buffer): AllowedMimeType | null {
  if (body.length >= 3 && body[0] === 0xff && body[1] === 0xd8 && body[2] === 0xff) {
    return 'image/jpeg';
  }
  if (
    body.length >= 8 &&
    body[0] === 0x89 &&
    body[1] === 0x50 &&
    body[2] === 0x4e &&
    body[3] === 0x47
  ) {
    return 'image/png';
  }
  if (
    body.length >= 12 &&
    body.subarray(0, 4).toString('ascii') === 'RIFF' &&
    body.subarray(8, 12).toString('ascii') === 'WEBP'
  ) {
    return 'image/webp';
  }
  if (body.length >= 5 && body.subarray(0, 5).toString('ascii') === '%PDF-') {
    return 'application/pdf';
  }
  return null;
}

export async function upload(
  user: SessionUser,
  metadata: UploadMetadata,
  body: Buffer,
): Promise<StoredDocument> {
  if (body.length !== metadata.sizeBytes) {
    throw validationFailed([
      { path: 'sizeBytes', message: 'Saiz fail tidak sepadan dengan kandungan.' },
    ]);
  }

  const sniffed = sniffMime(body);
  if (sniffed === null) {
    throw validationFailed([
      { path: 'mimeType', message: 'Hanya JPEG, PNG, WebP atau PDF diterima.' },
    ]);
  }
  if (sniffed !== metadata.mimeType) {
    throw validationFailed([
      {
        path: 'mimeType',
        message: `Isi fail ialah ${sniffed}, bukan ${metadata.mimeType}.`,
      },
    ]);
  }

  const storageKey = newStorageKey(user.employeeId);
  await storage.put(storageKey, body);

  const record = await repo.create({
    employeeId: user.employeeId,
    kind: metadata.kind,
    mimeType: sniffed,
    sizeBytes: body.length,
    storageKey,
  });

  return {
    id: record.id,
    kind: record.kind as DocumentKind,
    mimeType: record.mimeType as AllowedMimeType,
    sizeBytes: record.sizeBytes,
    createdAt: record.createdAt.toISOString(),
  };
}

export async function listMine(user: SessionUser): Promise<StoredDocument[]> {
  const rows = await repo.listForEmployee(user.employeeId);
  return rows.map((row) => ({
    id: row.id,
    kind: row.kind as DocumentKind,
    mimeType: row.mimeType as AllowedMimeType,
    sizeBytes: row.sizeBytes,
    createdAt: row.createdAt.toISOString(),
  }));
}

export async function readDocument(
  user: SessionUser,
  documentId: string,
): Promise<{ body: Buffer; mimeType: string; sizeBytes: number }> {
  const row = await repo.findAny(documentId);
  if (!row) throw notFound('That document does not exist');

  // The owner, or HR/owner, may read it. Anyone else gets the same 404 as a
  // missing document so the existence of a file is not leaked.
  const isOwner = row.employeeId === user.employeeId;
  const isAdmin = user.role === 'ADMIN_HR' || user.role === 'OWNER';
  if (!isOwner && !isAdmin) throw notFound('That document does not exist');

  const body = await storage.get(row.storageKey);
  return { body, mimeType: row.mimeType, sizeBytes: row.sizeBytes };
}

export async function removeDocument(user: SessionUser, documentId: string): Promise<void> {
  const row = await repo.findOwned(documentId, user.employeeId);
  if (!row) throw forbidden('You can only remove your own documents');

  // Only draft-time removal is allowed: a document already attached to a leave
  // request is evidence, and deleting it silently would hide the trail.
  const attached = await repo.findAttachedRequest(documentId);
  if (attached) {
    throw forbidden('Dokumen ini digunakan oleh permohonan; tidak boleh dipadam');
  }

  await storage.remove(row.storageKey);
  await repo.remove(row.id);
}
