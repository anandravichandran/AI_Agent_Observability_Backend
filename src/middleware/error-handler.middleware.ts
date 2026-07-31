import type { ErrorRequestHandler } from 'express'
import { Prisma } from '@/infrastructure/database/prisma.client'
import { ZodError } from 'zod'
import type { AppMetaConfig } from '@/config/config.types'
import { ErrorCode, HttpStatus, isServerError } from '@/core/constants'
import {
  AppError,
  isAppError,
  type ErrorDetail,
} from '@/core/errors/app-error'
import { buildErrorResponse } from '@/core/http/api-response'
import type { ILogger } from '@/core/logger/logger.interface'
import { buildResponseMeta } from './response-formatter.middleware'

/** Normalised view of any thrown value, ready for serialisation. */
interface NormalisedError {
  readonly statusCode: number
  readonly code: string
  readonly message: string
  readonly details: ErrorDetail[]
  readonly isOperational: boolean
  readonly original: unknown
}

/** Express' body-parser JSON failure carries these fields. */
interface BodyParserError extends Error {
  status?: number
  statusCode?: number
  type?: string
  body?: unknown
}

const isBodyParserError = (error: unknown): error is BodyParserError =>
  error instanceof Error && 'type' in error && typeof (error as BodyParserError).type === 'string'


/**
 * Translates any thrown value into a consistent, client-safe shape.
 *
 * Each infrastructure concern (Zod, Mongoose, body-parser) leaks its own error
 * type; normalising them in one place is what keeps controllers free of
 * defensive `try/catch` blocks and keeps the public error contract stable.
 */
const normaliseError = (error: unknown): NormalisedError => {
  // --- Errors we raised deliberately ---------------------------------------
  if (isAppError(error)) {
    return {
      statusCode: error.statusCode,
      code: error.code,
      message: error.message,
      details: error.details,
      isOperational: error.isOperational,
      original: error,
    }
  }

  // --- Schema validation ----------------------------------------------------
  if (error instanceof ZodError) {
    return {
      statusCode: HttpStatus.UNPROCESSABLE_ENTITY,
      code: ErrorCode.VALIDATION_ERROR,
      message: 'The request payload failed validation.',
      details: error.issues.map((issue) => ({
        field: issue.path.join('.') || undefined,
        message: issue.message,
        code: issue.code,
      })),
      isOperational: true,
      original: error,
    }
  }

  // --- Prisma / PostgreSQL failures -----------------------------------------
  // Replaces the old Mongoose ValidationError/CastError/duplicate-key (11000)
  // /MongooseServerSelectionError branches with their Prisma equivalents. See
  // MIGRATION_REPORT.md "Error handler still spoke Mongoose".
  if (error instanceof Prisma.PrismaClientKnownRequestError) {
    // P2002: unique constraint violation.
    if (error.code === 'P2002') {
      const target = error.meta?.target
      const fields = Array.isArray(target) ? (target as string[]) : typeof target === 'string' ? [target] : []

      return {
        statusCode: HttpStatus.CONFLICT,
        code: ErrorCode.DUPLICATE_RESOURCE,
        message: 'A resource with these values already exists.',
        details: fields.map((field) => ({
          field,
          message: `"${field}" must be unique.`,
        })),
        isOperational: true,
        original: error,
      }
    }

    // P2025: the row targeted by an update/delete/required-relation read does
    // not exist. This is Prisma's equivalent of a Mongoose CastError landing
    // on a document that was never there.
    if (error.code === 'P2025') {
      return {
        statusCode: HttpStatus.NOT_FOUND,
        code: ErrorCode.NOT_FOUND,
        message: 'The requested resource could not be found.',
        details: [],
        isOperational: true,
        original: error,
      }
    }

    // P2003: foreign key constraint violation.
    if (error.code === 'P2003') {
      const fieldName = typeof error.meta?.field_name === 'string' ? error.meta.field_name : undefined

      return {
        statusCode: HttpStatus.BAD_REQUEST,
        code: ErrorCode.INVALID_IDENTIFIER,
        message: 'The request references a resource that does not exist.',
        details: fieldName ? [{ field: fieldName, message: 'References a nonexistent row.' }] : [],
        isOperational: true,
        original: error,
      }
    }
  }

  // Malformed query input (e.g. a non-UUID string passed to a UUID column).
  if (error instanceof Prisma.PrismaClientValidationError) {
    return {
      statusCode: HttpStatus.BAD_REQUEST,
      code: ErrorCode.INVALID_IDENTIFIER,
      message: 'The request contains a malformed identifier or value.',
      details: [],
      isOperational: true,
      original: error,
    }
  }

  // Connection pool exhaustion, network failure, TLS failure, etc.
  if (
    error instanceof Prisma.PrismaClientInitializationError ||
    error instanceof Prisma.PrismaClientRustPanicError
  ) {
    return {
      statusCode: HttpStatus.SERVICE_UNAVAILABLE,
      code: ErrorCode.DATABASE_UNAVAILABLE,
      message: 'The database is currently unreachable.',
      details: [],
      isOperational: true,
      original: error,
    }
  }

  // --- Body parser ----------------------------------------------------------
  if (isBodyParserError(error)) {
    if (error.type === 'entity.too.large') {
      return {
        statusCode: HttpStatus.PAYLOAD_TOO_LARGE,
        code: ErrorCode.PAYLOAD_TOO_LARGE,
        message: 'The request payload exceeds the configured size limit.',
        details: [],
        isOperational: true,
        original: error,
      }
    }

    if (error.type === 'entity.parse.failed') {
      return {
        statusCode: HttpStatus.BAD_REQUEST,
        code: ErrorCode.INVALID_JSON,
        message: 'The request body is not valid JSON.',
        details: [],
        isOperational: true,
        original: error,
      }
    }

    if (error.type === 'entity.unsupported') {
      return {
        statusCode: HttpStatus.UNSUPPORTED_MEDIA_TYPE,
        code: ErrorCode.UNSUPPORTED_MEDIA_TYPE,
        message: 'The provided content type is not supported.',
        details: [],
        isOperational: true,
        original: error,
      }
    }
  }

  // --- Anything else is a bug ----------------------------------------------
  return {
    statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
    code: ErrorCode.INTERNAL_ERROR,
    message: 'An unexpected error occurred.',
    details: [],
    isOperational: false,
    original: error,
  }
}

