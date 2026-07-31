import { Router, type RequestHandler } from 'express'
import { asyncHandler } from '@/core/http/async-handler'
import { validate } from '@/middleware/validate.middleware'
import {
  listUsersQuerySchema,
  updateUserRoleSchema,
  updateUserStatusSchema,
  userIdParamSchema,
} from '@/modules/users/user.validation'
import type { AdminController } from './admin.controller'

export interface AdminRouterDependencies {
  readonly controller: AdminController
  readonly authenticate: RequestHandler
  /** Role gate, pre-bound to `admin` by the composition root. */
  readonly requireAdmin: RequestHandler
}

/**
 * Administrator user-management routes.
 *
 * Guard order is load-bearing and not interchangeable: `authenticate` populates
 * `req.user`, and `requireAdmin` then reads it. Reversed, every request would
 * be rejected as unauthenticated regardless of the caller's role.
 *
 * Unlike the self-service surface, these paths *do* carry a `/:id`, because the
 * entire point is acting on another account. The finer rules — an admin cannot
 * mutate their own account here, nor another admin — live in the service, where
 * the target's role is known.
 */
export const createAdminRouter = (dependencies: AdminRouterDependencies): Router => {
  const { controller, authenticate, requireAdmin } = dependencies
  const router = Router()

  router.use(authenticate, requireAdmin)

  router.get(
    '/users',
    validate({ query: listUsersQuerySchema }),
    asyncHandler(controller.listUsers),
  )

  router.get(
    '/users/:id',
    validate({ params: userIdParamSchema }),
    asyncHandler(controller.getUser),
  )

  router.patch(
    '/users/:id/role',
    validate({ params: userIdParamSchema, body: updateUserRoleSchema }),
    asyncHandler(controller.updateRole),
  )

  router.patch(
    '/users/:id/status',
    validate({ params: userIdParamSchema, body: updateUserStatusSchema }),
    asyncHandler(controller.updateStatus),
  )

  router.get(
    '/users/:id/sessions',
    validate({ params: userIdParamSchema }),
    asyncHandler(controller.listSessions),
  )

  router.delete(
    '/users/:id/sessions',
    validate({ params: userIdParamSchema }),
    asyncHandler(controller.revokeSessions),
  )

  return router
}
