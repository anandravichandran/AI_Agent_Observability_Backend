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
import type { ModelController } from '@/modules/models/model.controller'
import { createModelRouter } from '@/modules/models/model.routes'
import type { ApiKeyController } from '@/modules/apiKeys'
import { createApiKeyRouter } from '@/modules/apiKeys'

export interface ApiRouterDependencies {
  readonly healthController: HealthController
  readonly authController: AuthController
  readonly auditController: AuditController
  readonly userController: UserController
  readonly adminController: AdminController
  readonly modelController: ModelController
  readonly apiKeyController: ApiKeyController
  readonly credentialLimiter: RequestHandler
  readonly authenticate: RequestHandler
  readonly requireAdmin: RequestHandler
  readonly avatarUpload: RequestHandler
  readonly modelUpload: RequestHandler
}

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
      avatarUpload: dependencies.avatarUpload,
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

  router.use(
    '/admin',
    createAdminRouter({
      controller: dependencies.adminController,
      authenticate: dependencies.authenticate,
      requireAdmin: dependencies.requireAdmin,
    }),
  )

  // Phase 4: AI model upload & management.
  router.use(
    '/models',
    createModelRouter({
      controller: dependencies.modelController,
      authenticate: dependencies.authenticate,
      modelUpload: dependencies.modelUpload,
    }),
  )

  // Phase 5: self-service API key management.
  router.use(
    '/api-keys',
    createApiKeyRouter({
      controller: dependencies.apiKeyController,
      authenticate: dependencies.authenticate,
    }),
  )

  return router
}
