import type { Request } from 'express'
import type { DeviceFingerprintConfig } from '@/config/config.types'
import { UnauthorizedError } from '@/core/errors/app-error'
import { computeDeviceFingerprint } from '@/core/security/device-fingerprint'
import type { AuthenticatedActor, RequestContext } from '@/modules/auth/auth.types'

/**
 * Captures ambient request facts for the service layer.
 *
 * This is the boundary translation: everything below it works with a plain
 * `RequestContext` and never sees an Express `Request`. That is what keeps
 * `AuthService` drivable from a queue consumer or a test without a fake HTTP
 * object.
 */
export const toRequestContext = (req: Request): RequestContext => ({
  // `req.ip` respects the `trust proxy` setting configured in app.ts, so this
  // is the real client address behind a load balancer rather than the hop.
  ip: req.ip ?? req.socket.remoteAddress ?? 'unknown',
  userAgent: req.get('user-agent') ?? 'unknown',
  requestId: req.id,
})

/**
 * Computes the coarse device fingerprint for a request, when fingerprinting
 * is enabled.
 *
 * Threaded through `AuthController.buildContext` rather than folded into
 * `toRequestContext` itself, so contexts built outside an HTTP request (a
 * queue consumer, a test) are not forced to fabricate a fingerprint input.
 */
export const computeRequestFingerprint = (
  req: Request,
  config: DeviceFingerprintConfig,
): string | undefined => {
  if (!config.enabled) return undefined

  return computeDeviceFingerprint({
    userAgent: req.get('user-agent') ?? 'unknown',
    acceptLanguage: req.get('accept-language'),
    ip: req.ip ?? req.socket.remoteAddress ?? 'unknown',
  })
}

/**
 * Returns the authenticated principal, or throws.
 *
 * `req.user` is optional in the type system because it is absent on public
 * routes. Rather than sprinkle non-null assertions through controllers, this
 * helper converts the impossible case into a real 401. If it ever fires, a
 * protected route was mounted without `authenticate` in front of it — and
 * failing closed is the only acceptable behaviour for that bug.
 */
export const requireActor = (req: Request): AuthenticatedActor => {
  if (!req.user) {
    throw new UnauthorizedError('Authentication is required for this route.')
  }

  return req.user
}
