import type { UserRoleValue, UserStatusValue } from '@/modules/auth/auth.constants'
import type { SortOrder } from '@/core/http/pagination'
import type { UserSortField } from '@/modules/users/user.constants'

/** One row in the administrative user list. */
export interface AdminUserDto {
  readonly id: string
  readonly email: string
  readonly firstName: string
  readonly lastName: string
  readonly fullName: string
  readonly role: UserRoleValue
  readonly status: UserStatusValue
  readonly isEmailVerified: boolean
  readonly avatarUrl: string | null
  readonly lastLoginAt: string | null
  readonly createdAt: string
  readonly updatedAt: string
}

/** Full administrative view of a single account. */
export interface AdminUserDetailDto extends AdminUserDto {
  readonly failedLoginAttempts: number
  readonly lockedUntil: string | null
  readonly lastLoginIp: string | null
  readonly deletedAt: string | null
  readonly activeSessions: number
}

/** Validated list query for the admin user directory. */
export interface ListUsersQueryInput {
  readonly search?: string
  readonly role?: UserRoleValue
  readonly status?: UserStatusValue
  readonly sortBy?: UserSortField
  readonly sortOrder?: SortOrder
  readonly page: number
  readonly limit: number
}
