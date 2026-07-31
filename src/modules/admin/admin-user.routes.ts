import { Router, type RequestHandler } from 'express'
import { asyncHandler } from '@/core/http/async-handler'
import { validate } from '@/middleware/validate.middleware'
import type { AdminUserController } from './admin-user.controller'
import {
  adminUpdateUserSchema,
  listUsersQuerySchema,
  userIdParamSchema,
} from './admin.validation'

export interface AdminUserRouterDependencies {
  readonly controller: AdminUserController
  readonly authenticate: RequestHandler
  /** Role gate, pre-bound to `admin` by the composition root. */
  readonly requireAdmin: RequestHandler
}

/**
 * Administrator user-management routes, mounted under `/admin/users`.
 *
 * `authenticate` runs before `requireAdmin` on every route — the order is
 * load-bearing, since the role check reads the principal the former attaches.
 * Applying both at the router level keeps every endpoint uniformly guarded.
 */
export const createAdminUserRouter = (dependencies: AdminUserRouterDependencies): Router => {
  const { controller, authenticate, requireAdmin } = dependencies
  const router = Router()

  router.use(authenticate, requireAdmin)

  router.get(
    '/users',
    validate({ query: listUsersQuerySchema }),
    asyncHandler(controller.listUsers),
  )

  router.get(
    '/users/:userId',
    validate({ params: userIdParamSchema }),
    asyncHandler(controller.getUser),
  )

  router.patch(
    '/users/:userId',
    validate({ params: userIdParamSchema, body: adminUpdateUserSchema }),
    asyncHandler(controller.updateUser),
  )

  router.delete(
    '/users/:userId',
    validate({ params: userIdParamSchema }),
    asyncHandler(controller.deleteUser),
  )

  router.post(
    '/users/:userId/revoke-sessions',
    validate({ params: userIdParamSchema }),
    asyncHandler(controller.revokeUserSessions),
  )

  return router
}
