import { Router, type RequestHandler } from 'express'
import type { HealthController } from '@/modules/health/health.controller'
import { createHealthRouter } from '@/modules/health/health.routes'
import type { AuthController } from '@/modules/auth/auth.controller'
import { createAuthRouter } from '@/modules/auth/auth.routes'
import type { UserController } from '@/modules/users/users.controller'
import { createUserRouter } from '@/modules/users/users.routes'
import type { AuditController } from '@/modules/audit/audit.controller'
import { createAuditRouter } from '@/modules/audit/audit.routes'
import type { AdminUserController } from '@/modules/admin/admin-user.controller'
import { createAdminUserRouter } from '@/modules/admin/admin-user.routes'

export interface ApiRouterDependencies {
  readonly healthController: HealthController
  readonly authController: AuthController
  readonly userController: UserController
  readonly auditController: AuditController
  readonly adminUserController: AdminUserController
  readonly credentialLimiter: RequestHandler
  readonly authenticate: RequestHandler
  readonly requireAdmin: RequestHandler
}

/**
 * Version 1 API router.
 *
 * The single place where feature routers are mounted. Later phases register
 * domain routers here (`/models`, `/optimization`, `/benchmark`, ...); nothing
 * else in the application needs to change to add one.
 *
 * Health is mounted first and without a guard, deliberately: an orchestrator
 * probing readiness has no credentials, and a health endpoint that can fail
 * authentication is a health endpoint that will eventually report a false
 * outage.
 */
export const createApiV1Router = (dependencies: ApiRouterDependencies): Router => {
  const router = Router()

  router.use(createHealthRouter(dependencies.healthController))

  router.use(
    '/auth',
    createAuthRouter({
      controller: dependencies.authController,
      credentialLimiter: dependencies.credentialLimiter,
      authenticate: dependencies.authenticate,
    }),
  )

  router.use(
    '/users',
    createUserRouter({
      controller: dependencies.userController,
      authenticate: dependencies.authenticate,
      credentialLimiter: dependencies.credentialLimiter,
    }),
  )

  router.use(
    '/admin',
    createAdminUserRouter({
      controller: dependencies.adminUserController,
      authenticate: dependencies.authenticate,
      requireAdmin: dependencies.requireAdmin,
    }),
  )

  router.use(
    '/admin',
    createAuditRouter({
      controller: dependencies.auditController,
      authenticate: dependencies.authenticate,
      requireAdmin: dependencies.requireAdmin,
    }),
  )

  return router
}
