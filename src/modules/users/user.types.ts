import type { UserRoleValue, UserStatusValue } from '@/modules/auth/auth.constants'
import type { ThemePreferenceValue, NotificationSettings } from './user.constants'

// ---------------------------------------------------------------------------
// Preferences & notifications
// ---------------------------------------------------------------------------

export interface PreferencesDto {
  readonly theme: ThemePreferenceValue
}

export type NotificationSettingsDto = NotificationSettings

// ---------------------------------------------------------------------------
// Profile
// ---------------------------------------------------------------------------

/**
 * The self-service view of a user. Extends the public projection with the
 * account-owned fields (avatar, preferences, notifications) that should only
 * ever be returned to the owner or an administrator.
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
  readonly preferences: PreferencesDto
  readonly notifications: NotificationSettingsDto
  readonly lastLoginAt: string | null
  readonly createdAt: string
  readonly updatedAt: string
}

// ---------------------------------------------------------------------------
// Device sessions
// ---------------------------------------------------------------------------

/** A single active session, enriched for the "signed-in devices" view. */
export interface DeviceSessionDto {
  readonly id: string
  readonly ip: string
  readonly browser: string
  readonly os: string
  readonly device: string
  readonly userAgent: string
  readonly createdAt: string
  readonly lastUsedAt: string
  readonly expiresAt: string
  /** True when this session issued the token on the current request. */
  readonly current: boolean
}

// ---------------------------------------------------------------------------
// History & activity
// ---------------------------------------------------------------------------

/** One entry in the login-history feed. */
export interface LoginHistoryDto {
  readonly id: string
  readonly at: string
  readonly ip: string
  readonly browser: string
  readonly os: string
  readonly device: string
  readonly userAgent: string
  readonly outcome: 'success' | 'failure'
  /** e.g. 'signed in', 'wrong password', 'account locked'. */
  readonly detail: string | null
}

/** One entry in the broader account-activity feed. */
export interface ActivityDto {
  readonly id: string
  readonly action: string
  readonly category: string
  readonly outcome: 'success' | 'failure'
  readonly at: string
  readonly ip: string
  readonly browser: string
  readonly os: string
  readonly device: string
  readonly message: string | null
}

// ---------------------------------------------------------------------------
// Inputs (shapes mirrored by the Zod schemas)
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

export interface UpdatePreferencesInput {
  readonly theme: ThemePreferenceValue
}

export type UpdateNotificationsInput = Partial<NotificationSettings>

// ---------------------------------------------------------------------------
// List queries
// ---------------------------------------------------------------------------

export interface ActivityQueryInput {
  readonly action?: string
  readonly outcome?: 'success' | 'failure'
  readonly from?: Date
  readonly to?: Date
  readonly page: number
  readonly limit: number
}
