import rateLimit, { type Options, type RateLimitRequestHandler } from 'express-rate-limit'
import type { RequestHandler } from 'express'
import type { RateLimitConfig } from '@/config/config.types'
import { ErrorCode, HttpStatus, OBSERVABILITY_PATHS } from '@/core/constants'
import { buildErrorResponse } from '@/core/http/api-response'
import { buildResponseMeta } from './response-formatter.middleware'

export interface RateLimiterOptions {
  /** Overrides the configured window. Used for stricter per-route limits. */
  readonly windowMs?: number
  /** Overrides the configured maximum. */
  readonly max?: number
  /** Skips health and readiness probes. Defaults to true. */
  readonly skipObservabilityPaths?: boolean
}

/**
 * Factory for rate limiters.
 *
 * Exposed as a factory rather than a singleton so later phases can apply a
 * tighter budget to expensive endpoints (model uploads, benchmark dispatch)
 * without duplicating the envelope-shaped rejection handler.
 *
 * Note: the limiter uses an in-memory store, which is correct for a single
 * instance. A horizontally scaled deployment should supply a shared Redis store
 * here — the only change required is the `store` option.
 */
export const createRateLimiter = (
  config: RateLimitConfig,
  options: RateLimiterOptions = {},
): RequestHandler => {
  if (!config.enabled) {
    // Transparent pass-through keeps the middleware chain shape identical.
    return (_req, _res, next): void => next()
  }

  const skipObservability = options.skipObservabilityPaths ?? true

  const limiterOptions: Partial<Options> = {
    windowMs: options.windowMs ?? config.windowMs,
    limit: options.max ?? config.max,
    standardHeaders: 'draft-7',
    legacyHeaders: false,
    skip: (req) =>
      skipObservability && OBSERVABILITY_PATHS.some((path) => req.path.endsWith(path)),
    handler: (req, res) => {
      req.logger?.warn('Rate limit exceeded', {
        ip: req.ip,
        path: req.originalUrl,
        method: req.method,
      })

      res.status(HttpStatus.TOO_MANY_REQUESTS).json(
        buildErrorResponse({
          statusCode: HttpStatus.TOO_MANY_REQUESTS,
          code: ErrorCode.RATE_LIMIT_EXCEEDED,
          message: 'Too many requests. Please retry after the window resets.',
          meta: buildResponseMeta(res),
          details: [
            {
              message: `Limit is ${String(options.max ?? config.max)} requests per ${String(
                Math.round((options.windowMs ?? config.windowMs) / 1000),
              )} seconds.`,
            },
          ],
        }),
      )
    },
  }

  const limiter: RateLimitRequestHandler = rateLimit(limiterOptions)
  return limiter
}
