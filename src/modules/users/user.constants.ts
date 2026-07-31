/**
 * User & account domain constants.
 *
 * Kept as const objects with derived union types so the same values are usable
 * at runtime (Mongoose enums, Zod enums, OpenAPI) and at compile time, matching
 * the convention established by `auth.constants`.
 */

// ---------------------------------------------------------------------------
// Preferences
// ---------------------------------------------------------------------------

/** Visual theme selection. 'system' defers to the client's OS setting. */
export const ThemePreference = {
  LIGHT: 'light',
  DARK: 'dark',
  SYSTEM: 'system',
} as const

export type ThemePreferenceValue = (typeof ThemePreference)[keyof typeof ThemePreference]

export const THEME_PREFERENCES = Object.values(ThemePreference) as ThemePreferenceValue[]

export const DEFAULT_THEME: ThemePreferenceValue = ThemePreference.SYSTEM

// ---------------------------------------------------------------------------
// Notification channels
// ---------------------------------------------------------------------------

/**
 * Individual notification toggles.
 *
 * `securityAlerts` is the one a user cannot disable — sign-in and credential
 * notifications are a security control, not a marketing channel, so turning
 * them off would let an attacker operate silently. It is exposed for display
 * but always forced to true on write.
 */
export const NOTIFICATION_DEFAULTS = {
  productUpdates: true,
  securityAlerts: true,
  benchmarkResults: true,
  weeklyDigest: false,
} as const

export type NotificationSettings = {
  -readonly [K in keyof typeof NOTIFICATION_DEFAULTS]: boolean
}

// ---------------------------------------------------------------------------
// Avatars
// ---------------------------------------------------------------------------

/** MIME types accepted for avatar uploads. */
export const AVATAR_MIME_TYPES = ['image/png', 'image/jpeg', 'image/webp'] as const

export type AvatarMimeType = (typeof AVATAR_MIME_TYPES)[number]

/** Extension map keyed by MIME type, used when persisting the file to disk. */
export const AVATAR_EXTENSIONS: Record<AvatarMimeType, string> = {
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/webp': 'webp',
}

/** Sortable fields on the user collection, the whitelist for `resolveSort`. */
export const USER_SORT_FIELDS = [
  'createdAt',
  'updatedAt',
  'email',
  'firstName',
  'lastName',
  'lastLoginAt',
  'role',
  'status',
] as const

export type UserSortField = (typeof USER_SORT_FIELDS)[number]
