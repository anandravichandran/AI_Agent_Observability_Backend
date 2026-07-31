import { Router, type RequestHandler } from 'express'
import { asyncHandler } from '@/core/http/async-handler'
import { validate } from '@/middleware/validate.middleware'
import type { AuthController } from './auth.controller'
import {
  forgotPasswordSchema,
  loginSchema,
  logoutSchema,
  refreshTokenSchema,
  registerSchema,
  resendOtpSchema,
  resetPasswordSchema,
  verifyEmailSchema,
} from './auth.validation'

export interface AuthRouterDependencies {
  readonly controller: AuthController
  /**
   * Tight rate limiter applied to credential and OTP endpoints.
   *
   * Injected rather than constructed here so the route module stays free of
   * configuration, and so a test can mount these routes without a limiter.
   */
  readonly credentialLimiter: RequestHandler
  /** Access-token guard for the authenticated routes. */
  readonly authenticate: RequestHandler
}

/**
 * Authentication routes.
 *
 * Every handler is wrapped in `asyncHandler` so a rejected promise reaches the
 * global error handler. Express 4 does not catch async rejections on its own,
 * and an unwrapped `async` route that throws will hang the request until the
 * client times out.
 *
 * The credential limiter is applied per-route rather than to the whole router:
 * `/me` and `/sessions` are ordinary authenticated reads and do not deserve the
 * same 20-per-15-minutes budget as a login attempt.
 */
export const createAuthRouter = (dependencies: AuthRouterDependencies): Router => {
  const { controller, credentialLimiter, authenticate } = dependencies
  const router = Router()

  // --- Public -------------------------------------------------------------

  router.post(
    '/register',
    credentialLimiter,
    validate({ body: registerSchema }),
    asyncHandler(controller.register),
  )

  router.post(
    '/verify-email',
    credentialLimiter,
    validate({ body: verifyEmailSchema }),
    asyncHandler(controller.verifyEmail),
  )

  router.post(
    '/resend-otp',
    credentialLimiter,
    validate({ body: resendOtpSchema }),
    asyncHandler(controller.resendOtp),
  )

  router.post(
    '/login',
    credentialLimiter,
    validate({ body: loginSchema }),
    asyncHandler(controller.login),
  )

  router.post(
    '/forgot-password',
    credentialLimiter,
    validate({ body: forgotPasswordSchema }),
    asyncHandler(controller.forgotPassword),
  )

  router.post(
    '/reset-password',
    credentialLimiter,
    validate({ body: resetPasswordSchema }),
    asyncHandler(controller.resetPassword),
  )

  /**
   * Refresh is public by design: the access token is expected to be expired
   * when this is called, so requiring one would make the endpoint useless.
   * The refresh token itself is the credential.
   */
  router.post(
    '/refresh',
    validate({ body: refreshTokenSchema }),
    asyncHandler(controller.refresh),
  )

  /** Also public — signing out with an expired access token must still work. */
  router.post('/logout', validate({ body: logoutSchema }), asyncHandler(controller.logout))

  /**
   * Issues the double-submit CSRF cookie. Public and side-effect-free: it
   * grants no capability by itself, only the token a subsequent
   * cookie-authenticated mutation must echo back in a header.
   */
  router.get('/csrf-token', asyncHandler(controller.csrfToken))

  // --- Authenticated ------------------------------------------------------

  router.get('/me', authenticate, asyncHandler(controller.me))

  router.get('/sessions', authenticate, asyncHandler(controller.listSessions))

  router.post('/logout-all', authenticate, asyncHandler(controller.logoutAll))

  return router
}
