import type {
  OtpPurposeValue,
  SessionRevocationReasonValue,
  UserRoleValue,
  UserStatusValue,
} from './auth.constants'

/**
 * Persistence-agnostic entities.
 *
 * Repositories map Mongoose documents into these plain objects, so no layer
 * above the repository ever imports Mongoose or handles an `ObjectId`. Swapping
 * MongoDB for another store means writing new adapters and changing nothing in
 * the services, controllers, or tests that depend on the ports.
 */

/** Persisted shape of the preferences sub-document. */
export interface UserPreferencesData {
  readonly theme: 'light' | 'dark' | 'system'
}

/** Persisted shape of the notification-settings sub-document. */
export interface UserNotificationsData {
  readonly productUpdates: boolean
  readonly securityAlerts: boolean
  readonly benchmarkResults: boolean
  readonly weeklyDigest: boolean
}

export interface UserEntity {
  readonly id: string
  readonly email: string
  readonly firstName: string
  readonly lastName: string
  readonly role: UserRoleValue
  readonly status: UserStatusValue
  readonly isEmailVerified: boolean
  readonly emailVerifiedAt: Date | null
  readonly lastLoginAt: Date | null
  readonly lastLoginIp: string | null
  readonly failedLoginAttempts: number
  readonly lockedUntil: Date | null
  readonly passwordChangedAt: Date | null
  readonly avatarUrl: string | null
  readonly preferences: UserPreferencesData
  readonly notifications: UserNotificationsData
  /** Soft-delete tombstone. Non-null means the account is deleted. */
  readonly deletedAt: Date | null
  readonly createdAt: Date
  readonly updatedAt: Date
}

/**
 * A user together with the credential hash.
 *
 * Separate from `UserEntity` on purpose: the hash is `select: false` in the
 * schema and is only ever loaded by the call sites that verify a password.
 * Making it a distinct type means an accidental leak into a response DTO is a
 * compile error, not a runtime incident.
 */
export interface UserWithSecret extends UserEntity {
  readonly passwordHash: string
}

export interface CreateUserData {
  readonly email: string
  readonly passwordHash: string
  readonly firstName: string
  readonly lastName: string
  readonly role: UserRoleValue
  readonly status: UserStatusValue
}

/** Outcome of registering a failed login attempt. */
export interface LoginFailureState {
  readonly failedLoginAttempts: number
  readonly lockedUntil: Date | null
  readonly isLocked: boolean
}

// ---------------------------------------------------------------------------
// OTP
// ---------------------------------------------------------------------------

export interface OtpEntity {
  readonly id: string
  readonly userId: string
  readonly email: string
  readonly purpose: OtpPurposeValue
  readonly codeHash: string
  readonly expiresAt: Date
  readonly attempts: number
  readonly maxAttempts: number
  readonly consumedAt: Date | null
  readonly createdAt: Date
}

export interface CreateOtpData {
  readonly userId: string
  readonly email: string
  readonly purpose: OtpPurposeValue
  readonly codeHash: string
  readonly expiresAt: Date
  readonly maxAttempts: number
  readonly ip: string
  readonly userAgent: string
}

// ---------------------------------------------------------------------------
// Session
// ---------------------------------------------------------------------------

/**
 * One row per issued refresh token.
 *
 * Rotation creates a new row in the same `familyId` and marks the old one
 * revoked. Keeping superseded rows (rather than deleting them) is precisely
 * what makes reuse detection possible — a replayed token still resolves to a
 * row, and that row's revoked state is the theft signal.
 */
export interface SessionEntity {
  readonly id: string
  readonly userId: string
  readonly familyId: string
  readonly tokenHash: string
  readonly ip: string
  readonly userAgent: string
  readonly expiresAt: Date
  readonly lastUsedAt: Date
  readonly revokedAt: Date | null
  readonly revokedReason: SessionRevocationReasonValue | null
  readonly replacedBySessionId: string | null
  readonly createdAt: Date
}

export interface CreateSessionData {
  readonly userId: string
  readonly familyId: string
  readonly tokenHash: string
  readonly ip: string
  readonly userAgent: string
  readonly expiresAt: Date
}
