import type { NextFunction, Request, RequestHandler, Response } from 'express'
import type { CookieConfig } from '@/config/config.types'
import { ErrorCode } from '@/core/constants/error-codes'
import { UnauthorizedError } from '@/core/errors/app-error'
import { readAccessToken, resolveAccessTokenSource } from '@/core/http/cookies'
import type { ITokenService } from '@/core/security/token-service.interface'

export interface AuthenticateOptions {
  readonly tokenService: ITokenService
  readonly cookieConfig: CookieConfig
}

/**
 * Verifies the access token and attaches the principal to `req.user`.
 *
 * **This middleware performs no database read.** Everything it needs is in the
 * token's signed claims. That is the entire point of a short-lived access
 * token: authentication costs one HMAC verification, not a round trip, so it
 * scales with CPU rather than with database capacity.
 *
 * The tradeoff is that revocation is not instant — a token stays valid until it
 * expires, even if the session behind it was revoked. That window is bounded by
 * `JWT_ACCESS_TTL` (15 minutes by default) and is the standard accepted cost of
 * stateless auth. Anything needing immediate revocation must be checked at the
 * refresh boundary, which *is* stateful, or guarded explicitly.
 */
export const createAuthenticate = (options: AuthenticateOptions): RequestHandler => {
  const { tokenService, cookieConfig } = options

  return (req: Request, _res: Response, next: NextFunction): void => {
    const token = readAccessToken(
      req.get('authorization'),
      req.cookies as Record<string, unknown> | undefined,
      cookieConfig,
    )

    if (!token) {
      next(
        new UnauthorizedError('An access token is required.', {
          code: ErrorCode.TOKEN_MISSING,
        }),
      )
      return
    }

    try {
      const claims = tokenService.verifyAccessToken(token)

      req.user = {
        id: claims.sub,
        email: claims.email,
        role: claims.role,
        sessionId: claims.sid,
      }

      // Recorded so `csrf.middleware.ts` can scope its check to the ambient,
      // browser-managed cookie path and skip it for explicit bearer callers.
      req.authTokenSource = resolveAccessTokenSource(req.get('authorization'))

      // Bind identity to the request logger so every downstream log line is
      // attributable without each call site having to remember to add it.
      req.logger = req.logger.child({ userId: claims.sub, role: claims.role })

      next()
    } catch (error) {
      // Already normalised to a 401 AppError by the token service.
      next(error)
    }
  }
}

/**
 * Attaches the principal when a valid token is present, and does nothing when
 * it is absent or invalid.
 *
 * For endpoints whose response varies by identity but which do not require it.
 * Never use this to guard a protected resource.
 */
export const createOptionalAuthenticate = (
  options: AuthenticateOptions,
): RequestHandler => {
  const authenticate = createAuthenticate(options)

  return (req: Request, res: Response, next: NextFunction): void => {
    const hasToken = Boolean(
      readAccessToken(
        req.get('authorization'),
        req.cookies as Record<string, unknown> | undefined,
        options.cookieConfig,
      ),
    )

    if (!hasToken) {
      next()
      return
    }

    authenticate(req, res, (error?: unknown) => {
      // Swallow verification failures: an expired token on an optional route
      // should degrade to anonymous, not reject the request.
      next(error && req.user ? error : undefined)
    })
  }
}
