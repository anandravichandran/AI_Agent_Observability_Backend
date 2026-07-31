import type { RequestHandler } from 'express'
import { RouteNotFoundError } from '@/core/errors/app-error'

/**
 * Terminal 404 handler.
 *
 * Registered after every router. Rather than responding directly it throws a
 * typed error into the global handler, so an unmatched route produces exactly
 * the same envelope as any other failure — one code path, one contract.
 */
export const createNotFoundHandler = (): RequestHandler => {
  return (req, _res, next): void => {
    next(new RouteNotFoundError(req.method, req.originalUrl))
  }
}
