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
  /**
   * Closed by the owner (self-service delete) or an administrator. A soft
   * delete: the row is retained so the audit trail keeps referring to a real
   * account, but the account can no longer authenticate.
   */
  DELETED: 'deleted',
} as const

export type UserStatusValue = (typeof UserStatus)[keyof typeof UserStatus]

export const USER_STATUSES = Object.values(UserStatus) as UserStatusValue[]

// ---------------------------------------------------------------------------
// Profile preferences
// ---------------------------------------------------------------------------

/** UI colour scheme preference. `system` defers to the client's OS setting. */
export const UserTheme = {
  SYSTEM: 'system',
  LIGHT: 'light',
  DARK: 'dark',
} as const

export type UserThemeValue = (typeof UserTheme)[keyof typeof UserTheme]

export const USER_THEMES = Object.values(UserTheme) as UserThemeValue[]

/**
 * The notification channels a user can toggle.
 *
 * `securityAlerts` is included for completeness but is treated as always-on by
 * the service: a user cannot opt out of being told their password changed.
 */
export const NOTIFICATION_KEYS = [
  'productUpdates',
  'securityAlerts',
  'benchmarkComplete',
  'weeklyReport',
] as const

export type NotificationKey = (typeof NOTIFICATION_KEYS)[number]

/** Applied to every new account and used as the fallback for legacy rows. */
export const DEFAULT_USER_PREFERENCES = {
  theme: UserTheme.SYSTEM,
  language: 'en',
  timezone: 'UTC',
} as const

export const DEFAULT_NOTIFICATION_SETTINGS: Record<NotificationKey, boolean> = {
  productUpdates: true,
  securityAlerts: true,
  benchmarkComplete: true,
  weeklyReport: false,
}

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
  /** A user signed a specific device out from their session manager. */
  REVOKED_BY_USER: 'revoked_by_user',
  /** The account was closed (self-service delete). */
  ACCOUNT_DELETED: 'account_deleted',
} as const

export type SessionRevocationReasonValue =
  (typeof SessionRevocationReason)[keyof typeof SessionRevocationReason]

export const SESSION_REVOCATION_REASONS = Object.values(
  SessionRevocationReason,
) as SessionRevocationReasonValue[]
