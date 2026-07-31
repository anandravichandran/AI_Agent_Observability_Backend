import type { NextFunction, Request, RequestHandler, Response } from 'express'
import type { CookieConfig, CsrfConfig } from '@/config/config.types'
import { ErrorCode } from '@/core/constants/error-codes'
import { ForbiddenError } from '@/core/errors/app-error'
import { readCsrfCookie } from '@/core/http/cookies'

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS'])

export interface CsrfProtectionDependencies {
  readonly csrfConfig: CsrfConfig
  readonly cookieConfig: CookieConfig
}

/**
 * Double-submit-cookie CSRF verification.
 *
 * **Scope, deliberately narrow**: this only runs the check when
 * `req.authTokenSource === 'cookie'`, i.e. the request was authenticated via
 * the ambient, browser-managed access-token cookie — the one credential a
 * malicious cross-site page could cause the victim's browser to attach
 * automatically. It is a no-op for:
 *
 * - Requests without a resolved access-token source (public routes, or
 *   routes mounted without `authenticate` in front of this middleware).
 * - `Authorization: Bearer <token>` requests — a cross-site page cannot make
 *   the browser attach an `Authorization` header on the victim's behalf, so
 *   there is nothing ambient to forge.
 * - API-key requests (`req.apiKeyContext` set) — same reasoning; the key is
 *   sent by a service that chose to send it, not replayed by a browser.
 *
 * This also means the credential-issuing endpoints (`/auth/login`,
 * `/auth/register`, `/auth/refresh`, `/auth/logout`) are intentionally not
 * covered here: they run before `authenticate` (there is no session cookie
 * yet to protect), and `/auth/refresh` / `/auth/logout` must keep working for
 * non-browser clients that hold a refresh token but no CSRF cookie. Forging
 * either of those two gives an attacker no benefit over what they could
 * already do (see `README.md` — Security — for the full writeup), and
 * `SameSite` already blocks the primary cross-site request vector for them.
 *
 * Requires `chainMiddleware(authenticate, csrfProtection)` so `req.user` and
 * `req.authTokenSource` are already populated when this runs.
 */
export const createCsrfProtection = (dependencies: CsrfProtectionDependencies): RequestHandler => {
  const { csrfConfig, cookieConfig } = dependencies

  return (req: Request, res: Response, next: NextFunction): void => {
    if (!csrfConfig.enabled) {
      next()
      return
    }

    if (SAFE_METHODS.has(req.method)) {
      next()
      return
    }

    if (req.authTokenSource !== 'cookie') {
      next()
      return
    }

    const cookieToken = readCsrfCookie(req.cookies as Record<string, string> | undefined, cookieConfig)
    if (!cookieToken) {
      next(
        new ForbiddenError('A CSRF token is required for this request.', {
          code: ErrorCode.CSRF_TOKEN_MISSING,
        }),
      )
      return
    }

    const headerToken = req.get(csrfConfig.headerName)
    if (!headerToken || headerToken !== cookieToken) {
      next(
        new ForbiddenError('The CSRF token is missing or does not match.', {
          code: ErrorCode.CSRF_TOKEN_INVALID,
        }),
      )
      return
    }

    next()
  }
}
