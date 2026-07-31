import type {
  NotificationKey,
  OtpPurposeValue,
  SessionRevocationReasonValue,
  UserRoleValue,
  UserStatusValue,
  UserThemeValue,
} from './auth.constants'

/**
 * User-editable UI/locale preferences.
 *
 * A plain value object embedded on the user document. `language` and `timezone`
 * are free-form strings (BCP-47 tags and IANA zone names respectively) rather
 * than enums: the valid set is large, evolves independently of this codebase,
 * and is better validated at the edge than frozen into a union here.
 */
export interface UserPreferences {
  readonly theme: UserThemeValue
  readonly language: string
  readonly timezone: string
}

/** Per-channel notification opt-in flags. */
export type NotificationSettings = Record<NotificationKey, boolean>

/**
 * Persistence-agnostic entities.
 *
 * Repositories map Mongoose documents into these plain objects, so no layer
 * above the repository ever imports Mongoose or handles an `ObjectId`. Swapping
 * MongoDB for another store means writing new adapters and changing nothing in
 * the services, controllers, or tests that depend on the ports.
 */

export interface UserEntity {
  readonly id: string
  readonly email: string
  readonly firstName: string
  readonly lastName: string
  readonly role: UserRoleValue
  readonly status: UserStatusValue
  readonly isEmailVerified: boolean
  readonly emailVerifiedAt: Date | null
  /** Avatar image, stored as a data URI or an absolute URL. Null when unset. */
  readonly avatarUrl: string | null
  readonly preferences: UserPreferences
  readonly notificationSettings: NotificationSettings
  readonly lastLoginAt: Date | null
  readonly failedLoginAttempts: number
  readonly lockedUntil: Date | null
  readonly passwordChangedAt: Date | null
  /** Set when the account is soft-deleted; null for live accounts. */
  readonly deletedAt: Date | null
  readonly createdAt: Date
  readonly updatedAt: Date
}

/**
 * A user together with the credential hash.
 *
 * Separate from `UserEntity` on purpose: the hash is `select: false` in the
 * schema and is only ever loaded by the two call sites that verify a password.
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

/** Editable display fields on a profile. */
export interface UpdateProfileData {
  readonly firstName?: string
  readonly lastName?: string
}

/** Administrator-editable fields. Intentionally excludes name and credentials. */
export interface UpdateUserAdminData {
  readonly role?: UserRoleValue
  readonly status?: UserStatusValue
}

/**
 * A page request against the user directory.
 *
 * `sort` is a validated Mongo sort spec and `filters` are exact-match
 * constraints; `search` is a free-text term matched across name and email.
 */
export interface UserListQuery {
  readonly page: number
  readonly limit: number
  readonly sort: Record<string, 1 | -1>
  readonly search?: string
  readonly filters: {
    readonly role?: UserRoleValue
    readonly status?: UserStatusValue
    readonly isEmailVerified?: boolean
  }
}

export interface UserListResult {
  readonly items: UserEntity[]
  readonly total: number
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
