import { z } from 'zod'
import { USER_ROLES, USER_STATUSES } from '@/modules/auth/auth.constants'
import { THEME_PREFERENCES, ThemePreference, USER_SORT_FIELDS } from './user.constants'

/**
 * User & account request schemas.
 *
 * Same conventions as `auth.validation`: `.strict()` everywhere so unknown
 * fields are rejected rather than silently dropped, and the schema is the
 * single source of truth for the inbound shape.
 */

const personName = (label: string) =>
  z
    .string()
    .trim()
    .min(1, `${label} is required`)
    .max(80, `${label} is too long`)
    .regex(
      /^[\p{L}\p{M}'\- .]+$/u,
      `${label} may only contain letters, spaces, apostrophes, and hyphens`,
    )

/** Full password policy, shared with registration. */
const newPassword = z
  .string({ required_error: 'A new password is required' })
  .min(12, 'Password must be at least 12 characters')
  .max(72, 'Password must be at most 72 characters')
  .refine((value) => /[a-z]/.test(value), 'Password must contain a lowercase letter')
  .refine((value) => /[A-Z]/.test(value), 'Password must contain an uppercase letter')
  .refine((value) => /\d/.test(value), 'Password must contain a digit')
  .refine((value) => /[^A-Za-z0-9]/.test(value), 'Password must contain a symbol')

// ---------------------------------------------------------------------------
// Self-service
// ---------------------------------------------------------------------------

export const updateProfileSchema = z
  .object({
    firstName: personName('First name').optional(),
    lastName: personName('Last name').optional(),
  })
  .strict()
  .refine((value) => value.firstName !== undefined || value.lastName !== undefined, {
    message: 'Provide at least one field to update',
  })

export const changePasswordSchema = z
  .object({
    currentPassword: z
      .string({ required_error: 'Your current password is required' })
      .min(1, 'Your current password is required'),
    newPassword,
  })
  .strict()
  .refine((value) => value.currentPassword !== value.newPassword, {
    message: 'Choose a password different from your current one',
    path: ['newPassword'],
  })

export const deleteAccountSchema = z
  .object({
    password: z
      .string({ required_error: 'Confirm your password to delete the account' })
      .min(1, 'Confirm your password to delete the account'),
  })
  .strict()

export const updatePreferencesSchema = z
  .object({
    theme: z
      .enum(THEME_PREFERENCES as [string, ...string[]], {
        errorMap: () => ({ message: 'Unsupported theme' }),
      })
      .default(ThemePreference.SYSTEM),
  })
  .strict()

/**
 * Notification settings.
 *
 * `securityAlerts` is absent deliberately: it is not user-editable. The strict
 * schema therefore rejects a client that tries to switch it off, which is the
 * enforcement of the rule, not a courtesy.
 */
export const updateNotificationsSchema = z
  .object({
    productUpdates: z.boolean().optional(),
    benchmarkResults: z.boolean().optional(),
    weeklyDigest: z.boolean().optional(),
  })
  .strict()
  .refine((value) => Object.values(value).some((v) => v !== undefined), {
    message: 'Provide at least one setting to update',
  })

// ---------------------------------------------------------------------------
// List queries
// ---------------------------------------------------------------------------

/** Shared pagination shape reused by the activity and admin list endpoints. */
const paginationFields = {
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
}

export const activityQuerySchema = z
  .object({
    action: z.string().trim().min(1).max(64).optional(),
    outcome: z.enum(['success', 'failure']).optional(),
    from: z.coerce.date().optional(),
    to: z.coerce.date().optional(),
    ...paginationFields,
  })
  .strict()
  .refine((value) => !value.from || !value.to || value.from <= value.to, {
    message: '`from` must be earlier than `to`',
    path: ['from'],
  })

export const loginHistoryQuerySchema = z
  .object({
    outcome: z.enum(['success', 'failure']).optional(),
    ...paginationFields,
  })
  .strict()

// ---------------------------------------------------------------------------
// Administration
// ---------------------------------------------------------------------------

/** A 24-character Mongo ObjectId in a route parameter. */
const objectIdParam = z
  .string({ required_error: 'A user id is required' })
  .length(24, 'Expected a 24-character id')
  .regex(/^[0-9a-fA-F]{24}$/, 'Expected a valid id')

export const userIdParamSchema = z.object({ id: objectIdParam }).strict()

export const listUsersQuerySchema = z
  .object({
    search: z.string().trim().min(1).max(120).optional(),
    role: z.enum(USER_ROLES as [string, ...string[]]).optional(),
    status: z.enum(USER_STATUSES as [string, ...string[]]).optional(),
    sortBy: z.enum(USER_SORT_FIELDS as [string, ...string[]]).optional(),
    sortOrder: z.enum(['asc', 'desc']).optional(),
    ...paginationFields,
  })
  .strict()

export const updateUserRoleSchema = z
  .object({
    role: z.enum(USER_ROLES as [string, ...string[]], {
      errorMap: () => ({ message: 'Unsupported role' }),
    }),
  })
  .strict()

export const updateUserStatusSchema = z
  .object({
    status: z.enum(USER_STATUSES as [string, ...string[]], {
      errorMap: () => ({ message: 'Unsupported status' }),
    }),
  })
  .strict()

// ---------------------------------------------------------------------------
// Inferred types
// ---------------------------------------------------------------------------

export type UpdateProfileBody = z.infer<typeof updateProfileSchema>
export type ChangePasswordBody = z.infer<typeof changePasswordSchema>
export type DeleteAccountBody = z.infer<typeof deleteAccountSchema>
export type UpdatePreferencesBody = z.infer<typeof updatePreferencesSchema>
export type UpdateNotificationsBody = z.infer<typeof updateNotificationsSchema>
export type ActivityQueryParams = z.infer<typeof activityQuerySchema>
export type LoginHistoryQueryParams = z.infer<typeof loginHistoryQuerySchema>
export type ListUsersQueryParams = z.infer<typeof listUsersQuerySchema>
export type UpdateUserRoleBody = z.infer<typeof updateUserRoleSchema>
export type UpdateUserStatusBody = z.infer<typeof updateUserStatusSchema>
