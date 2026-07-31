import type {
  OtpPurposeValue,
  UserRoleValue,
  UserStatusValue,
} from './auth.constants'

// ---------------------------------------------------------------------------
// Request context
// ---------------------------------------------------------------------------

/**
 * Ambient facts about the caller, captured at the HTTP boundary and threaded
 * into the service layer.
 *
 * Passing this explicitly keeps `AuthService` free of Express types — it can be
 * driven from a queue consumer or a CLI without change.
 */
export interface RequestContext {
  readonly ip: string
  readonly userAgent: string
  readonly requestId: string
}

// ---------------------------------------------------------------------------
// Tokens
// ---------------------------------------------------------------------------

/** Claims carried by an access token. */
export interface AccessTokenClaims {
  /** Subject — the user id. */
  readonly sub: string
  readonly email: string
  readonly role: UserRoleValue
  /** Session id, so a token can be tied back to a revocable session. */
  readonly sid: string
  readonly type: 'access'
}

/** Claims carried by a refresh token. */
export interface RefreshTokenClaims {
  readonly sub: string
  readonly sid: string
  /** Rotation family. All descendants share it, enabling family-wide revocation. */
  readonly fid: string
  /** Unique token id; the hash of the token itself is what is stored. */
  readonly jti: string
  readonly type: 'refresh'
}

/** Verified claims plus the standard registered fields. */
export type VerifiedAccessClaims = AccessTokenClaims & {
  readonly iat: number
  readonly exp: number
}

export type VerifiedRefreshClaims = RefreshTokenClaims & {
  readonly iat: number
  readonly exp: number
}

export interface IssuedToken {
  readonly token: string
  readonly expiresAt: Date
}

export interface TokenPair {
  readonly accessToken: IssuedToken
  readonly refreshToken: IssuedToken
}

// ---------------------------------------------------------------------------
// Authenticated principal
// ---------------------------------------------------------------------------

/**
 * The principal attached to `req.user` by the authenticate middleware.
 * Intentionally minimal — derived from token claims, not a database read.
 */
export interface AuthenticatedActor {
  readonly id: string
  readonly email: string
  readonly role: UserRoleValue
  readonly sessionId: string
}

// ---------------------------------------------------------------------------
// DTOs — outbound
// ---------------------------------------------------------------------------

/** Public projection of a user. Never contains the password hash. */
export interface UserDto {
  readonly id: string
  readonly email: string
  readonly firstName: string
  readonly lastName: string
  readonly fullName: string
  readonly role: UserRoleValue
  readonly status: UserStatusValue
  readonly isEmailVerified: boolean
  readonly lastLoginAt: string | null
  readonly createdAt: string
  readonly updatedAt: string
}

export interface SessionDto {
  readonly id: string
  readonly ip: string
  readonly userAgent: string
  readonly createdAt: string
  readonly lastUsedAt: string
  readonly expiresAt: string
  /** True when this session issued the token on the current request. */
  readonly current: boolean
}

/** Returned by register — no tokens, because email is not yet verified. */
export interface RegistrationResult {
  readonly user: UserDto
  readonly otpExpiresAt: string
  readonly message: string
}

/** Returned by login, email verification, and refresh. */
export interface AuthenticationResult {
  readonly user: UserDto
  readonly tokens: TokenPair
}

export interface OtpDispatchResult {
  readonly expiresAt: string
  readonly resendAvailableAt: string
}

// ---------------------------------------------------------------------------
// DTOs — inbound (shapes mirrored by the Zod schemas)
// ---------------------------------------------------------------------------

export interface RegisterInput {
  readonly email: string
  readonly password: string
  readonly firstName: string
  readonly lastName: string
}

export interface LoginInput {
  readonly email: string
  readonly password: string
}

export interface VerifyOtpInput {
  readonly email: string
  readonly code: string
}

export interface ResendOtpInput {
  readonly email: string
  readonly purpose: OtpPurposeValue
}

export interface ForgotPasswordInput {
  readonly email: string
}

export interface ResetPasswordInput {
  readonly email: string
  readonly code: string
  readonly password: string
}
