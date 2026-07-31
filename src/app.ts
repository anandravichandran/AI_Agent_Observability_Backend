import path from 'node:path'
import express, { type Express, type RequestHandler } from 'express'
import cookieParser from 'cookie-parser'
import type { AppConfig } from '@/config/config.types'
import type { ILogger } from '@/core/logger/logger.interface'
import type { WinstonLogger } from '@/core/logger/winston.logger'
import { mountSwagger } from '@/docs/swagger'
import {
  createCompressionMiddleware,
  createCorsMiddleware,
  createErrorHandler,
  createHelmetMiddleware,
  createHttpLoggerMiddleware,
  createNotFoundHandler,
  createRateLimiter,
  createRequestIdMiddleware,
  createResponseFormatter,
} from '@/middleware'
import { createApiV1Router } from '@/routes'
import type { HealthController } from '@/modules/health/health.controller'
import type { AuthController } from '@/modules/auth/auth.controller'
import type { AuditController } from '@/modules/audit/audit.controller'
import type { UserController } from '@/modules/users/user.controller'
import type { AdminController } from '@/modules/admin/admin.controller'
import type { ModelController } from '@/modules/models/model.controller'

export interface CreateAppDependencies {
  readonly config: AppConfig
  readonly logger: WinstonLogger
  readonly healthController: HealthController
  readonly authController: AuthController
  readonly auditController: AuditController
  readonly userController: UserController
  readonly adminController: AdminController
  /** Access-token guard, pre-bound to the token service and cookie config. */
  readonly authenticate: RequestHandler
  /** Role gate bound to `admin`. */
  readonly requireAdmin: RequestHandler
  /** Single-file avatar parser, pre-bound to the configured size limit. */
  readonly avatarUpload: RequestHandler
  readonly modelController: ModelController
  /** Model file upload middleware (disk-buffered). */
  readonly modelUpload: RequestHandler
}

/**
 * Builds the Express application.
 *
 * A pure factory over its dependencies: it never reads `process.env`, never
 * constructs a collaborator, and never opens a socket. That separation is what
 * lets an integration test build a fully wired app around a stub database and
 * assert against it without starting a server.
 *
 * Middleware order is deliberate and load bearing:
 *
 *  1. `trust proxy`      — so `req.ip` is correct before anything reads it
 *  2. request id         — every later log line needs the correlation id
 *  3. security headers   — applied before any body is parsed or echoed
 *  4. CORS               — must precede routing to answer preflight requests
 *  5. compression        — wraps the response writer before handlers run
 *  6. body parsers       — malformed JSON surfaces in the error handler
 *  7. cookie parser      — must precede any middleware reading `req.cookies`
 *  8. static uploads     — public avatar files; outside the API rate limit
 *  9. response formatter — installs `res.success()` for all handlers
 * 10. access logging     — after the id exists, before routing
 * 11. rate limiting      — rejects excess load before real work begins
 * 12. routes             — the application itself
 * 13. 404                — anything unmatched
 * 14. error handler      — always last; Express requires it after all routes
 */
export const createApp = ({
  config,
  logger,
  healthController,
  authController,
  auditController,
  userController,
  adminController,
  authenticate,
  requireAdmin,
  avatarUpload,
  modelController,
  modelUpload,
}: CreateAppDependencies): Express => {
  const app = express()

  // 1. Proxy awareness. Required for accurate client IPs behind a load
  //    balancer, which rate limiting, access logs, and the audit trail all
  //    depend on.
  app.set('trust proxy', config.http.trustProxy)
  app.disable('x-powered-by')
  app.set('etag', 'strong')

  // 2. Correlation id and request-scoped logger.
  app.use(createRequestIdMiddleware(logger))

  // 3 & 4. Security headers and cross-origin policy.
  app.use(createHelmetMiddleware(config.swagger))
  app.use(createCorsMiddleware(config.cors))

  // 5. Response compression.
  app.use(createCompressionMiddleware())

  // 6. Body parsing, bounded by the configured limit.
  app.use(express.json({ limit: config.http.bodyLimit }))
  app.use(express.urlencoded({ extended: true, limit: config.http.bodyLimit }))

  // 7. Cookie parsing. Must sit ahead of `authenticate`, which reads the
  //    access token from `req.cookies`.
  app.use(cookieParser())

  // 8. Static avatar files.
  //
  //    Served outside the API base path so they skip the API rate limiter, and
  //    mounted before the response formatter because a file is not an envelope.
  //    Helmet sets `Cross-Origin-Resource-Policy: same-origin` globally, which
  //    would block the web client (a different origin) from embedding an avatar
  //    in an `<img>` tag — so the static handler deliberately relaxes that one
  //    header for these public, non-sensitive images.
  app.use(
    config.upload.publicPath,
    express.static(path.resolve(process.cwd(), config.upload.dir), {
      index: false,
      fallthrough: true,
      maxAge: '7d',
      setHeaders: (res) => {
        res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin')
      },
    }),
  )

  // 9. Envelope helpers on the response object.
  app.use(createResponseFormatter(config.http.version))

  // 10. HTTP access logging.
  app.use(createHttpLoggerMiddleware(logger, config.app))

  // 11. Baseline rate limiting, scoped to the API surface so docs stay
  //     reachable. Credential endpoints layer a much tighter budget on top.
  app.use(config.http.basePath, createRateLimiter(config.rateLimit))

  /**
   * Stricter limiter for credential and OTP endpoints.
   *
   * The general budget (300 per 15 minutes) is far too generous for a login
   * form: it would allow thousands of password guesses a day per address.
   */
  const credentialLimiter = createRateLimiter(config.rateLimit, {
    windowMs: config.rateLimit.authWindowMs,
    max: config.rateLimit.authMax,
    skipObservabilityPaths: false,
  })

  // 12a. API documentation.
  mountSwagger(app, config, logger)

  // 12b. Versioned API surface.
  app.use(
    config.http.basePath,
    createApiV1Router({
      healthController,
      authController,
      auditController,
      userController,
      adminController,
      credentialLimiter,
      authenticate,
      requireAdmin,
      avatarUpload,
      modelController,
      modelUpload,
    }),
  )

  // 12c. Root convenience endpoint.
  app.get('/', (_req, res) => {
    res.success(
      {
        service: config.app.name,
        version: config.app.version,
        environment: config.app.env,
        documentation: config.swagger.enabled
          ? `${config.http.basePath}${config.swagger.path}`
          : null,
        health: `${config.http.basePath}/health`,
        authentication: `${config.http.basePath}/auth`,
        account: `${config.http.basePath}/users`,
      },
      `${config.app.title} is running.`,
    )
  })

  // 13. Unmatched routes.
  app.use(createNotFoundHandler())

  // 14. Terminal error handler.
  app.use(createErrorHandler(logger as ILogger, config.app))

  return app
}
