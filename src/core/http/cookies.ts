import type { CookieOptions, Response } from 'express'
import type { CookieConfig } from '@/config/config.types'
import type { TokenPair } from '@/modules/auth/auth.types'

/**
 * Auth cookie management.
 *
 * Tokens are delivered as `HttpOnly` cookies rather than in the response body.
 * The tradeoff, stated plainly:
 *
 * - **Cookies** are unreadable by JavaScript, so an XSS payload cannot exfiltrate
 *   the token. The cost is CSRF exposure, which `SameSite` addresses.
 * - **Response body + localStorage** is immune to CSRF but hands the token to
 *   any injected script.
 *
 * XSS is the more common and more damaging failure, so cookies win. The tokens
 * are *also* returned in the response body to support non-browser clients (CI
 * runners, the CLI) that have no cookie jar; browser clients should ignore
 * that field and let the cookie do the work.
 */

const baseOptions = (config: CookieConfig): CookieOptions => ({
  httpOnly: true,
  secure: config.secure,
  sameSite: config.sameSite,
  ...(config.domain ? { domain: config.domain } : {}),
})

/**
 * Writes the access and refresh cookies.
 *
 * `maxAge` mirrors each token's own expiry, so a cookie never outlives the
 * credential it carries. The refresh cookie is scoped to the auth path, which
 * keeps it off every ordinary API request and shrinks its exposure surface.
 */
export const setAuthCookies = (
  res: Response,
  tokens: TokenPair,
  config: CookieConfig,
): void => {
  const base = baseOptions(config)

  res.cookie(config.accessName, tokens.accessToken.token, {
    ...base,
    path: config.path,
    maxAge: tokens.accessToken.expiresAt.getTime() - Date.now(),
  })

  res.cookie(config.refreshName, tokens.refreshToken.token, {
    ...base,
    path: config.refreshPath,
    maxAge: tokens.refreshToken.expiresAt.getTime() - Date.now(),
  })
}

/**
 * Removes both cookies.
 *
 * The clearing options must match the originals on `path`, `domain`, `secure`,
 * and `sameSite`, or the browser treats it as a different cookie and silently
 * leaves the original in place — a logout that does not log out.
 */
export const clearAuthCookies = (res: Response, config: CookieConfig): void => {
  const base = baseOptions(config)

  res.clearCookie(config.accessName, { ...base, path: config.path })
  res.clearCookie(config.refreshName, { ...base, path: config.refreshPath })
}

/**
 * Extracts the refresh token, preferring the cookie.
 *
 * The body fallback exists for API clients without a cookie jar. The cookie is
 * checked first so a browser cannot be tricked into using an attacker-supplied
 * body value when a legitimate cookie is present.
 */
export const readRefreshToken = (
  cookies: Record<string, unknown> | undefined,
  body: Record<string, unknown> | undefined,
  config: CookieConfig,
): string | undefined => {
  const fromCookie = cookies?.[config.refreshName]
  if (typeof fromCookie === 'string' && fromCookie.length > 0) return fromCookie

  const fromBody = body?.['refreshToken']
  if (typeof fromBody === 'string' && fromBody.length > 0) return fromBody

  return undefined
}

/**
 * Extracts the access token from the `Authorization` header or the cookie.
 *
 * Header first: an explicit bearer token is an unambiguous statement of intent,
 * whereas the cookie is ambient and travels automatically.
 */
export const readAccessToken = (
  authorizationHeader: string | undefined,
  cookies: Record<string, unknown> | undefined,
  config: CookieConfig,
): string | undefined => {
  if (authorizationHeader?.startsWith('Bearer ')) {
    const token = authorizationHeader.slice(7).trim()
    if (token.length > 0) return token
  }

  const fromCookie = cookies?.[config.accessName]
  if (typeof fromCookie === 'string' && fromCookie.length > 0) return fromCookie

  return undefined
}
