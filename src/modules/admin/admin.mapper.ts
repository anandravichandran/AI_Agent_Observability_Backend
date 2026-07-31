import type { UserEntity } from '@/modules/auth/auth.entities'
import type { AdminUserDto } from './admin.types'

/**
 * Projects a user entity for administrator consumption.
 *
 * An explicit whitelist, as everywhere else: it adds `deletedAt` (which the
 * public DTO hides) but still never touches the credential hash.
 */
export const toAdminUserDto = (user: UserEntity): AdminUserDto => ({
  id: user.id,
  email: user.email,
  firstName: user.firstName,
  lastName: user.lastName,
  fullName: `${user.firstName} ${user.lastName}`.trim(),
  role: user.role,
  status: user.status,
  isEmailVerified: user.isEmailVerified,
  avatarUrl: user.avatarUrl,
  lastLoginAt: user.lastLoginAt?.toISOString() ?? null,
  createdAt: user.createdAt.toISOString(),
  updatedAt: user.updatedAt.toISOString(),
  deletedAt: user.deletedAt?.toISOString() ?? null,
})
