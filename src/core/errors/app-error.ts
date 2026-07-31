import { ErrorCode, type ErrorCodeValue } from '@/core/constants/error-codes'
import { HttpStatus, type HttpStatusCode } from '@/core/constants/http-status'

/** Structured, client-safe detail attached to an error response. */
export interface ErrorDetail {
  readonly field?: string
  readonly message: string
  readonly code?: string
}

export interface AppErrorOptions {
  readonly code?: ErrorCodeValue
  readonly details?: ErrorDetail[]
  /**
   * Operational errors are expected conditions (bad input, missing resource).
   * Non-operational errors indicate a bug or an unrecoverable state and are
   * always logged at `error` level with a full stack trace.
   */
  readonly isOperational?: boolean
  /** Underlying error, preserved for logs. Never serialised to the client. */
  readonly cause?: unknown
}

/**
 * Base class for every error deliberately thrown by the application.
 *
 * The global error handler relies on `instanceof AppError` to distinguish
 * intentional failures from unexpected ones, so throw a subclass of this rather
 * than a bare `Error` anywhere inside a request lifecycle.
 */
export class AppError extends Error {
  public readonly statusCode: HttpStatusCode
  public readonly code: ErrorCodeValue
  public readonly details: ErrorDetail[]
  public readonly isOperational: boolean
  public readonly timestamp: string
  public override readonly cause?: unknown

  constructor(
    message: string,
    statusCode: HttpStatusCode = HttpStatus.INTERNAL_SERVER_ERROR,
    options: AppErrorOptions = {},
  ) {
    super(message)

    this.name = new.target.name
    this.statusCode = statusCode
    this.code = options.code ?? ErrorCode.INTERNAL_ERROR
    this.details = options.details ?? []
    this.isOperational = options.isOperational ?? true
    this.timestamp = new Date().toISOString()
    this.cause = options.cause

    Object.setPrototypeOf(this, new.target.prototype)
    Error.captureStackTrace(this, new.target)
  }

  /** Client-safe projection. Never includes `cause` or the stack. */
  public toJSON(): Record<string, unknown> {
    return {
      name: this.name,
      code: this.code,
      message: this.message,
      statusCode: this.statusCode,
      ...(this.details.length > 0 ? { details: this.details } : {}),
    }
  }
}

// ---------------------------------------------------------------------------
// 4xx
// ---------------------------------------------------------------------------

export class BadRequestError extends AppError {
  constructor(message = 'The request could not be understood.', options: AppErrorOptions = {}) {
    super(message, HttpStatus.BAD_REQUEST, {
      code: ErrorCode.BAD_REQUEST,
      ...options,
    })
  }
}

export class ValidationError extends AppError {
  constructor(
    message = 'The request payload failed validation.',
    details: ErrorDetail[] = [],
    options: AppErrorOptions = {},
  ) {
    super(message, HttpStatus.UNPROCESSABLE_ENTITY, {
      code: ErrorCode.VALIDATION_ERROR,
      details,
      ...options,
    })
  }
}

/**
 * 401 — the caller is not authenticated, or their credentials/token failed.
 *
 * Defaults to a deliberately vague message: distinguishing “no such account”
 * from “wrong password” hands an attacker a user enumeration oracle.
 */
export class UnauthorizedError extends AppError {
  constructor(message = 'Authentication is required.', options: AppErrorOptions = {}) {
    super(message, HttpStatus.UNAUTHORIZED, {
      code: ErrorCode.UNAUTHENTICATED,
      ...options,
    })
  }
}

/** 403 — authenticated, but not permitted. */
export class ForbiddenError extends AppError {
  constructor(message = 'You do not have permission to perform this action.', options: AppErrorOptions = {}) {
    super(message, HttpStatus.FORBIDDEN, {
      code: ErrorCode.FORBIDDEN,
      ...options,
    })
  }
}

export class NotFoundError extends AppError {
  constructor(message = 'The requested resource was not found.', options: AppErrorOptions = {}) {
    super(message, HttpStatus.NOT_FOUND, {
      code: ErrorCode.NOT_FOUND,
      ...options,
    })
  }
}

export class RouteNotFoundError extends NotFoundError {
  constructor(method: string, path: string) {
    super(`Cannot ${method.toUpperCase()} ${path}`, {
      code: ErrorCode.ROUTE_NOT_FOUND,
      details: [
        {
          message:
            'No route matches this method and path. Check the API base path and the OpenAPI document.',
        },
      ],
    })
  }
}

export class ConflictError extends AppError {
  constructor(message = 'The request conflicts with the current state.', options: AppErrorOptions = {}) {
    super(message, HttpStatus.CONFLICT, {
      code: ErrorCode.CONFLICT,
      ...options,
    })
  }
}

export class PayloadTooLargeError extends AppError {
  constructor(message = 'The request payload is too large.', options: AppErrorOptions = {}) {
    super(message, HttpStatus.PAYLOAD_TOO_LARGE, {
      code: ErrorCode.PAYLOAD_TOO_LARGE,
      ...options,
    })
  }
}

export class TooManyRequestsError extends AppError {
  constructor(message = 'Too many requests. Please retry later.', options: AppErrorOptions = {}) {
    super(message, HttpStatus.TOO_MANY_REQUESTS, {
      code: ErrorCode.RATE_LIMIT_EXCEEDED,
      ...options,
    })
  }
}

// ---------------------------------------------------------------------------
// 5xx
// ---------------------------------------------------------------------------

export class InternalServerError extends AppError {
  constructor(message = 'An unexpected error occurred.', options: AppErrorOptions = {}) {
    super(message, HttpStatus.INTERNAL_SERVER_ERROR, {
      code: ErrorCode.INTERNAL_ERROR,
      isOperational: false,
      ...options,
    })
  }
}

export class NotImplementedError extends AppError {
  constructor(message = 'This capability is not implemented yet.', options: AppErrorOptions = {}) {
    super(message, HttpStatus.NOT_IMPLEMENTED, {
      code: ErrorCode.NOT_IMPLEMENTED,
      ...options,
    })
  }
}

export class DatabaseError extends AppError {
  constructor(message = 'A database operation failed.', options: AppErrorOptions = {}) {
    super(message, HttpStatus.INTERNAL_SERVER_ERROR, {
      code: ErrorCode.DATABASE_ERROR,
      isOperational: false,
      ...options,
    })
  }
}

export class ServiceUnavailableError extends AppError {
  constructor(message = 'The service is temporarily unavailable.', options: AppErrorOptions = {}) {
    super(message, HttpStatus.SERVICE_UNAVAILABLE, {
      code: ErrorCode.SERVICE_UNAVAILABLE,
      ...options,
    })
  }
}

export class MailDeliveryError extends AppError {
  constructor(message = 'The message could not be delivered.', options: AppErrorOptions = {}) {
    super(message, HttpStatus.INTERNAL_SERVER_ERROR, {
      code: ErrorCode.MAIL_DELIVERY_FAILED,
      isOperational: false,
      ...options,
    })
  }
}

/** Narrowing helper used by the global error handler. */
export const isAppError = (error: unknown): error is AppError => error instanceof AppError

/** True when an error is safe to surface verbatim to the client. */
export const isOperationalError = (error: unknown): boolean =>
  isAppError(error) && error.isOperational
