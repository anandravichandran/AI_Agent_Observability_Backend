/**
 * Authentication domain constants.
 *
 * Kept as const objects with derived union types so the same values are usable
 * at runtime (Mongoose enums, Zod enums, OpenAPI) and at compile time.
 */

// ---------------------------------------------------------------------------
// Roles
// ---------------------------------------------------------------------------

export const UserRole = {
  /** Full platform administration, including audit access. */
  ADMIN: 'admin',
  /** Uploads models, runs optimizations and benchmarks. */
  ENGINEER: 'engineer',
  /** Read-only access to results and reports. */
  VIEWER: 'viewer',
} as const

export type UserRoleValue = (typeof UserRole)[keyof typeof UserRole]

export const USER_ROLES = Object.values(UserRole) as UserRoleValue[]

/**
 * Privilege ranking, used by `authorize()` for hierarchical checks.
 * A higher number satisfies any requirement at or below its level.
 */
export const ROLE_RANK: Record<UserRoleValue, number> = {
  [UserRole.VIEWER]: 1,
  [UserRole.ENGINEER]: 2,
  [UserRole.ADMIN]: 3,
}

/** Role assigned at self-service registration. Never `admin`. */
export const DEFAULT_USER_ROLE: UserRoleValue = UserRole.ENGINEER

// ---------------------------------------------------------------------------
// Account status
// ---------------------------------------------------------------------------

export const UserStatus = {
  /** Registered but email not yet verified. Cannot obtain tokens. */
  PENDING: 'pending',
  ACTIVE: 'active',
  /** Disabled by an administrator. */
  SUSPENDED: 'suspended',
} as const

export type UserStatusValue = (typeof UserStatus)[keyof typeof UserStatus]

export const USER_STATUSES = Object.values(UserStatus) as UserStatusValue[]

// ---------------------------------------------------------------------------
// OTP
// ---------------------------------------------------------------------------

export const OtpPurpose = {
  EMAIL_VERIFICATION: 'email_verification',
  PASSWORD_RESET: 'password_reset',
} as const

export type OtpPurposeValue = (typeof OtpPurpose)[keyof typeof OtpPurpose]

export const OTP_PURPOSES = Object.values(OtpPurpose) as OtpPurposeValue[]

// ---------------------------------------------------------------------------
// Tokens
// ---------------------------------------------------------------------------

export const TokenType = {
  ACCESS: 'access',
  REFRESH: 'refresh',
} as const

export type TokenTypeValue = (typeof TokenType)[keyof typeof TokenType]

// ---------------------------------------------------------------------------
// Session
// ---------------------------------------------------------------------------

export const SessionRevocationReason = {
  LOGOUT: 'logout',
  LOGOUT_ALL: 'logout_all',
  ROTATED: 'rotated',
  REUSE_DETECTED: 'reuse_detected',
  PASSWORD_CHANGED: 'password_changed',
  MAX_SESSIONS_EXCEEDED: 'max_sessions_exceeded',
  ADMIN_REVOKED: 'admin_revoked',
} as const

export type SessionRevocationReasonValue =
  (typeof SessionRevocationReason)[keyof typeof SessionRevocationReason]

export const SESSION_REVOCATION_REASONS = Object.values(
  SessionRevocationReason,
) as SessionRevocationReasonValue[]
