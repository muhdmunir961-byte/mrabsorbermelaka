import { HTTP_STATUS_FOR, type ErrorCode } from '@mr/shared';

export interface ErrorDetail {
  path: string;
  message: string;
}

/**
 * Base error for anything the API raises deliberately. Unknown errors never
 * reach the client as-is; the handler turns them into a 500 plus a correlation id.
 */
export class AppError extends Error {
  readonly code: ErrorCode;
  readonly status: number;
  readonly details: ErrorDetail[] | undefined;

  constructor(code: ErrorCode, message: string, details?: ErrorDetail[]) {
    super(message);
    this.name = 'AppError';
    this.code = code;
    this.status = HTTP_STATUS_FOR[code];
    this.details = details;
  }
}

export const validationFailed = (details: ErrorDetail[], message = 'The request was rejected') =>
  new AppError('VALIDATION_FAILED', message, details);

export const unauthenticated = (message = 'Sign in to continue') =>
  new AppError('UNAUTHENTICATED', message);

export const forbidden = (message = 'You do not have access to this resource') =>
  new AppError('FORBIDDEN', message);

export const notFound = (message = 'Not found') => new AppError('NOT_FOUND', message);

export const conflict = (message: string) => new AppError('CONFLICT', message);
