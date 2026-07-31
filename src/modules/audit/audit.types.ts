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
  readonly action?: string
  readonly actorId?: string
  readonly outcome?: AuditOutcome
  readonly from?: Date
  readonly to?: Date
  readonly page: number
  readonly limit: number
}

export interface AuditQueryResult {
  readonly items: AuditLogEntity[]
  readonly total: number
}
