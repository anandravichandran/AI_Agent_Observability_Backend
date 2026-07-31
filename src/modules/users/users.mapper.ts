import type { UserEntity } from '@/modules/auth/auth.entities'
import type { AuditLogEntity } from '@/modules/audit/audit.types'
import type { ActivityDto, LoginHistoryDto, ProfileDto } from './users.types'

/**
 * Entity-to-DTO projections for the account surface.
 *
 * As in the auth mapper, these are explicit whitelists rather than spreads: a
 * field only reaches a client if it is named here, so adding an internal field
 * to an entity later cannot leak it by accident.
 */

export const toProfileDto = (user: UserEntity): ProfileDto => ({
  id: user.id,
  email: user.email,
  firstName: user.firstName,
  lastName: user.lastName,
  fullName: `${user.firstName} ${user.lastName}`.trim(),
  role: user.role,
  status: user.status,
  isEmailVerified: user.isEmailVerified,
  avatarUrl: user.avatarUrl,
  preferences: user.preferences,
  notificationSettings: user.notificationSettings,
  lastLoginAt: user.lastLoginAt?.toISOString() ?? null,
  createdAt: user.createdAt.toISOString(),
  updatedAt: user.updatedAt.toISOString(),
})

export const toActivityDto = (event: AuditLogEntity): ActivityDto => ({
  id: event.id,
  action: event.action,
  category: event.category,
  outcome: event.outcome,
  ip: event.ip,
  userAgent: event.userAgent,
  message: event.message,
  at: event.createdAt.toISOString(),
})

export const toLoginHistoryDto = (event: AuditLogEntity): LoginHistoryDto => ({
  id: event.id,
  outcome: event.outcome,
  ip: event.ip,
  userAgent: event.userAgent,
  message: event.message,
  at: event.createdAt.toISOString(),
})
