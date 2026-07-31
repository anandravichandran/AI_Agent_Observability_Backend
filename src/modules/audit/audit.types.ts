/** Audit trail contracts. */

export type AuditOutcome = 'success' | 'failure'

/**
 * Canonical event names.
 *
 * Dotted and namespaced so the trail can be filtered by prefix (`auth.*`) and
 * so later phases can add `model.*` or `benchmark.*` without collision.
 */
export const AuditAction = {
  REGISTER: 'auth.register',
  LOGIN: 'auth.login',
  LOGIN_BLOCKED: 'auth.login.blocked',
  LOGOUT: 'auth.logout',
  LOGOUT_ALL: 'auth.logout_all',
  TOKEN_REFRESH: 'auth.token.refresh',
  TOKEN_REUSE_DETECTED: 'auth.token.reuse_detected',
  EMAIL_VERIFY: 'auth.email.verify',
  OTP_ISSUED: 'auth.otp.issued',
  OTP_FAILED: 'auth.otp.failed',
  OTP_RESEND: 'auth.otp.resend',
  PASSWORD_FORGOT: 'auth.password.forgot',
  PASSWORD_RESET: 'auth.password.reset',
  ACCESS_DENIED: 'auth.access.denied',

  // --- Account self-service ------------------------------------------------
  PROFILE_UPDATE: 'account.profile.update',
  PASSWORD_CHANGE: 'account.password.change',
  ACCOUNT_DELETE: 'account.delete',
  AVATAR_UPDATE: 'account.avatar.update',
  PREFERENCES_UPDATE: 'account.preferences.update',
  NOTIFICATIONS_UPDATE: 'account.notifications.update',
  SESSION_REVOKE: 'account.session.revoke',

  // --- Administration ------------------------------------------------------
  ADMIN_USER_UPDATE: 'admin.user.update',
  ADMIN_USER_DELETE: 'admin.user.delete',
  ADMIN_USER_SESSIONS_REVOKE: 'admin.user.sessions.revoke',
} as const

export type AuditActionValue = (typeof AuditAction)[keyof typeof AuditAction]

export const AuditCategory = {
  AUTHENTICATION: 'authentication',
  AUTHORIZATION: 'authorization',
  ACCOUNT: 'account',
  SECURITY: 'security',
} as const

export type AuditCategoryValue = (typeof AuditCategory)[keyof typeof AuditCategory]

/** Everything needed to write one audit record. */
export interface AuditEvent {
  readonly action: AuditActionValue
  readonly category: AuditCategoryValue
  readonly outcome: AuditOutcome
  readonly actorId?: string | null
  readonly actorEmail?: string | null
  readonly actorRole?: string | null
  readonly ip: string
  readonly userAgent: string
  readonly requestId: string
  readonly targetType?: string | null
  readonly targetId?: string | null
  readonly message?: string | null
  /** Redacted by the service before persistence. */
  readonly metadata?: Record<string, unknown>
}

export interface AuditLogEntity {
  readonly id: string
  readonly action: string
  readonly category: string
  readonly outcome: AuditOutcome
  readonly actorId: string | null
  readonly actorEmail: string | null
  readonly actorRole: string | null
  readonly ip: string
  readonly userAgent: string
  readonly requestId: string
  readonly targetType: string | null
  readonly targetId: string | null
  readonly message: string | null
  readonly metadata: Record<string, unknown>
  readonly createdAt: Date
}

export interface AuditQuery {
  /** Exact action match, e.g. `auth.login`. */
  readonly action?: string
  /** Match any of several actions. Used to scope a user's login history. */
  readonly actions?: readonly string[]
  readonly actorId?: string
  readonly actorEmail?: string
  readonly category?: string
  readonly outcome?: AuditOutcome
  /** Free-text term matched against action, message, and actor email. */
  readonly search?: string
  readonly from?: Date
  readonly to?: Date
  readonly page: number
  readonly limit: number
  /** Validated Mongo sort spec. Defaults to newest-first when omitted. */
  readonly sort?: Record<string, 1 | -1>
}

export interface AuditQueryResult {
  readonly items: AuditLogEntity[]
  readonly total: number
}
