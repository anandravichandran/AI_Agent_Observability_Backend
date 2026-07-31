import { z } from 'zod'
import {
  createSortSchema,
  limitField,
  pageField,
} from '@/core/query'
import { UserTheme } from '@/modules/auth/auth.constants'

/**
 * Request schemas for the account-management surface.
 *
 * Every schema is `.strict()`: an unknown key is a 422, not a silently dropped
 * field. On a self-service surface that is what stops a client from smuggling
 * in `role` or `status` alongside a profile edit.
 */

// ---------------------------------------------------------------------------
// Shared field validators (mirrors the auth module's password/name policy)
// ---------------------------------------------------------------------------

const personName = (label: string): z.ZodString =>
  z
    .string()
    .trim()
    .min(1, `${label} is required`)
    .max(80, `${label} is too long`)
    .regex(
      /^[\p{L}\p{M}'\- .]+$/u,
      `${label} may only contain letters, spaces, apostrophes, and hyphens`,
    )

/** Same policy as registration: length dominates, bcrypt caps at 72 bytes. */
const password = z
  .string()
  .min(12, 'Password must be at least 12 characters')
  .max(72, 'Password must be at most 72 characters')
  .refine((value) => /[a-z]/.test(value), 'Password must contain a lowercase letter')
  .refine((value) => /[A-Z]/.test(value), 'Password must contain an uppercase letter')
  .refine((value) => /\d/.test(value), 'Password must contain a digit')
  .refine((value) => /[^A-Za-z0-9]/.test(value), 'Password must contain a symbol')

// ---------------------------------------------------------------------------
// Profile
// ---------------------------------------------------------------------------

export const updateProfileSchema = z
  .object({
    firstName: personName('First name').optional(),
    lastName: personName('Last name').optional(),
  })
  .strict()
  // An empty body is a no-op the caller almost certainly did not intend, so
  // reject it rather than silently touching nothing.
  .refine(
    (value) => value.firstName !== undefined || value.lastName !== undefined,
    { message: 'Provide at least one field to update' },
  )

export const changePasswordSchema = z
  .object({
    currentPassword: z.string().min(1, 'Current password is required'),
    newPassword: password,
  })
  .strict()
  .refine((value) => value.currentPassword !== value.newPassword, {
    message: 'The new password must differ from the current one',
    path: ['newPassword'],
  })

export const deleteAccountSchema = z
  .object({
    // Re-authentication for a destructive, irreversible action.
    password: z.string().min(1, 'Your password is required to close the account'),
  })
  .strict()

// ---------------------------------------------------------------------------
// Avatar
// ---------------------------------------------------------------------------

/** 512 KiB decoded. A base64 payload of this size stays under the 1 MB body cap. */
export const MAX_AVATAR_BYTES = 512 * 1024

const DATA_URI_PATTERN = /^data:image\/(png|jpe?g|webp|gif);base64,([A-Za-z0-9+/]+={0,2})$/

/** Decoded byte length of a base64 string, computed without allocating a Buffer. */
const base64ByteLength = (base64: string): number => {
  const padding = base64.endsWith('==') ? 2 : base64.endsWith('=') ? 1 : 0
  return (base64.length * 3) / 4 - padding
}

export const uploadAvatarSchema = z
  .object({
    image: z
      .string()
      .trim()
      .min(1, 'An image is required')
      .superRefine((value, ctx) => {
        if (value.startsWith('data:')) {
          const match = DATA_URI_PATTERN.exec(value)
          if (!match) {
            ctx.addIssue({
              code: z.ZodIssueCode.custom,
              message: 'Expected a base64 PNG, JPEG, WebP, or GIF data URI',
            })
            return
          }

          if (base64ByteLength(match[2] ?? '') > MAX_AVATAR_BYTES) {
            ctx.addIssue({
              code: z.ZodIssueCode.custom,
              message: `Image must be at most ${String(MAX_AVATAR_BYTES / 1024)} KB`,
            })
          }
          return
        }

        // Not a data URI: must be an absolute https URL.
        const isHttpsUrl = z.string().url().safeParse(value).success && value.startsWith('https://')
        if (!isHttpsUrl) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: 'Expected an https image URL or a base64 image data URI',
          })
        }
      }),
  })
  .strict()

// ---------------------------------------------------------------------------
// Preferences & notifications
// ---------------------------------------------------------------------------

export const updatePreferencesSchema = z
  .object({
    theme: z.nativeEnum(UserTheme).optional(),
    // BCP-47-ish: letters and hyphens, e.g. `en`, `en-GB`, `pt-BR`.
    language: z
      .string()
      .trim()
      .regex(/^[A-Za-z]{2,3}(-[A-Za-z0-9]{2,8})*$/, 'Expected a language tag such as `en` or `en-GB`')
      .max(35)
      .optional(),
    // IANA zone name, e.g. `Europe/London`, or `UTC`.
    timezone: z
      .string()
      .trim()
      .regex(/^[A-Za-z0-9+_\-/]{1,64}$/, 'Expected an IANA timezone such as `Europe/London`')
      .optional(),
  })
  .strict()
  .refine((value) => Object.keys(value).length > 0, {
    message: 'Provide at least one preference to update',
  })

export const updateNotificationSettingsSchema = z
  .object({
    productUpdates: z.boolean().optional(),
    securityAlerts: z.boolean().optional(),
    benchmarkComplete: z.boolean().optional(),
    weeklyReport: z.boolean().optional(),
  })
  .strict()
  .refine((value) => Object.keys(value).length > 0, {
    message: 'Provide at least one setting to update',
  })

// ---------------------------------------------------------------------------
// Activity & login history queries
// ---------------------------------------------------------------------------

const ACTIVITY_SORT_FIELDS = ['createdAt'] as const

export const activityQuerySchema = z
  .object({
    action: z.string().trim().min(1).max(64).optional(),
    category: z.string().trim().min(1).max(32).optional(),
    outcome: z.enum(['success', 'failure']).optional(),
    page: pageField,
    limit: limitField(100, 20),
    sort: createSortSchema(ACTIVITY_SORT_FIELDS, { createdAt: -1 }),
  })
  .strict()

export const loginHistoryQuerySchema = z
  .object({
    outcome: z.enum(['success', 'failure']).optional(),
    page: pageField,
    limit: limitField(100, 20),
    sort: createSortSchema(ACTIVITY_SORT_FIELDS, { createdAt: -1 }),
  })
  .strict()

// ---------------------------------------------------------------------------
// Route params
// ---------------------------------------------------------------------------

/** A Mongo ObjectId is exactly 24 hex characters. */
export const sessionIdParamSchema = z
  .object({
    sessionId: z
      .string()
      .trim()
      .regex(/^[a-fA-F0-9]{24}$/, 'Expected a 24-character session id'),
  })
  .strict()

// ---------------------------------------------------------------------------
// Inferred types
// ---------------------------------------------------------------------------

export type UpdateProfileBody = z.infer<typeof updateProfileSchema>
export type ChangePasswordBody = z.infer<typeof changePasswordSchema>
export type DeleteAccountBody = z.infer<typeof deleteAccountSchema>
export type UploadAvatarBody = z.infer<typeof uploadAvatarSchema>
export type UpdatePreferencesBody = z.infer<typeof updatePreferencesSchema>
export type UpdateNotificationSettingsBody = z.infer<typeof updateNotificationSettingsSchema>
export type ActivityQueryParams = z.infer<typeof activityQuerySchema>
export type LoginHistoryQueryParams = z.infer<typeof loginHistoryQuerySchema>
