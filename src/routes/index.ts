import { Router, type RequestHandler } from 'express'
import type { HealthController } from '@/modules/health/health.controller'
import { createHealthRouter } from '@/modules/health/health.routes'
import type { AuthController } from '@/modules/auth/auth.controller'
import { createAuthRouter } from '@/modules/auth/auth.routes'
import type { AuditController } from '@/modules/audit/audit.controller'
import { createAuditRouter } from '@/modules/audit/audit.routes'
import type { UserController } from '@/modules/users/user.controller'
import { createUserRouter } from '@/modules/users/user.routes'
import type { AdminController } from '@/modules/admin/admin.controller'
import { createAdminRouter } from '@/modules/admin/admin.routes'

export interface ApiRouterDependencies {
  readonly healthController: HealthController
  readonly authController: AuthController
  readonly auditController: AuditController
  readonly userController: UserController
  readonly adminController: AdminController
  readonly credentialLimiter: RequestHandler
  readonly authenticate: RequestHandler
  readonly requireAdmin: RequestHandler
  readonly avatarUpload: RequestHandler
}

/**
 * Version 1 API router.
 *
 * The single place where feature routers are mounted. Later phases register
 * domain routers here (`/models`, `/optimization`, `/benchmark`, ...); nothing
 * else in the application needs to change to add one.
 *
 * Two surfaces deliberately share the `/admin` prefix: the audit-trail reader
 * and the user-management router. Both are admin-gated, and mounting them on
 * the same prefix keeps the administrative namespace in one place.
 */
export const createApiV1Router = (dependencies: ApiRouterDependencies): Router => {
  const router = Router()

  // Health is mounted first and without a guard, deliberately: an orchestrator
  // probing readiness has no credentials.
  router.use(createHealthRouter(dependencies.healthController))

  router.use(
    '/auth',
    createAuthRouter({
      controller: dependencies.authController,
      credentialLimiter: dependencies.credentialLimiter,
      authenticate: dependencies.authenticate,
    }),
  )

  // Account self-service. Every id on this surface comes from the token.
  router.use(
    '/users',
    createUserRouter({
      controller: dependencies.userController,
      authenticate: dependencies.authenticate,
      avatarUpload: dependencies.avatarUpload,
    }),
  )

  // Administration: the audit trail and user management share the prefix.
  router.use(
    '/admin',
    createAuditRouter({
      controller: dependencies.auditController,
      authenticate: dependencies.authenticate,
      requireAdmin: dependencies.requireAdmin,
    }),
  )

  router.use(
    '/admin',
    createAdminRouter({
      controller: dependencies.adminController,
      authenticate: dependencies.authenticate,
      requireAdmin: dependencies.requireAdmin,
    }),
  )

  return router
}
