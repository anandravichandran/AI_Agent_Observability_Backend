import type { UserRoleValue, UserStatusValue } from '@/modules/auth/auth.constants'
import type { UserListQuery } from '@/modules/auth/auth.entities'

/**
 * Administrator's view of a user.
 *
 * Richer than the public `UserDto` — it exposes `deletedAt` and the avatar —
 * but still an explicit projection that never carries the password hash.
 */
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
  readonly deletedAt: string | null
}

/** Fields an administrator may change on another account. */
export interface AdminUpdateUserInput {
  readonly role?: UserRoleValue
  readonly status?: UserStatusValue
}

export interface AdminUsersResult {
  readonly items: AdminUserDto[]
  readonly total: number
}

export interface SessionsRevokedResult {
  readonly revokedSessions: number
}

/** Re-exported for the service signature; the repository owns the shape. */
export type AdminUserListQuery = UserListQuery
