import type { SessionEntity, UserEntity } from './auth.entities'
import type { SessionDto, UserDto } from './auth.types'

/**
 * Entity to DTO projection.
 *
 * An explicit whitelist, never a spread. Spreading an entity into a response is
 * how internal fields leak: add `passwordResetToken` to the entity six months
 * from now and a spread would publish it silently, whereas this mapper simply
 * would not include it.
 *
 * Dates are serialised to ISO-8601 strings here rather than left to
 * `JSON.stringify`, so the contract is explicit and identical across transports.
 */

export const toUserDto = (user: UserEntity): UserDto => ({
  id: user.id,
  email: user.email,
  firstName: user.firstName,
  lastName: user.lastName,
  fullName: `${user.firstName} ${user.lastName}`.trim(),
  role: user.role,
  status: user.status,
  isEmailVerified: user.isEmailVerified,
  lastLoginAt: user.lastLoginAt?.toISOString() ?? null,
  createdAt: user.createdAt.toISOString(),
  updatedAt: user.updatedAt.toISOString(),
})

/**
 * Projects a session for the “active devices” list.
 *
 * `tokenHash` and `familyId` are omitted deliberately: the hash is a credential
 * derivative, and the family id would expose the rotation graph to a client
 * that has no use for it.
 */
export const toSessionDto = (
  session: SessionEntity,
  currentSessionId: string,
): SessionDto => ({
  id: session.id,
  ip: session.ip,
  userAgent: session.userAgent,
  createdAt: session.createdAt.toISOString(),
  lastUsedAt: session.lastUsedAt.toISOString(),
  expiresAt: session.expiresAt.toISOString(),
  current: session.id === currentSessionId,
})
