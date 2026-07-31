import { Router, type RequestHandler } from 'express'
import { asyncHandler } from '@/core/http/async-handler'
import { validate } from '@/middleware/validate.middleware'
import type { UserController } from './user.controller'
import {
  activityQuerySchema,
  changePasswordSchema,
  deleteAccountSchema,
  loginHistoryQuerySchema,
  updateNotificationsSchema,
  updatePreferencesSchema,
  updateProfileSchema,
  userIdParamSchema,
} from './user.validation'

export interface UserRouterDependencies {
  readonly controller: UserController
  readonly authenticate: RequestHandler
  /** Single-file avatar parser, pre-bound to the configured size limit. */
  readonly avatarUpload: RequestHandler
}

/**
 * Account self-service routes.
 *
 * Every route is guarded by `authenticate` and every id comes from the token —
 * there is deliberately no `/:id` in any path here, because on this surface the
 * only account a user may act on is their own. The single parameter that does
 * appear (`/devices/:id`) identifies a *session*, and ownership of it is
 * enforced in the service against the token's user id.
 */
export const createUserRouter = (dependencies: UserRouterDependencies): Router => {
  const { controller, authenticate, avatarUpload } = dependencies
  const router = Router()

  router.use(authenticate)

  // --- Profile -------------------------------------------------------------
  router.get('/profile', asyncHandler(controller.getProfile))
  router.patch(
    '/profile',
    validate({ body: updateProfileSchema }),
    asyncHandler(controller.updateProfile),
  )

  // --- Security ------------------------------------------------------------
  router.post(
    '/password',
    validate({ body: changePasswordSchema }),
    asyncHandler(controller.changePassword),
  )
  router.delete(
    '/account',
    validate({ body: deleteAccountSchema }),
    asyncHandler(controller.deleteAccount),
  )

  // --- Avatar --------------------------------------------------------------
  router.put('/avatar', avatarUpload, asyncHandler(controller.uploadAvatar))
  router.delete('/avatar', asyncHandler(controller.removeAvatar))

  // --- Settings ------------------------------------------------------------
  router.patch(
    '/preferences',
    validate({ body: updatePreferencesSchema }),
    asyncHandler(controller.updatePreferences),
  )
  router.patch(
    '/notifications',
    validate({ body: updateNotificationsSchema }),
    asyncHandler(controller.updateNotifications),
  )

  // --- Devices -------------------------------------------------------------
  router.get('/devices', asyncHandler(controller.listDeviceSessions))
  router.delete(
    '/devices/:id',
    validate({ params: userIdParamSchema }),
    asyncHandler(controller.revokeDeviceSession),
  )

  // --- History -------------------------------------------------------------
  router.get(
    '/login-history',
    validate({ query: loginHistoryQuerySchema }),
    asyncHandler(controller.getLoginHistory),
  )
  router.get(
    '/activity',
    validate({ query: activityQuerySchema }),
    asyncHandler(controller.getActivity),
  )

  return router
}
