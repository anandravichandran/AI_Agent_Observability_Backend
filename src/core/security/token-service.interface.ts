import type {
  AccessTokenClaims,
  IssuedToken,
  RefreshTokenClaims,
  VerifiedAccessClaims,
  VerifiedRefreshClaims,
} from '@/modules/auth/auth.types'

/**
 * JWT signing and verification port.
 *
 * Access and refresh tokens are signed with *different* secrets and carry a
 * `type` claim. Both defences exist because either alone can be bypassed: a
 * shared secret lets an access token be replayed at the refresh endpoint, and a
 * missing type check lets a refresh token authenticate an API call.
 */
export interface ITokenService {
  signAccessToken(claims: AccessTokenClaims): IssuedToken

  signRefreshToken(claims: RefreshTokenClaims): IssuedToken

  /** @throws {AppError} 401 when the token is malformed, expired, or wrongly typed. */
  verifyAccessToken(token: string): VerifiedAccessClaims

  /** @throws {AppError} 401 when the token is malformed, expired, or wrongly typed. */
  verifyRefreshToken(token: string): VerifiedRefreshClaims

  /**
   * SHA-256 of a token, for storage and lookup.
   *
   * Refresh tokens are stored hashed for the same reason passwords are: a leaked
   * database must not yield usable credentials. A fast hash is correct here
   * (unlike for passwords) because the input is 200+ bits of entropy, so there
   * is nothing to brute force.
   */
  hashToken(token: string): string
}
