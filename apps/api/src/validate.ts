import type { z } from 'zod';
import { validationFailed } from './errors.js';

/** Turn a Zod failure into the API's single error shape. */
export function toErrorDetails(error: z.ZodError): { path: string; message: string }[] {
  return error.issues.map((issue) => ({
    path: issue.path.join('.') || '(root)',
    message: issue.message,
  }));
}

/**
 * Parse untrusted input at the boundary. Never trust `request.body` directly.
 */
export function parseInput<T extends z.ZodType>(schema: T, value: unknown): z.infer<T> {
  const result = schema.safeParse(value);
  if (!result.success) {
    throw validationFailed(toErrorDetails(result.error));
  }
  return result.data;
}
