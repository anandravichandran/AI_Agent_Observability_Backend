import cors, { type CorsOptions } from 'cors'
import helmet from 'helmet'
import type { RequestHandler } from 'express'
import type { CorsConfig, SwaggerConfig } from '@/config/config.types'
import { HttpStatus } from '@/core/constants'
import { AppError } from '@/core/errors/app-error'
import { ErrorCode } from '@/core/constants/error-codes'

/**
 * Helmet configuration.
 *
 * The default CSP blocks the inline styles Swagger UI ships with, so when docs
 * are enabled the policy is widened for those assets only — never disabled.
 */
export const createHelmetMiddleware = (swagger: SwaggerConfig): RequestHandler =>
  helmet({
    contentSecurityPolicy: swagger.enabled
      ? {
          directives: {
            defaultSrc: ["'self'"],
            baseUri: ["'self'"],
            fontSrc: ["'self'", 'https:', 'data:'],
            imgSrc: ["'self'", 'data:', 'https:'],
            scriptSrc: ["'self'", "'unsafe-inline'"],
            styleSrc: ["'self'", 'https:', "'unsafe-inline'"],
            objectSrc: ["'none'"],
            frameAncestors: ["'none'"],
            upgradeInsecureRequests: [],
          },
        }
      : undefined,
    crossOriginEmbedderPolicy: false,
    crossOriginResourcePolicy: { policy: 'cross-origin' },
    referrerPolicy: { policy: 'no-referrer' },
    hsts: {
      maxAge: 31_536_000,
      includeSubDomains: true,
      preload: true,
    },
    frameguard: { action: 'deny' },
    hidePoweredBy: true,
    noSniff: true,
  })

/**
 * CORS configuration driven entirely by `CORS_ORIGINS`.
 *
 * A rejected origin produces a typed `AppError`, so it flows through the global
 * error handler and returns the same envelope as every other failure instead of
 * the opaque default CORS error.
 */
export const createCorsMiddleware = (config: CorsConfig): RequestHandler => {
  const options: CorsOptions = {
    origin: (origin, callback) => {
      // Same-origin and non-browser clients (curl, health probes) send no Origin.
      if (!origin || config.allowAnyOrigin) {
        callback(null, true)
        return
      }

      if (config.origins.includes(origin)) {
        callback(null, true)
        return
      }

      callback(
        new AppError(`Origin "${origin}" is not permitted by the CORS policy.`, HttpStatus.FORBIDDEN, {
          code: ErrorCode.BAD_REQUEST,
          isOperational: true,
        }),
      )
    },
    credentials: config.credentials,
    methods: ['GET', 'HEAD', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: [
      'Content-Type',
      'Accept',
      'Origin',
      'X-Request-Id',
      'X-Correlation-Id',
    ],
    exposedHeaders: ['X-Request-Id', 'X-Response-Time', 'X-Api-Version'],
    maxAge: 86_400,
    optionsSuccessStatus: HttpStatus.NO_CONTENT,
  }

  return cors(options)
}
