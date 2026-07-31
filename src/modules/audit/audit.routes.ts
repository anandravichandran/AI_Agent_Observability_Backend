import { Router, type RequestHandler } from 'express'
import { asyncHandler } from '@/core/http/async-handler'
import { validate } from '@/middleware/validate.middleware'
import type { AuditController } from './audit.controller'
import { auditQuerySchema } from './audit.validation'

export interface AuditRouterDependencies {
  readonly controller: AuditController
  readonly authenticate: RequestHandler
  /** Role gate. Supplied by the composition root, already bound to `admin`. */
  readonly requireAdmin: RequestHandler
}

/**
 * Audit routes.
 *
 * The guard order is not interchangeable: `authenticate` must run before
 * `requireAdmin`, because the role check reads `req.user`, which only the
 * former populates. Reversed, every request would be rejected as unauthenticated
 * regardless of the caller's role.
 */
export const createAuditRouter = (dependencies: AuditRouterDependencies): Router => {
  const router = Router()

  router.get(
    '/audit-logs',
    dependencies.authenticate,
    dependencies.requireAdmin,
    validate({ query: auditQuerySchema }),
    asyncHandler(dependencies.controller.list),
  )

  return router
}