/**
 * The single terminal error handler for the application.
 *
 * Express identifies an error handler by its four-argument signature, so `next`
 * must stay in the parameter list even though it is only used for the
 * headers-already-sent case.
 */
export const createErrorHandler = (
  logger: ILogger,
  app: AppMetaConfig,
): ErrorRequestHandler => {
  return (error, req, res, next): void => {
    // Once the response has started streaming, the only correct action is to
    // hand off to Express so it can destroy the socket.
    if (res.headersSent) {
      next(error)
      return
    }

    const normalised = normaliseError(error)
    const requestLogger = req.logger ?? logger

    const logContext = {
      statusCode: normalised.statusCode,
      code: normalised.code,
      method: req.method,
      path: req.originalUrl,
      ip: req.ip,
      ...(normalised.original instanceof Error
        ? { stack: normalised.original.stack }
        : { thrown: String(normalised.original) }),
      ...(normalised.original instanceof AppError && normalised.original.cause
        ? { cause: String(normalised.original.cause) }
        : {}),
    }

    // Programmer errors and 5xx always warrant a full-fidelity log entry.
    // Expected 4xx conditions are recorded at warn level to keep signal high.
    if (!normalised.isOperational || isServerError(normalised.statusCode)) {
      requestLogger.error(`Unhandled request failure: ${normalised.message}`, logContext)
    } else {
      requestLogger.warn(`Request rejected: ${normalised.message}`, logContext)
    }

    // Never leak internal messages or stacks from a non-operational error in
    // production — they routinely contain connection strings and file paths.
    const exposeInternals = !app.isProduction
    const clientMessage =
      normalised.isOperational || exposeInternals
        ? normalised.message
        : 'An unexpected error occurred.'

    res.status(normalised.statusCode).json(
      buildErrorResponse({
        statusCode: normalised.statusCode,
        code: normalised.code,
        message: clientMessage,
        details: normalised.details,
        meta: buildResponseMeta(res),
        ...(exposeInternals && normalised.original instanceof Error
          ? { stack: normalised.original.stack }
          : {}),
      }),
    )
  }
}
