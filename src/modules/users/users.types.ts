import type { SortSpec } from '@/core/query'
import type { AuditOutcome } from '@/modules/audit/audit.types'
import type { NotificationSettings, UserPreferences } from '@/modules/auth/auth.entities'
import type { UserRoleValue, UserStatusValue, UserThemeValue } from '@/modules/auth/auth.constants'

// ---------------------------------------------------------------------------
// Outbound DTOs
// ---------------------------------------------------------------------------

/**
 * The full account profile.
 *
 * A superset of the auth module's lean `UserDto`: it adds the avatar,
 * preferences, and notification settings that the account-management surface
 * owns. Assembled by an explicit mapper, never spread from the entity.
 */
export interface ProfileDto {
  readonly id: string
  readonly email: string
  readonly firstName: string
  readonly lastName: string
  readonly fullName: string
  readonly role: UserRoleValue
  readonly status: UserStatusValue
  readonly isEmailVerified: boolean
  readonly avatarUrl: string | null
  readonly preferences: UserPreferences
  readonly notificationSettings: NotificationSettings
  readonly lastLoginAt: string | null
  readonly createdAt: string
  readonly updatedAt: string
}

/** One row of the account activity feed, projected from an audit record. */
export interface ActivityDto {
  readonly id: string
  readonly action: string
  readonly category: string
  readonly outcome: AuditOutcome
  readonly ip: string
  readonly userAgent: string
  readonly message: string | null
  readonly at: string
}

/** One login attempt, projected from the audit trail. */
export interface LoginHistoryDto {
  readonly id: string
  readonly outcome: AuditOutcome
  readonly ip: string
  readonly userAgent: string
  readonly message: string | null
  readonly at: string
}

/** Result of a credential change: how many sessions were revoked as a side effect. */
export interface SessionsRevokedResult {
  readonly revokedSessions: number
}

// ---------------------------------------------------------------------------
// Inbound inputs (mirrored by the Zod schemas)
// ---------------------------------------------------------------------------

export interface UpdateProfileInput {
  readonly firstName?: string
  readonly lastName?: string
}

export interface ChangePasswordInput {
  readonly currentPassword: string
  readonly newPassword: string
}

export interface DeleteAccountInput {
  readonly password: string
}

export interface UploadAvatarInput {
  /** A `data:image/...;base64,...` URI or an absolute `https://` URL. */
  readonly image: string
}

export interface UpdatePreferencesInput {
  readonly theme?: UserThemeValue
  readonly language?: string
  readonly timezone?: string
}

/** Every flag is optional so a client can toggle one channel at a time. */
export interface UpdateNotificationSettingsInput {
  readonly productUpdates?: boolean
  readonly securityAlerts?: boolean
  readonly benchmarkComplete?: boolean
  readonly weeklyReport?: boolean
}

// ---------------------------------------------------------------------------
// List queries
// ---------------------------------------------------------------------------

export interface ActivityQuery {
  readonly page: number
  readonly limit: number
  readonly sort: SortSpec
  readonly action?: string
  readonly category?: string
  readonly outcome?: AuditOutcome
}

export interface LoginHistoryQuery {
  readonly page: number
  readonly limit: number
  readonly sort: SortSpec
  readonly outcome?: AuditOutcome
}

export interface PagedResult<T> {
  readonly items: T[]
  readonly total: number
}
