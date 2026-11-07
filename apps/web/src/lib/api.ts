import { z } from 'zod';
import { StoredDocument } from '@mr/shared';
import { apiUrl } from './config';

const ErrorEnvelope = z.object({
  error: z.object({
    code: z.string(),
    message: z.string(),
    correlationId: z.string(),
    details: z.array(z.object({ path: z.string(), message: z.string() })).optional(),
  }),
});

export class ApiError extends Error {
  readonly code: string;
  readonly status: number;
  readonly details: { path: string; message: string }[];

  constructor(
    code: string,
    message: string,
    status: number,
    details: { path: string; message: string }[],
  ) {
    super(message);
    this.name = 'ApiError';
    this.code = code;
    this.status = status;
    this.details = details;
  }
}

/**
 * Every response is parsed through a schema at the boundary, so an API change
 * shows up as a loud validation error instead of `undefined` deep in a render.
 */
export async function api<T>(
  path: string,
  schema: z.ZodType<T>,
  init: RequestInit = {},
): Promise<T> {
  const response = await fetch(apiUrl(path), {
    credentials: 'include',
    ...init,
    headers: {
      ...(init.body ? { 'content-type': 'application/json' } : {}),
      ...init.headers,
    },
  });

  if (response.status === 204) {
    return schema.parse(undefined);
  }

  const payload: unknown = await response.json().catch(() => null);

  if (!response.ok) {
    const parsed = ErrorEnvelope.safeParse(payload);
    if (parsed.success) {
      throw new ApiError(
        parsed.data.error.code,
        parsed.data.error.message,
        response.status,
        parsed.data.error.details ?? [],
      );
    }
    throw new ApiError('INTERNAL', 'The server did not answer as expected', response.status, []);
  }

  return schema.parse(payload);
}

/**
 * Uploads a file as a raw body with its metadata in headers. The server checks
 * the real bytes, so the browser's file.type is a convenience, not a promise.
 */
export async function apiUpload<T>(
  path: string,
  file: File,
  kind: 'MC' | 'LEAVE_SUPPORT' | 'IDENTITY' | 'OTHER',
  schema?: z.ZodType<T>,
): Promise<T> {
  const response = await fetch(apiUrl(path), {
    method: 'POST',
    credentials: 'include',
    headers: {
      'content-type': file.type,
      'x-document-kind': kind,
      'x-document-type': file.type,
      'x-document-size': String(file.size),
    },
    body: file,
  });

  const payload: unknown = await response.json().catch(() => null);

  if (!response.ok) {
    const parsed = ErrorEnvelope.safeParse(payload);
    throw new ApiError(
      parsed.success ? parsed.data.error.code : 'INTERNAL',
      parsed.success ? parsed.data.error.message : 'Muat naik gagal',
      response.status,
      parsed.success ? (parsed.data.error.details ?? []) : [],
    );
  }

  return (schema ?? (StoredDocument as unknown as z.ZodType<T>)).parse(payload);
}
