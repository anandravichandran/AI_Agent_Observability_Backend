import type { NextFunction, Request, RequestHandler, Response } from 'express'
import { ZodError, type ZodTypeAny } from 'zod'
import { ValidationError, type ErrorDetail } from '@/core/errors/app-error'

/** Schemas for the request parts to validate. Omitted parts are left untouched. */
export interface ValidationSchemas {
  readonly body?: ZodTypeAny
  readonly query?: ZodTypeAny
  readonly params?: ZodTypeAny
}

/** Flattens a `ZodError` into the API's error detail shape. */
export const toErrorDetails = (error: ZodError): ErrorDetail[] =>
  error.issues.map((issue) => ({
    field: issue.path.join('.') || undefined,
    message: issue.message,
    code: issue.code,
  }))

/**
 * Validates and **replaces** request parts with their parsed output.
 *
 * The replacement is the important half. Zod does not merely check the payload,
 * it produces a new value with coercions applied, unknown keys stripped, and
 * defaults filled in. Assigning that result back means every handler downstream
 * works with data that is both validated and normalised — and, because unknown
 * keys are dropped, a mass-assignment attempt like `{"role": "admin"}` on the
 * register endpoint never reaches the service layer at all.
 *
 * All parts are validated before failing so the client gets every problem in
 * one response rather than discovering them one round trip at a time.
 */
export const validate = (schemas: ValidationSchemas): RequestHandler => {
  return (req: Request, _res: Response, next: NextFunction): void => {
    const details: ErrorDetail[] = []

    if (schemas.body) {
      const result = schemas.body.safeParse(req.body)
      if (result.success) {
        req.body = result.data
      } else {
        details.push(...prefix(toErrorDetails(result.error), 'body'))
      }
    }

    if (schemas.query) {
      const result = schemas.query.safeParse(req.query)
      if (result.success) {
        req.query = result.data as Request['query']
      } else {
        details.push(...prefix(toErrorDetails(result.error), 'query'))
      }
    }

    if (schemas.params) {
      const result = schemas.params.safeParse(req.params)
      if (result.success) {
        req.params = result.data as Request['params']
      } else {
        details.push(...prefix(toErrorDetails(result.error), 'params'))
      }
    }

    if (details.length > 0) {
      next(new ValidationError('The request payload failed validation.', details))
      return
    }

    next()
  }
}

/** Namespaces a field path so `email` in the body is distinguishable from a query `email`. */
const prefix = (details: ErrorDetail[], location: string): ErrorDetail[] =>
  details.map((detail) => ({
    ...detail,
    field: detail.field ? `${location}.${detail.field}` : location,
  }))
