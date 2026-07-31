import { z } from 'zod'
import {
  booleanQueryField,
  createSortSchema,
  limitField,
  pageField,
  searchField,
} from '@/core/query'
import { UserRole, UserStatus } from '@/modules/auth/auth.constants'

/**
 * Validation for the administrator user-management surface.
 *
 * The list schema is the canonical demonstration of the four cross-cutting
 * query concerns composed together: pagination (`page`/`limit`), filtering
 * (`role`/`status`/`verified`), searching (`search`), and sorting (`sort`).
 */

/** Sortable columns — indexed or low-cardinality fields only. */
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

export const listUsersQuerySchema = z
  .object({
    // Filtering
    role: z.nativeEnum(UserRole).optional(),
    status: z
      .enum([UserStatus.PENDING, UserStatus.ACTIVE, UserStatus.SUSPENDED, UserStatus.DELETED])
      .optional(),
    verified: booleanQueryField(),
    // Searching
    search: searchField(),
    // Pagination
    page: pageField,
    limit: limitField(100, 20),
    // Sorting
    sort: createSortSchema(USER_SORT_FIELDS, { createdAt: -1 }),
  })
  .strict()

/**
 * Administrators may reactivate or suspend an account and change its role.
 * Closing an account has its own DELETE endpoint, so `deleted` is not a valid
 * target here.
 */
export const adminUpdateUserSchema = z
  .object({
    role: z.nativeEnum(UserRole).optional(),
    status: z.enum([UserStatus.ACTIVE, UserStatus.SUSPENDED]).optional(),
  })
  .strict()
  .refine((value) => value.role !== undefined || value.status !== undefined, {
    message: 'Provide a role or a status to update',
  })

export const userIdParamSchema = z
  .object({
    userId: z
      .string()
      .trim()
      .regex(/^[a-fA-F0-9]{24}$/, 'Expected a 24-character user id'),
  })
  .strict()

export type ListUsersQueryParams = z.infer<typeof listUsersQuerySchema>
export type AdminUpdateUserBody = z.infer<typeof adminUpdateUserSchema>
