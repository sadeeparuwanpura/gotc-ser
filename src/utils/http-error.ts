/**
 * The only error type the services throw. The error middleware is the only place that
 * turns one into a response body (API.md §Conventions):
 *
 *   { "error": { "code": "IN_USE", "message": "…", "details": { … } } }
 */

export const ERROR_CODES = [
  'UNAUTHENTICATED',
  'FORBIDDEN',
  'NOT_FOUND',
  'VALIDATION_FAILED',
  'IN_USE',
  'DUPLICATE',
  'INVALID_TRANSITION',
  'LAST_ADMIN',
  'ADMIN_PERMISSIONS_FIXED',
  'INCOMPLETE_OPERATIONS',
  'INTERNAL'
] as const;

export type ErrorCode = (typeof ERROR_CODES)[number];

const STATUS_BY_CODE: Readonly<Record<ErrorCode, number>> = {
  UNAUTHENTICATED: 401,
  FORBIDDEN: 403,
  NOT_FOUND: 404,
  VALIDATION_FAILED: 422,
  IN_USE: 409,
  DUPLICATE: 409,
  INVALID_TRANSITION: 409,
  LAST_ADMIN: 409,
  ADMIN_PERMISSIONS_FIXED: 409,
  INCOMPLETE_OPERATIONS: 409,
  INTERNAL: 500
};

export type ErrorDetails = Record<string, unknown>;

export class HttpError extends Error {
  readonly code: ErrorCode;
  readonly status: number;
  readonly details: ErrorDetails | undefined;

  constructor(code: ErrorCode, message: string, details?: ErrorDetails) {
    super(message);
    this.name = 'HttpError';
    this.code = code;
    this.status = STATUS_BY_CODE[code];
    this.details = details;
    Error.captureStackTrace?.(this, HttpError);
  }

  static unauthenticated(message = 'Sign in to continue.'): HttpError {
    return new HttpError('UNAUTHENTICATED', message);
  }

  static forbidden(message: string, details?: ErrorDetails): HttpError {
    return new HttpError('FORBIDDEN', message, details);
  }

  static notFound(message: string, details?: ErrorDetails): HttpError {
    return new HttpError('NOT_FOUND', message, details);
  }

  static validation(message: string, details?: ErrorDetails): HttpError {
    return new HttpError('VALIDATION_FAILED', message, details);
  }

  static inUse(message: string, details?: ErrorDetails): HttpError {
    return new HttpError('IN_USE', message, details);
  }

  static duplicate(message: string, details?: ErrorDetails): HttpError {
    return new HttpError('DUPLICATE', message, details);
  }

  static invalidTransition(message: string, details?: ErrorDetails): HttpError {
    return new HttpError('INVALID_TRANSITION', message, details);
  }

  static lastAdmin(name: string): HttpError {
    return new HttpError('LAST_ADMIN', `${name} is the last admin. Promote another user first.`);
  }

  static adminPermissionsFixed(): HttpError {
    return new HttpError(
      'ADMIN_PERMISSIONS_FIXED',
      'Admin always has every permission. The Admin group is fixed so the system cannot be locked out.'
    );
  }

  static incompleteOperations(count: number, details: ErrorDetails): HttpError {
    return new HttpError(
      'INCOMPLETE_OPERATIONS',
      `A cone order needs a thread at every position. ${count} operation${count === 1 ? '' : 's'} have unassigned positions.`,
      details
    );
  }

  static internal(message = 'Something went wrong on the server.'): HttpError {
    return new HttpError('INTERNAL', message);
  }
}
