import type { RequestHandler, Response } from 'express'
import { Headers, HttpStatus } from '@/core/constants'
import {
  buildSuccessResponse,
  type PaginationMeta,
  type ResponseMeta,
  type SuccessResponse,
} from '@/core/http/api-response'
import { elapsedSince } from '@/core/utils/time'

/**
 * Builds the `meta` block shared by success and error envelopes.
 * Exported so the global error handler produces byte-identical metadata.
 */
export const buildResponseMeta = (res: Response): ResponseMeta => {
  const { req } = res

  return {
    requestId: req.id,
    timestamp: new Date().toISOString(),
    durationMs: typeof req.startTime === 'number' ? elapsedSince(req.startTime) : undefined,
    path: req.originalUrl,
    method: req.method,
  }
}

/**
 * Decorates the response object with envelope helpers.
 *
 * Controllers call `res.success(data)` and never construct an envelope by hand,
 * which is what guarantees a uniform contract across every endpoint. Adding a
 * field to the envelope is a one-file change.
 */
export const createResponseFormatter = (apiVersion: string): RequestHandler => {
  return (_req, res, next): void => {
    res.setHeader(Headers.API_VERSION, apiVersion)

    res.buildEnvelope = function buildEnvelope<TData>(
      statusCode: number,
      data: TData,
      message: string,
    ): SuccessResponse<TData> {
      return buildSuccessResponse({
        data,
        statusCode,
        message,
        meta: buildResponseMeta(this),
      })
    }

    res.respond = function respond<TData>(
      statusCode: number,
      data: TData,
      message = 'Request completed successfully.',
      pagination?: PaginationMeta,
    ): Response {
      const meta = buildResponseMeta(this)

      if (meta.durationMs !== undefined && !this.headersSent) {
        this.setHeader(Headers.RESPONSE_TIME, `${meta.durationMs}ms`)
      }

      return this.status(statusCode).json(
        buildSuccessResponse({ data, statusCode, message, meta, pagination }),
      )
    }

    res.success = function success<TData>(
      data: TData,
      message = 'Request completed successfully.',
      pagination?: PaginationMeta,
    ): Response {
      return this.respond(HttpStatus.OK, data, message, pagination)
    }

    res.created = function created<TData>(
      data: TData,
      message = 'Resource created successfully.',
    ): Response {
      return this.respond(HttpStatus.CREATED, data, message)
    }

    res.accepted = function accepted<TData>(
      data: TData,
      message = 'Request accepted for processing.',
    ): Response {
      return this.respond(HttpStatus.ACCEPTED, data, message)
    }

    res.noContent = function noContent(): Response {
      return this.status(HttpStatus.NO_CONTENT).end()
    }

    next()
  }
}
