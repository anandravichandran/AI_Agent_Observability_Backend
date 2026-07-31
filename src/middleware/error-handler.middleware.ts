import type { ErrorRequestHandler } from 'express'
import mongoose from 'mongoose'
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

const hasMongoDuplicateKey = (error: unknown): error is { keyValue?: Record<string, unknown> } =>
  typeof error === 'object' &&
  error !== null &&
  'code' in error &&
  (error as { code?: unknown }).code === 11000

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

  // --- Mongoose document validation ----------------------------------------
  if (error instanceof mongoose.Error.ValidationError) {
    return {
      statusCode: HttpStatus.UNPROCESSABLE_ENTITY,
      code: ErrorCode.VALIDATION_ERROR,
      message: 'The document failed schema validation.',
      details: Object.values(error.errors).map((issue) => ({
        field: issue.path,
        message: issue.message,
      })),
      isOperational: true,
      original: error,
    }
  }

  // --- Malformed identifier -------------------------------------------------
  if (error instanceof mongoose.Error.CastError) {
    return {
      statusCode: HttpStatus.BAD_REQUEST,
      code: ErrorCode.INVALID_IDENTIFIER,
      message: `"${String(error.value)}" is not a valid ${error.kind}.`,
      details: [{ field: error.path, message: `Expected a valid ${error.kind}.` }],
      isOperational: true,
      original: error,
    }
  }

  // --- Unique index violation ----------------------------------------------
  if (hasMongoDuplicateKey(error)) {
    const fields = Object.keys(error.keyValue ?? {})

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

  // --- Driver-level failures ------------------------------------------------
  if (error instanceof mongoose.Error.MongooseServerSelectionError) {
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
