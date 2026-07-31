import { Router, type RequestHandler } from 'express'
import { asyncHandler } from '@/core/http/async-handler'
import { validate } from '@/middleware/validate.middleware'
import type { UserController } from './users.controller'
import {
  activityQuerySchema,
  changePasswordSchema,
  deleteAccountSchema,
  loginHistoryQuerySchema,
  sessionIdParamSchema,
  updateNotificationSettingsSchema,
  updatePreferencesSchema,
  updateProfileSchema,
  uploadAvatarSchema,
} from './users.validation'

export interface UserRouterDependencies {
  readonly controller: UserController
  /** Access-token guard applied to every route in this module. */
  readonly authenticate: RequestHandler
  /**
   * Tight limiter for the destructive credential endpoints (change password,
   * close account), matching the budget applied to the auth surface.
   */
  readonly credentialLimiter: RequestHandler
}

/**
 * Account self-service routes, all mounted under `/users/me`.
 *
 * `authenticate` is applied router-wide: every endpoint here operates on the
 * caller's own account, so there is no public route to carve out. The two
 * destructive credential operations additionally sit behind the credential
 * limiter.
 */
export const createUserRouter = (dependencies: UserRouterDependencies): Router => {
  const { controller, authenticate, credentialLimiter } = dependencies
  const router = Router()

  router.use(authenticate)

  // --- Profile -------------------------------------------------------------
  router.get('/me', asyncHandler(controller.getProfile))
  router.patch('/me', validate({ body: updateProfileSchema }), asyncHandler(controller.updateProfile))

  // --- Credentials & lifecycle --------------------------------------------
  router.post(
    '/me/change-password',
    credentialLimiter,
    validate({ body: changePasswordSchema }),
    asyncHandler(controller.changePassword),
  )
  router.delete(
    '/me',
    credentialLimiter,
    validate({ body: deleteAccountSchema }),
    asyncHandler(controller.deleteAccount),
  )

  // --- Avatar --------------------------------------------------------------
  router.put('/me/avatar', validate({ body: uploadAvatarSchema }), asyncHandler(controller.uploadAvatar))
  router.delete('/me/avatar', asyncHandler(controller.removeAvatar))

  // --- Preferences & notifications ----------------------------------------
  router.get('/me/preferences', asyncHandler(controller.getPreferences))
  router.put(
    '/me/preferences',
    validate({ body: updatePreferencesSchema }),
    asyncHandler(controller.updatePreferences),
  )
  router.get('/me/notification-settings', asyncHandler(controller.getNotificationSettings))
  router.put(
    '/me/notification-settings',
    validate({ body: updateNotificationSettingsSchema }),
    asyncHandler(controller.updateNotificationSettings),
  )

  // --- Activity & login history -------------------------------------------
  router.get(
    '/me/activity',
    validate({ query: activityQuerySchema }),
    asyncHandler(controller.getActivity),
  )
  router.get(
    '/me/login-history',
    validate({ query: loginHistoryQuerySchema }),
    asyncHandler(controller.getLoginHistory),
  )

  // --- Device sessions -----------------------------------------------------
  router.get('/me/sessions', asyncHandler(controller.listSessions))
  router.delete('/me/sessions', asyncHandler(controller.revokeOtherSessions))
  router.delete(
    '/me/sessions/:sessionId',
    validate({ params: sessionIdParamSchema }),
    asyncHandler(controller.revokeSession),
  )

  return router
}
